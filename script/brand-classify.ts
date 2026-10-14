#!/usr/bin/env bun
/**
 * Census every ancestor token in a tree, so the PROTECT list is built from evidence.
 *
 * `reparent-probe.ts` answers "would anything survive `rebrand()`?". That question has a
 * blind spot: a token that survives because it is PROTECTED and a token that survives because
 * it is MISSED from the map look identical in the residual count. Worse, a token can be
 * mapped to the *wrong* fork token and still show as clean - `@opencode/` reaching
 * `@sleepycode/*` instead of the published `@sleepy-ai/*` is zero residual and a broken
 * package name.
 *
 * So this reports the raw material instead of a verdict: every distinct ancestor token, how
 * often it occurs, and where. Reading that table is what turns PROTECT from a guess into a
 * list, because the difference between "the product name" and "a provider id that happens to
 * share it" only shows up in the samples.
 *
 * Usage: bun run script/brand-classify.ts [ref] [--top=N]
 *        bun run script/brand-classify.ts refs/remotes/opencode/dev --top=40
 *
 * Pass FULL refnames - see resolveRef() in ./lib/git-tree.ts for why bare shorthands are unsafe.
 */

import { UPSTREAMS, rebrandWith, scanTokenCounts, useUpstream } from "./lib/branding"
import { BLOB_BATCH, listTree, readBlobBatch, resolveRef, shallowWarning } from "./lib/git-tree"

const args = process.argv.slice(2)
const top = Number(args.find((a) => a.startsWith("--top="))?.slice("--top=".length) ?? 60)
const profileId = args.find((a) => a.startsWith("--profile="))?.slice("--profile=".length) ?? "opencode"
const ref = args.find((a) => !a.startsWith("--")) ?? "HEAD"

const profile = UPSTREAMS.find((u) => u.id === profileId)
if (!profile) throw new Error(`unknown profile "${profileId}"`)
useUpstream(profileId)

/** token -> occurrences -> the files that hold them, for a human to classify. */
type Census = Map<string, Map<string, number>>

function note(census: Census, token: string, path: string, n: number) {
  const files = census.get(token) ?? new Map<string, number>()
  files.set(path, (files.get(path) ?? 0) + n)
  census.set(token, files)
}

const full = await resolveRef(ref)
const warn = await shallowWarning(full)
if (warn) console.log(warn + "\n")
console.log(`brand census  ref=${full}  profile=${profile.id} (${profile.label})\n`)

const entries = await listTree(full)
const census: Census = new Map()
let scanned = 0
let skipped = 0

for (let i = 0; i < entries.length; i += BLOB_BATCH) {
  const chunk = entries.slice(i, i + BLOB_BATCH)
  const blobs = await readBlobBatch(chunk.map((e) => e.sha))
  for (const entry of chunk) {
    const blob = blobs.get(entry.sha)
    // A candidate tree is mostly binaries and vendored recordings. Decoding them as utf8
    // would fill the census with replacement-character noise, and those bytes are not ours
    // to rename anyway.
    if (!blob || blob.includes(0)) {
      skipped++
      continue
    }
    scanned++
    const text = blob.toString("utf8")
    for (const [token, n] of scanTokenCounts(text, profile)) note(census, token, entry.path, n)
  }
}

const rows = [...census].sort((a, b) => {
  const total = (t: [string, Map<string, number>]) => [...t[1].values()].reduce((x, y) => x + y, 0)
  return total(b) - total(a)
})

console.log(`  ${scanned} text files scanned, ${skipped} binary or unreadable skipped`)
console.log(`  ${rows.length} distinct tokens\n`)

for (const [token, files] of rows.slice(0, top)) {
  const occurrences = [...files.values()].reduce((x, y) => x + y, 0)
  const where = [...files].sort((a, b) => b[1] - a[1])
  const samples = where
    .slice(0, 3)
    .map(([p, n]) => `${p} (${n})`)
    .join(", ")
  const more = where.length > 3 ? ` +${where.length - 3} more` : ""
  console.log(`  ${String(occurrences).padStart(6)}  ${String(where.length).padStart(4)}f  ${token}`)
  console.log(`          ${samples}${more}`)
}

/**
 * The check that matters most, and the one a census cannot express: renaming must be
 * reversible. `rebrand` is a shield/unshield over an ordered table, so a rule that fires
 * inside another rule's output corrupts both directions silently. Round-tripping every
 * distinct token proves the table is injective as applied.
 */
const lossy = rows.filter(([token]) => {
  const once = rebrandWith(token, profile)
  return rebrandWith(once, profile) !== once
})
console.log(
  lossy.length === 0
    ? `\n  round-trip: every token is a fixed point of rebrand - idempotent and lossless`
    : `\n  NOT IDEMPOTENT:\n${lossy.map(([t]) => `    ${t} -> ${rebrandWith(t, profile)}`).join("\n")}`,
)
if (lossy.length > 0) process.exit(1)