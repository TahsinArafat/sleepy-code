#!/usr/bin/env bun
/**
 * Upstream sync driver for the SleepyCode fork of XiaomiMiMo/MiMo-Code.
 *
 * WHY THIS EXISTS
 * ---------------
 * The fork is upstream plus a branding layer (mimo -> sleepy). Branding touches
 * ~1500 files, so a naive `git merge upstream/main` turns every upstream edit to a
 * branded line into a conflict: 92 conflicted files for the current 975-commit gap,
 * even though only ~54 files carry real fork logic.
 *
 * WHY NOT "DEBRAND AND MERGE"
 * ---------------------------
 * branding.ts's doc comment proposes debranding the fork into mimo space and merging
 * there. That is UNSOUND: MAP is not injective (`MiMo`+`Mimo` -> `Sleepy`,
 * `MiMoCode`+`Mimocode`+`MimoCode` -> `SleepyCode`), so `debrand` cannot recover the
 * original (`Mimo Code` -> `Sleepy Code` -> `MiMo Code`). A debranded merge silently
 * masks real upstream changes and corrupts fork prose. Do not reintroduce it.
 *
 * WHAT WE DO INSTEAD
 * ------------------
 * Project every merge side FORWARD into sleepy space with rebrand() - a pure,
 * lossless, one-way function - and let git do a normal 3-way merge:
 *
 *     base'     = rebrand(base)      <- synthetic, grafted
 *     upstream' = rebrand(upstream)  <- synthetic
 *     fork      = origin/main        <- already sleepy
 *
 * For a branding-only file, fork == base' byte-for-byte, so git sees "ours unchanged"
 * and auto-takes upstream'. No conflict, no manual work, no inverse function.
 *
 * To make git pick base' as the merge base we graft it into history:
 *
 *     B' = commit(tree(rebrand(base)))      parent: base
 *     U' = commit(tree(rebrand(upstream)))  parent: B'
 *     F''= commit(tree(origin/main))        parents: B', origin/main
 *
 * merge-base(F'', U') == B'  (base is an ancestor of B', so B' wins), and because F''
 * has origin/main as a parent the merged result stays a descendant of origin/main -
 * so the sync lands as an ordinary PR with intact lineage.
 *
 * USAGE
 *   bun run script/sync-upstream.ts build      # write B'/U'/F'' objects + refs
 *   bun run script/sync-upstream.ts dry-run    # conflict report, touches nothing
 *   bun run script/sync-upstream.ts merge      # real merge onto a sync branch
 *   bun run script/sync-upstream.ts audit      # leftover mimo tokens in the tree
 *   bun run script/sync-upstream.ts stats      # branding-only vs real-logic breakdown
 */

import { rebrand, audit, shouldSkipContent, mapPath, MAP } from "./lib/branding"

const UPSTREAM_REMOTE = "upstream"
const ORIGIN_REMOTE = "origin"
const REFS = "refs/sleepy-sync"
/**
 * Fork side of the merge. Defaults to HEAD rather than origin/main: the sync branch
 * carries pre-merge fixes (branding gaps, tooling) that must be part of the merge
 * input, or they would be silently dropped from the result. Override with
 * SLEEPY_SYNC_FORK=<ref> to measure a different fork state.
 */
const FORK_REF = process.env.SLEEPY_SYNC_FORK ?? "HEAD"

const args = process.argv.slice(2)
const cmd = args[0] ?? "help"

// ---------------------------------------------------------------- git helpers

async function git(rawArgs: string[], stdin?: Uint8Array): Promise<Buffer> {
  const p = Bun.spawn(["git", ...rawArgs], {
    stdin: stdin ? new Blob([stdin]) : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const out = Buffer.from(await new Response(p.stdout).arrayBuffer())
  const err = Buffer.from(await new Response(p.stderr).arrayBuffer()).toString("utf8")
  const code = await p.exited
  if (code !== 0) throw new Error(`git ${rawArgs.join(" ")} failed (${code}): ${err.trim()}`)
  return out
}

const gitText = async (rawArgs: string[]) => (await git(rawArgs)).toString("utf8")

function resolveRef(ref: string) {
  return gitText(["rev-parse", ref]).then((s) => s.trim())
}

type Entry = { mode: string; type: string; sha: string; path: string }

/** `git ls-tree -r -z` -> entries. Records are "<mode> <type> <sha>\t<path>\0". */
async function listTree(ref: string): Promise<Entry[]> {
  const buf = await git(["ls-tree", "-r", "-z", ref])
  const entries: Entry[] = []
  let off = 0
  while (off < buf.length) {
    const nul = buf.indexOf(0, off)
    const rec = buf.subarray(off, nul === -1 ? buf.length : nul).toString("utf8")
    off = nul === -1 ? buf.length : nul + 1
    if (!rec) continue
    const sp = rec.indexOf(" ")
    const sp2 = rec.indexOf(" ", sp + 1)
    const tab = rec.indexOf("\t")
    entries.push({
      mode: rec.slice(0, sp),
      type: rec.slice(sp + 1, sp2),
      sha: rec.slice(sp2 + 1, tab),
      path: rec.slice(tab + 1),
    })
  }
  return entries
}

/** Read many blobs in one `cat-file --batch` process. */
async function readBlobs(shas: string[]): Promise<Map<string, Buffer>> {
  const map = new Map<string, Buffer>()
  if (!shas.length) return map
  const input = Buffer.from(shas.map((s) => `${s}\n`).join(""), "utf8")
  const p = Bun.spawn(["git", "cat-file", "--batch"], {
    stdin: new Blob([input]),
    stdout: "pipe",
    stderr: "pipe",
  })
  const buf = Buffer.from(await new Response(p.stdout).arrayBuffer())
  await p.exited

  let off = 0
  while (off < buf.length) {
    const nl = buf.indexOf(0x0a, off)
    if (nl === -1) break
    const header = buf.subarray(off, nl).toString("utf8")
    const parts = header.split(" ")
    if (parts.length < 3 || parts[1] === "missing") {
      off = nl + 1
      continue
    }
    const sha = parts[0]!
    const size = Number(parts[2])
    const body = buf.subarray(nl + 1, nl + 1 + size)
    map.set(sha, Buffer.from(body))
    off = nl + 1 + size + 1
  }
  return map
}

// ------------------------------------------------------------- tree building

/** fast-import path quoting for anything outside a safe charset. */
function quotePath(path: string): string {
  if (/^[\x20-\x7e]+$/.test(path) && !path.includes('"') && !path.includes("\\")) return path
  let out = '"'
  for (const ch of path) {
    if (ch === '"' || ch === "\\") out += "\\" + ch
    else if (ch === "\n") out += "\\n"
    else if (ch === "\t") out += "\\t"
    else out += ch
  }
  return out + '"'
}

/** Fixed identity so repeated builds are reproducible and never leak a local name. */
function committer(): string {
  return "Sleepy Sync <sync@sleepy.local> 1735689600 +0000"
}

type BuildOpts = {
  /** transform applied to text content */
  xform: (text: string) => string
  /** remap source path -> destination path */
  remap: (path: string) => string
  /** skip content transform for these paths */
  skip: (path: string) => boolean
}

/**
 * Rebuild `ref`'s tree through fast-import, transforming content and paths.
 * Returns the new commit sha. Binary content (NUL bytes) is passed through raw.
 */
async function buildRewritten(
  ref: string,
  branchRef: string,
  message: string,
  parents: string[],
  opts: BuildOpts,
): Promise<string> {
  const entries = await listTree(ref)
  const blobShas = entries.filter((e) => e.type === "blob").map((e) => e.sha)
  const blobs = await readBlobs([...new Set(blobShas)])

  const chunks: Buffer[] = []
  const lines: string[] = []
  let mark = 1
  const marks = new Map<string, number>() // dest path -> mark
  let transformed = 0
  let passthrough = 0
  const collisions: string[] = []

  for (const e of entries) {
    const dest = opts.remap(e.path)
    if (marks.has(dest)) collisions.push(dest)
    marks.set(dest, mark)

    if (e.type === "commit") {
      // gitlink/submodule: reference the sha directly, nothing to transform
      lines.push(`M ${e.mode} ${e.sha} ${quotePath(dest)}`)
      continue
    }

    const raw = blobs.get(e.sha)
    if (raw === undefined) throw new Error(`missing blob ${e.sha} for ${e.path}`)

    let body = raw
    const isText = e.mode !== "120000" && !raw.includes(0)
    if (isText && !opts.skip(e.path)) {
      const next = Buffer.from(opts.xform(raw.toString("utf8")), "utf8")
      if (!next.includes(0)) {
        if (!next.equals(raw)) transformed++
        body = next
      } else {
        passthrough++ // transform would inject the NUL sentinel; keep raw
      }
    } else {
      passthrough++
    }

    // blob records must precede the commit that references their marks
    chunks.push(Buffer.from(`blob\nmark :${mark}\ndata ${body.length}\n`, "utf8"))
    chunks.push(body)
    chunks.push(Buffer.from("\n", "utf8"))
    lines.push(`M ${e.mode} :${mark} ${quotePath(dest)}`)
    mark++
  }

  if (collisions.length) {
    throw new Error(`path remap collided for ${collisions.length} paths, e.g. ${collisions[0]}`)
  }

  const msgBuf = Buffer.from(message, "utf8")
  // fast-import grammar (verified empirically):
  //   commit <ref> / committer / data <n> / <msg> / from / merge* / deleteall? / M lines
  //
  // `deleteall` is LOAD-BEARING. Without it the M lines are applied as a delta ON TOP OF
  // the `from` parent's tree, so every synthetic commit becomes a UNION of parent tree and
  // intended tree. Observed damage before this was fixed:
  //   - B' carried 4709 paths for a 4696-path merge-base: both `.mimocode/*` AND its
  //     `.sleepycode/*` rename, plus both `bin/mimo` and `bin/sleepy`.
  //   - U' carried 5411 paths for a 5360-path upstream/main, resurrecting the 34 files
  //     upstream deleted since the merge-base (STATS.md, 17x sst-env.d.ts,
  //     src/tool/change-directory.ts, src/task/gate-state.ts, ...).
  // Either way the merge would silently un-delete upstream removals and `dry-run` would
  // report conflicts against trees that are not the ones being merged.
  const commit = [
    `commit ${branchRef}`,
    `committer ${committer()}`,
    `data ${msgBuf.length}`,
    message,
    `from ${parents[0]}`,
    ...parents.slice(1).map((p) => `merge ${p}`),
    "deleteall",
    ...lines,
    "",
  ].join("\n")
  chunks.push(Buffer.from(commit, "utf8"))

  const stream = Buffer.concat(chunks)
  const p = Bun.spawn(["git", "fast-import", "--quiet", "--force"], {
    stdin: new Blob([stream] as any),
    stdout: "pipe",
    stderr: "pipe",
  })
  const err = Buffer.from(await new Response(p.stderr).arrayBuffer()).toString("utf8")
  const code = await p.exited
  if (code !== 0) throw new Error(`fast-import failed (${code}):\n${err}`)
  if (err.trim()) console.log(err.trim())
  const sha = (await gitText(["rev-parse", branchRef])).trim()
  console.log(
    `  ${branchRef} -> ${sha.slice(0, 8)}  files=${entries.length} transformed=${transformed} passthrough=${passthrough}`,
  )
  return sha
}

// --------------------------------------------------------------- subcommands

async function need(ref: string) {
  const sha = await resolveRef(ref).catch(() => null)
  if (!sha) throw new Error(`ref ${ref} missing - run: bun run script/sync-upstream.ts build`)
  return sha
}

async function cmdBuild() {
  const base = await resolveRef(FORK_REF)
  console.log(`fork side: ${FORK_REF} -> ${base.slice(0, 8)}`)
  const mergeBase = (await gitText(["merge-base", base, `${UPSTREAM_REMOTE}/main`])).trim()
  console.log(`merge-base: ${mergeBase.slice(0, 8)}`)
  console.log(`upstream:   ${(await resolveRef(`${UPSTREAM_REMOTE}/main`)).slice(0, 8)}`)
  console.log(`fork:       ${base.slice(0, 8)}`)

  console.log("\nbuilding B' (rebranded merge-base)...")
  const bPrime = await buildRewritten(
    mergeBase,
    `${REFS}/base`,
    "sync: rebranded merge-base (synthetic)",
    [mergeBase],
    { xform: rebrand, remap: mapPath, skip: shouldSkipContent },
  )

  console.log("building U' (rebranded upstream)...")
  const uPrime = await buildRewritten(
    `${UPSTREAM_REMOTE}/main`,
    `${REFS}/upstream`,
    "sync: rebranded upstream/main (synthetic)",
    [bPrime],
    { xform: rebrand, remap: mapPath, skip: shouldSkipContent },
  )

  console.log("building F'' (fork tree grafted onto B')...")
  const fPrime = await buildRewritten(
    base,
    `${REFS}/fork`,
    "sync: fork tree grafted onto rebranded base (synthetic)",
    [bPrime, base],
    { xform: (t) => t, remap: (p) => p, skip: () => true },
  )

  const mb = (await gitText(["merge-base", fPrime, uPrime])).trim()
  console.log(`\nmerge-base(F'', U') = ${mb.slice(0, 8)}  expected ${bPrime.slice(0, 8)}  ${mb === bPrime ? "OK" : "MISMATCH"}`)
  if (mb !== bPrime) throw new Error("graft failed: git did not choose the synthetic base")
  console.log("graft verified.")
}

async function conflictReport(forkRef: string, upRef: string) {
  const p = Bun.spawn(["git", "merge-tree", "--write-tree", "--name-only", forkRef, upRef], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const out = await new Response(p.stdout).text()
  const code = await p.exited
  const lines = out.split("\n")
  const tree = lines[0]!.trim()
  const conflicts: string[] = []
  for (const l of lines.slice(1)) {
    const m = l.match(/^CONFLICT \(([^)]+)\): (?:Merge conflict in|deleted in .* and modified in .*:|modified in .* and deleted in .*:) ?(.*)$/)
    if (m) conflicts.push(m[2]!.trim())
    else if (/^CONFLICT/.test(l)) conflicts.push(l)
  }
  return { code, tree, conflicts: [...new Set(conflicts)].filter(Boolean).sort() }
}

async function cmdDryRun() {
  const fork = await need(`${REFS}/fork`)
  const up = await need(`${REFS}/upstream`)
  const naive = await conflictReport(FORK_REF, `${UPSTREAM_REMOTE}/main`)
  const projected = await conflictReport(fork, up)

  console.log(`naive merge (origin/main + upstream/main):     ${naive.conflicts.length} conflicts`)
  console.log(`projected merge (rebranded base graft):        ${projected.conflicts.length} conflicts`)
  const saved = naive.conflicts.length - projected.conflicts.length
  console.log(`branding noise eliminated:                     ${saved} files (${((saved / Math.max(1, naive.conflicts.length)) * 100).toFixed(0)}%)`)
  console.log(`\nconflicts that survive (real logic / structural):`)
  for (const c of projected.conflicts) console.log(`  ${c}`)
  return projected
}

async function cmdStats() {
  const base = await resolveRef(FORK_REF)
  const mergeBase = (await gitText(["merge-base", base, `${UPSTREAM_REMOTE}/main`])).trim()
  const ours = new Set((await gitText(["diff", "--name-only", mergeBase, base])).trim().split("\n"))
  const theirs = new Set(
    (await gitText(["diff", "--name-only", mergeBase, `${UPSTREAM_REMOTE}/main`])).trim().split("\n"),
  )
  const overlap = [...ours].filter((f) => theirs.has(f))

  const bEntries = await listTree(mergeBase)
  const uEntries = await listTree(`${UPSTREAM_REMOTE}/main`)
  const fEntries = await listTree(base)
  const bBy = new Map(bEntries.map((e) => [e.path, e]))
  const uBy = new Map(uEntries.map((e) => [e.path, e]))
  const fBy = new Map(fEntries.map((e) => [e.path, e]))

  const blobs = await readBlobs(
    [...new Set([
      ...overlap.map((p) => bBy.get(p)?.sha).filter(Boolean) as string[],
      ...overlap.map((p) => uBy.get(p)?.sha).filter(Boolean) as string[],
      ...overlap.map((p) => fBy.get(p)?.sha).filter(Boolean) as string[],
    ])] as string[],
  )
  const text = (sha?: string) => (sha ? blobs.get(sha)?.toString("utf8") ?? null : null)

  let brandingOnly = 0
  let realLogic = 0
  const real: string[] = []
  for (const p of overlap) {
    if (shouldSkipContent(p)) continue
    const b = rebrand(text(bBy.get(p)?.sha) ?? "")
    const f = text(fBy.get(p)?.sha)
    if (f === null) continue
    if (f === b) brandingOnly++
    else {
      realLogic++
      real.push(p)
    }
  }
  console.log(`files touched by BOTH sides: ${overlap.length}`)
  console.log(`  branding-only (auto-resolves): ${brandingOnly}`)
  console.log(`  real fork logic (needs review): ${realLogic}`)
  console.log(`\nupstream-only changes (free, no conflict): ${[...theirs].filter((f) => !ours.has(f)).length}`)
  console.log(`fork-only changes (preserved): ${[...ours].filter((f) => !theirs.has(f)).length}`)
  return real
}

/**
 * Regression guard for the whole approach. The projected merge is only correct if
 * branding is a pure function of upstream text: for every file the fork changed, the
 * change must be EITHER byte-identical (untouched) OR exactly rebrand(base). Anything
 * else is fork logic, which is fine but must be counted so we know the real merge
 * surface. If `unsound` grows after a branding edit, the MAP lost information.
 */
async function cmdVerify() {
  const base = await resolveRef(FORK_REF)
  const mergeBase = (await gitText(["merge-base", base, `${UPSTREAM_REMOTE}/main`])).trim()
  const bt = await listTree(mergeBase)
  const ft = await listTree(base)
  const fBy = new Map(ft.map((e) => [e.path, e.sha]))
  const blobs_ = await readBlobs([
    ...new Set([...bt.map((e) => e.sha), ...ft.map((e) => e.sha)]),
  ])

  let identical = 0
  let projectionSound = 0
  const unsound: string[] = []
  let skipped = 0

  for (const e of bt) {
    const dest = mapPath(e.path)
    const fsha = fBy.get(dest)
    if (fsha === undefined) continue // deleted or renamed by fork
    const braw = blobs_.get(e.sha)
    const fraw = blobs_.get(fsha)
    if (!braw || !fraw) continue
    if (braw.equals(fraw)) {
      identical++
      continue
    }
    if (shouldSkipContent(e.path) || braw.includes(0) || fraw.includes(0)) {
      skipped++
      continue
    }
    const projected = Buffer.from(rebrand(braw.toString("utf8")), "utf8")
    if (projected.equals(fraw)) projectionSound++
    else unsound.push(dest)
  }

  const changed = projectionSound + unsound.length + skipped
  console.log(`merge-base: ${mergeBase.slice(0, 8)}   fork: ${base.slice(0, 8)}`)
  console.log(`untouched (byte-identical):        ${identical}`)
  console.log(`fork == rebrand(base) [SOUND]:     ${projectionSound}`)
  console.log(`binary/lockfile skip:              ${skipped}`)
  console.log(`real fork logic:                   ${unsound.length}`)
  console.log(
    `\nprojection soundness: ${((projectionSound / Math.max(1, changed)) * 100).toFixed(1)}% of changed text files`,
  )
  console.log(`files carrying fork logic (${unsound.length}) - these are the ones to protect in a merge:`)
  for (const u of unsound.sort()) console.log(`  ${u}`)
  const list = `${import.meta.dir}/.sync-fork-logic.txt`
  await Bun.write(list, unsound.sort().join("\n") + "\n")
  console.log(`\nwrote ${list} (${unsound.length} paths)`)

  // Invariant 2: the fork must not contain unshielded mimo tokens. rebrand is idempotent
  // BY CONSTRUCTION (no MAP output re-matches a MAP input - asserted below), so applying
  // it to fork text is always a no-op. That means this cannot detect MAP defects; what it
  // detects is fork-side branding GAPS: text a human wrote or edited that still says mimo.
  // Each gap is either deliberate attribution (allowlisted) or a bug to fix.
  const selfIdempotent = MAP.every(([m, s]) =>
    MAP.every(([m2]) => s === m2 || !s.includes(m2)),
  )
  if (!selfIdempotent)
    throw new Error("MAP is not idempotent: some rule output re-matches a rule input")
  console.log(`\nMAP idempotency: OK (no rule output re-matches any rule input)`)

  // Files where mimo references are DELIBERATE - upstream attribution and real
  // third-party identifiers. Adding to this list is a decision, not a cleanup.
  const BRAND_GAPS_ALLOW: Record<string, string> = {
    LICENSE: "Xiaomi copyright attribution must remain",
    "README.md": "'Better Than OpenCode & MiMo-Code' - names the upstream we fork from",
    "README.zh.md": "same comparison, Chinese",
    "README_npm.md": "same comparison, npm listing",
    ".github/ISSUE_TEMPLATE/bug-report.yml": "asks which upstream repo/version",
    "packages/opencode/.gitignore": "ignores .mimocode-test-fixtures-* emitted by vendored tests",
    "packages/opencode/.npmignore": "same",
    // Upstream-authored package metadata: author/homepage/repository point at the real
    // Xiaomi project. Fork deliberately kept attribution here (only name/keywords/
    // description were rebranded). Regenerating the SDK reverts these, so track them.
    "packages/plugin/package.json": "upstream author/homepage/repository attribution",
    "packages/sdk/js/package.json": "upstream author/homepage/repository attribution",
    // Generated artifacts. Descriptions drift from source until the next codegen run;
    // they are not hand-edited, so do not 'fix' them in place - regenerate.
    "packages/sdk/openapi.json": "generated; regenerate, do not hand-edit",
    "packages/sdk/js/src/v2/gen/types.gen.ts": "generated; regenerate, do not hand-edit",
  }

  const forkChanged = (await gitText(["diff", "--name-only", mergeBase, base]))
    .trim()
    .split("\n")
    .filter(Boolean)
  const byPath = new Map((await listTree(base)).map((e) => [e.path, e.sha]))
  const forkBlobs = await readBlobs(
    forkChanged.map((p) => byPath.get(p)).filter((s): s is string => !!s),
  )
  const gaps: { path: string; tokens: string[]; allowed: boolean }[] = []
  for (const p of forkChanged) {
    const raw = forkBlobs.get(byPath.get(p)!)
    if (!raw || raw.includes(0) || shouldSkipContent(p)) continue
    const tokens = audit(raw.toString("utf8"))
    if (tokens.length) gaps.push({ path: p, tokens, allowed: p in BRAND_GAPS_ALLOW })
  }
  const unexpected = gaps.filter((g) => !g.allowed)
  console.log(
    `\nfork branding gaps: ${gaps.length} file(s) with unshielded mimo tokens (${gaps.length - unexpected.length
    } allowlisted, ${unexpected.length} unexpected)`,
  )
  for (const g of unexpected.slice(0, 25))
    console.log(`  ${g.path}\n      ${g.tokens.slice(0, 6).join(", ")}`)
  if (unexpected.length)
    console.log(
      `  ^ decide per token: add to MAP (ours to rename), PROTECT (external identifier), or BRAND_GAPS_ALLOW (deliberate).`,
    )
  else console.log(`  clean - every remaining mimo token in the fork is deliberate.`)
}

async function cmdMerge() {
  const fork = await need(`${REFS}/fork`)
  const up = await need(`${REFS}/upstream`)
  const branch = args[1] ?? `sync/upstream-${new Date().toISOString().slice(0, 7)}`
  const dirty = (await gitText(["status", "--porcelain"])).trim()
  if (dirty) {
    console.log(`working tree has ${dirty.split("\n").length} local change(s); commit or stash first.`)
    console.log(dirty)
    process.exit(1)
  }
  // `checkout -B` force-resets the branch to F''. That is safe only if the existing tip
  // is already an ancestor of F'' (i.e. F'' was built from it). Otherwise a previous
  // sync's conflict resolutions on this branch would be silently discarded.
  const existing = await gitText(["rev-parse", "--verify", "-q", `refs/heads/${branch}`])
    .then((s) => s.trim())
    .catch(() => null)
  if (existing && existing !== fork) {
    const contained = await gitText(["merge-base", "--is-ancestor", existing, fork])
      .then(() => true)
      .catch(() => false)
    if (!contained)
      throw new Error(
        `branch ${branch} has commits (${existing.slice(0, 8)}) that are not ancestors of ${fork.slice(0, 8)}; ` +
        `rebuilding it here would discard them. Re-run \`build\` with this branch checked out as the fork side, ` +
        `or pass a fresh branch name.`,
      )
  }
  await git(["checkout", "-B", branch, fork])
  console.log(`on ${branch} at ${fork.slice(0, 8)}; merging ${up.slice(0, 8)}`)
  // No `-X` option: `none` is not a valid recursive strategy option, and git aborts
  // with "fatal: unknown strategy option: -Xnone". We want plain 3-way recursive.
  const p = Bun.spawn(["git", "merge", "--no-ff", "--no-commit", up], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const out = await new Response(p.stdout).text()
  const err = await new Response(p.stderr).text()
  const code = await p.exited
  if (out.trim()) console.log(out.trim())
  if (err.trim()) console.error(err.trim())

  const unmerged = (await gitText(["diff", "--name-only", "--diff-filter=U"])).trim().split("\n").filter(Boolean)
  const merging = await gitText(["rev-parse", "-q", "--verify", "MERGE_HEAD"]).then(() => true).catch(() => false)
  // A non-zero exit is normal for a conflicted merge, so it cannot be the only signal.
  // But if git refused to start the merge at all, `unmerged` is empty and the old code
  // printed "0 file(s) need resolution" - indistinguishable from a clean merge. That
  // false-clean report is how a broken option silently produced an empty sync.
  if (code !== 0 && !merging && unmerged.length === 0)
    throw new Error(`git merge exited ${code} without starting a merge - nothing was merged.`)
  if (!merging && unmerged.length === 0) {
    console.log(`\nmerge applied cleanly (no conflicts); commit with: git commit -m "chore: sync upstream"`)
    return
  }
  console.log(`\n${unmerged.length} file(s) need resolution:`)
  for (const u of unmerged) console.log(`  ${u}`)
}

async function cmdAudit() {
  const ref = args[1] ?? "HEAD"
  const entries = await listTree(ref)
  const blobs = await readBlobs(entries.filter((e) => e.type === "blob").map((e) => e.sha))
  const rows: { path: string; tokens: string[] }[] = []
  for (const e of entries) {
    if (e.type !== "blob" || shouldSkipContent(e.path)) continue
    const buf = blobs.get(e.sha)
    if (!buf || buf.includes(0)) continue
    const t = audit(buf.toString("utf8"))
    if (t.length) rows.push({ path: e.path, tokens: t })
  }
  console.log(`${rows.length} file(s) still contain unshielded mimo tokens:\n`)
  for (const r of rows.slice(0, 60)) console.log(`  ${r.path}\n      ${r.tokens.slice(0, 8).join(", ")}`)
  if (rows.length > 60) console.log(`  ... ${rows.length - 60} more`)
}

switch (cmd) {
  case "build":
    await cmdBuild()
    break
  case "dry-run":
    await cmdDryRun()
    break
  case "stats":
    await cmdStats()
    break
  case "verify":
    await cmdVerify()
    break
  case "merge":
    await cmdMerge()
    break
  case "audit":
    await cmdAudit()
    break
  default:
    console.log(`usage: bun run script/sync-upstream.ts <build|dry-run|stats|verify|merge [branch]|audit [ref]>`)
}
