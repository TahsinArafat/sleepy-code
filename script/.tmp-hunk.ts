#!/usr/bin/env bun
/**
 * Scratch helper for the in-progress upstream merge.
 * Resolves conflict hunks in a file by a per-hunk policy, leaving already
 * auto-merged content untouched.
 *
 *   bun run script/.tmp-hunk.ts <file> <policy...>
 *
 * policy for each hunk, in order:
 *   ours    - keep the HEAD side only
 *   theirs  - keep the incoming side only
 *   both    - keep HEAD side then incoming side (union)
 *   ours-first / theirs-first - union with the other side second
 */
const file = process.argv[2]!
const policies = process.argv.slice(3)

const text = await Bun.file(file).text()
const lines = text.split("\n")

type Hunk = { start: number; end: number; ours: string[]; theirs: string[] }
const hunks: Hunk[] = []
let cur: { start: number; ours: string[]; theirs: string[]; side: "ours" | "theirs" } | null = null
for (let i = 0; i < lines.length; i++) {
  const l = lines[i]!
  if (l.startsWith("<<<<<<<")) {
    if (cur) throw new Error(`nested conflict marker at line ${i + 1} of ${file}`)
    cur = { start: i, ours: [], theirs: [], side: "ours" }
    continue
  }
  if (cur && l.startsWith("=======") && !l.startsWith("=======" + "x")) {
    cur.side = "theirs"
    continue
  }
  if (cur && l.startsWith(">>>>>>>")) {
    hunks.push({ start: cur.start, end: i, ours: cur.ours, theirs: cur.theirs })
    cur = null
    continue
  }
  if (cur) cur[cur.side].push(l)
}
if (cur) throw new Error(`unterminated conflict in ${file}`)
if (hunks.length !== policies.length)
  throw new Error(`${file}: ${hunks.length} hunks but ${policies.length} policies given`)

const out: string[] = []
let p = 0
for (let i = 0; i < lines.length; i++) {
  const h = hunks[p]
  if (h && i === h.start) {
    const pol = policies[p]!
    const pick = (side: "ours" | "theirs") => (side === "ours" ? h.ours : h.theirs)
    const order: ("ours" | "theirs")[] =
      pol === "ours"
        ? ["ours"]
        : pol === "theirs"
          ? ["theirs"]
          : pol === "ours-first"
            ? ["ours", "theirs"]
            : pol === "theirs-first"
              ? ["theirs", "ours"]
              : pol === "both"
                ? ["ours", "theirs"]
                : (() => {
                  throw new Error(`unknown policy ${pol}`)
                })()
    for (const s of order) out.push(...pick(s))
    i = h.end
    p++
    continue
  }
  out.push(lines[i]!)
}

await Bun.write(file, out.join("\n"))
const left = out.filter((l) => /^(<<<<<<<|=======$|>>>>>>>)/.test(l)).length
console.log(`${file}: resolved ${p} hunk(s) [${policies.join(", ")}] markers-left=${left}`)
