/**
 * Branding layer for the SleepyCode fork.
 *
 * The fork is upstream MiMo-Code plus a branding layer. That layer is a *derived*
 * function of upstream text, not hand-edited source: `bun run script/sync-upstream.ts
 * verify` confirms rebrand(upstream) is byte-identical to the fork for ~99% of
 * branding-only files.
 *
 * Treating branding as data instead of merging it through git is what makes upstream
 * syncs tractable. `verify` measures it: of the 665 base files the fork changed at all,
 * 562 are exactly rebrand(base) - pure branding, zero fork logic.
 *
 * NOTE ON `debrand`: it is LOSSY and must never be used to normalise a merge. MAP is
 * not injective (`MiMo`+`Mimo` -> `Sleepy`, and `MiMoCode`+`Mimocode`+`MimoCode` ->
 * `SleepyCode`), so `Mimo Code` -> `Sleepy Code` -> `MiMo Code` is wrong. It silently
 * masks real upstream changes. Only `rebrand` (one-way, lossless) is sound; merging
 * projects all three sides FORWARD with it. `debrand` is kept for diagnostics only.
 *
 * SAFETY: the map is token-aware and fails closed. `audit()` reports any surviving
 * `mimo` token so a human classifies it, rather than letting a blind replace corrupt
 * real things. A naive `s/mimo/sleepy/` would turn the Spanish word "asumimos" into
 * "asusleepys" and would re-point the wire constant `com.xiaomi.mimo/turn-lifecycle`
 * away from the MiMo MCP server that advertises it.
 */

/**
 * Identifiers containing "mimo" that are NOT ours to rename. Shielded before MAP
 * runs, so these always win.
 */
export const PROTECT: ReadonlyArray<RegExp> = [
  // Real Xiaomi/MiMo service hosts — renaming these breaks network calls.
  /mimo\.xiaomi\.com/,
  /xiaomimimo\.com/,
  // GitHub org / repo paths — the upstream we sync from.
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
]

/**
 * Single source of truth, applied in listed order for `rebrand` and in reverse
 * listed order for `debrand` (which makes debrand the exact structural inverse).
 *
 * Order is load-bearing: `MIMOCODE_HOME` must precede `MIMOCODE_`, or the general
 * prefix rule would produce `SLEEPYCODE_HOME` instead of the fork's `SLEEPY_HOME`.
 *
 * Deliberate asymmetries that mirror decisions already in fork history — do not
 * "tidy" them without checking:
 *  - `MIMOCODE_HOME` -> `SLEEPY_HOME` (not SLEEPYCODE_HOME): fork's global data dir env.
 *  - `mimo-v2.5` / `mimo-auto` / `mimo-free` ARE renamed: unlike the protected
 *    `MiMo-V2-Pro` family, these are ids the fork's own gateway publishes, so they
 *    are ours to name.
 */
export const MAP: ReadonlyArray<readonly [mimo: string, sleepy: string]> = [
  // npm scope
  ["@mimo-ai", "@sleepy-ai"],
  ["mimo-ai", "sleepy-ai"],
  // config dir + files
  [".mimocode", ".sleepycode"],
  ["mimocode.jsonc", "sleepycode.jsonc"],
  ["mimocode.json", "sleepycode.json"],
  // fork-specific global data dir env — MUST precede the generic prefix rule
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
]

/**
 * Placeholder sentinel. MUST contain no letters, because MAP includes case-only
 * rules like ["MIMO","SLEEPY"] that would otherwise rewrite the sentinel itself
 * and make the protected span unrecoverable (observed: silently deleting
 * `com.xiaomi.mimo/turn-lifecycle` and `MiMo-V2-Pro` from output).
 */
const PH = "\u0000" // NUL: never appears in the text files we transform

function placeholder(i: number): string {
  return `${PH}${i}${PH}`
}

function shield(text: string): [string, string[]] {
  const spans: string[] = []
  let out = text
  for (const re of PROTECT) {
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

function applyMap(text: string, pairs: ReadonlyArray<readonly string[]>): string {
  let out = text
  for (const [from, to] of pairs) out = out.split(from).join(to)
  return out
}

/**
 * Reverse of MAP, ordered longest sleepy-token first.
 *
 * Mechanically reversing MAP is wrong: `SLEEPY_HOME` must debrand to
 * `MIMOCODE_HOME`, but the generic `SLEEPY` -> `MIMO` rule would otherwise fire
 * first and yield `MIMO_HOME`. Sorting by token length makes the specific rule
 * win over the general one.
 */
const REVERSE_MAP: ReadonlyArray<readonly [sleepy: string, mimo: string]> = MAP.map(
  ([m, s]) => [s, m] as const,
).sort((a, b) => b[0].length - a[0].length)

/** Transform upstream (mimo) text into fork (sleepy) text. */
export function rebrand(text: string): string {
  const [shielded, spans] = shield(text)
  return unshield(applyMap(shielded, MAP), spans)
}

/**
 * Inverse of {@link rebrand}: normalise fork text back to upstream's mimo space.
 * Used to strip branding before a merge so only real logic conflicts survive.
 */
export function debrand(text: string): string {
  const [shielded, spans] = shield(text)
  return unshield(applyMap(shielded, REVERSE_MAP), spans)
}

/**
 * `mimo` tokens that survived rebranding and are not protected. Non-empty output
 * means the map has a gap: add the token to MAP (ours to rename) or PROTECT
 * (external identifier). Never let this pass silently.
 */
export function audit(text: string): string[] {
  const found = new Map<string, number>()
  for (const m of text.matchAll(/[A-Za-z0-9_@:./+-]*[Mm]imo[A-Za-z0-9_@:./+-]*/g)) {
    const tok = m[0]
    if (!tok) continue
    if (PROTECT.some((re) => new RegExp(re.source, "i").test(tok))) continue
    found.set(tok, (found.get(tok) ?? 0) + 1)
  }
  return [...found.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${t} (${n})`)
}

/** Paths the fork renamed alongside their content. Applied by the sync script. */
export const PATH_MAP: ReadonlyArray<readonly [mimo: string, sleepy: string]> = [
  ["packages/opencode/bin/mimo", "packages/opencode/bin/sleepy"],
  ["packages/opencode/src/plugin/mimo.ts", "packages/opencode/src/plugin/sleepy.ts"],
  ["packages/opencode/src/tool/websearch/mimo.ts", "packages/opencode/src/tool/websearch/sleepy.ts"],
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
]

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

export function mapPath(path: string): string {
  for (const [from, to] of PATH_MAP) {
    if (path === from) return to
    if (path.startsWith(from + "/")) return to + path.slice(from.length)
  }
  return path
}
