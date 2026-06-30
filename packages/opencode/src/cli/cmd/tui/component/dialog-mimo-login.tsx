import { createMemo, createSignal, onMount, onCleanup, Show } from "solid-js"
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
import os from "os"
import path from "path"
import {
  buildAuthorizeUrl,
  startLoginServer,
  waitForCode,
  exchangeCodeForToken,
  writeConfig,
  getDashboardUrl,
} from "../../login"
import { Global } from "@/global"
import open from "open"

export function DialogMimoLogin() {
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
        description: "Authenticate via Sleepy Dashboard Browser OAuth",
        category: "Recommended",
        onSelect: async () => {
          const dashboardUrl = getDashboardUrl()
          const authorizeUrl = buildAuthorizeUrl(dashboardUrl)
          const server = await startLoginServer()
          try {
            await open(authorizeUrl)
          } catch {
            // Browser may not open; user can copy URL
          }
          dialog.replace(() => (
            <SleepyOAuthFlow url={authorizeUrl} server={server} dashboardUrl={dashboardUrl} />
          ))
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

function SleepyOAuthFlow(props: { url: string; server: import("http").Server; dashboardUrl: string }) {
  const dialog = useDialog()
  const sdk = useSDK()
  const sync = useSync()
  const local = useLocal()
  const { theme } = useTheme()
  const toast = useToast()
  const renderer = useRenderer()
  const [copied, setCopied] = createSignal(false)
  const [busy, setBusy] = createSignal(false)

  function copyUrl() {
    Clipboard.copy(props.url)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(toast.error)
  }

  onCleanup(() => {
    try { props.server.close() } catch {}
  })

  onMount(async () => {
    try {
      const code = await waitForCode()
      setBusy(true)
      const tokenData = await exchangeCodeForToken(code, props.dashboardUrl)
      const configPath = path.join(Global.Path.config, "gateway.json")
      await writeConfig(configPath, {
        ...tokenData,
        dashboard_url: props.dashboardUrl,
      })
      await sdk.client.instance.dispose()
      await sync.bootstrap()
      local.model.set({ providerID: "sleepy", modelID: "smart" }, { recent: true })
      toast.show({ message: "Login successful!", variant: "success" })
      dialog.clear()
    } catch (err: any) {
      toast.show({ message: err?.message ?? "Login failed", variant: "error" })
      dialog.clear()
    } finally {
      try { props.server.close() } catch {}
    }
  })

  return (
    <DialogPrompt
      title="Sleepy OAuth Login"
      placeholder=""
      busy={busy()}
      busyText="Authenticating..."
      description={
        <box gap={1}>
          <Show when={props.url}>
            <text fg={theme.textMuted}>
              Open the URL below in your browser to authenticate.
              <Show when={copied()}>{" "}<span style={{ fg: theme.primary }}>(Copied!)</span></Show>
            </text>
            <text
              fg={theme.primary}
              onMouseUp={() => {
                if (renderer.getSelection()?.getSelectedText()) return
                copyUrl()
              }}
            >
              {props.url}
            </text>
          </Show>
          <text fg={theme.textMuted}>Waiting for authorization...</text>
        </box>
      }
    />
  )
}
