/**
 * Branding layer for the SleepyCode fork.
 *
 * The fork is *upstream plus a branding layer*. That layer is a *derived* function of
 * upstream text, not hand-edited source: `bun run script/sync-upstream.ts verify` confirms
 * rebrand(upstream) is byte-identical to the fork for ~99% of branding-only files.
 *
 * Treating branding as data instead of merging it through git is what makes upstream
 * syncs tractable. `bun run script/fork-delta.ts` measures it tip-to-tip: of every path
 * where our tree and upstream's differ, 830 are exactly `rebrand(upstream)` and only 80
 * carry real fork logic. Those 830 re-project onto ANY upstream for free.
 *
 * ## Upstreams
 *
 * `MiMo-Code` is itself an opencode fork, so the fork has two possible ancestors. They
 * are declared here as `UpstreamProfile`s rather than hard-coded, so switching parents is
 * a data change (`useUpstream("opencode")` or `SLEEPYCODE_UPSTREAM=opencode`) and not a
 * rewrite of this module. The exported `MAP`/`PROTECT`/`rebrand`/`debrand` stay as the
 * active profile's view so existing callers keep working unchanged.
 *
 * ## Why the upstream identity belongs in data
 *
 * `debrand()` is only sound when the map is INJECTIVE, i.e. no two distinct upstream
 * tokens collapse onto the same fork token. The mimo map cannot be: the fork chose the
 * one-word product name "Sleepy", so `MiMo` and `Mimo` both land on `Sleepy` and
 * `MiMoCode`/`Mimocode`/`MimoCode` all land on `SleepyCode`. `debrand("Sleepy Code")` then
 * cannot recover `MiMo Code`, it silently emits `Mimo Code` - which masks real upstream
 * changes during a merge. Run `bun run script/lib/branding.ts` to print the measured
 * collision set; it is computed from the maps, never asserted in a comment.
 *
 * The opencode map has no such forced collapse. Its upstream spells itself `opencode`
 * and `OpenCode` only (measured: 28226 / 12209 occurrences in `opencode/v1`), so a
 * case-preserving map is injective and `debrand` becomes sound there. That is the single
 * strongest technical argument for re-parenting onto opencode, and it is only visible
 * because the maps are data.
 *
 * SAFETY: the map is token-aware and fails closed. `audit()` reports any surviving
 * upstream token so a human classifies it, rather than letting a blind replace corrupt
 * real things. A naive `s/mimo/sleepy/` would turn the Spanish word "asumimos" into
 * "asusleepys" and would re-point the wire constant `com.xiaomi.mimo/turn-lifecycle`
 * away from the MiMo MCP server that advertises it.
 */

/**
 * One possible upstream. Everything that differs between two ancestors lives here, so
 * `rebrand` itself is ancestor-agnostic.
 */
export interface UpstreamProfile {
  /** Stable id, also the `SLEEPYCODE_UPSTREAM` value. */
  readonly id: string
  /** Human label for diagnostics. */
  readonly label: string
  /**
   * The whole rename table, applied in listed order. Ordered, not longest-first: the
   * specific rules deliberately precede the generic prefix rules and that ordering is
   * load-bearing (see MIMO below).
   */
  readonly map: ReadonlyArray<readonly [from: string, to: string]>
  /** Identifiers containing the upstream token that are NOT ours to rename. */
  readonly protect: ReadonlyArray<RegExp>
  /**
   * Global word scanner used by {@link audit} to find unshielded leftovers. Exposed as
   * data rather than derived from `map`: `map`'s LHS is a rename table, not a tokenizer,
   * and inferring one from it changed which strings get flagged (91 of 209 tracked files
   * that mention the token reported differently). Keep it literal.
   *
   * Match the CORE only - no surrounding boundary characters. Token edges are expanded by
   * {@link scanTokens}, because a single pattern carrying both a leading and a trailing
   * boundary class backtracks catastrophically on input that does not contain the token:
   * 64s to scan 200KB of a large JSON fixture, where core-plus-expand does the whole file
   * in 1ms.
   */
  readonly scan: RegExp
  /** Paths upstream ships that the fork renames. */
  readonly pathMap: ReadonlyArray<readonly [from: string, to: string]>
}

/** Characters that may sit inside an identifier. Mirrors the boundary class the scan used to inline. */
const TOKEN_EDGE = /[A-Za-z0-9_@:./+-]/

/**
 * Every distinct upstream-branded token in `text`, with its occurrence count.
 *
 * Reproduces the leftmost-longest, non-overlapping scan of the boundary-inclusive regex it
 * replaces - `opencode.ai` yields `opencode.ai`, `x-opencode-directory` yields
 * `x-opencode-directory`, and `opencode-opencode` yields that single token ONCE rather than
 * twice - but in linear time. A core starting inside a span an earlier match already claimed
 * is skipped, and that is what makes the counts match the old scanner.
 */
export function scanTokenCounts(text: string, profile: UpstreamProfile = active): Map<string, number> {
  const found = new Map<string, number>()
  const core = new RegExp(profile.scan.source, "g")
  let claimed = 0
  for (const m of text.matchAll(core)) {
    const at = m.index ?? 0
    if (at < claimed) continue
    let start = at
    let end = at + m[0].length
    while (start > 0 && TOKEN_EDGE.test(text[start - 1]!)) start--
    while (end < text.length && TOKEN_EDGE.test(text[end]!)) end++
    claimed = end
    const tok = text.slice(start, end)
    found.set(tok, (found.get(tok) ?? 0) + 1)
  }
  return found
}

/** Distinct tokens only, for callers that care which names appear and not how often. */
export function scanTokens(text: string, profile: UpstreamProfile = active): Set<string> {
  return new Set(scanTokenCounts(text, profile).keys())
}

/**
 * Ancestor we are on today: `XiaomiMiMo/MiMo-Code`.
 *
 * Order is load-bearing: `MIMOCODE_HOME` must precede `MIMOCODE_`, or the general
 * prefix rule would produce `SLEEPYCODE_HOME` instead of the fork's `SLEEPY_HOME`.
 *
 * Deliberate asymmetries that mirror decisions already in fork history - do not
 * "tidy" them without checking:
 *  - `MIMOCODE_HOME` -> `SLEEPY_HOME` (not SLEEPYCODE_HOME): fork's global data dir env.
 *  - `mimo-v2.5` / `mimo-auto` / `mimo-free` ARE renamed: unlike the protected
 *    `MiMo-V2-Pro` family, these are ids the fork's own gateway publishes, so they
 *    are ours to name.
 *  - `MiMo`/`Mimo` -> `Sleepy` (one word) is what makes this map lossy. See the header.
 */
const MIMO: UpstreamProfile = {
  id: "mimo",
  label: "XiaomiMiMo/MiMo-Code",
  map: [
    // npm scope
    ["@mimo-ai", "@sleepy-ai"],
    ["mimo-ai", "sleepy-ai"],
    // config dir + files
    [".mimocode", ".sleepycode"],
    ["mimocode.jsonc", "sleepycode.jsonc"],
    ["mimocode.json", "sleepycode.json"],
    // fork-specific global data dir env - MUST precede the generic prefix rule
    ["MIMOCODE_HOME", "SLEEPY_HOME"],
    ["mimocode_home", "sleepy_home"],
    // env var prefix
    ["MIMOCODE_", "SLEEPYCODE_"],
    ["mimocode_", "sleepycode_"],
    // http header
    ["x-mimocode-directory", "x-sleepycode-directory"],
    // identifiers
    ["resolveMimocodeHome", "resolveSleepyHome"],
    ["ensureMimocodeGitignore", "ensureSleepycodeGitignore"],
    ["MimocodeHome", "SleepyHome"],
    ["DialogMimoLogin", "DialogSleepyLogin"],
    ["MimoAuthPlugin", "SleepyAuthPlugin"],
    ["isMimoModel", "isSleepyModel"],
    ["usesMimoResponsesApi", "usesSleepyResponsesApi"],
    ["IconMiMo", "IconSleepy"],
    ["mimoRoot", "sleepyRoot"],
    // product name
    ["MiMoCode", "SleepyCode"],
    ["Mimocode", "SleepyCode"],
    ["MimoCode", "SleepyCode"],
    ["mimocode", "sleepycode"],
    ["MIMOCODE", "SLEEPYCODE"],
    // model aliases owned by the fork gateway
    ["mimo-v2.5", "sleepy-v2.5"],
    ["mimo-auto", "sleepy-auto"],
    ["mimo-free", "sleepy-free"],
    // standalone provider id + prose word
    ["MiMo", "Sleepy"],
    ["Mimo", "Sleepy"],
    ["MIMO", "SLEEPY"],
    ["mimo", "sleepy"],
  ],
  protect: [
    // Real Xiaomi/MiMo service hosts - renaming these breaks network calls.
    /mimo\.xiaomi\.com/,
    /xiaomimimo\.com/,
    // GitHub org / repo paths - the upstream we sync from.
    /XiaomiMiMo\/MiMo-Code/,
    /XiaomiMiMoPlatform/,
    /XiaomiMiMo/,
    // MCP wire-protocol capability: must match the key the server advertises.
    /com\.xiaomi\.mimo\/turn-lifecycle/,
    // Real upstream model names served by third-party providers.
    /MiMo-V2-Pro/,
    /MiMo-V2-Omni/,
    /MiMo-V2-Flash/,
    /mimo-v2-pro/,
    /mimo-v2-omni/,
    /mimo-v2-flash/,
    /xiaomi\/mimo-v2\.5/,
    // Bundled-runtime env vars read by vendored python inside builtin skills.
    // Renaming would desync the shell from the .py files that read them.
    /MIMO_PYTHON/,
    /MIMO_SOFFICE/,
    // Spanish prose that merely contains the substring "mimo".
    /asumimos/i,
  ],
  scan: /[Mm]imo/g,
  pathMap: [
    ["packages/opencode/bin/mimo", "packages/opencode/bin/sleepy"],
    ["packages/opencode/src/plugin/mimo.ts", "packages/opencode/src/plugin/sleepy.ts"],
    [
      "packages/opencode/src/tool/websearch/mimo.ts",
      "packages/opencode/src/tool/websearch/sleepy.ts",
    ],
    [
      "packages/opencode/src/cli/cmd/tui/component/dialog-mimo-login.tsx",
      "packages/opencode/src/cli/cmd/tui/component/dialog-sleepy-login.tsx",
    ],
    // NOTE: the repo-level `.mimocode/` config dir is deliberately NOT renamed. The fork
    // never moved it - all 9 files are still tracked under `.mimocode/` (verify with
    // `git ls-tree -r --name-only HEAD | grep '^\.mimocode'`). An earlier version of this
    // list claimed `.mimocode` -> `.sleepycode`, which made B'/U' project those paths into
    // a directory the fork does not have: upstream edits to `.mimocode/tui.json` etc. were
    // then silently dropped from the merge, and `verify` skipped them as "renamed by fork",
    // hiding them from the soundness measurement. Do not re-add it without actually
    // renaming the directory in the fork first.
  ],
}

/**
 * Candidate ancestor: `anomalyco/opencode`.
 *
 * Structural mirror of the mimo profile, derived from measurement of `opencode/v1`
 * (`git grep -o -E '[A-Za-z_]*[Oo]pen[Cc]ode[A-Za-z_]*' opencode/v1`):
 *   `@opencode-ai/*` workspace scope, `.opencode/` config dir, `OPENCODE_*` env prefix,
 *   `x-opencode-directory` header, and the token in exactly two casings.
 *
 * Unlike mimo this map is INJECTIVE, because `OpenCode` and `Opencode` land on distinct
 * fork tokens (`SleepyCode` / `Sleepycode`) instead of being collapsed together. That is
 * what buys a sound `debrand`. Collapsing `Opencode` into `SleepyCode` for brand
 * tidiness would reintroduce the mimo hazard, so do not "tidy" it without re-running
 * `bun run script/lib/branding.ts`.
 *
 * Not yet wired to a working port: PROTECT carries only the one externally-owned host
 * confirmed to be load-bearing (`opencode.ai`, 2224 refs in `opencode/v1`). Anything else
 * upstream contains must be classified before this profile is used for a real sync -
 * `audit()` is what surfaces the leftovers.
 */
const OPENCODE: UpstreamProfile = {
  id: "opencode",
  label: "anomalyco/opencode",
  map: [
    // npm scope
    ["@opencode-ai", "@sleepy-ai"],
    ["opencode-ai", "sleepy-ai"],
    // config dir + files
    [".opencode", ".sleepycode"],
    ["opencode.jsonc", "sleepycode.jsonc"],
    ["opencode.json", "sleepycode.json"],
    // env var prefix
    ["OPENCODE_", "SLEEPYCODE_"],
    ["opencode_", "sleepycode_"],
    // http header
    ["x-opencode-directory", "x-sleepycode-directory"],
    // product name - case-preserving, so the map stays injective
    ["OpenCode", "SleepyCode"],
    ["Opencode", "Sleepycode"],
    // camelCase. Upstream ships this casing too (openCodeUserAgent, openCodeOrganization),
    // and it is the ONLY variant the probe found the map missing, so it earns its slot by
    // measurement rather than by symmetry. Does not shadow the two above: neither "OpenCode"
    // nor "Opencode" contains "openCode" as a substring.
    ["openCode", "sleepyCode"],
    ["opencode", "sleepycode"],
    ["OPENCODE", "SLEEPYCODE"],
  ],
  protect: [
    // Real service host behind the config endpoint and the Zen gateway. Renaming any of
    // these re-points live network calls (2224 refs in `opencode/v1`).
    /opencode\.ai/,
  ],
  scan: /[Oo]pen[Cc]ode/g,
  pathMap: [],
}

export const UPSTREAMS: ReadonlyArray<UpstreamProfile> = [MIMO, OPENCODE]

/**
 * Active profile. Defaults to mimo (today's parent); `SLEEPYCODE_UPSTREAM` overrides it so
 * a sync run can be pointed at the other ancestor without editing code.
 */
let active: UpstreamProfile = UPSTREAMS.find((u) => u.id === process.env.SLEEPYCODE_UPSTREAM) ?? MIMO

export function activeUpstream(): UpstreamProfile {
  return active
}

/** Switch the module over to another ancestor. Returns the previously active profile. */
export function useUpstream(id: string): UpstreamProfile {
  const found = UPSTREAMS.find((u) => u.id === id)
  if (!found) throw new Error(`unknown upstream "${id}" (known: ${UPSTREAMS.map((u) => u.id).join(", ")})`)
  const previous = active
  active = found
  return previous
}

/** Active profile's rename table. */
export const MAP: ReadonlyArray<readonly [mimo: string, sleepy: string]> = active.map

/** Active profile's shielded identifiers. */
export const PROTECT: ReadonlyArray<RegExp> = active.protect

/** Paths the fork renamed alongside their content. Applied by the sync script. */
export const PATH_MAP: ReadonlyArray<readonly [mimo: string, sleepy: string]> = active.pathMap

/**
 * Placeholder sentinel. MUST contain no letters, because every map includes case-only
 * rules like ["MIMO","SLEEPY"] that would otherwise rewrite the sentinel itself and make
 * the protected span unrecoverable (observed: silently deleting
 * `com.xiaomi.mimo/turn-lifecycle` and `MiMo-V2-Pro` from output).
 */
const PH = "\u0000" // NUL: never appears in the text files we transform

function placeholder(i: number): string {
  return `${PH}${i}${PH}`
}

function shield(text: string, protect: ReadonlyArray<RegExp>): [string, string[]] {
  const spans: string[] = []
  let out = text
  for (const re of protect) {
    out = out.replace(new RegExp(re.source, "gi"), (m) => {
      spans.push(m)
      return placeholder(spans.length - 1)
    })
  }
  return [out, spans]
}

function unshield(text: string, spans: string[]): string {
  return text.replace(new RegExp(`${PH}(\\d+)${PH}`, "g"), (_, i) => spans[Number(i)] ?? "")
}

function applyMap(text: string, pairs: ReadonlyArray<readonly [string, string]>): string {
  let out = text
  for (const [from, to] of pairs) out = out.split(from).join(to)
  return out
}

/**
 * Transform text using an explicit profile. This is the single rebrand implementation;
 * the active-profile export below is a thin wrapper so callers can stay agnostic.
 */
export function rebrandWith(text: string, profile: UpstreamProfile): string {
  const [shielded, spans] = shield(text, profile.protect)
  return unshield(applyMap(shielded, profile.map), spans)
}

/**
 * Reverse of {@link rebrandWith}: normalise fork text back to upstream's token space.
 *
 * LOSSY whenever {@link mapCollisions} reports a collapse, and it must never be used to
 * normalise a merge in that state. See the header and `bun run script/lib/branding.ts`.
 */
export function debrandWith(text: string, profile: UpstreamProfile): string {
  // Ordered longest sleepy-token first. Mechanically reversing the map is wrong:
  // `SLEEPY_HOME` must debrand to `MIMOCODE_HOME`, but the generic `SLEEPY` -> `MIMO`
  // rule would otherwise fire first and yield `MIMO_HOME`. Sorting by token length makes
  // the specific rule win over the general one.
  const reverse = profile.map.map(([m, s]) => [s, m] as const).sort((a, b) => b[0].length - a[0].length)
  const [shielded, spans] = shield(text, profile.protect)
  return unshield(applyMap(shielded, reverse), spans)
}

/** Transform upstream text into fork text. */
export function rebrand(text: string): string {
  return rebrandWith(text, active)
}

/** Inverse of {@link rebrand}, against the active profile. Diagnostics only when lossy. */
export function debrand(text: string): string {
  return debrandWith(text, active)
}

/**
 * Fork tokens reachable from MORE THAN ONE upstream token. Each entry is a point where
 * `debrand` cannot know which upstream spelling to restore, so it may emit the wrong one.
 *
 * An empty array means the map is injective over its own vocabulary and `debrand` is
 * sound for those tokens. This is computed, never asserted: if you edit a map, re-run it.
 */
export function mapCollisions(profile: UpstreamProfile = active): Array<{ to: string; from: string[] }> {
  const byTarget = new Map<string, string[]>()
  for (const [from, to] of profile.map) {
    if (!byTarget.has(to)) byTarget.set(to, [])
    byTarget.get(to)?.push(from)
  }
  return [...byTarget.entries()]
    .filter(([, from]) => from.length > 1)
    .map(([to, from]) => ({ to, from: [...from].sort() }))
    .sort((a, b) => b.from.length - a.from.length || a.to.localeCompare(b.to))
}

/**
 * Upstream tokens that survived rebranding and are not protected. Non-empty output means
 * the map has a gap: add the token to the profile's `map` (ours to rename) or `protect`
 * (external identifier). Never let this pass silently.
 */
export function audit(text: string, profile: UpstreamProfile = active): string[] {
  const found = new Map<string, number>()
  for (const [tok, n] of scanTokenCounts(text, profile)) {
    if (profile.protect.some((re) => new RegExp(re.source, "i").test(tok))) continue
    found.set(tok, (found.get(tok) ?? 0) + n)
  }
  return [...found.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${t} (${n})`)
}

/** Files whose content must never be rebranded: lockfiles, binaries, vendored fixtures. */
export const SKIP_CONTENT: ReadonlyArray<RegExp> = [
  /^bun\.lock$/,
  /(^|\/)package-lock\.json$/,
  /(^|\/)node_modules\//,
  /\.(png|jpe?g|gif|ico|webp|avif|woff2?|ttf|eot|pdf|zip|gz|br|so|dylib|exe|node)$/,
  // Vendored capture of a third-party API response: the ids in it are not ours.
  /test\/tool\/fixtures\/models-api\.json$/,
]

export function shouldSkipContent(path: string): boolean {
  return SKIP_CONTENT.some((re) => re.test(path))
}

export function mapPath(path: string, profile: UpstreamProfile = active): string {
  for (const [from, to] of profile.pathMap) {
    if (path === from) return to
    if (path.startsWith(from + "/")) return to + path.slice(from.length)
  }
  return path
}

/**
 * Self-check. Run: `bun run script/lib/branding.ts`.
 *
 * Reports, per profile, whether `debrand` is sound - i.e. whether that ancestor's map has
 * forced collapses that make `debrand` ambiguous.
 */
if (import.meta.main) {
  let lossy = false
  for (const profile of UPSTREAMS) {
    const collisions = mapCollisions(profile)
    console.log(`\n${profile.id}  (${profile.label})  [${profile.map.length} map rules]`)
    console.log(`  debrand sound: ${collisions.length === 0 ? "yes - map is injective" : "NO - map is lossy"}`)
    for (const c of collisions) console.log(`    ${c.from.map((f) => `"${f}"`).join(" + ")} -> "${c.to}"`)
    if (profile.id !== active.id) continue
    lossy = collisions.length > 0
  }
  console.log(`\nactive upstream: ${active.id} (override with SLEEPYCODE_UPSTREAM=<id>)`)
  if (lossy) {
    console.log(`\nNOTE: "${active.id}" is lossy. debrand() is diagnostics-only for it.`)
  }
}