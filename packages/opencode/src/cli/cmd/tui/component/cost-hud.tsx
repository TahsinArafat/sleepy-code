import { createMemo } from "solid-js"
import { useRoute } from "@tui/context/route"
import { useSync } from "@tui/context/sync"
import { useLocal } from "@tui/context/local"
import { useTheme } from "@tui/context/theme"
import { TextAttributes } from "@opentui/core"

export function CostHud() {
  const route = useRoute()
  const sync = useSync()
  const local = useLocal()
  const { theme } = useTheme()

  const activeModel = createMemo(() => local.model.parsed().model)

  const latency = createMemo(() => {
    if (route.data.type !== "session") return undefined
    const messages = sync.data.message[route.data.sessionID]?.["main"] ?? []
    const lastAssistant = messages.findLast(
      (item) => item.role === "assistant" && item.time.completed !== undefined,
    )
    if (!lastAssistant || lastAssistant.role !== "assistant") return undefined
    if (lastAssistant.time.completed === undefined) return undefined
    const duration = lastAssistant.time.completed - lastAssistant.time.created
    return duration > 0 ? `${Math.round(duration)}ms` : undefined
  })

  const totalCost = createMemo(() => {
    if (route.data.type !== "session") return 0
    const sessionMessages = sync.data.message[route.data.sessionID]
    if (!sessionMessages) return 0
    let sum = 0
    for (const agentID of Object.keys(sessionMessages)) {
      const msgs = sessionMessages[agentID] ?? []
      for (const msg of msgs) {
        if (msg.role === "assistant") {
          sum += msg.cost
        }
      }
    }
    return sum
  })

  const formattedCost = createMemo(() => {
    const cost = totalCost()
    return `$${cost.toFixed(4)}`
  })

  return (
    <box
      flexDirection="row"
      alignItems="center"
      gap={2}
      border={["bottom"]}
      borderColor={theme.border}
      backgroundColor={theme.backgroundPanel}
      paddingLeft={1}
      paddingRight={1}
      height={3}
    >
      <text fg={theme.primary} attributes={TextAttributes.BOLD}>
        💤 SLEEPY HUD
      </text>
      <text fg={theme.text}>
        {` | Route: `}
      </text>
      <text fg={theme.accent} attributes={TextAttributes.BOLD}>
        {activeModel()}
      </text>
      {latency() && (
        <>
          <text fg={theme.text}>
            {` | `}
          </text>
          <text fg={theme.success}>
            {`${latency()}`}
          </text>
        </>
      )}
      <text fg={theme.text}>
        {` | Cost: `}
      </text>
      <text fg={theme.primary} attributes={TextAttributes.BOLD}>
        {formattedCost()}
      </text>
    </box>
  )
}
