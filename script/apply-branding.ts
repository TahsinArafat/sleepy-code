#!/usr/bin/env bun
/**
 * Apply the active branding profile to the tree in the current checkout.
 *
 * The re-parent's second commit has to be exactly this and nothing else: take the
 * ancestor's tree and replace its name with ours. Every file that mentions the ancestor,
 * and every path that carries its token, changes together, so the tree stays internally
 * consistent and the diff that follows - the actual port - is readable as fork logic
 * instead of as 2,600 files of rename noise.
 *
 * That only holds if the substitution is the WHOLE of the change. This script therefore
 * adds nothing: it renames paths and rewrites bytes, and it will not reformat, not touch
 * a file with no token in it, and not skip a file it could not read. A rebrand commit that
 * silently drops a file is worse than no rebrand commit, because every diff after it is
 * then measured against a base nobody has.
 *
 * Two failure modes this refuses rather than reports:
 *   - a collision, where two paths map to one. That is a silent build break, so it is
 *     checked before anything is written.
 *   - a binary decoded as text. The ancestor tree is 337 binaries - brand art, mp4s, a
 *     zip of brand assets - and `rebrand` over mojibake would corrupt every one.
 *
 * Usage: bun run script/apply-branding.ts [--profile=<id>] [--write]
 *        bun run script/apply-branding.ts --profile=opencode          # dry run
 *        bun run script/apply-branding.ts --profile=opencode --write  # apply
 *
 * Reverses with: git reset --hard HEAD
 */

import { mkdir } from "node:fs/promises"
import path from "node:path"
import { mapPath, rebrand, shouldSkipContent, useUpstream } from "./lib/branding"
import { BLOB_BATCH, git, gitText, readBlobBatch } from "./lib/git-tree"

const args = process.argv.slice(2)
const write = args.includes("--write")
const profileId = args.find((a) => a.startsWith("--profile="))?.slice("--profile=".length) ?? "opencode"
// Throws on an unknown id, so the profile is valid before anything is measured.
useUpstream(profileId)

/**
 * Lockfiles are excluded by `shouldSkipContent`, and that exclusion has to be lifted here
 * for exactly one reason: the workspace entries in `bun.lock` are named after the
 * `package.json` files this pass rewrites, so leaving it alone makes every `bun ci
 * --frozen-lockfile` fail immediately on a renamed workspace package.
 *
 * The reason the exclusion exists is that a lockfile carries integrity hashes, and this
 * is not ours to change. So the exclusion is replaced by a check rather than by trust:
 * every opaque token of 40+ characters must survive the rewrite, verbatim. Measured on
 * `opencode/dev`: 2,485 such tokens, none lost.
 */
const LOCKFILE = /(?:^|\/)bun\.lock$/

/**
 * Everything a lockfile must not have changed. Bun's text lockfile stores the digest
 * positionally as the last element of an entry array rather than under an `integrity` key,
 * so keying off the schema would check nothing at all; any long opaque token is a far
 * better proxy for "this is a hash we must not touch".
 */
const integrityViolations = (before: string, after: string) => {
  const survived = new Set([...after.matchAll(/[A-Za-z0-9_-]{40,}/g)].map((m) => m[0]))
  return [...before.matchAll(/[A-Za-z0-9_-]{40,}/g)]
    .map((m) => m[0])
    .filter((t) => !survived.has(t))
}

const paths = gitText(["ls-files", "-z"]).then((out) => out.split("\0").filter(Boolean))
console.log(`apply-branding  profile=${profileId}  mode=${write ? "WRITE" : "dry-run"}\n`)

/** path -> new path, for the paths the map actually moves. */
const renames = (await paths).flatMap((from) => {
  const to = mapPath(from)
  return to === from ? [] : [{ from, to }]
})

// Checked before any write. Two sources landing on one path is a build break a reviewer
// would otherwise have to notice inside a 2,600-file diff, so it is refused here.
const targets = new Map<string, string[]>()
for (const { from, to } of renames) targets.set(to, [...(targets.get(to) ?? []), from])
const collisions = [...targets].filter(([, from]) => from.length > 1)
if (collisions.length > 0) {
  console.error(`refusing: ${collisions.length} path collisions`)
  for (const [to, from] of collisions) console.error(`  ${from.join(" + ")} -> ${to}`)
  process.exit(1)
}

const tracked = new Set(await paths)
const moving = new Set(renames.map((r) => r.from))
const occupied = renames.filter((r) => tracked.has(r.to) && !moving.has(r.to))
if (occupied.length > 0) {
  console.error(`refusing: ${occupied.length} destination paths already occupied by unmoved files`)
  for (const { from, to } of occupied) console.error(`  ${from} -> ${to} (already exists)`)
  process.exit(1)
}

// Renames first, and through `git mv`, so the index and the worktree move together. After
// this the old paths do not exist and every later read is from the new path.
const moved = new Map(renames.map((r) => [r.from, r.to]))
if (write) {
  for (const { from, to } of renames) {
    await mkdir(path.dirname(to), { recursive: true })
    const code = await git(["mv", "--", from, to]).then(
      () => 0,
      () => 1,
    )
    if (code !== 0) {
      console.error(`refusing: git mv -- ${from} ${to} failed`)
      process.exit(1)
    }
  }
}

/** `ls-files -s` gives each path's blob sha, which survives a rename - so one batched read covers every file. */
const indexed = gitText(["ls-files", "-s"]).then((out) =>
  out
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [meta, path] = line.split("\t")
      const sha = (meta ?? "").trim().split(" ")[1]
      return { path: path ?? "", sha: sha ?? "" }
    }),
)

const index = await indexed
let rewritten = 0
let unchanged = 0
let skippedBinary = 0
let skippedByRule = 0
let bytes = 0
const lockfilesRewritten: string[] = []

for (let i = 0; i < index.length; i += BLOB_BATCH) {
  const chunk = index.slice(i, i + BLOB_BATCH)
  const blobs = await readBlobBatch(chunk.map((e) => e.sha))
  for (const entry of chunk) {
    const target = moved.get(entry.path) ?? entry.path
    const lock = LOCKFILE.test(target)
    if (shouldSkipContent(target) && !lock) {
      skippedByRule++
      continue
    }
    const blob = blobs.get(entry.sha)
    // Missing blob or an embedded NUL means this is not text. Decoding it would corrupt it.
    if (!blob || blob.includes(0)) {
      skippedBinary++
      continue
    }
    const original = blob.toString("utf8")
    const next = rebrand(original)
    if (next === original) {
      unchanged++
      continue
    }
    // Checked before the write, not after, so a lockfile that would lose a digest is never
    // staged in the first place.
    const lost = lock ? integrityViolations(original, next) : []
    if (lost.length > 0) {
      console.error(`refusing: rebrand would change ${lost.length} integrity token(s) in ${target}`)
      for (const t of lost.slice(0, 3)) console.error(`  ${t.slice(0, 72)}`)
      process.exit(1)
    }
    if (lock) lockfilesRewritten.push(target)
    rewritten++
    bytes += next.length - original.length
    if (write) await Bun.write(target, next)
  }
}

if (write) await git(["add", "-A"])

console.log(`  files:            ${index.length}`)
console.log(`  renamed paths:    ${renames.length}`)
for (const { from, to } of renames.slice(0, 8)) console.log(`    ${from}\n      -> ${to}`)
if (renames.length > 8) console.log(`    ... ${renames.length - 8} more`)
console.log(`\n  content rewritten: ${rewritten}${write ? "" : "  (dry run)"}`)
console.log(`  unchanged:         ${unchanged}`)
console.log(`  skipped (binary):  ${skippedBinary}`)
console.log(`  skipped (rule):    ${skippedByRule}`)
console.log(`  lockfiles rewritten: ${lockfilesRewritten.length}${lockfilesRewritten.length ? ` (${lockfilesRewritten.join(", ")}, integrity verified)` : ""}`)
console.log(`  net bytes:         ${bytes >= 0 ? "+" : ""}${bytes}`)
console.log(`  collisions:        ${collisions.length}`)
console.log(
  write ? `\n  staged. Review with: git diff --cached --stat` : `\n  nothing written. Re-run with --write to apply.`,
)