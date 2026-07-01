import type { AssistantMessage } from "@mimo-ai/sdk/v2"
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@mimo-ai/plugin/tui"
import { createMemo } from "solid-js"

const id = "internal:sidebar-session-stats"

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return `${n}`
}

function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const messages = createMemo(() => props.api.state.session.messages(props.session_id))

  const stats = createMemo(() => {
    const input = messages()
      .filter((m): m is AssistantMessage => m.role === "assistant")
      .reduce((sum, m) => sum + m.tokens.input, 0)
    const output = messages()
      .filter((m): m is AssistantMessage => m.role === "assistant")
      .reduce((sum, m) => sum + m.tokens.output + m.tokens.reasoning, 0)
    return { input, output, total: input + output }
  })

  return (
    <box>
      <text fg={theme().text}>
        <b>Session Stats:</b>{" "}
      </text>
      <text fg={theme().textMuted}>
        In {formatTokens(stats().input)} / Out {formatTokens(stats().output)} / Total{" "}
        {formatTokens(stats().total)}
      </text>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 125,
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
