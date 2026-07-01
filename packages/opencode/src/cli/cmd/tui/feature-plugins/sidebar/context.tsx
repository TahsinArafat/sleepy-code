import type { AssistantMessage } from "@mimo-ai/sdk/v2"
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@mimo-ai/plugin/tui"
import { Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { completedTPS, formatTPS, streamingTPS } from "./tps"
import fs from "fs"
import path from "path"
import { Global } from "@/global"

const id = "internal:sidebar-context"
const REFRESH_MS = 1000

function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const msg = createMemo(() => props.api.state.session.messages(props.session_id))
  const cost = createMemo(() => msg().reduce((sum, item) => sum + (item.role === "assistant" ? item.cost : 0), 0))

  const state = createMemo(() => {
    const last = msg().findLast((item): item is AssistantMessage => item.role === "assistant" && item.tokens.output > 0)
    if (!last) {
      return {
        tokens: 0,
        limit: 128000,
        percent: null,
      }
    }

    const tokens =
      last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
    const model = props.api.state.provider.find((item) => item.id === last.providerID)?.models[last.modelID]
    const limit = model?.limit.context ?? 128000
    return {
      tokens,
      limit,
      percent: model?.limit.context ? Math.round((tokens / model.limit.context) * 100) : null,
    }
  })

  const [tick, setTick] = createSignal(Date.now())
  const [expanded, setExpanded] = createSignal(true)
  const [tier, setTier] = createSignal("free")
  const [totalCost, setTotalCost] = createSignal(0)
  const [creditUSD, setCreditUSD] = createSignal(5.0)
  const [balanceUSD, setBalanceUSD] = createSignal(0.0)

  onMount(() => {
    let active = true;
    const poll = async () => {
      try {
        const configPath = path.join(Global.Path.config, "gateway.json")
        if (!fs.existsSync(configPath)) return
        const sleepyConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"))
        const token = sleepyConfig.access_token || sleepyConfig.token
        const dashboardUrl = sleepyConfig.dashboard_url || "http://localhost:3000"

        if (!token) return

        const res = await fetch(`${dashboardUrl}/api/usage?days=30`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (!res.ok || !active) return
        const data = await res.json()
        setTier(data.tier ?? "free")
        setTotalCost(data.totalCost ?? 0)
        setCreditUSD(data.limits?.creditUSD ?? 5.0)
        setBalanceUSD(data.balanceUSD ?? 0.0)
      } catch {
      }
    };

    void poll();
    const handle = setInterval(poll, 15000)
    onCleanup(() => {
      active = false
      clearInterval(handle)
    })
  })

  const progressBar = createMemo(() => {
    const costUSD = creditUSD() - balanceUSD()
    const max = creditUSD()
    const percent = Math.min(100, Math.max(0, (costUSD / max) * 100))
    const filledLength = Math.round(percent / 10)
    const emptyLength = 10 - filledLength
    const bar = "█".repeat(filledLength) + "░".repeat(emptyLength)
    return `[${bar}] ${percent.toFixed(0)}%`
  })

  const contextBar = createMemo(() => {
    const used = state().tokens
    const max = state().limit ?? 128000
    const percent = Math.min(100, Math.max(0, (used / max) * 100))
    const filledLength = Math.round(percent / 10)
    const emptyLength = 10 - filledLength
    const bar = "█".repeat(filledLength) + "░".repeat(emptyLength)
    return `[${bar}] ${percent.toFixed(0)}%`
  })

  const lastAssistant = createMemo(() =>
    msg().findLast((item): item is AssistantMessage => item.role === "assistant"),
  )

  const latency = createMemo(() => {
    const last = lastAssistant()
    if (!last || last.time.completed === undefined) return undefined
    const duration = last.time.completed - last.time.created
    return duration > 0 ? `${Math.round(duration)}ms` : undefined
  })

  const isStreaming = createMemo(() => {
    const m = lastAssistant()
    return m !== undefined && !m.time.completed
  })

  createEffect(() => {
    if (!isStreaming()) return
    const handle = setInterval(() => setTick(Date.now()), REFRESH_MS)
    onCleanup(() => clearInterval(handle))
  })

  const tps = createMemo<number | null>(() => {
    const m = lastAssistant()
    if (!m) return null

    if (isStreaming()) {
      tick() // reactivity dep so the readout updates between deltas
      const parts = props.api.state.part(m.id)
      const combined = parts
        .filter((p) => p.type === "text" || p.type === "reasoning")
        .map((p) => p.text)
        .join("")
      return streamingTPS(combined, m.time.created, Date.now())
    }

    const idleTarget = msg().findLast(
      (item): item is AssistantMessage =>
        item.role === "assistant" &&
        item.time.completed !== undefined &&
        item.tokens.output + item.tokens.reasoning > 0,
    )
    if (!idleTarget || idleTarget.time.completed === undefined) return null
    return completedTPS(
      idleTarget.tokens.output,
      idleTarget.tokens.reasoning,
      idleTarget.time.created,
      idleTarget.time.completed,
    )
  })

  const tpsLabel = createMemo(() => formatTPS(tps()))

  return (
    <box gap={1}>
      <box>
        <text fg={theme().text}>
          <b>Context</b>
        </text>
        <text fg={theme().textMuted}>
          Limit: {state().limit.toLocaleString()} / Used: {state().tokens.toLocaleString()} ({state().percent ?? 0}%)
        </text>
        <text fg={theme().accent}>{contextBar()}</text>
        <Show when={tpsLabel()}>{(label) => <text fg={theme().textMuted}>{label()}</text>}</Show>
        <text fg={theme().textMuted}>{cost().toFixed(4)} spent</text>
        <Show when={latency()}>
          {(l) => (
            <text fg={theme().textMuted}>
              Gateway: <span style={{ fg: theme().success }}>{l()}</span>
            </text>
          )}
        </Show>
      </box>
      <box>
        <text fg={theme().text} onMouseUp={() => setExpanded(!expanded())}>
          <b>Plan & Limits</b> {expanded() ? "▼" : "▶"}
        </text>
        <Show when={expanded()}>
          <text fg={theme().textMuted}>Tier: {tier().charAt(0).toUpperCase() + tier().slice(1)}</text>
          <text fg={theme().textMuted}>Balance: ${balanceUSD().toFixed(2)}</text>
          <text fg={theme().textMuted}>Spent: ${(totalCost() / 100).toFixed(4)}</text>
          <text fg={theme().accent}>{progressBar()}</text>
        </Show>
      </box>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 100,
    slots: {
      sidebar_content(_ctx, props) {
        return <View api={api} session_id={props.session_id} />
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
}

export default plugin
