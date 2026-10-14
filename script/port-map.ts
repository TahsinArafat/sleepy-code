#!/usr/bin/env bun
/**
 * Build the port map: for every file carrying real fork logic, where does it LAND in a
 * candidate re-parent target, and how much has to be reconciled to get it there?
 *
 * `reparent-probe.ts` answers "is the candidate brandable". This answers the question that
 * actually sizes the job: "what is the port". Two numbers per file, both measured:
 *
 *   LANDING   same-path | relocated | absent. Resolved by longest-suffix match, not by
 *             hand-written path rules, so the map cannot drift from the tree it describes.
 *   COST      changed lines between OUR blob and `rebrand(THEIR blob at the landing path)`.
 *             Subtracting a plain rebrand is what isolates OUR logic: everything the rebrand
 *             already accounts for is free, and what remains is the port.
 *
 * A file with no landing has no base to diff against, so its cost is its own size - it is a
 * hand-port by definition. Reporting that separately keeps "cheap" from hiding "absent".
 *
 * Usage: bun run script/port-map.ts refs/remotes/opencode/v1
 *        bun run script/port-map.ts refs/remotes/opencode/v1 refs/remotes/opencode/dev
 *
 * Pass FULL refnames. `opencode/dev` is not safe: a stray tag of the same name makes git
 * resolve the shorthand to whatever that tag points at, and every number below would then
 * describe our own tree instead of the candidate's - confidently and wrongly. `resolveRef`
 * in ./lib/git-tree.ts refuses an ambiguous ref rather than guessing between them.
 *
 * `--ours=<ref>` names our side of the diff, which defaults to HEAD. Set it whenever this
 * is run from anywhere other than a checkout of the fork itself: the re-parent branch's
 * tree holds none of our files, and reading ours off disk there prices the whole port at
 * zero without a word of complaint.
 *
 * Usage: bun run script/port-map.ts refs/remotes/opencode/v1
 *        bun run script/port-map.ts refs/remotes/opencode/v1 refs/remotes/opencode/dev
 *        bun run script/port-map.ts refs/remotes/opencode/dev --ours=sync/upstream-2026-09
 */

import { rebrand, useUpstream } from "./lib/branding"
import { BLOB_BATCH, type Entry, diffLines, gitText, listTree, readBlobBatch, shallowWarning } from "./lib/git-tree"

const oursFlag = process.argv.find((a) => a.startsWith("--ours="))
const OURS = oursFlag ? oursFlag.slice("--ours=".length) : "HEAD"
const refs = process.argv.slice(2).filter((a) => !a.startsWith("--"))
if (refs.length === 0) refs.push("refs/remotes/opencode/v1")

/**
 * Where a candidate's own code lives. Only files under one of these roots can host a port,
 * which keeps the suffix search from matching a fixture or a snapshot with a plausible name.
 */
const CODE_ROOTS = ["packages/"]

const isHostable = (path: string) =>
  CODE_ROOTS.some((r) => path.startsWith(r)) && !/\.(md|json|txt|yml|yaml|lock|png|jpg|svg|ico)$/.test(path)

/**
 * Known subtree relocations, in the order they are tried.
 *
 * These are MEASURED moves, not guesses: MiMo already kept the TUI's translation tables at
 * `packages/app/src/i18n/` before we forked them into the monolith, and upstream has since
 * lifted the whole `cli/cmd/tui/` tree into its own `packages/tui/src/`. Both facts were
 * confirmed against the candidate tip before being written down here.
 *
 * `to` is an ordered list of candidate destinations, not one, because upstream's move was
 * selective rather than wholesale: `util/clipboard.ts` and `util/editor.ts` were FLATTENED
 * up to `packages/tui/src/`, while `util/model.ts` stayed in `util/`. A single destination per
 * prefix would misroute one or the other, so each is tried and the first that exists wins.
 *
 * `prefix` is matched against the path relative to our `src/`, so the same table works for
 * any of our source packages without knowing which one a file came from.
 */
const MOVES: ReadonlyArray<{ prefix: string; to: ReadonlyArray<string> }> = [
  { prefix: "cli/cmd/tui/i18n/", to: ["packages/app/src/i18n/"] },
  { prefix: "cli/cmd/tui/util/", to: ["packages/tui/src/", "packages/tui/src/util/"] },
  { prefix: "cli/cmd/tui/", to: ["packages/tui/src/"] },
  { prefix: "cli/cmd/", to: ["packages/cli/src/cmd/"] },
]

const suffixHits = (suffix: string, hostable: string[]) =>
  hostable.filter((p) => p === suffix || p.endsWith("/" + suffix)).sort((a, b) => a.length - b.length)

type Hit = { target: string; ambiguous: string[]; peeled: number; via: string }

function locate(rel: string, hostable: string[]): Hit | null {
  // 1. An explicit subtree move, resolved directly. A hit here is a relocation by
  //    construction - no similarity guessing involved.
  for (const { prefix, to } of MOVES) {
    if (!rel.startsWith(prefix)) continue
    const rest = rel.slice(prefix.length)
    for (const dest of to) {
      const hits = suffixHits(rest, hostable)
      // Prefer a hit inside the destination we predicted: `cli/cmd/tui/app.tsx` matches both
      // `packages/app/src/app.tsx` and `packages/tui/src/app.tsx`, and only one is the TUI.
      const preferred = hits.findIndex((p) => p.startsWith(dest))
      if (preferred !== -1)
        return { target: hits[preferred]!, ambiguous: hits.filter((_, i) => i !== preferred), peeled: 0, via: `${prefix} -> ${dest}` }
      if (hits.length && dest === to[to.length - 1])
        return { target: hits[0]!, ambiguous: hits.slice(1), peeled: 0, via: prefix }
    }
  }

  // 2. Longest-suffix fallback. Peeling to a bare `index.tsx` matches hundreds of unrelated
  //    files, so peel at most GUESS_AFTER_PEEL segments before admitting the match is a guess.
  const segs = rel.split("/")
  for (let peeled = 0; peeled <= Math.min(GUESS_AFTER_PEEL, segs.length - 1); peeled++) {
    const hits = suffixHits(segs.slice(peeled).join("/"), hostable)
    if (hits.length) return { target: hits[0]!, ambiguous: hits.slice(1), peeled, via: `suffix -${peeled}` }
  }
  return null
}

/**
 * Files that are regenerated rather than ported.
 *
 * Left in the totals these dominate everything else and invert the comparison: the three
 * generated SDK artefacts alone are 64,906 lines, which is 3x the entire real port surface
 * and made v1 - the cheaper candidate on every real measure - look like the expensive one.
 * `packages/sdk/js/script/build.ts` regenerates all three from the server schema, which
 * AGENTS.md records as the supported way to rebuild the SDK, so counting them as porting
 * work would double-count a build step.
 */
const isGenerated = (path: string) => /(^|\/)openapi\.json$/.test(path) || /\/gen\/[^/]+\.ts$/.test(path)

type Landing = { file: string; kind: "same-path" | "relocated" | "guess" | "absent"; target: string | null; ambiguous: string[]; peeled: number; via: string; generated: boolean }

/** Beyond this many peeled segments the suffix has stopped describing a real correspondence. */
const GUESS_AFTER_PEEL = 1

const classify = (file: string, byPath: Map<string, string>, hostable: string[]): Landing => {
  const generated = isGenerated(file)
  const sha = byPath.get(file)
  if (sha) return { file, kind: "same-path", target: file, ambiguous: [], peeled: 0, via: "same-path", generated }
  // Drop the whole `packages/<pkg>/src/` prefix, then let locate() peel segments.
  const m = file.match(/^packages\/[^/]+\/(?:src|test)\/(.+)$/)
  const rel = m?.[1] ?? file
  const hit = locate(rel, hostable)
  if (!hit) return { file, kind: "absent", target: null, ambiguous: [], peeled: 0, via: "none", generated }
  return { file, kind: hit.peeled > GUESS_AFTER_PEEL ? "guess" : "relocated", target: hit.target, ambiguous: hit.ambiguous, peeled: hit.peeled, via: hit.via, generated }
}

const progress = (msg: string) => {
  if (process.stderr.isTTY) process.stderr.write(msg)
}

const ours = (await Bun.file("script/.fork-delta-logic.txt").text()).trim().split("\n").filter(Boolean)

/**
 * OUR side of the diff, read from a ref rather than from the working tree.
 *
 * Reading it off disk is the obvious thing and it is wrong. Run this from the re-parent
 * branch - whose tree is upstream's, and holds none of our files - and every file resolves
 * to "" , so each one is priced at zero and the tool cheerfully reports a port surface of
 * 14,234 lines against the true 48,218. No error, no warning, just a number that would
 * size the entire migration.
 *
 * `--ours=<ref>` makes the side explicit and therefore reproducible from any checkout.
 */
const ourTree = new Map((await listTree(OURS)).map((e) => [e.path, e.sha]))
const notInOurs = ours.filter((f) => !ourTree.has(f))
if (notInOurs.length)
  throw new Error(
    `${notInOurs.length} of the ${ours.length} files in script/.fork-delta-logic.txt are absent from ${OURS}:\n` +
      notInOurs.slice(0, 5).map((f) => `    ${f}`).join("\n") +
      `\n  That list is generated by script/fork-delta.ts, which defaults its fork side to HEAD.\n` +
      `  Regenerate it against the right branch: bun run script/fork-delta.ts upstream/main ${OURS}`,
  )

const ourBlobs = new Map<string, string>()
{
  const shas = [...new Set(ours.map((f) => ourTree.get(f)!))]
  for (let i = 0; i < shas.length; i += BLOB_BATCH) {
    for (const [sha, buf] of await readBlobBatch(shas.slice(i, i + BLOB_BATCH)))
      ourBlobs.set(sha, buf.toString("utf8"))
    progress(`\r  reading ours ${Math.min(i + BLOB_BATCH, shas.length)}/${shas.length}   `)
  }
  progress("\r" + " ".repeat(40) + "\r")
}
const ourText = (file: string) => ourBlobs.get(ourTree.get(file)!) ?? ""

const report = async (ref: string) => {
  const previous = useUpstream("opencode")
  try {
    const tree = await listTree(ref)
    const byPath = new Map(tree.map((e) => [e.path, e.sha]))
    const hostable = tree.filter((e) => isHostable(e.path)).map((e) => e.path)

    const shallow = await shallowWarning(ref)
    if (shallow) console.log(`\n  ${shallow}`)
    console.log(`\n${"=".repeat(78)}`)
    console.log(`${ref}  --  ${(await gitText(["log", "-1", "--format=%h %cI", ref]).catch(() => "?")).trim()}`)
    // Both sides are named, because a port cost is meaningless without them: the same
    // candidate priced against a different fork side is a different number.
    console.log(
      `  our side: ${OURS}  --  ${(await gitText(["log", "-1", "--format=%h %cI", OURS]).catch(() => "?")).trim()}`,
    )
    console.log(`  hostable files in candidate: ${hostable.length}`)

    const landings: Landing[] = ours.map((f) => classify(f, byPath, hostable))
    const count = (k: Landing["kind"]) => landings.filter((l) => l.kind === k).length
    const buckets = { "same-path": count("same-path"), relocated: count("relocated"), guess: count("guess"), absent: count("absent") }

    console.log(
      `\n  --- landing for our ${ours.length} fork-logic files ---\n` +
        `    same-path:   ${String(buckets["same-path"]).padStart(3)}   (lands where it is, port = apply our diff)\n` +
        `    relocated:   ${String(buckets.relocated).padStart(3)}   (measured subtree move - a real path rewrite)\n` +
        `    guess:       ${String(buckets.guess).padStart(3)}   <-- basename-ish only; landing unproven\n` +
        `    absent:      ${String(buckets.absent).padStart(3)}   <-- no host in the candidate`,
    )

    // --- cost ---------------------------------------------------------------
    const needSha = [...new Set(landings.flatMap((l) => (l.target ? [byPath.get(l.target)!] : [])))]
    const blobMap = new Map<string, Buffer>()
    for (let i = 0; i < needSha.length; i += BLOB_BATCH) {
      for (const [sha, buf] of await readBlobBatch(needSha.slice(i, i + BLOB_BATCH))) blobMap.set(sha, buf)
      progress(`\r  reading ${Math.min(i + BLOB_BATCH, needSha.length)}/${needSha.length}   `)
    }
    if (needSha.length > BLOB_BATCH) progress("\r" + " ".repeat(40) + "\r")

    let totalCost = 0
    const rows: Array<{ l: Landing; cost: number; ours: number }> = []
    for (const l of landings) {
      // Every path here is source or text; fork-delta already excluded binaries from this list.
      const ours = ourText(l.file)
      const ourLines = ours ? ours.split("\n").length : 0
      const theirBuf = l.target ? blobMap.get(byPath.get(l.target)!) : undefined
      // No landing => no base, so the whole file is hand-ported.
      const cost = theirBuf ? await diffLines(rebrand(theirBuf.toString("utf8")), ours, l.file) : ourLines
      totalCost += cost
      rows.push({ l, cost, ours: ourLines })
    }

    rows.sort((a, b) => b.cost - a.cost)
    console.log(`\n  --- reconciliation cost (changed lines vs rebrand(candidate)) ---`)
    console.log(`    ${"file".padEnd(62)}${"land".padEnd(12)}${"cost".padStart(8)}`)
    for (const r of rows.slice(0, 22))
      console.log(`    ${r.l.file.slice(-62).padEnd(62)}${r.l.kind.padEnd(12)}${String(r.cost).padStart(8)}`)
    // Two different numbers, and conflating them is how a candidate looks cheap when it is
    // not. A file with a host costs only OUR delta against it; a file without one costs its
    // entire length, because there is nothing to apply the delta to. Averaging those hides
    // a candidate that hosts almost nothing behind the small files it does host.
    const hosted = rows.filter((r) => r.l.kind !== "absent" && !r.l.generated)
    const orphan = rows.filter((r) => r.l.kind === "absent" && !r.l.generated)
    const gen = rows.filter((r) => r.l.generated)
    const sum = (rs: typeof rows) => rs.reduce((n, r) => n + r.cost, 0)
    console.log(
      `\n    cost to reconcile onto files the candidate HOSTS (${hosted.length} files): ${sum(hosted).toLocaleString()} lines` +
        `\n    cost to hand-port files it has NO host for  (${orphan.length} files): ${sum(orphan).toLocaleString()} lines` +
        `\n    REAL PORT SURFACE: ${(sum(hosted) + sum(orphan)).toLocaleString()} lines` +
        `\n    (excluded as regenerated by the SDK build: ${gen.length} files, ${sum(gen).toLocaleString()} lines)`,
    )
    if (totalCost !== sum(hosted) + sum(orphan) + sum(gen))
      throw new Error(`cost accounting does not balance: ${totalCost} vs ${sum(hosted) + sum(orphan) + sum(gen)}`)

    const absent = rows.filter((r) => r.l.kind === "absent")
    if (absent.length) {
      console.log(`\n  --- no host in candidate (${absent.length} files, ${absent.reduce((n, r) => n + r.cost, 0).toLocaleString()} lines) ---`)
      for (const r of absent.sort((a, b) => b.cost - a.cost).slice(0, 15))
        console.log(`    ${String(r.cost).padStart(7)}  ${r.l.file}`)
    }

    const guess = rows.filter((r) => r.l.kind === "guess")
    if (guess.length) {
      console.log(`\n  --- basename-only match, landing UNPROVEN (${guess.length} files) ---`)
      console.log(`    cost below is measured against a file that may not be the real host.`)
      for (const r of guess.sort((a, b) => b.cost - a.cost))
        console.log(`    ${String(r.cost).padStart(7)}  ${r.l.file}\n              guessed -> ${r.l.target}`)
    }

    const amb = landings.filter((l) => l.ambiguous.length)
    if (amb.length) {
      console.log(`\n  --- several hosts matched the same suffix (${amb.length}) ---`)
      for (const l of amb)
        console.log(`    ${l.file}\n      -> ${[l.target!, ...l.ambiguous].slice(0, 4).join("\n      -> ")}`)
    }

    return {
      ref,
      ...buckets,
      hosted: sum(hosted),
      orphan: sum(orphan),
      generated: sum(gen),
      totalCost,
      landings,
      byPath,
      blobMap,
    }
  } finally {
    useUpstream(previous.id)
  }
}

/**
 * What it costs to go A -> B, i.e. to stage the migration rather than jump.
 *
 * Per-candidate cost answers "how much work is each base". It cannot answer "is staging
 * worth it", because that is a question about paying twice: port onto A, then redo the
 * move to B later. The second bill is the CONTENT DRIFT between A and B for exactly the
 * files we would own after the first port - diff `rebrand(A's host)` against
 * `rebrand(B's host)` for each file, at whichever path each candidate puts it.
 *
 * Path moves are what the diff deliberately ignores, so a low number here means "B is
 * mostly the same code in different directories" - the staircase is then nearly free and
 * the only cost is re-typing the moves, which a script can do. A high number means the
 * candidates disagree about what the code IS, and staging would be a false economy: the
 * first port's work would be thrown away rather than carried.
 */
async function staircase(a: Awaited<ReturnType<typeof report>>, b: Awaited<ReturnType<typeof report>>) {
  const previous = useUpstream("opencode")
  try {
    const byFile = new Map(b.landings.map((l) => [l.file, l]))
    const rows: Array<{ file: string; cost: number; from: string; to: string }> = []
    let bothHosted = 0

    for (const la of a.landings) {
      const lb = byFile.get(la.file)
      if (la.generated || !la.target || !lb?.target) continue
      const bufA = a.blobMap.get(a.byPath.get(la.target)!)
      const bufB = b.blobMap.get(b.byPath.get(lb.target)!)
      if (!bufA || !bufB) continue
      bothHosted++
      rows.push({
        file: la.file,
        cost: await diffLines(rebrand(bufA.toString("utf8")), rebrand(bufB.toString("utf8")), la.file),
        from: la.target,
        to: lb.target,
      })
    }

    const total = rows.reduce((n, r) => n + r.cost, 0)
    const same = rows.filter((r) => r.from === r.to).length
    const row = (label: string, n: string | number) => `  ${label.padEnd(44)}${String(n).padStart(5)}`
    console.log(
      `\n${"=".repeat(78)}\nSTAIRCASE  ${a.ref} -> ${b.ref}\n` +
        `  content drift across the ${bothHosted} files BOTH candidates host\n` +
        row("path unchanged in both", same) +
        "\n" +
        row("path differs (move only, no content change)", bothHosted - same) +
        "\n" +
        `  ${"DRIFT TO REDO ONCE STAGED".padEnd(44)}${total.toLocaleString().padStart(5)} lines`,
    )
    for (const r of rows.sort((x, y) => y.cost - x.cost).slice(0, 12))
      console.log(`    ${String(r.cost).padStart(7)}  ${r.file}\n                ${r.from}\n             -> ${r.to}`)
    return total
  } finally {
    useUpstream(previous.id)
  }
}

const results = []
for (const ref of refs) results.push(await report(ref))

if (results.length > 1) {
  console.log(`\n${"=".repeat(78)}\nCOMPARISON\n`)
  console.log(
    `  ${"ref".padEnd(16)}${"same-path".padStart(11)}${"relocated".padStart(11)}${"absent".padStart(9)}${"reconcile".padStart(12)}${"hand-port".padStart(12)}${"generated".padStart(11)}`,
  )
  for (const r of results)
    console.log(
      `  ${r.ref.padEnd(16)}${String(r["same-path"]).padStart(11)}${String(r.relocated).padStart(11)}${String(r.absent).padStart(9)}${r.hosted.toLocaleString().padStart(12)}${r.orphan.toLocaleString().padStart(12)}${r.generated.toLocaleString().padStart(11)}`,
    )

  // The decision, in one place: jump straight to the last candidate, or stage through the
  // first and pay the drift again later. Both routes end at the same place, so the totals
  // are directly comparable - which is the only way to tell a cheaper base from a cheaper
  // ROUTE. A candidate that is cheaper to port to but expensive to move on from is the
  // trap this line exists to make visible.
  const [a, b] = results
  if (a && b) {
    const drift = await staircase(a, b)
    const direct = b.hosted + b.orphan
    const staged = a.hosted + a.orphan + drift
    const verdict = staged <= direct ? "STAGE (cheaper overall)" : "JUMP (staging pays twice)"
    console.log(
      `\n  route A - ${a.ref} only ................. ${(a.hosted + a.orphan).toLocaleString().padStart(9)} lines, stops short of the main line` +
        `\n  route B - ${b.ref} directly ............ ${direct.toLocaleString().padStart(9)} lines` +
        `\n  route C - ${a.ref}, then ${b.ref} ....... ${staged.toLocaleString().padStart(9)} lines   ${verdict}`,
    )
  }
}