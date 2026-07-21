import type { AssistantMessage } from "@sleepy-ai/sdk/v2"
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@sleepy-ai/plugin/tui"
import { Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { completedTPS, formatTPS, streamingTPS } from "./tps"
import fs from "fs"
import path from "path"
import { Global } from "@/global"

const id = "internal:sidebar-context"
const REFRESH_MS = 1000

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return `${n}`
}

function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const msg = createMemo(() => props.api.state.session.messages(props.session_id))
  const cost = createMemo(() => {
    const msgs = msg()
    let total = 0
    for (const item of msgs) {
      if (item.role !== "assistant") continue
      if (item.cost > 0) {
        total += item.cost
        continue
      }
      const t = item.tokens
      const model = props.api.state.provider.find((p) => p.id === item.providerID)?.models[item.modelID]
      if (!model) continue
      total += (t.input * model.cost.input) / 1_000_000
      total += ((t.output + t.reasoning) * model.cost.output) / 1_000_000
      total += (t.cache.read * model.cost.cache.read) / 1_000_000
      total += (t.cache.write * model.cost.cache.write) / 1_000_000
    }
    return total
  })

  const stats = createMemo(() => {
    const assistants = msg().filter((m): m is AssistantMessage => m.role === "assistant")
    const input = assistants.reduce((s, m) => s + m.tokens.input, 0)
    const output = assistants.reduce((s, m) => s + m.tokens.output + m.tokens.reasoning, 0)
    return { input, output, total: input + output }
  })

  const state = createMemo(() => {
    const last = msg().findLast((item): item is AssistantMessage => item.role === "assistant")
    if (!last) {
      return {
        tokens: 0,
        limit: 128000,
        percent: null,
        modelName: null as string | null,
        inputPrice: 0,
        outputPrice: 0,
      }
    }

    const tokens =
      last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
    const model = props.api.state.provider.find((item) => item.id === last.providerID)?.models[last.modelID]
    const limit = model?.limit.context ?? 128000
    return {
      tokens,
      limit,
      percent: limit > 0 ? Math.round((tokens / limit) * 100) : 0,
      modelName: model?.name ?? last.modelID,
      inputPrice: model?.cost?.input ?? 0,
      outputPrice: model?.cost?.output ?? 0,
    }
  })

  const [tick, setTick] = createSignal(Date.now())
  const [expanded, setExpanded] = createSignal(true)
  const [tier, setTier] = createSignal("")
  const [totalCost, setTotalCost] = createSignal(0)
  const [creditUSD, setCreditUSD] = createSignal(5.0)
  const [balanceUSD, setBalanceUSD] = createSignal(0.0)
  const [monthlyUsageUSD, setMonthlyUsageUSD] = createSignal(0.0)
  const [monthlyAllowanceUSD, setMonthlyAllowanceUSD] = createSignal(5.0)
  const [limit5h, setLimit5h] = createSignal(0.5)
  const [limit24h, setLimit24h] = createSignal(1.5)
  const [limitWeekly, setLimitWeekly] = createSignal(3.5)
  const [limitMonthly, setLimitMonthly] = createSignal(5.0)
  const [rpmLimit, setRpmLimit] = createSignal(15)
  const [cost5h, setCost5h] = createSignal(0)
  const [cost24h, setCost24h] = createSignal(0)
  const [costWeekly, setCostWeekly] = createSignal(0)
  const [costMonthly, setCostMonthly] = createSignal(0)

  onMount(() => {
    let active = true;
        const poll = async (retries = 3) => {
      try {
        const configPath = path.join(Global.Path.config, "gateway.json")
        if (!fs.existsSync(configPath)) return
        const sleepyConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"))
        const token = sleepyConfig.access_token || sleepyConfig.token
        const dashboardUrl = sleepyConfig.dashboard_url || "https://www.sleepyai.org"

        if (!token) return

        const res = await fetch(`${dashboardUrl}/api/usage?days=30`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (!res.ok || !active) {
          if (retries > 0 && active) setTimeout(() => poll(retries - 1), 2000);
          return
        }
        const data = await res.json()
        setTier(data.tier || "free")
        setTotalCost(data.totalCost || 0)
        setBalanceUSD(data.balanceUSD || 0.0)
        setMonthlyUsageUSD(data.monthlyUsageUSD || 0.0)
        setMonthlyAllowanceUSD(data.monthlyAllowanceUSD || 5.0)
        if (data.limits) {
          setCreditUSD(data.limits.creditUSD || 5.0)
          setLimit5h(data.limits.limit5h || 0.5)
          setLimit24h(data.limits.limit24h || 1.5)
          setLimitWeekly(data.limits.limitWeekly || 3.5)
          setLimitMonthly(data.limits.limitMonthly || 5.0)
          setRpmLimit(data.limits.rpmLimit || 15)
        }
        if (data.usageByWindow) {
          setCost5h(data.usageByWindow.cost5h || 0)
          setCost24h(data.usageByWindow.cost24h || 0)
          setCostWeekly(data.usageByWindow.costWeekly || 0)
          setCostMonthly(data.usageByWindow.costMonthly || 0)
        }
      } catch {
        if (retries > 0 && active) setTimeout(() => poll(retries - 1), 2000);
      }
    };

    void poll();
    const handle = setInterval(poll, 15000)
    onCleanup(() => {
      active = false
      clearInterval(handle)
    })
  })

  const bar = (used: number, max: number) => {
    const pct = Math.min(100, Math.max(0, max > 0 ? (used / max) * 100 : 0))
    const filled = Math.round(pct / 10)
    const empty = 10 - filled
    const c = pct > 85 ? theme().error : theme().accent
    return <text fg={c}>{`[${"▅".repeat(filled)}${"_".repeat(empty)}]`}</text>
  }

  const contextBar = createMemo(() => {
    const used = state().tokens
    const max = state().limit ?? 128000
    const percent = Math.min(100, Math.max(0, max > 0 ? (used / max) * 100 : 0))
    const filledLength = Math.round(percent / 10)
    const emptyLength = 10 - filledLength
    const b = "▅".repeat(filledLength) + "_".repeat(emptyLength)
    const c = percent > 85 ? theme().error : theme().accent
    return <text fg={c}>{`[${b}]`}</text>
  })

  const lastAssistant = createMemo(() =>
    msg().findLast((item): item is AssistantMessage => item.role === "assistant"),
  )

  const latency = createMemo(() => {
    const last = lastAssistant()
    if (!last || last.time.completed === undefined) return undefined
    const duration = last.time.completed - last.time.created
    if (duration <= 0) return undefined
    return duration < 1000 ? `${Math.round(duration)}ms` : `${(duration / 1000).toFixed(1)}s`
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
        <Show when={state().modelName}>
          <text fg={theme().accent}>{state().modelName}</text>
        </Show>
        <text fg={theme().textMuted}>
          Limit: {state().limit.toLocaleString()} / Used: {state().tokens.toLocaleString()}
        </text>
        {contextBar()}
        <Show when={state().inputPrice > 0 || state().outputPrice > 0}>
          <text fg={theme().textMuted}>Input: ${state().inputPrice.toFixed(3)}/1M · Output: ${state().outputPrice.toFixed(3)}/1M</text>
        </Show>
        <box flexDirection="row" flexWrap="wrap" gap={1}>
          <Show when={tpsLabel()}>{(label) => <text fg={theme().info}>{label()}</text>}</Show>
          <text fg={theme().warning}>Cost: ${cost().toFixed(4)}</text>
          <Show when={latency()}>
            {(l) => (
              <text fg={theme().success}>GW: {l()}</text>
            )}
          </Show>
        </box>
      </box>
      <box>
        <text fg={theme().text}><b>Session</b></text>
        <text fg={theme().textMuted}>
          In {formatTokens(stats().input)} / Out {formatTokens(stats().output)} / Total {formatTokens(stats().total)}
        </text>
      </box>
      <box>
        <text fg={theme().text} onMouseUp={() => setExpanded(!expanded())}>
          <b>Plan & Limits</b> {expanded() ? "▼" : "▶"}
        </text>
        <Show when={expanded() && tier() !== ""}>
          <text fg={theme().textMuted}>Tier: {tier().charAt(0).toUpperCase() + tier().slice(1)} | Allow: ${creditUSD().toFixed(2)}</text>
          <Show when={balanceUSD() > 0}>
            <text fg={theme().textMuted}>Extra balance: ${balanceUSD().toFixed(2)}</text>
          </Show>
          <box flexDirection="row">{bar(cost5h(), limit5h())}<text fg={theme().textMuted}> 5h (${cost5h().toFixed(2)}/${limit5h().toFixed(2)})</text></box>
          <box flexDirection="row">{bar(cost24h(), limit24h())}<text fg={theme().textMuted}> 24h (${cost24h().toFixed(2)}/${limit24h().toFixed(2)})</text></box>
          <box flexDirection="row">{bar(costWeekly(), limitWeekly())}<text fg={theme().textMuted}> Wk (${costWeekly().toFixed(2)}/${limitWeekly().toFixed(2)})</text></box>
          <box flexDirection="row">{bar(costMonthly(), limitMonthly())}<text fg={theme().textMuted}> Mo (${costMonthly().toFixed(2)}/${limitMonthly().toFixed(2)})</text></box>
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
