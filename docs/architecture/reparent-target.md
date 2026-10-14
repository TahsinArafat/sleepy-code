# Re-parent target: `opencode/dev`, and why the cheaper-looking base is a trap

> **Decision.** SleepyCode re-parents onto **`opencode/dev`** (opencode **2.0.29**, released 2026-10-14) in a single jump. Not `opencode/v1` first, and not a merge.
>
> Every number below is reproduced by `bun run script/port-map.ts refs/remotes/opencode/v1 refs/remotes/opencode/dev`. Nothing here is estimated.
>
> **Pass full refnames.** `opencode/dev` is unsafe as a shorthand: a stray
> `refs/tags/opencode/dev` tag pointing at one of our own commits makes git resolve the
> shorthand tags-first, so the script would measure our tree as though it were the
> candidate. `resolveRef` now refuses an ambiguous ref rather than silently picking one.

SleepyCode is currently a fork of **MiMo-Code**, which is itself a fork of **opencode** — so the stated goal ("be a direct opencode fork") was never actually true of the git graph. `git merge-base HEAD opencode/v1` and `git merge-base HEAD opencode/dev` both return **empty**; MiMo's root commit `8e5cc8a8` has no parents. Git can never auto-merge across that boundary. Any re-parent is a manual port, and the only real question is **onto what**.

---

## The two candidates

| | `opencode/v1` | `opencode/dev` |
| --- | --- | --- |
| version | 1.19.0 | **2.0.29** |
| tip | 2026-10-14 | 2026-10-15 |
| commits / 30d | 163 | 757 |
| tree files | 6,634 | 8,592 |
| `packages/*` dirs | 32 | 36 |
| role | previous major, in maintenance | **current released major** |

Both are maintained. They are not two branches of the same line — they are two consecutive majors. `v1` receives fixes; it does not receive v2 features. Forking `v1` means forking a line that is already closing.

---

## The measurement that decides it

Our real port surface is 80 files (`bun run script/fork-delta.ts` → `script/.fork-delta-logic.txt`). Three generated SDK artefacts are excluded because `packages/sdk/js/script/build.ts` regenerates them.

```
  ref               same-path  relocated   absent   reconcile   hand-port  generated
  opencode/v1              39         26       15      45,187       3,570     64,906
  opencode/dev              9         44       27      39,725       8,493     31,746
```

Read on its own, the `same-path` column says **v1**: it leaves 39 of 80 files exactly where they are, against 9 for `dev`. Most of its work is therefore applying a diff we already hold, verifiable file by file.

That reading is wrong, and the reason it is wrong is that per-candidate cost cannot see the second bill.

## Why staging through v1 pays twice

Porting onto `v1` and then moving to `dev` is two jobs. The second one is the **content drift between the candidates** across exactly the files we would own after the first port — measured by diffing `rebrand(v1's host)` against `rebrand(dev's host)` for each file, which deliberately ignores the path move and counts only what genuinely differs in the code:

```
STAIRCASE  opencode/v1 -> opencode/dev
  content drift across the 52 files BOTH candidates host
  path unchanged in both                         24
  path differs (move only, no content change)    28
  DRIFT TO REDO ONCE STAGED                   32,353 lines
```

```
  route A  v1 only .............    48,757 lines   stops short of the main line
  route B  dev directly ........    48,218 lines
  route C  v1, then dev ........    81,110 lines   JUMP (staging pays twice)
```

**v1's 39 same-path files were never cheaper — only cheaper first.** 28 of the 52 shared files change path between the two majors, and every one of those moves drags real content drift behind it. The largest single contributors are upstream's own churn rather than ours:

| lines | file | v1 → dev |
| --- | --- | --- |
| 4,706 | `tui/routes/session/index.tsx` | same path, rewritten |
| 2,960 | `test/session/prompt.test.ts` | `packages/opencode/test/` → `packages/cli/test/acp/` |
| 2,166 | `test/provider/provider.test.ts` | `packages/opencode/test/` → `packages/core/test/` |
| 2,110 | `provider/provider.ts` | `packages/opencode/src/` → `packages/ai/src/provider.ts` |
| 2,059 | `tui/component/prompt/index.tsx` | same path, rewritten |
| ~1,450 ×5 | `i18n/{en,fr,ja,ru,zh}.ts` | `packages/app/src/i18n/` → `packages/ui/src/i18n/` |

## And dev's structure is stable where we land

A 757-commits-per-month main line is only a risk if it is *structurally* unstable. Measured over the last 60 days, `dev` has 245 renames under `packages/`, but they are not spread across the tree:

| path | renames / 60d | relevance |
| --- | --- | --- |
| `packages/gui-extensions/src` | 146 | none — we do not use it |
| `packages/app/src` | 50 | i18n tables only |
| `packages/desktop/src` | 29 | none |
| **`packages/core/src`** | **7** | we land here |
| `packages/ai/src`, `packages/tui/src`, `packages/cli/src` | **1 total** | we land here |

The one commit that appeared to touch all 19 packages at once, `34d8ded0c5`, is `sync release versions for v2.0.29 [skip ci]` — a version bump, not a move. The landings themselves are present and singular today: `packages/tui/src/app.tsx`, `packages/tui/src/routes/session/index.tsx`, `packages/core/src/provider.ts`.

---

## What this decision costs

`dev` is the more expensive base **per file**: 27 of our 80 files have no host and must be hand-written (8,493 lines against v1's 3,570), and only 9 land where they are. That work is real and is the bulk of the migration. It is bought once, on the line that will still exist.

## What it does not change

- **Branding is not a risk.** `bun run script/reparent-probe.ts refs/remotes/opencode/v1 refs/remotes/opencode/dev` reports **0 residual tokens and 0 path collisions** on both. The `OPENCODE` profile in `script/lib/branding.ts` rebrands 100% of non-protected tokens, and its map is **injective** — unlike the mimo map, whose collisions make `debrand()` unsound and unusable in a merge.
- **The TUI port is mechanical and identical for both candidates.** Upstream lifted `cli/cmd/tui/` to `packages/tui/src/` in both v1 and dev, so this decision does not make the TUI any harder. 15 of our 25 TUI fork-logic files land at `packages/tui/src/<same relative path>`.
- **Tier 3 stays blocked either way.** `src/actor/*` and `src/llm-server/` are absent from *both* candidates, so the orchestrator, fleet, cron and audio-e2e features need reimplementation regardless of which base is chosen.

## Verified references

SleepyCode ships `@sleepy-ai/cli` 0.1.19 across 12 platform packages; the product surface that must survive the port is itemised in `fork-port-manifest.md`.