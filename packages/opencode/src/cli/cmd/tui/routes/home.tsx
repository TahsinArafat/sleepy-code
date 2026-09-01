import { Prompt, type PromptRef } from "@tui/component/prompt"
import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import path from "path"
import fs from "fs"
import { Logo } from "../component/logo"
import { logoThin, logos, type LogoKey } from "@/cli/logo"
import { StarryBackground } from "../component/starry-background"
import { BackgroundImage } from "../component/background-image"
import { useProject } from "../context/project"
import { useSync } from "../context/sync"
import { Toast } from "../ui/toast"
import { useArgs } from "../context/args"
import { useRouteData } from "@tui/context/route"
import { usePromptRef } from "../context/prompt"
import { useLocal } from "../context/local"
import { useKV } from "../context/kv"
import { useLanguage } from "@tui/context/language"
import { TuiPluginRuntime } from "../plugin"
import { Global } from "@/global"
import { isPlainTerminal } from "../util/terminal"
import { useDialog } from "../ui/dialog"
import { DialogSleepyLogin } from "../component/dialog-sleepy-login"
import { useTheme } from "../context/theme"
import { TextAttributes } from "@opentui/core"
import { useExit } from "../context/exit"
import { useVisualMode } from "../context/visual"

let once = false

export function Home() {
  const sync = useSync()
  const project = useProject()
  const route = useRouteData("home")
  const promptRef = usePromptRef()
  const [ref, setRef] = createSignal<PromptRef | undefined>()
  const args = useArgs()
  const local = useLocal()
  const kv = useKV()
  const t = useLanguage().t
  const plainTerminal = isPlainTerminal()
  const dialog = useDialog()
  const { theme } = useTheme()
  const exit = useExit()
  const visual = useVisualMode()
  const gateConfigPath = path.join(Global.Path.config, "gateway.json")
  const [isAuthed, setAuthed] = createSignal(fs.existsSync(gateConfigPath))
  const modelReady = createMemo(() => isAuthed() && local.model.current() != null)
  onMount(() => {
    const interval = setInterval(() => setAuthed(fs.existsSync(gateConfigPath)), 1000)
    onCleanup(() => clearInterval(interval))
  })
  useKeyboard((evt) => {
    if (isAuthed()) return
    if (evt.name === "l" && !evt.ctrl && !evt.meta) {
      dialog.replace(() => <DialogSleepyLogin />)
    }
    if (evt.name === "escape") exit()
  })
  const bgImagePath = createMemo(() => {
    const filename = kv.get("background_image")
    if (!filename || typeof filename !== "string") return undefined
    return path.join(Global.Path.config, "backgrounds", filename)
  })
  const logoKey = createMemo(() => {
    const key = kv.get("logo_design")
    return typeof key === "string" && key in logos ? (key as LogoKey) : "thin"
  })
  const placeholder = {
    get normal() {
      return [
        t("tui.home.placeholder.example.todo"),
        t("tui.home.placeholder.example.stack"),
        t("tui.home.placeholder.example.tests"),
      ]
    },
    shell: ["ls -la", "git status", "pwd"],
  }
  let sent = false

  const bind = (r: PromptRef | undefined) => {
    setRef(r)
    promptRef.set(r)
    if (once || !r) return
    if (route.prompt) {
      r.set(route.prompt)
      once = true
      return
    }
    if (!args.prompt) return
    r.set({ input: args.prompt, parts: [] })
    once = true
  }

  // Wait for sync and model store to be ready before auto-submitting --prompt
  createEffect(() => {
    const r = ref()
    if (sent) return
    if (!r) return
    if (!sync.ready || !local.model.ready) return
    if (!args.prompt) return
    if (r.current.input !== args.prompt) return
    sent = true
    r.submit()
  })

  return (
    <>
      <Show when={!plainTerminal}>
        <Show
          when={bgImagePath()}
          fallback={
            <Show when={visual.vivid()}>
              <StarryBackground animated={visual.motion} />
            </Show>
          }
        >
          {(p) => <BackgroundImage path={p()} />}
        </Show>
      </Show>
      <box flexGrow={1} alignItems="center" paddingLeft={8} paddingRight={8} zIndex={1}>
        <box flexGrow={1} minHeight={0} />
        <box height={4} minHeight={0} flexShrink={1} />
        <box flexShrink={0}>
          <Show
            when={plainTerminal}
            fallback={
              <TuiPluginRuntime.Slot name="home_logo" mode="replace">
                <Show when={logoKey()} keyed>
                  {(k) => <Logo shape={logos[k]} animated={visual.motion()} sweep={visual.motion()} />}
                </Show>
              </TuiPluginRuntime.Slot>
            }
          >
            <box flexDirection="column" flexShrink={0}>
              {logoThin.left.slice(2).map((line, index) => (
                <box flexDirection="row" gap={1} flexShrink={0}>
                  <text selectable={false}>{line}</text>
                  <text selectable={false}>{logoThin.right[index + 2] ?? ""}</text>
                </box>
              ))}
            </box>
          </Show>
        </box>
        <box height={1} minHeight={0} flexShrink={1} />
        <Show when={isAuthed()}>
          <box
            width="100%"
            maxWidth={75}
            zIndex={1000}
            paddingTop={1}
            flexShrink={0}
          >
            <Show
              when={plainTerminal}
              fallback={
                <TuiPluginRuntime.Slot
                  name="home_prompt"
                  mode="replace"
                  workspace_id={project.workspace.current()}
                  ref={bind}
                >
                  <Prompt
                    ref={bind}
                    disabled={!modelReady()}
                    workspaceID={project.workspace.current()}
                    right={<TuiPluginRuntime.Slot name="home_prompt_right" workspace_id={project.workspace.current()} />}
                    placeholders={placeholder}
                  />
                </TuiPluginRuntime.Slot>
              }
            >
              <Prompt
                ref={bind}
                disabled={!modelReady()}
                workspaceID={project.workspace.current()}
                placeholders={placeholder}
              />
            </Show>
          </box>
        </Show>
        <Show when={plainTerminal}>
          <box paddingTop={1} flexShrink={0}>
            <text selectable={false}>{t("tui.tips.plain_terminal")}</text>
          </box>
        </Show>
        <Show when={!plainTerminal}>
          <Show when={!isAuthed()}>
            <box paddingTop={2} alignItems="center" gap={2} flexShrink={0}>
              <box
                paddingLeft={3}
                paddingRight={3}
                paddingTop={1}
                paddingBottom={1}
                backgroundColor={theme.accent}
                onMouseUp={() => dialog.replace(() => <DialogSleepyLogin />)}
              >
                <text fg={theme.background} attributes={TextAttributes.BOLD}>
                  Login with Browser
                </text>
              </box>
              <text
                fg={theme.textMuted}
                attributes={TextAttributes.UNDERLINE}
                onMouseUp={() => exit()}
              >
                Exit
              </text>
            </box>
          </Show>
          <Show when={!isAuthed() && !plainTerminal}>
            <box paddingTop={1} flexShrink={0}>
              <text fg={theme.textMuted}>
                Press <span style={{ fg: theme.accent }}>L</span> to login &middot; <span style={{ fg: theme.textMuted }}>Esc</span> to exit
              </text>
            </box>
          </Show>
          <TuiPluginRuntime.Slot name="home_bottom" />
        </Show>
        <box flexGrow={1} minHeight={0} />
        <Toast />
      </box>
      <Show when={!plainTerminal}>
        <box width="100%" flexShrink={0}>
          <TuiPluginRuntime.Slot name="home_footer" mode="single_winner" />
        </box>
      </Show>
    </>
  )
}
