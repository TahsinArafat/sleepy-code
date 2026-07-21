import type { AssistantMessage } from "@sleepy-ai/sdk/v2"
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@sleepy-ai/plugin/tui"
import { createMemo, createSignal, createEffect, onCleanup } from "solid-js"

const id = "internal:sidebar-mascot"

const IDLE_FRAMES = [
  `  ▄▄▄▄▄▄  \n  ██████  \n  █▀██▀█  \n  ██████  \n  █▄██▄█  `,
  `  ▄▄▄▄▄▄  \n  ██████  \n  █▀██▀█  \n  ██████  \n  █▄██▄█ z`,
  `  ▄▄▄▄▄▄  \n  ██████  \n  █▀██▀█  \n  ██████  \n  █▄██▄█ zZ`,
]

const ACTIVE_FRAMES = [
  `  ▄▄▄▄▄▄ ⚡\n  ██████  \n  █▀██▀█  \n  ██████  \n  █▄██▄█  `,
  `  ▄▄▄▄▄▄ 💥\n  ██████  \n  █>██<█  \n  ██████  \n  █▄██▄█  `,
  `  ▄▄▄▄▄▄ ⚡\n  ██████  \n  █▀██▀█  \n  ██████  \n  █▄██▄█  `,
]

function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const [frame, setFrame] = createSignal(0)

  const messages = createMemo(() => props.api.state.session.messages(props.session_id))

  const lastAssistant = createMemo(() =>
    messages().findLast((item): item is AssistantMessage => item.role === "assistant"),
  )

  const isStreaming = createMemo(() => {
    const m = lastAssistant()
    return m !== undefined && !m.time.completed
  })

  const isRunning = createMemo(
    () => props.api.state.session.status(props.session_id)?.type === "busy" || isStreaming(),
  )

  createEffect(() => {
    const interval = isRunning() ? 300 : 1500
    const handle = setInterval(() => setFrame((f) => (f + 1) % IDLE_FRAMES.length), interval)
    onCleanup(() => clearInterval(handle))
  })

  const ascii = createMemo(() => (isRunning() ? ACTIVE_FRAMES[frame()] : IDLE_FRAMES[frame()]))

  return (
    <box>
      <text fg={theme().textMuted}>{ascii()}</text>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 10,
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
