#!/usr/bin/env bun
/**
 * Probe a candidate re-parent target BEFORE branching off it.
 *
 * Stage 2 of the re-parent is a fresh base, not a merge. That makes it cheap to
 * reverse and impossible to do blindly. This script answers the three questions
 * that decide whether a candidate is viable, using only the object store - no
 * checkout, no install, no branch:
 *
 *   1. COVERAGE   If we ran `rebrand()` with a candidate's profile over that
 *                 candidate's own tree, would anything survive? A residual token
 *                 is a file that still says "opencode" after the pass.
 *   2. PRESSURE   How much of the tree is PROTECTED (service hosts, URLs) and
 *                 must therefore keep the old name on purpose.
 *   3. COLLISION  Which PATHS carry the token and so need a pathMap entry, and
 *                 do any of them collide after renaming? Two source paths
 *                 mapping to one target is a silent build break.
 *
 * Plus the two facts needed to compare candidates at all: is the branch still
 * maintained, and how big is the tree.
 *
 * Usage: bun run script/reparent-probe.ts refs/remotes/opencode/v1
 *        bun run script/reparent-probe.ts refs/remotes/opencode/v1 refs/remotes/opencode/dev
 *
 * Pass FULL refnames - see resolveRef() in ./lib/git-tree.ts for why the bare shorthand is
 * unsafe here.
 */

import { UPSTREAMS, rebrand, scanTokenCounts, scanTokens, useUpstream } from "./lib/branding"

const refs = process.argv.slice(2)
if (refs.length === 0) refs.push("refs/remotes/opencode/v1")

async function git(args: string[]): Promise<Buffer> {
  const p = Bun.spawn(["git", ...args], { stdout: "pipe", stderr: "pipe" })
  const out = Buffer.from(await new Response(p.stdout).arrayBuffer())
  const err = Buffer.from(await new Response(p.stderr).arrayBuffer()).toString("utf8")
  if ((await p.exited) !== 0) throw new Error(`git ${args.join(" ")}: ${err.trim()}`)
  return out
}

const gitText = async (args: string[]) => (await git(args)).toString("utf8")

/**
 * Commit counts are meaningless on a shallow clone - a depth-1 fetch reports "1 commit in
 * 12 weeks" for a branch that actually takes hundreds, which is exactly the kind of number
 * that invites a strategic decision it cannot support. Detect the case, do not print one.
 */
async function shallowWarning(ref: string): Promise<string | null> {
  const isShallow = (await gitText(["rev-parse", "--is-shallow-repository"]).catch(() => "")).trim()
  if (isShallow !== "true") return null
  const sha = (await gitText(["rev-parse", ref]).catch(() => "")).trim()
  const boundary = await gitText(["cat-file", "-p", "shallow"]).catch(() => "")
  if (!boundary.includes(sha)) return null
  return `SHALLOW: ${ref} sits at a depth boundary - commit counts below are NOT trustworthy. Deepen with: git fetch --deepen=600 opencode ${ref.replace("opencode/", "")}`
}

type Entry = { mode: string; type: string; sha: string; path: string }

async function listTree(ref: string): Promise<Entry[]> {
  const buf = await git(["ls-tree", "-r", "-z", ref])
  const out: Entry[] = []
  let off = 0
  while (off < buf.length) {
    const nul = buf.indexOf(0, off)
    const rec = buf.subarray(off, nul === -1 ? buf.length : nul).toString("utf8")
    off = nul === -1 ? buf.length : nul + 1
    if (!rec) continue
    const tab = rec.indexOf("\t")
    const [mode, type, sha] = rec.slice(0, tab).split(" ")
    if (!mode || !type || !sha) continue
    out.push({ mode, type, sha, path: rec.slice(tab + 1) })
  }
  return out
}

// Batched: a candidate tree can hold gigabytes of blobs, so never hold more
// than one chunk's worth in memory at a time.
const BLOB_BATCH = 4000

async function readBlobBatch(shas: string[]): Promise<Map<string, Buffer>> {
  const map = new Map<string, Buffer>()
  if (!shas.length) return map
  const p = Bun.spawn(["git", "cat-file", "--batch"], {
    stdin: new Blob([Buffer.from(shas.map((s) => `${s}\n`).join(""), "utf8")]),
    stdout: "pipe",
    stderr: "pipe",
  })
  const raw = Buffer.from(await new Response(p.stdout).arrayBuffer())
  let off = 0
  for (const sha of shas) {
    const nl = raw.indexOf(10, off)
    if (nl === -1) break
    const size = Number(raw.subarray(off, nl).toString("utf8").split(" ")[2])
    if (!Number.isFinite(size)) break
    map.set(sha, raw.subarray(nl + 1, nl + 1 + size))
    off = nl + 1 + size + 1
  }
  await p.exited
  return map
}

// A path counts as "carries the brand" when it contains an upstream token. Token edges
// come from the shared scanner so the probe and audit() agree on what a token is.
const pathTokens = (path: string, profile: (typeof UPSTREAMS)[number]) => [...scanTokens(path, profile)]

const report = async (ref: string) => {
  const profile = UPSTREAMS.find((u) => u.id === "opencode")
  if (!profile) throw new Error("no opencode profile in branding")

  const previous = useUpstream("opencode")
  try {
    const tree = await listTree(ref)

    const tip = await gitText(["log", "-1", "--format=%h %cI %s", ref]).catch(() => "")
    const shallow = await shallowWarning(ref)
    const since = shallow
      ? "(suppressed - shallow)"
      : (
          await gitText(["rev-list", "--count", "--since=30.days", ref]).catch(() => "?")
        ).trim()
    if (shallow) console.log(`\n  ${shallow}`)

    console.log(`\n${"=".repeat(72)}`)
    console.log(`${ref}`)
    console.log(`  tip:        ${tip.trim()}`)
    console.log(`  30d commits: ${since.trim()}`)
    console.log(`  tree:       ${tree.length} files`)
    console.log(`  packages:   ${(await gitText(["ls-tree", "--name-only", `${ref}:packages`]).catch(() => "(none)")).trim().split("\n").filter(Boolean).length}`)

    // --- 3. path collisions -------------------------------------------------
    const renamed = tree
      .map((e) => ({ ...e, tokens: pathTokens(e.path, profile), target: e.path }))
      .filter((e) => e.tokens.length)
    const byTarget = new Map<string, string[]>()
    for (const e of renamed) {
      // apply the profile's own text map to the path, segment by segment
      let next = e.path
      for (const [from, to] of profile.map) next = next.split(from).join(to)
      e.target = next
      byTarget.set(e.target, [...(byTarget.get(e.target) ?? []), e.path])
    }
    const collisions = [...byTarget.entries()].filter(([, srcs]) => srcs.length > 1)

    // --- 1 + 2. content coverage -------------------------------------------
    let clean = 0
    let residual = 0
    let protectedOnly = 0
    const residualFiles: string[] = []
    const residualTokens = new Map<string, number>()
    const protectedTokens = new Map<string, number>()
    let binary = 0

    const classify = (path: string, raw: Buffer) => {
      if (raw.includes(0)) {
        binary++
        return
      }
      const text = raw.toString("utf8")
      if (!scanTokens(text, profile).size) return
      const left = scanTokenCounts(rebrand(text), profile)
      if (!left.size) {
        clean++
        return
      }
      for (const t of left.keys()) residualTokens.set(t, (residualTokens.get(t) ?? 0) + 1)
      // everything that survived is it protected, or is it a genuine miss?
      const onlyProtected = [...left.keys()].every((t) =>
        profile.protect.some((re) => new RegExp(re.source, "i").test(t)),
      )
      if (onlyProtected) {
        protectedOnly++
        for (const t of left.keys()) protectedTokens.set(t, (protectedTokens.get(t) ?? 0) + 1)
        return
      }
      residual++
      residualFiles.push(path)
      for (const t of left.keys()) protectedTokens.set(t, (protectedTokens.get(t) ?? 0) + 1)
    }

    for (let i = 0; i < tree.length; i += BLOB_BATCH) {
      const slice = tree.slice(i, i + BLOB_BATCH)
      const blobs = await readBlobBatch([...new Set(slice.map((e) => e.sha))])
      for (const e of slice) {
        const raw = blobs.get(e.sha)
        if (raw) classify(e.path, raw)
      }
      if (tree.length > BLOB_BATCH) process.stderr.write(`\r  scanning ${Math.min(i + BLOB_BATCH, tree.length)}/${tree.length}   `)
    }
    if (tree.length > BLOB_BATCH) process.stderr.write("\r" + " ".repeat(40) + "\r")

    const total = clean + residual + protectedOnly
    console.log(`\n  --- content coverage over ${total} files containing an opencode token ---`)
    console.log(`    fully rebranded:  ${String(clean).padStart(5)}`)
    console.log(`    protected only:   ${String(protectedOnly).padStart(5)}   (service hosts, intentional)`)
    console.log(`    RESIDUAL:         ${String(residual).padStart(5)}   <-- files still naming opencode`)
    console.log(`    (binary skipped:  ${binary})`)

    const top = (m: Map<string, number>, n = 8) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
    if (protectedTokens.size) {
      console.log(`\n    top surviving tokens:`)
      for (const [t, n] of top(protectedTokens)) console.log(`      ${String(n).padStart(6)}  ${t}`)
    }
    if (residualFiles.length) {
      console.log(`\n    sample residual files:`)
      for (const p of residualFiles.slice(0, 10)) console.log(`      ${p}`)
    }

    // --- our Tier-1 surface -------------------------------------------------
    const ours = await Bun.file("script/.fork-delta-only.txt").text().catch(() => "")
    const ourPaths = ours.trim().split("\n").filter(Boolean)
    const targetSet = new Set(tree.map((e) => e.path))
    const landed = ourPaths.filter((p) => targetSet.has(p))

    console.log(`\n  --- our ${ourPaths.length} fork-only files against this tree ---`)
    console.log(`    already present at the same path: ${landed.length}`)
    if (landed.length) for (const p of landed.slice(0, 12)) console.log(`      ${p}`)

    // --- path collisions ----------------------------------------------------
    console.log(`\n  --- paths carrying the token: ${renamed.length} ---`)
    console.log(`    would COLLIDE after rename: ${collisions.length}   <-- must be 0`)
    for (const [t, srcs] of collisions.slice(0, 10)) console.log(`      ${t}\n        <- ${srcs.join("\n        <- ")}`)
    if (renamed.length) {
      console.log(`    sample renamed paths:`)
      for (const e of renamed.slice(0, 8)) console.log(`      ${e.path}\n        -> ${e.target}`)
    }

    return { ref, total, clean, protectedOnly, residual, renamed: renamed.length, collisions: collisions.length }
  } finally {
    useUpstream(previous.id)
  }
}

const results = []
for (const ref of refs) results.push(await report(ref))

if (results.length > 1) {
  console.log(`\n${"=".repeat(72)}\nCOMPARISON\n`)
  console.log(`  ${"ref".padEnd(18)}${"files w/ token".padStart(16)}${"residual".padStart(11)}${"renamed paths".padStart(16)}${"collisions".padStart(12)}`)
  for (const r of results)
    console.log(`  ${r.ref.padEnd(18)}${String(r.total).padStart(16)}${String(r.residual).padStart(11)}${String(r.renamed).padStart(16)}${String(r.collisions).padStart(12)}`)
}