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

function nonNegativeNumber(key: string) {
  const value = process.env[key]
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
}

// A fraction in (0, 1], written either as a decimal ("0.85") or a percentage
// ("85%"). Values outside the range — and anything unparseable — yield undefined
// so the caller keeps its own default.
function ratio(key: string) {
  const value = process.env[key]?.trim()
  if (!value) return undefined
  const parsed = value.endsWith("%") ? Number(value.slice(0, -1)) / 100 : Number(value)
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 1 ? parsed : undefined
}

const SLEEPYCODE_EXPERIMENTAL = truthy("SLEEPYCODE_EXPERIMENTAL")

// Defaults to false. When enabled, sleepycode does not inherit Claude Code's
// settings (CLAUDE.md, ~/.claude/skills, etc.) and does not pick up provider
// API keys from environment variables.
const SLEEPYCODE_DISABLE_CLAUDE_CODE_ENV = truthy("SLEEPYCODE_DISABLE_CLAUDE_CODE")
const SLEEPYCODE_DISABLE_CLAUDE_CODE = SLEEPYCODE_DISABLE_CLAUDE_CODE_ENV

const SLEEPYCODE_DISABLE_EXTERNAL_SKILLS = truthy("SLEEPYCODE_DISABLE_EXTERNAL_SKILLS")
const SLEEPYCODE_DISABLE_CLAUDE_CODE_SKILLS =
  SLEEPYCODE_DISABLE_EXTERNAL_SKILLS || SLEEPYCODE_DISABLE_CLAUDE_CODE || truthy("SLEEPYCODE_DISABLE_CLAUDE_CODE_SKILLS")
const copy = process.env["SLEEPYCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]

/**
 * Password for a listener nobody asked for, held in memory only.
 *
 * Opening a socket makes every instance route reachable by any process running as
 * this user — `/file` reads and writes the project, `/pty` and `/bash-interactive`
 * run commands. The token-authenticated `/v1` routes are carved out of basic auth on
 * purpose (see `server/middleware.ts`), so generating this closes everything else
 * without closing the surface the listener exists for.
 */
let generatedServerPassword: string | undefined

/**
 * Generate the password for an implicit listener, once.
 *
 * Idempotent: a second listener in the same process must not invalidate the
 * credential the first one is already authenticating against. A user-supplied
 * password always wins, and in that case nothing is generated at all — the operator
 * has already said what auth should be.
 */
export function generateServerPassword() {
  if (process.env["SLEEPYCODE_SERVER_PASSWORD"]) return
  generatedServerPassword ??= Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")
}

/**
 * Disarm the generated password once its listener is gone.
 *
 * A credential outliving the socket it was minted for is state with no owner: nothing can
 * present it any more, but every in-process request still has to satisfy it. Clearing it
 * belongs with `stop()` for the same reason unpublishing the address does.
 */
export function clearGeneratedServerPassword() {
  generatedServerPassword = undefined
}

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

  // Defaults to false. When false, the bash tool intercepts irreversible
  // deletion commands (rm, rmdir, unlink, shred, del, erase, rd, remove-item,
  // and git destructive subcommands like reset --hard / clean -f / branch -D /
  // worktree remove / push --force / stash drop|clear / tag -d) and forces an
  // extra permission prompt with permission="bash_delete" — separate from the
  // normal bash-permission ask so it can't be silently pre-approved by a broad
  // `bash: allow` rule. Set SLEEPYCODE_AUTO_APPROVE_DELETE=true to trust the
  // model with deletes and skip the second confirmation.
  // Read lazily (getter, not an eagerly-evaluated literal) so an embedder can
  // flip it at runtime: the desktop app runs the server in-process, so its
  // approval mode — switchable mid-session, like the TUI's /skip-permissions —
  // has no process boundary at which to re-read env. A literal would freeze
  // this at module-evaluation time and make every later write a no-op.
  get SLEEPYCODE_AUTO_APPROVE_DELETE() {
    return truthy("SLEEPYCODE_AUTO_APPROVE_DELETE")
  },
  // Set by the TUI's --dangerously-skip-permissions flag. When truthy, an
  // allow-all base ruleset is injected UNDER the user's config permission so
  // every tool auto-approves unless the user explicitly denied it.
  SLEEPYCODE_DANGEROUSLY_SKIP_PERMISSIONS: truthy("SLEEPYCODE_DANGEROUSLY_SKIP_PERMISSIONS"),
  SLEEPYCODE_DISABLE_DEFAULT_PLUGINS: truthy("SLEEPYCODE_DISABLE_DEFAULT_PLUGINS"),
  SLEEPYCODE_DISABLE_LSP_DOWNLOAD: truthy("SLEEPYCODE_DISABLE_LSP_DOWNLOAD"),
  SLEEPYCODE_ENABLE_EXPERIMENTAL_MODELS: truthy("SLEEPYCODE_ENABLE_EXPERIMENTAL_MODELS"),
  // Defaults to false. When enabled, checkpoint writers, checkpoint-based
  // context rebuilds, and checkpoint copy in the system prompt and tool
  // schemas are disabled; context overflow falls back to compaction.
  // Read lazily so tests and in-process embedders can toggle it at runtime.
  get SLEEPYCODE_DISABLE_CHECKPOINT() {
    return truthy("SLEEPYCODE_DISABLE_CHECKPOINT")
  },
  SLEEPYCODE_DISABLE_AUTOCOMPACT: truthy("SLEEPYCODE_DISABLE_AUTOCOMPACT"),
  // Default compaction trigger, used when `compaction.max_context` is not set in
  // config. Same grammar as that config field: an absolute token count
  // ("300000"), a shorthand ("300K", "1M"), or a percentage of the model window
  // ("50%"). Clamped to the model window — it can only lower the trigger, never
  // raise it. An explicit `compaction.max_context` in config overrides this.
  // Pairs with SLEEPYCODE_DISABLE_CHECKPOINT: on the checkpoint-off fallback path
  // this is how the compaction threshold is tuned via env alone. Read lazily so
  // tests and in-process embedders can toggle it at runtime.
  get SLEEPYCODE_COMPACTION_MAX_CONTEXT() {
    return process.env["SLEEPYCODE_COMPACTION_MAX_CONTEXT"]
  },
  // Fraction of the working window at which compaction fires; the remaining
  // headroom is what the summary generation gets to write into. Accepts a decimal
  // ("0.85") or a percentage ("85%"); anything unparseable or outside (0, 1] is
  // ignored and the 0.9 default stands. Applies on top of whatever window
  // `compaction.max_context` / SLEEPYCODE_COMPACTION_MAX_CONTEXT resolved to, so
  // the two compose rather than override each other. Read lazily so tests and
  // in-process embedders can toggle it at runtime.
  get SLEEPYCODE_COMPACTION_TRIGGER_RATIO() {
    return ratio("SLEEPYCODE_COMPACTION_TRIGGER_RATIO") ?? 0.9
  },
  SLEEPYCODE_DISABLE_MODELS_FETCH: truthy("SLEEPYCODE_DISABLE_MODELS_FETCH"),
  // Defaults to automatic model inference. Explicit true forces every model to
  // use the GPT system prompt and Codex toolset; explicit false forces even GPT
  // models to use the default prompt and toolset.
  get SLEEPYCODE_CODEX_MODE() {
    if (truthy("SLEEPYCODE_CODEX_MODE")) return true
    if (falsy("SLEEPYCODE_CODEX_MODE")) return false
    return undefined
  },
  SLEEPYCODE_DISABLE_MOUSE: truthy("SLEEPYCODE_DISABLE_MOUSE"),
  SLEEPYCODE_OUTPUT_LENGTH_CONTINUATION_LIMIT: number("SLEEPYCODE_OUTPUT_LENGTH_CONTINUATION_LIMIT") ?? 3,
  SLEEPYCODE_INVALID_OUTPUT_CONTINUATION_LIMIT: number("SLEEPYCODE_INVALID_OUTPUT_CONTINUATION_LIMIT") ?? 2,
  SLEEPYCODE_TEXT_TOOL_CALL_RETRY_LIMIT: number("SLEEPYCODE_TEXT_TOOL_CALL_RETRY_LIMIT") ?? 2,
  // Defaults to false. When enabled, unsigned historical reasoning sent through
  // the Anthropic Messages format receives an empty placeholder signature so it
  // follows the same native thinking-block serialization path as signed content.
  get SLEEPYCODE_FORCE_ANTHROPIC_REASONING_CONTENT() {
    return truthy("SLEEPYCODE_FORCE_ANTHROPIC_REASONING_CONTENT")
  },

  // Consecutive-block repetition detection for streamed reasoning + text.
  // A block of at least N tokens repeating REPEAT_THRESHOLD times consecutively
  // within the last WINDOW_TOKENS tokens triggers recovery (remind → replan → terminate).
  SLEEPYCODE_TEXT_NGRAM_N: number("SLEEPYCODE_TEXT_NGRAM_N") ?? 4,
  SLEEPYCODE_TEXT_REPEAT_THRESHOLD: number("SLEEPYCODE_TEXT_REPEAT_THRESHOLD") ?? 20,
  SLEEPYCODE_TEXT_WINDOW_TOKENS: number("SLEEPYCODE_TEXT_WINDOW_TOKENS") ?? 500,

  // Caps applied to image attachments before a prompt is sent.
  // SLEEPYCODE_MAX_PROMPT_IMAGES (default undefined = no count limit) bounds how
  // many images may be sent per request (oldest excess images are dropped).
  // SLEEPYCODE_MAX_PROMPT_IMAGE_SIZE overrides the default per-image byte cap
  // (DEFAULT_MAX_IMAGE_BYTES ~4.5 MB, kept under the provider 5 MB hard limit);
  // oversized images are recompressed under the cap, or stripped to a text
  // placeholder when they can't be compressed. Values must be positive integers.
  SLEEPYCODE_MAX_PROMPT_IMAGES: number("SLEEPYCODE_MAX_PROMPT_IMAGES"),
  SLEEPYCODE_MAX_PROMPT_IMAGE_SIZE: number("SLEEPYCODE_MAX_PROMPT_IMAGE_SIZE"),
  SLEEPYCODE_DISABLE_PROVIDER_ENV: truthy("SLEEPYCODE_DISABLE_PROVIDER_ENV"),
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
  SLEEPYCODE_DISABLE_AGENTS_SKILLS: SLEEPYCODE_DISABLE_EXTERNAL_SKILLS || truthy("SLEEPYCODE_DISABLE_AGENTS_SKILLS"),
  SLEEPYCODE_DISABLE_CODEX_SKILLS: SLEEPYCODE_DISABLE_EXTERNAL_SKILLS || truthy("SLEEPYCODE_DISABLE_CODEX_SKILLS"),
  SLEEPYCODE_DISABLE_OPENCODE_SKILLS: SLEEPYCODE_DISABLE_EXTERNAL_SKILLS || truthy("SLEEPYCODE_DISABLE_OPENCODE_SKILLS"),

  // Skill-search ranking and loading policy. Exact mentions stay above BM25;
  // the BM25/coverage blend has a 0.90 ceiling, and near-max results auto-load.
  SLEEPYCODE_SKILL_SEARCH_EXACT_SCORE: 1,
  SLEEPYCODE_SKILL_SEARCH_BM25_K1: 1.5,
  SLEEPYCODE_SKILL_SEARCH_BM25_LENGTH_NORMALIZATION: 0.75,
  SLEEPYCODE_SKILL_SEARCH_BM25_IDF_SMOOTHING: 0.5,
  SLEEPYCODE_SKILL_SEARCH_BM25_SCORE_WEIGHT: 0.55,
  SLEEPYCODE_SKILL_SEARCH_QUERY_COVERAGE_WEIGHT: 0.35,
  SLEEPYCODE_SKILL_SEARCH_AUTO_LOAD_THRESHOLD: 0.85,
  SLEEPYCODE_SKILL_SEARCH_SCORE_PRECISION: 4,
  SLEEPYCODE_SKILL_SEARCH_MAX_RESULTS: 3,
  SLEEPYCODE_SKILL_SEARCH_STEM_MIN_LENGTH: 3,
  SLEEPYCODE_SKILL_SEARCH_FILE_SAMPLE_LIMIT: 10,

  // Defaults to false. When enabled, skill-source commands appear in the `/`
  // autocomplete dropdown alongside user commands and MCP prompts. Skills are
  // surfaced in `/` completion by default; set SLEEPYCODE_DISABLE_SLASH_SKILLS=1
  // to hide them and fall back to the `/skills` picker + model-driven
  // invocation only.
  SLEEPYCODE_DISABLE_SLASH_SKILLS: truthy("SLEEPYCODE_DISABLE_SLASH_SKILLS"),
  SLEEPYCODE_FAKE_VCS: process.env["SLEEPYCODE_FAKE_VCS"],

  // When enabled, skips all git subprocess calls during project discovery
  // (which git, rev-parse --git-common-dir, rev-parse --show-toplevel) and
  // branch detection. The project is treated as a non-git directory rooted at
  // the working directory. Use to avoid touching git in restricted/sandboxed
  // environments or where git startup probing is undesirable.
  SLEEPYCODE_DISABLE_GIT: truthy("SLEEPYCODE_DISABLE_GIT"),

  /**
   * The password every non-`/v1` route is authenticated against.
   *
   * A getter rather than a snapshot, because a listener the user did not ask for
   * generates one at bind time (see `generateServerPassword`). The generated value
   * is deliberately NOT written to `process.env`: every child we spawn inherits the
   * environment, and a subprocess is supposed to hold a scoped task token, never the
   * credential that opens the whole instance API.
   */
  get SLEEPYCODE_SERVER_PASSWORD() {
    return process.env["SLEEPYCODE_SERVER_PASSWORD"] || generatedServerPassword
  },
  /**
   * Did the OPERATOR configure auth, as opposed to us generating a password for a
   * listener we opened on our own initiative?
   *
   * The difference is load-bearing for `InstanceMiddleware`: a user-secured server is
   * allowed to serve directories outside its cwd (the desktop engine does exactly
   * that), while an implicit listener must stay pinned to one project no matter what
   * credential guards it.
   */
  get SLEEPYCODE_SERVER_PASSWORD_SUPPLIED() {
    return Boolean(process.env["SLEEPYCODE_SERVER_PASSWORD"])
  },
  SLEEPYCODE_SERVER_USERNAME: process.env["SLEEPYCODE_SERVER_USERNAME"],
  SLEEPYCODE_ENABLE_QUESTION_TOOL: truthy("SLEEPYCODE_ENABLE_QUESTION_TOOL"),

  // Defaults to false. Set SLEEPYCODE_ENABLE_TRY_BEST_HANDOFF=true (or 1) to
  // enable try-best loop detection, automatic turn pausing, and handoff UI.
  SLEEPYCODE_ENABLE_TRY_BEST_HANDOFF: truthy("SLEEPYCODE_ENABLE_TRY_BEST_HANDOFF"),

  // Defaults to false. Opt in to append the runtime-derived environment block
  // (working directory, platform, shell, git status/branch/commits) to the model's
  // system prompt. Instruction files (AGENTS.md / CLAUDE.md) are appended
  // regardless — suppress the whole block with SLEEPYCODE_DISABLE_INSTRUCTIONS, or
  // individual sources with SLEEPYCODE_DISABLE_PROJECT_CONFIG /
  // SLEEPYCODE_DISABLE_CLAUDE_CODE_PROMPT.
  get SLEEPYCODE_ENABLE_DYNAMIC_SYSTEM_PROMPT() {
    return truthy("SLEEPYCODE_ENABLE_DYNAMIC_SYSTEM_PROMPT")
  },

  // Defaults to false (enabled): instruction-file content (AGENTS.md / CLAUDE.md)
  // is appended to the model's system prompt. Set SLEEPYCODE_DISABLE_INSTRUCTIONS=true
  // to drop the whole instruction block regardless of which files resolve.
  get SLEEPYCODE_DISABLE_INSTRUCTIONS() {
    return truthy("SLEEPYCODE_DISABLE_INSTRUCTIONS")
  },

  // Defaults to false. The edit tool does pure exact-string matching with
  // explicit error signals. Set SLEEPYCODE_ENABLE_FUZZY_EDIT=true to opt into the
  // legacy multi-stage fuzzy fallback chain (line-trimmed / block-anchor /
  // whitespace-normalized / indentation-flexible / etc.) when old_string fails
  // to match exactly.
  SLEEPYCODE_ENABLE_FUZZY_EDIT: truthy("SLEEPYCODE_ENABLE_FUZZY_EDIT"),

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
  // Token-efficient post-cleanse: strip ANSI / fold \r progress bars / redact
  // secrets / elide super-long lines from bash tool output before it is
  // returned to the model. Only applies when the output fits inline — if the
  // output spills to a truncation file, cleaning is skipped so the on-disk
  // archive stays raw. Off by default. Set to 1/true to opt in.
  SLEEPYCODE_EXPERIMENTAL_TOKEN_EFFICIENCY: truthy("SLEEPYCODE_EXPERIMENTAL_TOKEN_EFFICIENCY"),
  // Tunables for the token-efficient post-cleanse pipeline (see
  // src/tool/bash_token_efficient_pipeline.ts). Positive integers only;
  // unset / non-positive values fall back to the documented defaults.
  //   MAX_LINE_CHARS   threshold above which a single line is elided  (default 500)
  //   LINE_HEAD_KEEP   chars kept from the head of an elided line     (default 160)
  //   NEVER_WORSE_MARGIN  bytes the cleaned output must beat the raw  (default 0)
  SLEEPYCODE_EXPERIMENTAL_TOKEN_EFFICIENCY_MAX_LINE_CHARS: number("SLEEPYCODE_EXPERIMENTAL_TOKEN_EFFICIENCY_MAX_LINE_CHARS") ?? 500,
  SLEEPYCODE_EXPERIMENTAL_TOKEN_EFFICIENCY_LINE_HEAD_KEEP: number("SLEEPYCODE_EXPERIMENTAL_TOKEN_EFFICIENCY_LINE_HEAD_KEEP") ?? 160,
  SLEEPYCODE_EXPERIMENTAL_TOKEN_EFFICIENCY_NEVER_WORSE_MARGIN: number("SLEEPYCODE_EXPERIMENTAL_TOKEN_EFFICIENCY_NEVER_WORSE_MARGIN") ?? 0,
  // Heuristic (shape-based) filter pipeline for bash output. Runs AFTER the
  // common pipeline, only when the common pipeline is enabled AND this flag is
  // explicitly opted in. Each shape (gitdiff / pytest / npm / make /
  // stacktrace / tsc / kubectl / json / md / gostest) recognises a command
  // pattern or body fingerprint and rewrites the body to strip predictable
  // noise. Off by default. Set to 1/true to opt in.
  SLEEPYCODE_EXPERIMENTAL_TOKEN_EFFICIENCY_HEURISTIC: truthy("SLEEPYCODE_EXPERIMENTAL_TOKEN_EFFICIENCY_HEURISTIC"),
  SLEEPYCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX: number("SLEEPYCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX"),
  SLEEPYCODE_EXPERIMENTAL_OXFMT: SLEEPYCODE_EXPERIMENTAL || truthy("SLEEPYCODE_EXPERIMENTAL_OXFMT"),
  SLEEPYCODE_EXPERIMENTAL_LSP_TY: truthy("SLEEPYCODE_EXPERIMENTAL_LSP_TY"),
  SLEEPYCODE_EXPERIMENTAL_LSP_TOOL: SLEEPYCODE_EXPERIMENTAL || truthy("SLEEPYCODE_EXPERIMENTAL_LSP_TOOL"),
  // Defaults to OFF: exec (tool_script orchestration) is registered only for
  // GPT-toolset models. Opt in here to expose it to every model.
  SLEEPYCODE_ENABLE_EXEC_TOOL: truthy("SLEEPYCODE_ENABLE_EXEC_TOOL"),
  // Defaults to OFF for non-GPT models. GPT models enable MCP Tool Search in
  // SessionPrompt regardless of this flag. Opt in here to enable it for every
  // function-calling model.
  SLEEPYCODE_EXPERIMENTAL_MCP_TOOL_SEARCH:
    SLEEPYCODE_EXPERIMENTAL || truthy("SLEEPYCODE_EXPERIMENTAL_MCP_TOOL_SEARCH"),
  // Defaults to OFF (opt-in): the Orchestrator primary mode — a general
  // coordinator that delegates to child sessions via the `session` tool, with a
  // global singleton workspace and child permission-approval routing. Enable with
  // SLEEPYCODE_EXPERIMENTAL_ORCHESTRATOR=true (or the umbrella SLEEPYCODE_EXPERIMENTAL).
  SLEEPYCODE_EXPERIMENTAL_ORCHESTRATOR: SLEEPYCODE_EXPERIMENTAL || truthy("SLEEPYCODE_EXPERIMENTAL_ORCHESTRATOR"),
  // Defaults to OFF (opt-in): dynamic workflows and built-in workflows.
  // Enable with SLEEPYCODE_EXPERIMENTAL_WORKFLOW_TOOL=true (or the umbrella
  // SLEEPYCODE_EXPERIMENTAL flag).
  SLEEPYCODE_EXPERIMENTAL_WORKFLOW_TOOL:
    SLEEPYCODE_EXPERIMENTAL || truthy("SLEEPYCODE_EXPERIMENTAL_WORKFLOW_TOOL"),
  // Defaults to true: cron + self-paced loop scheduling are on by default.
  // Set SLEEPYCODE_EXPERIMENTAL_CRON=false to opt out. Runtime kill switch is
  // SLEEPYCODE_DISABLE_CRON (checked live every tick).
  SLEEPYCODE_EXPERIMENTAL_CRON: !falsy("SLEEPYCODE_EXPERIMENTAL_CRON"),
  // Keepalive contract for self-paced loops (spec [S8]). Budget = how many
  // "forget" turns the model gets before the loop is declared model_stopped;
  // delay seconds = the auto-arm horizon used for the keepalive fire. Budget
  // accepts 0 (end immediately on the first turn without a re-arm) for tests
  // and aggressive policies. Both are getters so tests can flip the env var
  // between cases without restarting the process.
  get SLEEPYCODE_LOOP_KEEPALIVE_BUDGET() {
    return nonNegativeNumber("SLEEPYCODE_LOOP_KEEPALIVE_BUDGET") ?? 1
  },
  get SLEEPYCODE_LOOP_KEEPALIVE_DELAY_S() {
    return number("SLEEPYCODE_LOOP_KEEPALIVE_DELAY_S") ?? 1200
  },
  SLEEPYCODE_EXPERIMENTAL_MARKDOWN: !falsy("SLEEPYCODE_EXPERIMENTAL_MARKDOWN"),
  SLEEPYCODE_MODELS_URL: process.env["SLEEPYCODE_MODELS_URL"],
  SLEEPYCODE_MODELS_PATH: process.env["SLEEPYCODE_MODELS_PATH"],
  SLEEPYCODE_DISABLE_EMBEDDED_WEB_UI: truthy("SLEEPYCODE_DISABLE_EMBEDDED_WEB_UI"),
  SLEEPYCODE_DB: process.env["SLEEPYCODE_DB"],

  // Defaults to true — all channels share a single sleepycode.db. The per-channel
  // DB isolation (sleepycode-{channel}.db) is unnecessary for sleepycode since we
  // don't ship multiple release channels yet. Use SLEEPYCODE_HOME to isolate dev
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
  // evolve). Does not affect compose skills — the two sets are
  // independent and non-overlapping.
  get SLEEPYCODE_DISABLE_BUILTIN_SKILLS() {
    return truthy("SLEEPYCODE_DISABLE_BUILTIN_SKILLS")
  },
  // Disables the built-in official skills (docx, pdf, pptx, xlsx,
  // html-to-video-pipeline) while keeping the rest of the builtin bundle
  // available. Defaults to false (all skills are extracted and loaded). Set
  // SLEEPYCODE_DISABLE_OFFICIAL_SKILLS=true to skip them.
  get SLEEPYCODE_DISABLE_OFFICIAL_SKILLS() {
    return truthy("SLEEPYCODE_DISABLE_OFFICIAL_SKILLS")
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
