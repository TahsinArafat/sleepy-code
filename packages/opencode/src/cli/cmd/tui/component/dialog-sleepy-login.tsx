import { createMemo, createSignal, onMount, Show } from "solid-js"
import { useSDK } from "../context/sdk"
import { useSync } from "@tui/context/sync"
import { useLocal } from "@tui/context/local"
import { useDialog } from "@tui/ui/dialog"
import { useTheme } from "../context/theme"
import { useLanguage } from "../context/language"
import { createDialogProviderOptions } from "./dialog-provider"
import { DialogSelect } from "@tui/ui/dialog-select"
import { DialogPrompt } from "../ui/dialog-prompt"
import { useToast } from "../ui/toast"
import * as Clipboard from "@tui/util/clipboard"
import { useRenderer } from "@opentui/solid"
import { TextAttributes } from "@opentui/core"
import os from "os"
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
  const dialog = useDialog()
  const sdk = useSDK()
  const sync = useSync()
  const local = useLocal()
  const toast = useToast()
  const { t } = useLanguage()
  const providerOptions = createDialogProviderOptions()

  const options = createMemo(() => {
    const recommended = [
      {
        title: "Sleepy Login",
        value: "sleepy",
        description: "Authenticate via Sleepy Dashboard (browser or device code)",
        category: "Recommended",
        onSelect: async () => {
          dialog.replace(() => <SleepyDeviceFlow />)
        },
      },
      {
        title: t("tui.dialog.login.import_claude"),
        value: "import_claude",
        category: "Recommended",
        onSelect: async () => {
          const claudeDir = path.join(os.homedir(), ".claude")
          const candidates = ["settings.json", "settings.local.json", "settings_local.json"]

          const resolve = await (async () => {
            const envs: Record<string, string>[] = []
            for (const file of candidates) {
              try {
                const content = await Bun.file(path.join(claudeDir, file)).json()
                if (content?.env && typeof content.env === "object") envs.push(content.env)
              } catch {}
            }
            return (name: string) => {
              for (let i = envs.length - 1; i >= 0; i--) {
                const v = envs[i][name]
                if (v && typeof v === "string") return v
              }
              return process.env[name]
            }
          })()

          const key = resolve("ANTHROPIC_API_KEY")
          const rawBaseUrl = resolve("ANTHROPIC_BASE_URL")
          const baseUrl = rawBaseUrl
            ? rawBaseUrl.replace(/\/+$/, "").replace(/(?<!\/v1)$/, "/v1")
            : undefined
          // strip Claude Code context-window suffix e.g. claude-opus-4-6[1m]
          const preferredModel = (
            resolve("ANTHROPIC_DEFAULT_OPUS_MODEL") ?? resolve("ANTHROPIC_DEFAULT_SONNET_MODEL")
          )?.replace(/\[.*\]$/, "")

          if (!key) {
            toast.show({ message: t("tui.dialog.login.import_claude.no_key"), variant: "error" })
            dialog.clear()
            return
          }

          await sdk.client.auth.set({
            providerID: "anthropic",
            auth: { type: "api", key },
          })
          await sdk.client.global.config.update({
            config: {
              provider: {
                anthropic: { options: { baseURL: baseUrl || "https://api.anthropic.com/v1" } },
              },
            },
          })
          await sdk.client.instance.dispose()
          await sync.bootstrap()

          const anthropic = sync.data.provider.find((p) => p.id === "anthropic")
          if (anthropic) {
            if (preferredModel && !(preferredModel in anthropic.models)) {
              await sdk.client.global.config.update({
                config: {
                  provider: {
                    anthropic: { models: { [preferredModel]: { name: preferredModel } } },
                  },
                },
              })
              await sdk.client.instance.dispose()
              await sync.bootstrap()
            }
            const models = Object.keys(anthropic.models).sort()
            const selected = preferredModel
              || models.find((m) => m === "claude-opus-4-6")
              || models.findLast((m) => m.includes("opus"))
              || models.findLast((m) => m.includes("sonnet"))
              || models[0]
            if (selected) {
              local.model.set({ providerID: "anthropic", modelID: selected }, { recent: true })
            }
          }
          toast.show({ message: t("tui.dialog.login.import_claude.success"), variant: "info" })
          dialog.clear()
        },
      },
    ]

    return [
      ...recommended,
      ...providerOptions().filter((option) => option.value !== "sleepy" && option.value !== "xiaomi"),
    ]
  })

  return (
    <DialogSelect
      title={t("tui.dialog.login.title")}
      options={options()}
    />
  )
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
