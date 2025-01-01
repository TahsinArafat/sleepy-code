import { Config } from "effect"

function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

function falsy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "false" || value === "0"
}

function number(key: string) {
  const value = process.env[key]
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

const SLEEPYCODE_EXPERIMENTAL = truthy("SLEEPYCODE_EXPERIMENTAL")

// Defaults to false. When enabled, sleepycode runs in pure-sleepy mode:
//   — does NOT inherit Claude Code's settings (CLAUDE.md, ~/.claude/skills, etc.)
//   — does NOT pick up provider API keys from environment variables
//   — falls back to the sleepy-auto model as the default
// Set SLEEPYCODE_SLEEPY_ONLY=true to disable .claude inheritance and env-based
// provider auto-detection.
const SLEEPYCODE_SLEEPY_ONLY = truthy("SLEEPYCODE_SLEEPY_ONLY")
const SLEEPYCODE_DISABLE_CLAUDE_CODE_ENV = truthy("SLEEPYCODE_DISABLE_CLAUDE_CODE")
const SLEEPYCODE_DISABLE_CLAUDE_CODE = SLEEPYCODE_SLEEPY_ONLY || SLEEPYCODE_DISABLE_CLAUDE_CODE_ENV

const SLEEPYCODE_DISABLE_EXTERNAL_SKILLS = truthy("SLEEPYCODE_DISABLE_EXTERNAL_SKILLS")
const SLEEPYCODE_DISABLE_CLAUDE_CODE_SKILLS =
  SLEEPYCODE_DISABLE_EXTERNAL_SKILLS || SLEEPYCODE_DISABLE_CLAUDE_CODE || truthy("SLEEPYCODE_DISABLE_CLAUDE_CODE_SKILLS")
const copy = process.env["SLEEPYCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]

export const Flag = {
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"],
  OTEL_EXPORTER_OTLP_HEADERS: process.env["OTEL_EXPORTER_OTLP_HEADERS"],

  SLEEPYCODE_AUTO_SHARE: truthy("SLEEPYCODE_AUTO_SHARE"),
  SLEEPYCODE_AUTO_HEAP_SNAPSHOT: truthy("SLEEPYCODE_AUTO_HEAP_SNAPSHOT"),
  SLEEPYCODE_GIT_BASH_PATH: process.env["SLEEPYCODE_GIT_BASH_PATH"],
  SLEEPYCODE_CONFIG: process.env["SLEEPYCODE_CONFIG"],
  SLEEPYCODE_CONFIG_CONTENT: process.env["SLEEPYCODE_CONFIG_CONTENT"],

  SLEEPYCODE_DISABLE_AUTOUPDATE: truthy("SLEEPYCODE_DISABLE_AUTOUPDATE"),

  // Defaults to false (rotation enabled). When enabled, the active log file is
  // never archived to <name>.log.<stamp> on hitting MAX_FILE_SIZE — it grows in
  // place. Useful when an external tool tails/manages the single log file.
  SLEEPYCODE_DISABLE_LOG_ROTATION: truthy("SLEEPYCODE_DISABLE_LOG_ROTATION"),

  // Defaults to true (analytics enabled). Set SLEEPYCODE_ENABLE_ANALYSIS=false
  // to opt out of POSTing model_call/tool_call/agent_request metrics.
  SLEEPYCODE_ENABLE_ANALYSIS: !falsy("SLEEPYCODE_ENABLE_ANALYSIS"),
  SLEEPYCODE_ALWAYS_NOTIFY_UPDATE: truthy("SLEEPYCODE_ALWAYS_NOTIFY_UPDATE"),
  SLEEPYCODE_DISABLE_PRUNE: truthy("SLEEPYCODE_DISABLE_PRUNE"),
  SLEEPYCODE_DISABLE_TERMINAL_TITLE: truthy("SLEEPYCODE_DISABLE_TERMINAL_TITLE"),
  SLEEPYCODE_SHOW_TTFD: truthy("SLEEPYCODE_SHOW_TTFD"),
  SLEEPYCODE_PERMISSION: process.env["SLEEPYCODE_PERMISSION"],
  SLEEPYCODE_DISABLE_DEFAULT_PLUGINS: truthy("SLEEPYCODE_DISABLE_DEFAULT_PLUGINS"),
  SLEEPYCODE_DISABLE_LSP_DOWNLOAD: truthy("SLEEPYCODE_DISABLE_LSP_DOWNLOAD"),
  SLEEPYCODE_ENABLE_EXPERIMENTAL_MODELS: truthy("SLEEPYCODE_ENABLE_EXPERIMENTAL_MODELS"),
  SLEEPYCODE_DISABLE_AUTOCOMPACT: truthy("SLEEPYCODE_DISABLE_AUTOCOMPACT"),
  SLEEPYCODE_DISABLE_MODELS_FETCH: truthy("SLEEPYCODE_DISABLE_MODELS_FETCH"),
  SLEEPYCODE_DISABLE_MOUSE: truthy("SLEEPYCODE_DISABLE_MOUSE"),
  SLEEPYCODE_OUTPUT_LENGTH_CONTINUATION_LIMIT: number("SLEEPYCODE_OUTPUT_LENGTH_CONTINUATION_LIMIT") ?? 3,
  SLEEPYCODE_INVALID_OUTPUT_CONTINUATION_LIMIT: number("SLEEPYCODE_INVALID_OUTPUT_CONTINUATION_LIMIT") ?? 2,
  SLEEPYCODE_TEXT_TOOL_CALL_RETRY_LIMIT: number("SLEEPYCODE_TEXT_TOOL_CALL_RETRY_LIMIT") ?? 2,

  // Sliding-window n-gram repetition detection for streamed reasoning + text.
  // An n-gram of size N appearing REPEAT_THRESHOLD times within the last
  // WINDOW_TOKENS tokens triggers recovery (remind → replan → terminate).
  SLEEPYCODE_TEXT_NGRAM_N: number("SLEEPYCODE_TEXT_NGRAM_N") ?? 6,
  SLEEPYCODE_TEXT_REPEAT_THRESHOLD: number("SLEEPYCODE_TEXT_REPEAT_THRESHOLD") ?? 3,
  SLEEPYCODE_TEXT_WINDOW_TOKENS: number("SLEEPYCODE_TEXT_WINDOW_TOKENS") ?? 500,

  // Caps applied to image attachments before a prompt is sent. Both default to
  // undefined (no limit). SLEEPYCODE_MAX_PROMPT_IMAGES bounds how many images may
  // be sent per request (oldest excess images are dropped); SLEEPYCODE_MAX_PROMPT_IMAGE_SIZE
  // bounds the decoded byte size of a single image. Values must be positive integers.
  SLEEPYCODE_MAX_PROMPT_IMAGES: number("SLEEPYCODE_MAX_PROMPT_IMAGES"),
  SLEEPYCODE_MAX_PROMPT_IMAGE_SIZE: number("SLEEPYCODE_MAX_PROMPT_IMAGE_SIZE"),
  SLEEPYCODE_SLEEPY_ONLY,
  SLEEPYCODE_DISABLE_PROVIDER_ENV: SLEEPYCODE_SLEEPY_ONLY || truthy("SLEEPYCODE_DISABLE_PROVIDER_ENV"),
  SLEEPYCODE_DISABLE_CLAUDE_CODE,
  get SLEEPYCODE_DISABLE_CLAUDE_CODE_MCP() {
    // MCP compatibility stays on in sleepy-only mode so users can reuse Claude Code
    // MCP servers without inheriting prompts, skills, or provider env keys.
    return SLEEPYCODE_DISABLE_CLAUDE_CODE_ENV || truthy("SLEEPYCODE_DISABLE_CLAUDE_CODE_MCP")
  },
  SLEEPYCODE_DISABLE_CLAUDE_CODE_PROMPT: SLEEPYCODE_DISABLE_CLAUDE_CODE || truthy("SLEEPYCODE_DISABLE_CLAUDE_CODE_PROMPT"),
  // Defaults to false (enabled): markdown commands under ~/.claude/commands and
  // {project}/.claude/commands load as slash commands. Independent of the
  // sleepy-only master switch. Set SLEEPYCODE_DISABLE_CLAUDE_CODE_COMMANDS=true to disable.
  SLEEPYCODE_DISABLE_CLAUDE_CODE_COMMANDS: truthy("SLEEPYCODE_DISABLE_CLAUDE_CODE_COMMANDS"),
  SLEEPYCODE_DISABLE_CLAUDE_CODE_SKILLS,
  SLEEPYCODE_DISABLE_EXTERNAL_SKILLS,
  SLEEPYCODE_DISABLE_CODEX_SKILLS: SLEEPYCODE_DISABLE_EXTERNAL_SKILLS || truthy("SLEEPYCODE_DISABLE_CODEX_SKILLS"),
  SLEEPYCODE_DISABLE_OPENCODE_SKILLS: SLEEPYCODE_DISABLE_EXTERNAL_SKILLS || truthy("SLEEPYCODE_DISABLE_OPENCODE_SKILLS"),
  SLEEPYCODE_FAKE_VCS: process.env["SLEEPYCODE_FAKE_VCS"],

  // When enabled, skips all git subprocess calls during project discovery
  // (which git, rev-parse --git-common-dir, rev-parse --show-toplevel) and
  // branch detection. The project is treated as a non-git directory rooted at
  // the working directory. Use to avoid touching git in restricted/sandboxed
  // environments or where git startup probing is undesirable.
  SLEEPYCODE_DISABLE_GIT: truthy("SLEEPYCODE_DISABLE_GIT"),
  SLEEPYCODE_SERVER_PASSWORD: process.env["SLEEPYCODE_SERVER_PASSWORD"],
  SLEEPYCODE_SERVER_USERNAME: process.env["SLEEPYCODE_SERVER_USERNAME"],
  SLEEPYCODE_ENABLE_QUESTION_TOOL: truthy("SLEEPYCODE_ENABLE_QUESTION_TOOL"),

  // Experimental
  SLEEPYCODE_EXPERIMENTAL,
  SLEEPYCODE_EXPERIMENTAL_FILEWATCHER: Config.boolean("SLEEPYCODE_EXPERIMENTAL_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  SLEEPYCODE_EXPERIMENTAL_DISABLE_FILEWATCHER: Config.boolean("SLEEPYCODE_EXPERIMENTAL_DISABLE_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  SLEEPYCODE_EXPERIMENTAL_ICON_DISCOVERY: SLEEPYCODE_EXPERIMENTAL || truthy("SLEEPYCODE_EXPERIMENTAL_ICON_DISCOVERY"),
  SLEEPYCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT:
    copy === undefined ? process.platform === "win32" : truthy("SLEEPYCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"),
  SLEEPYCODE_ENABLE_EXA: truthy("SLEEPYCODE_ENABLE_EXA") || SLEEPYCODE_EXPERIMENTAL || truthy("SLEEPYCODE_EXPERIMENTAL_EXA"),
  SLEEPYCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS: number("SLEEPYCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS"),
  SLEEPYCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX: number("SLEEPYCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX"),
  SLEEPYCODE_EXPERIMENTAL_OXFMT: SLEEPYCODE_EXPERIMENTAL || truthy("SLEEPYCODE_EXPERIMENTAL_OXFMT"),
  SLEEPYCODE_EXPERIMENTAL_LSP_TY: truthy("SLEEPYCODE_EXPERIMENTAL_LSP_TY"),
  SLEEPYCODE_EXPERIMENTAL_LSP_TOOL: SLEEPYCODE_EXPERIMENTAL || truthy("SLEEPYCODE_EXPERIMENTAL_LSP_TOOL"),
  // Defaults to true: dynamic workflow + built-in deep-research are on by default.
  // Set SLEEPYCODE_EXPERIMENTAL_WORKFLOW_TOOL=false to opt out. The env-var name is
  // kept for backwards compat (long-running experiments still pass it as `1`).
  SLEEPYCODE_EXPERIMENTAL_WORKFLOW_TOOL: !falsy("SLEEPYCODE_EXPERIMENTAL_WORKFLOW_TOOL"),
  SLEEPYCODE_EXPERIMENTAL_MARKDOWN: !falsy("SLEEPYCODE_EXPERIMENTAL_MARKDOWN"),
  SLEEPYCODE_MODELS_URL: process.env["SLEEPYCODE_MODELS_URL"],
  SLEEPYCODE_MODELS_PATH: process.env["SLEEPYCODE_MODELS_PATH"],
  SLEEPYCODE_DISABLE_EMBEDDED_WEB_UI: truthy("SLEEPYCODE_DISABLE_EMBEDDED_WEB_UI"),
  SLEEPYCODE_DB: process.env["SLEEPYCODE_DB"],

  // Defaults to true — all channels share a single sleepycode.db. The per-channel
  // DB isolation (sleepycode-{channel}.db) is unnecessary for sleepycode since we
  // don't ship multiple release channels yet. Use SLEEPY_HOME to isolate dev
  // environments instead. Set SLEEPYCODE_DISABLE_CHANNEL_DB=false to restore
  // per-channel isolation.
  SLEEPYCODE_DISABLE_CHANNEL_DB: !falsy("SLEEPYCODE_DISABLE_CHANNEL_DB"),
  SLEEPYCODE_SKIP_MIGRATIONS: truthy("SLEEPYCODE_SKIP_MIGRATIONS"),
  SLEEPYCODE_STRICT_CONFIG_DEPS: truthy("SLEEPYCODE_STRICT_CONFIG_DEPS"),

  SLEEPYCODE_WORKSPACE_ID: process.env["SLEEPYCODE_WORKSPACE_ID"],
  SLEEPYCODE_EXPERIMENTAL_HTTPAPI: truthy("SLEEPYCODE_EXPERIMENTAL_HTTPAPI"),
  SLEEPYCODE_EXPERIMENTAL_WORKSPACES: SLEEPYCODE_EXPERIMENTAL || truthy("SLEEPYCODE_EXPERIMENTAL_WORKSPACES"),

  // Evaluated at access time (not module load) because tests, the CLI, and
  // external tooling set these env vars at runtime.

  // Disables compose-agent-internal skills (e.g. compose:plan, compose:review,
  // compose:tdd). These are hidden workflow-orchestration skills only visible
  // to the compose agent and are NOT part of builtin skills.
  get SLEEPYCODE_DISABLE_COMPOSE_SKILLS() {
    return truthy("SLEEPYCODE_DISABLE_COMPOSE_SKILLS")
  },
  // Disables user-facing builtin skills shipped with the binary (e.g.
  // self-extend). Does not affect compose skills — the two sets are
  // independent and non-overlapping.
  get SLEEPYCODE_DISABLE_BUILTIN_SKILLS() {
    return truthy("SLEEPYCODE_DISABLE_BUILTIN_SKILLS")
  },
  get SLEEPYCODE_DISABLE_PROJECT_CONFIG() {
    return truthy("SLEEPYCODE_DISABLE_PROJECT_CONFIG")
  },
  get SLEEPYCODE_TUI_CONFIG() {
    return process.env["SLEEPYCODE_TUI_CONFIG"]
  },
  get SLEEPYCODE_CONFIG_DIR() {
    return process.env["SLEEPYCODE_CONFIG_DIR"]
  },
  get SLEEPY_HOME() {
    return process.env["SLEEPY_HOME"]
  },
  get SLEEPYCODE_PURE() {
    return truthy("SLEEPYCODE_PURE")
  },
  get SLEEPYCODE_PLUGIN_META_FILE() {
    return process.env["SLEEPYCODE_PLUGIN_META_FILE"]
  },
  get SLEEPYCODE_CLIENT() {
    return process.env["SLEEPYCODE_CLIENT"] ?? "cli"
  },
}
