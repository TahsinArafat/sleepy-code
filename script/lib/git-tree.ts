/**
 * Read-only git object-store plumbing shared by the re-parent scripts.
 *
 * Every measurement here runs against the OBJECT STORE, never a working tree. That is
 * deliberate: probing a candidate must not require checking it out, installing it, or
 * creating a branch, so that "have we looked at this yet?" can never become "have we
 * half-migrated to this?". It also matters on disk - a second full checkout of a
 * candidate plus its own dependency install is gigabytes we usually do not have.
 */

export async function git(args: string[]): Promise<Buffer> {
  const p = Bun.spawn(["git", ...args], { stdout: "pipe", stderr: "pipe" })
  const out = Buffer.from(await new Response(p.stdout).arrayBuffer())
  const err = Buffer.from(await new Response(p.stderr).arrayBuffer()).toString("utf8")
  if ((await p.exited) !== 0) throw new Error(`git ${args.join(" ")}: ${err.trim()}`)
  return out
}

export const gitText = async (args: string[]) => (await git(args)).toString("utf8")

/** Refs git resolves by name rather than by the shorthand search order, so they are never ambiguous. */
const PSEUDO_REFS = new Set(["HEAD", "FETCH_HEAD", "ORIG_HEAD", "MERGE_HEAD", "CHERRY_PICK_HEAD"])

/**
 * Resolve a ref to exactly one full refname, or refuse to measure anything.
 *
 * This exists because of a silent failure that would have poisoned the whole migration plan.
 * A `git fetch --deepen=600 opencode dev v1` left behind a loose tag `refs/tags/opencode/dev`
 * pointing at one of OUR commits. Git resolves an ambiguous shorthand **tags first**, so from
 * that moment every `opencode/dev` in these scripts meant our own tree - 5,513 files - instead
 * of the candidate's 8,592. Nothing errors. `ls-tree` succeeds, the numbers print, and they are
 * confident and wrong: a port map built that way would claim our files already exist upstream
 * and size the job at nothing.
 *
 * Git only warns on stderr, which a spawned child throws away. So check explicitly.
 * `git show-ref <pattern>` matches on the literal pattern or on a tail starting at a slash, so
 * a qualified `refs/remotes/opencode/dev` matches exactly one ref while the bare shorthand
 * matches both the tag and the branch.
 *
 * Not every multi-match is a trap, so only the dangerous one is refused. Git resolves
 * `refs/heads/` before `refs/remotes/`, so a branch matching its own remote-tracking copy is
 * documented and harmless - and refusing it would break `--ours=sync/upstream-2026-09` in
 * every repo that has pushed. A tag is the opposite: `refs/tags/` wins, so a tag shadows the
 * branch you meant and the only safe move is to refuse.
 *
 * `HEAD` is exempt. It is a pseudo-ref, not a shorthand, so it is never subject to the
 * resolution order above, and the fact that `git show-ref HEAD` also matches the symbolic
 * HEAD of each remote says nothing about it. Without the exemption the check rejects `HEAD`
 * in any repo with more than one remote, which is most repos, and would have made the
 * default in port-map unusable.
 */
export async function resolveRef(ref: string): Promise<string> {
  if (PSEUDO_REFS.has(ref)) {
    await gitText(["rev-parse", "--verify", `${ref}^{commit}`])
    return ref
  }
  const out = await gitText(["show-ref", ref]).catch(() => "")
  const matches = out
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split(" ").slice(1).join(" "))
  if (matches.length === 0) throw new Error(`unknown ref: ${ref}`)
  if (matches.length === 1) return matches[0]!
  // Git's documented order for a multi-match shorthand is heads before remotes.
  const picked = matches.find((m) => m.startsWith("refs/heads/")) ?? matches[0]!
  if (!matches.some((m) => m.startsWith("refs/tags/")))
    return picked
  throw new Error(
    `ambiguous ref ${ref}: a TAG shadows the branch, and git prefers the tag.\n` +
      matches.map((m) => `    ${m}`).join("\n") +
      `\n  Measuring "${picked}" instead of the branch would silently size this wrong.\n` +
      `  Re-run with the full refname, e.g. refs/remotes/opencode/dev.`,
  )
}

/**
 * Commit counts are meaningless on a shallow clone - a depth-1 fetch reports "1 commit in
 * 12 weeks" for a branch that actually takes hundreds, which is exactly the kind of number
 * that invites a strategic decision it cannot support. Detect the case, do not print one.
 */
export async function shallowWarning(ref: string): Promise<string | null> {
  const isShallow = (await gitText(["rev-parse", "--is-shallow-repository"]).catch(() => "")).trim()
  if (isShallow !== "true") return null
  const sha = (await gitText(["rev-parse", ref]).catch(() => "")).trim()
  const boundary = await gitText(["cat-file", "-p", "shallow"]).catch(() => "")
  if (!boundary.includes(sha)) return null
  return `SHALLOW: ${ref} sits at a depth boundary - commit counts below are NOT trustworthy. Deepen with: git fetch --deepen=600 opencode ${ref.replace("opencode/", "")}`
}

export type Entry = { mode: string; type: string; sha: string; path: string }

export async function listTree(ref: string): Promise<Entry[]> {
  const buf = await git(["ls-tree", "-r", "-z", await resolveRef(ref)])
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
export const BLOB_BATCH = 4000

export async function readBlobBatch(shas: string[]): Promise<Map<string, Buffer>> {
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

/**
 * Diff size between two texts, in changed lines.
 *
 * The re-parent questions are all "how much has to be reconciled?", and a line count is
 * the honest unit for that. `git diff --no-index` is used rather than a hand-rolled LCS
 * because it is the same algorithm a reviewer will run when they actually apply the port -
 * so the number printed here is the number they will meet.
 */
export async function diffLines(a: string, b: string, label: string): Promise<number> {
  const dir = `/tmp/opencode-port-map/${label.replace(/[^A-Za-z0-9._-]/g, "_")}`
  await Bun.$`mkdir -p ${dir}`.quiet()
  await Bun.write(`${dir}/a`, a).catch(() => {})
  await Bun.write(`${dir}/b`, b).catch(() => {})
  const p = Bun.spawn(["git", "diff", "--no-index", "--numstat", `${dir}/a`, `${dir}/b`], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const out = Buffer.from(await new Response(p.stdout).arrayBuffer()).toString("utf8")
  await p.exited
  // `--numstat` prints "adds\tdels\tpath"; a binary file prints "-\t-\tpath" instead.
  const [adds, dels] = out.trim().split(/\s+/).map((n) => Number(n))
  return (adds && Number.isFinite(adds) ? adds : 0) + (dels && Number.isFinite(dels) ? dels : 0)
}