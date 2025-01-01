import { Show, createSignal } from "solid-js"
import { useTheme } from "@tui/context/theme"
import { SplitBorder } from "@tui/component/border"
import { useDialog } from "@tui/ui/dialog"
import { DialogSleepyLogin } from "./dialog-sleepy-login"
import { TextAttributes } from "@opentui/core"

export function BannerSessionExpired(props: { message: string }) {
  const { theme } = useTheme()
  const dialog = useDialog()
  const [hover, setHover] = createSignal(false)

  const handleLogin = () => {
    dialog.replace(() => <DialogSleepyLogin />)
  }

  return (
    <box
      border={["left"]}
      borderColor={theme.warning}
      customBorderChars={SplitBorder.customBorderChars}
      marginBottom={1}
      flexShrink={0}
    >
      <box
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        paddingRight={2}
        backgroundColor={hover() ? theme.backgroundElement : theme.backgroundPanel}
        onMouseOver={() => setHover(true)}
        onMouseOut={() => setHover(false)}
        onMouseUp={handleLogin}
      >
        <text fg={theme.warning}>
          <span style={{ fg: theme.warning, bold: true }}>⚠ Session Expired</span>
        </text>
        <text fg={theme.textMuted} wrapMode="word">
          {props.message}
        </text>
        <text fg={theme.textMuted}>
          Run <span style={{ fg: theme.primary, attributes: TextAttributes.UNDERLINE }}>/login</span> to re-authenticate, or{" "}
          <span style={{ fg: theme.primary, attributes: TextAttributes.UNDERLINE }}>click here</span>.
        </text>
      </box>
    </box>
  )
}
