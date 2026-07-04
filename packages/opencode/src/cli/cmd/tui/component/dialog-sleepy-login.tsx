import { createSignal, onMount, Show } from "solid-js"
import { useSDK } from "../context/sdk"
import { useSync } from "@tui/context/sync"
import { useLocal } from "@tui/context/local"
import { useDialog } from "@tui/ui/dialog"
import { useTheme } from "../context/theme"
import { DialogPrompt } from "../ui/dialog-prompt"
import { useToast } from "../ui/toast"
import * as Clipboard from "@tui/util/clipboard"
import { useRenderer } from "@opentui/solid"
import { TextAttributes } from "@opentui/core"
import path from "path"
import {
  startDeviceFlow,
  pollDeviceToken,
  writeConfig,
  getDashboardUrl,
  type DeviceCodeResponse,
} from "../../login"
import { Global } from "@/global"
import open from "open"

export function DialogSleepyLogin() {
  return <SleepyDeviceFlow />
}

function SleepyDeviceFlow() {
  const dialog = useDialog()
  const sdk = useSDK()
  const sync = useSync()
  const local = useLocal()
  const { theme } = useTheme()
  const toast = useToast()
  const renderer = useRenderer()
  const [copied, setCopied] = createSignal(false)
  const [busy, setBusy] = createSignal(false)
  const [deviceData, setDeviceData] = createSignal<DeviceCodeResponse | null>(null)
  const [error, setError] = createSignal<string | null>(null)

  function copyUrl() {
    const url = deviceData()?.verification_uri_complete
    if (!url) return
    Clipboard.copy(url)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(toast.error)
  }

  function copyCode() {
    const code = deviceData()?.user_code
    if (!code) return
    Clipboard.copy(code)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(toast.error)
  }

  onMount(async () => {
    const dashboardUrl = getDashboardUrl()

    let device: DeviceCodeResponse
    try {
      device = await startDeviceFlow(dashboardUrl)
    } catch (err: any) {
      setError(err?.message ?? "Failed to start device login")
      return
    }

    setDeviceData(device)

    try {
      await open(device.verification_uri_complete)
    } catch {
      // Browser may not open in all environments
    }

    setBusy(true)

    const pollMs = (device.interval ?? 5) * 1000

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, pollMs))

      try {
        const tokenData = await pollDeviceToken(dashboardUrl, device.device_code)
        const configPath = path.join(Global.Path.config, "gateway.json")
        await writeConfig(configPath, {
          access_token: tokenData.access_token,
          endpoint: tokenData.endpoint,
          tier: tokenData.tier,
          email: tokenData.email,
          dashboard_url: dashboardUrl,
        })
        await sdk.client.instance.dispose()
        await sync.bootstrap()
        local.model.set({ providerID: "sleepy", modelID: "smart" }, { recent: true })
        toast.show({ message: "Login successful!", variant: "success" })
        dialog.clear()
        return
      } catch (err: any) {
        if (err.code === "authorization_pending" || err.code === "slow_down") continue
        if (err.code === "expired_token") {
          setError("Login expired. Please try again.")
          return
        }
        if (err.code === "access_denied") {
          setError("Login denied.")
          return
        }
        setError(err?.message ?? "Login failed")
        return
      }
    }
  })

  return (
    <DialogPrompt
      title="Sleepy Device Login"
      placeholder=""
      busy={busy()}
      busyText="Waiting for authorization..."
      description={
        <box gap={1}>
          <Show when={error()}>
            <text fg={theme.error}>{error()}</text>
            <text
              fg={theme.primary}
              attributes={TextAttributes.UNDERLINE}
              onMouseUp={() => dialog.replace(() => <SleepyDeviceFlow />)}
            >
              Try again
            </text>
          </Show>
          <Show when={!error() && deviceData()}>
            <text fg={theme.textMuted}>
              Open the URL below in your browser and enter the code to authenticate.
              <Show when={copied()}>{" "}<span style={{ fg: theme.primary }}>(Copied!)</span></Show>
            </text>
            <text
              fg={theme.primary}
              onMouseUp={() => {
                if (renderer.getSelection()?.getSelectedText()) return
                copyUrl()
              }}
            >
              {deviceData()!.verification_uri_complete}
            </text>
            <box gap={1} alignItems="center">
              <text fg={theme.textMuted}>Code:</text>
              <text
                fg={theme.accent}
                attributes={TextAttributes.BOLD}
                onMouseUp={() => {
                  if (renderer.getSelection()?.getSelectedText()) return
                  copyCode()
                }}
              >
                {deviceData()!.user_code}
              </text>
            </box>
          </Show>
        </box>
      }
    />
  )
}
