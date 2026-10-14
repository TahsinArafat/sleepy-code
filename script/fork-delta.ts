#!/usr/bin/env bun
/**
 * Measure the fork's TRUE delta over an upstream, tip-to-tip.
 *
 * `sync-upstream.ts verify` walks the merge-base tree, so it only sees files that
 * existed at the fork point. Upstream files ADDED since then are invisible to it,
 * which under-reports; and files upstream changed since then are attributed to the
 * fork even when the fork only carried the change, which over-reports. Neither
 * number answers "what did WE actually write".
 *
 * This walks both tips and asks the only question that matters: for every path where
 * the two trees differ, is our blob exactly `rebrand(upstream blob)`?
 *
 *   yes -> pure branding. Free to re-project onto any new upstream.
 *   no  -> real fork logic. This is the port surface.
 *
 * Usage: bun run script/fork-delta.ts [upstream-ref] [fork-ref]
 */

import { rebrand, shouldSkipContent } from "./lib/branding"

const UPSTREAM = process.argv[2] ?? "upstream/main"
const FORK = process.argv[3] ?? "HEAD"

async function git(args: string[], stdin?: Uint8Array): Promise<Buffer> {
  const p = Bun.spawn(["git", ...args], {
    stdin: stdin ? new Blob([stdin]) : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const out = Buffer.from(await new Response(p.stdout).arrayBuffer())
  const err = Buffer.from(await new Response(p.stderr).arrayBuffer()).toString("utf8")
  if ((await p.exited) !== 0) throw new Error(`git ${args.join(" ")}: ${err.trim()}`)
  return out
}

const gitText = async (args: string[]) => (await git(args)).toString("utf8")

type Entry = { sha: string; path: string }

async function listTree(ref: string): Promise<Map<string, string>> {
  const buf = await git(["ls-tree", "-r", "-z", ref])
  const out = new Map<string, string>()
  let off = 0
  while (off < buf.length) {
    const nul = buf.indexOf(0, off)
    const rec = buf.subarray(off, nul === -1 ? buf.length : nul).toString("utf8")
    off = nul === -1 ? buf.length : nul + 1
    if (!rec) continue
    const tab = rec.indexOf("\t")
    out.set(rec.slice(tab + 1), rec.slice(tab - 40, tab))
  }
  return out
}

async function readBlobs(shas: string[]): Promise<Map<string, Buffer>> {
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
    const header = raw.subarray(off, nl).toString("utf8")
    const size = Number(header.split(" ")[2])
    if (!Number.isFinite(size)) break
    map.set(sha, raw.subarray(nl + 1, nl + 1 + size))
    off = nl + 1 + size + 1
  }
  await p.exited
  return map
}

const upstream = await listTree(UPSTREAM)
const fork = await listTree(FORK)
console.log(`${UPSTREAM}: ${upstream.size} files`)
console.log(`${FORK}: ${fork.size} files`)

const paths = new Set([...upstream.keys(), ...fork.keys()])
const blobs = await readBlobs([...new Set([...upstream.values(), ...fork.values()])])

const brandingOnly: string[] = []
const forkLogic: string[] = []
const forkOnly: string[] = []
const upstreamOnly: string[] = []
const skipped: string[] = []

for (const path of [...paths].sort()) {
  const u = upstream.get(path)
  const f = fork.get(path)
  if (u && !f) {
    upstreamOnly.push(path)
    continue
  }
  if (f && !u) {
    forkOnly.push(path)
    continue
  }
  if (!u || !f || u === f) continue
  const uraw = blobs.get(u)
  const fraw = blobs.get(f)
  if (!uraw || !fraw) continue
  if (shouldSkipContent(path) || uraw.includes(0) || fraw.includes(0)) {
    skipped.push(path)
    continue
  }
  if (Buffer.from(rebrand(uraw.toString("utf8")), "utf8").equals(fraw)) brandingOnly.push(path)
  else forkLogic.push(path)
}

console.log(`\nidentical:        ${[...paths].filter((p) => upstream.get(p) === fork.get(p)).length}`)
console.log(`branding-only:    ${brandingOnly.length}   (free to re-project onto any upstream)`)
console.log(`REAL FORK LOGIC:  ${forkLogic.length}   <-- the actual port surface`)
console.log(`fork-only files:  ${forkOnly.length}   (exist only in ours)`)
console.log(`upstream-only:    ${upstreamOnly.length}   (exist only upstream)`)
console.log(`skipped (binary): ${skipped.length}`)

const area = (list: string[]) => {
  const counts = new Map<string, number>()
  for (const p of list) {
    const key = p.split("/").slice(0, 3).join("/")
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

console.log(`\n--- REAL FORK LOGIC by area (${forkLogic.length}) ---`)
for (const [k, v] of area(forkLogic).slice(0, 25)) console.log(`  ${String(v).padStart(4)}  ${k}`)

console.log(`\n--- FORK-ONLY by area (${forkOnly.length}) ---`)
for (const [k, v] of area(forkOnly).slice(0, 15)) console.log(`  ${String(v).padStart(4)}  ${k}`)

await Bun.write(
  "script/.fork-delta-logic.txt",
  forkLogic.join("\n") + "\n",
)
await Bun.write(
  "script/.fork-delta-only.txt",
  forkOnly.sort().join("\n") + "\n",
)
console.log(`\nwrote script/.fork-delta-logic.txt and script/.fork-delta-only.txt`)
