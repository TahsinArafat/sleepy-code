import type { AssistantMessage } from "@mimo-ai/sdk/v2"
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@mimo-ai/plugin/tui"
import { createMemo } from "solid-js"

const id = "internal:sidebar-session-stats"

function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const messages = createMemo(() => props.api.state.session.messages(props.session_id))

  const inputTokens = createMemo(() =>
    messages()
      .filter((m): m is AssistantMessage => m.role === "assistant")
      .reduce((sum, m) => sum + m.tokens.input, 0),
  )

  const outputTokens = createMemo(() =>
    messages()
      .filter((m): m is AssistantMessage => m.role === "assistant")
      .reduce((sum, m) => sum + m.tokens.output + m.tokens.reasoning, 0),
  )

  const totalTokens = createMemo(() => inputTokens() + outputTokens())

  return (
    <box gap={1}>
      <text fg={theme().text}>
        <b>Session Stats</b>
      </text>
      <text fg={theme().textMuted}>Input: {inputTokens().toLocaleString()} tokens</text>
      <text fg={theme().textMuted}>Output: {outputTokens().toLocaleString()} tokens</text>
      <text fg={theme().textMuted}>Total: {totalTokens().toLocaleString()} tokens</text>
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
