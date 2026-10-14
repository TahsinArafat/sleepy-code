# Fork Port Manifest — the 78 fork-only files

> A triage of every file that exists **only** in SleepyCode with **no** counterpart in `upstream/main` (XiaomiMiMo/MiMo-Code). These are the fork's inventions. Everything else in the tree is either identical to upstream or a pure rebrand of it.
>
> Regenerate the input with `bun run script/fork-delta.ts` → `script/.fork-delta-only.txt`. Every file below appears in that output exactly once; the tiers account for all 78.

The *other* half of the fork surface — 80 files that exist upstream but carry real non-branding edits — is **not** triaged here. Those are rewrites of upstream files rather than additions, and they are a per-file porting problem, not a keep/drop decision. They are also what actually determines whether a re-parent is cheap.

## The cost model behind every verdict

Two measured facts decide whether a file is cheap or expensive to carry onto a different parent:

1. **Dependency fan-out.** A file whose imports are all relative siblings and runtime builtins moves byte-for-byte. A file importing a subsystem the new parent lacks is a reimplementation.
2. **Data vs. code.** Pure data — JSON themes, markdown prompts, licence text — is free. Code that binds to another file's shape is free only if that file also moves.

Against `opencode/v1`, the closest structural candidate because it still uses a monolithic `packages/opencode/`:

| Dependency we use | `opencode/v1` status | Consequence |
| --- | --- | --- |
| `@/actor/*` (`Actor`, `Liveness`, `deriveLiveness`, `ActorRegistry`) | **absent** | reimplementation required |
| `src/llm-server/` (1192 LOC, local audio/completions server) | **absent** | reimplementation required |
| `src/session/session.sql.ts` (`SessionTable`) | relocated into `src/storage/schema.ts` | import-path rewrite |
| `@/storage` (barrel) | `src/storage/storage.ts`, no `index.ts` | import-path rewrite |
| `src/effect/cross-spawn-spawner.ts` | **absent** (v1 has `app-node-builder-v1.ts`, `config-service.ts`, `runtime-flags.ts` instead) | needs a replacement |
| `@/session/{schema,message-v2,prompt}`, `@/project/instance`, `@/tool`, `@/cli/cmd/cmd`, `@/cli/ui`, `@/util` | present | no work |
| `src/agent/prompt/orchestrator.txt` and its `session` / `cron` tools | absent | the Orchestrator feature has no host |

Two subsystems, not one, define the whole migration cost: `@/actor/*` and `src/llm-server/`. Everything in Tier 3 hangs off them.

---

## Tier 1 — carry as-is (36 files)

No adaptation. These define the SleepyCode product surface, and the dependency analysis says it is well factored: the entire surface bottoms out in `Log`, `Global`, `UI`, and the TUI contexts, and nothing else.

### Product surface (10)

| File | Notes |
| --- | --- |
| `src/plugin/sleepy.ts` | 233 lines. Gateway provider, x25519/AES-GCM device-key exchange, OAuth. Imports only `Log` + `Global`. **The most important file in the fork.** |
| `src/cli/cmd/login.ts` | 402 lines. `./cmd`, `http`, `open`, `fs`, `path`, `timers/promises`, `../../global`, `../ui`, `@clack/prompts`. |
| `src/cli/cmd/doctor.ts` | 116 lines. `./cmd`, `fs/promises`, `path`, `../../global`, `../ui`. |
| `src/cli/cmd/init.ts` | 97 lines. `./cmd`, `fs/promises`, `path`, `../ui`. |
| `src/provider/session-check.ts` | 178 lines. Imports only `Log`. |
| `src/cli/cmd/tui/util/connect.ts` | 5 lines, zero imports. |
| `bin/sleepy` | The branded bin entrypoint. |
| `.npmignore` | Publishing config. |
| `AGENTS.md` | Package-level agent instructions. |
| `.github/workflows/release.yml` | Release pipeline. |

### TUI branding (4)

`src/cli/cmd/tui/context/theme/sleepycode.json` (245 lines of pure data), `component/dialog-sleepy-login.tsx` (169 lines), `component/banner-session-expired.tsx` (48 lines, depends only on that dialog), `feature-plugins/sidebar/mascot.tsx` (69 lines).

`mascot.tsx` imports types from `@sleepy-ai/sdk/v2` and `@sleepy-ai/plugin/tui` — our own regenerated SDK, which is already on the port list. Type-only, so it carries if the SDK does.

### Agent and system prompts (6)

`src/agent/prompt/{apex,forge,phantom,pivot,stack}.txt` and `src/tool/plan-enter.txt`. Static text, no imports. `plan-enter.txt` describes a mode switch against the shared agent model, so it survives.

### Skills — self-contained bundle (11)

`src/skill/builtin/.bundle/design-blueprint/{SKILL.md,assets/design-md-template.md,references/{anti-slop,decision-trace,design-directions,embody-modes,nine-section-protocol,six-layer-model}.md}`, `src/skill/builtin/.bundle/evolve/SKILL.md`, `src/skill/builtin/.bundle/frontend-design/{LICENSE.txt,SKILL.md}`.

Verified: **zero** references to `../../..` or any `@/` alias inside the bundle. Fully self-contained markdown.

### Tests (5)

`test/plugin/sleepy.test.ts`, `test/provider/session-check.test.ts`, `test/cli/{doctor,init,login}.test.ts`.

---

## Tier 2 — verify or mechanically edit (16 files)

Every adaptation here is an import-path rewrite or a "confirm this still exists" check. No logic changes.

### Needs a known import rewrite (3)

| File | Change |
| --- | --- |
| `src/tool/auto-worktree-hint.ts` | `@/session/session.sql` → `@/storage/schema`; `@/storage` barrel → `@/storage/storage`. |
| `src/tool/conflict-detection.ts` | The same two rewrites, plus `./auto-worktree-hint` which travels with it. |
| `test/tool/auto-worktree-scan.test.ts` | Follows `auto-worktree-hint.ts`. |

### Needs a specific thing verified (13)

| File | What to verify |
| --- | --- |
| `src/tool/isolated-git-guard.ts` | 348 lines, imports only `../global`. Should be free — confirm the `Global` surface still carries the paths it reads. |
| `test/tool/isolated-git-guard.test.ts` | Travels with its source. |
| `test/tool/bash-isolated-git-guard.test.ts` | The bash-path variant. |
| `test/tool/session-gating.test.ts` | Imports `../../src/effect/cross-spawn-spawner`, which `opencode/v1` **does not have**. Needs a replacement or the test needs rebasing onto v1's spawner. |
| `src/permission/permission.sql.ts` | Type-only import of `SessionID` from `../session/schema`. Present in v1 — confirm the id type is unchanged. 24 lines. |
| `src/tool/websearch/sleepy.ts` | Imports only `effect` and `effect/unstable/http`. Should be free. |
| `src/util/sleepy-process.ts` | 24 lines, zero imports. Free. |
| `test/tool/plan-enter.test.ts` | Prompt-text assertions. |
| `test/cli/tui/connect.test.ts` | Follows `connect.ts`. |
| `test/cli/tui/spinner-pacman.test.ts` | Depends on the TUI port landing. |
| `test/session/auto-worktree-notice.test.ts` | Imports `project/instance`, `session`, `session/prompt`, `util`, `effect` — all present in v1. |
| `test/fixture/skills/llm-endpoint-demo/speak.mjs` | Imports only `node:fs/promises`. Free. |
| `test/fixture/skills/llm-endpoint-demo/transcribe.mjs` | Imports only `node:fs`. Free. |

### A grep result that would have been wrong

`test/tool/isolated-git-guard.test.ts` and `test/tool/session-gating.test.ts` both matched an "orchestrator" grep. Those matches are a **session or agent name in test data**, not an import of an orchestrator subsystem. Neither is blocked by the Orchestrator work.

---

## Tier 3 — blocked on a MiMo-only subsystem (12 files)

These cannot move because what they describe has no host on the new parent. Each is a reimplementation decision, and the decision is product-level, not engineering-level.

### Blocked on `@/actor/*` (2)

| File | Note |
| --- | --- |
| `src/tool/fleet.ts` | 202 lines. Imports `Actor`, `deriveLiveness`, `Liveness` from `@/actor/schema`. v1 has no `src/actor/`. The fleet concept presumes MiMo's actor runtime. |
| `test/tool/fleet.test.ts` | 189 lines. Also imports `DEFAULT_LIVENESS_STALL_MS` from `@/actor/schema`. Dies with its source. |

### Blocked on the orchestration and cron runtime (9)

| File | Note |
| --- | --- |
| `src/session/prompt/orchestrator.txt` | The prompt for a feature with no host. |
| `src/tool/session.txt` | 82 lines documenting the orchestrator operations of a tool that would not exist. |
| `src/tool/session.shell.txt` | 55 lines, shell form of the same. |
| `src/tool/cron.shell.txt` | 48 lines. MiMo's cron subsystem is 1256 LOC with no v1 counterpart. |
| `test/agent/orchestrator.test.ts` | 90 lines. Imports `Instance`, `Agent`, and `orchestrator.txt`. |
| `test/session/orchestrator-prompt.test.ts` | Imports `orchestrator.txt`. |
| `test/session/orchestrator-route-first.test.ts` | 196 lines. Imports `orchestrator.txt` **only** — asserts prompt content, not behaviour. |
| `test/session/orchestrator-live-behavior.test.ts` | Genuinely blocked: imports `../../src/actor/registry`, a runtime rather than a prompt. |
| `test/agent/fixtures/list-agents-probe.ts` | Lists the agent set including orchestrator. |

Three of these — `orchestrator-prompt`, `orchestrator-route-first`, and `list-agents-probe` — would keep passing unchanged, because they assert text. They are cheap to carry but only worth carrying if the feature is rebuilt; otherwise they test the shape of an absent tool.

### Blocked on `src/llm-server/` (1)

| File | Note |
| --- | --- |
| `test/llm-server/e2e-audio.test.ts` | Imports `../../src/llm-server/tokens`. That subsystem is 1192 LOC — `completions.ts`, `protocol.ts`, `tokens.ts` — and has **no** `opencode/v1` counterpart. A MiMo-only feature, not a fork invention, but it drags this test into Tier 3. |

Note that its two fixtures (`speak.mjs`, `transcribe.mjs`) are Tier 2 — they import nothing but node builtins. It is only the harness that is blocked.

---

## Tier 4 — drop (8 files)

Nothing here needs a porting decision.

| File | Why drop |
| --- | --- |
| `docs/harness/MiMo Orchestrator Mode.md` + `.en` `.fr` `.ja` `.ru` | 5 files, **86 KB**, last touched 2026-09-02. Documents MiMo's Orchestrator, a feature we inherit and that Tier 3 drops. Naming the old vendor in shipped docs is a branding leak that the tooling **cannot see** — see below. |
| `docs/compose/specs/2026-07-14-orchestrator-route-first-redesign.md` | Design history for the orchestrator route-first redesign. Superseded. |
| `packages/opencode/.sleepycode-test-fixtures-50158/sleepycode-test-eqsxv84ythu/.watcher-b67v64k2mnv` | **Tracked test-fixture leak.** A per-run temp directory with a PID in the name, committed to the tree. Delete it and add a `.sleepycode-test-fixtures-*` ignore rule. |
| `script/.tmp-hunk.ts` | 77 lines. A scratch helper for resolving conflict hunks during a merge. Grep finds **zero** references outside its own doc comment. A re-parent is a fresh-branch port rather than a merge, so the graft strategy it serves is obsolete. |

---

## Tier 5 — rewrite the tooling for a new parent (4 files)

The fork's own maintenance machinery. These do not port; they get re-pointed.

| File | Fate |
| --- | --- |
| `script/lib/branding.ts` | Already parameterised — ships a `MIMO` and an `OPENCODE` profile, with `SLEEPYCODE_UPSTREAM` selecting the active one. Stage 2 is where the default flips. |
| `script/fork-delta.ts` | Parent-agnostic. Re-points by changing one remote ref. |
| `script/sync-upstream.ts` | The MiMo merge driver. Its B'/U'/F'' graft strategy assumes shared history, and **there is none** — the MiMo root commit has no parents. This script cannot drive an opencode re-parent and should be retired rather than ported. |
| `.sleepycode/memory.md` | Carries regardless of parent, but every claim about "upstream" in it becomes false after a re-parent. Needs a rewrite pass; the recorded audit findings stay valid. |

---

## Hold — keep, but re-read when the code moves (2 files)

`docs/compose/spec/auto-worktree-config-toggle.md` and `docs/compose/specs/auto-worktree.md`. They document the auto-worktree feature, which is Tier 2 and carries, so they are not stale. They were not part of the automated dependency pass and should be re-read when `auto-worktree-hint.ts` is ported.

---

## A blind spot worth knowing about before Stage 2

The five `docs/harness/MiMo Orchestrator Mode.*` files are a good illustration of a gap in the branding layer. The vendor name is in their **filenames only** — the content contains zero `mimo` tokens:

```
grep -c -i mimo "docs/harness/MiMo Orchestrator Mode.md"   ->  0
```

So `audit()` returns `[]` for all five, because it scans content. And `mapPath()` leaves the paths untouched, because the `MIMO` profile's `pathMap` lists only three specific files (`bin/mimo`, `plugin/mimo.ts`, `websearch/mimo.ts`) and has no general documentation rule.

Both tools report them clean. They are nonetheless the most visible MiMo remnants in the repository, and a filename-based pass is the only thing that will catch them. That is an argument for deleting them now rather than for extending the map later.

---

## Summary

| Tier | Files | Character |
| --- | --- | --- |
| 1 — carry as-is | 36 | product surface, branding, prompts, skills |
| 2 — verify or mechanical edit | 16 | import-path rewrites and existence checks |
| 3 — blocked on MiMo-only | 12 | reimplementation decision required |
| 4 — drop | 8 | stale docs, a leaked fixture, orphaned scratch |
| 5 — rewrite tooling | 4 | `sync-upstream.ts` retires |
| Hold — keep, re-read | 2 | auto-worktree specs |
| **Total** | **78** | |

**52 of 78 need no judgement call at all.** Gateway, OAuth, login, doctor, init, theme, skills, agent prompts, sidebar — the entire product surface depends on `Log`, `Global`, `UI`, and the TUI contexts, and on nothing else. That is a well-factored fork, and it means a re-parent does not put the product at risk.

**Everything about orchestration dies together, and it is bigger than it first looked.** `fleet`, `session`, `cron`, and the orchestrator prompt are one feature held together by `@/actor/*`. The audio end-to-end path is a second, independent casualty via `src/llm-server/`. Together they are 12 files. Rebuilding an actor runtime, or abandoning the feature, is a product decision — and it should be made **before** any porting starts, because it changes what "done" means.

## What is deliberately not here

- **The 80 real-fork-logic files.** The harder half. Each exists upstream and needs its edits re-applied; they are not additions and carry no keep/drop decision.
- **A size estimate.** Line counts were not gathered per file, and a total would mislead without them. The dependency graph predicts difficulty here; volume does not.
- **Any change to the tree.** This document is the triage only. The two drops in Tier 4 that are pure deletions — the fixture leak and the orphaned scratch file — are safe to apply whenever you want them; they were left in place so this stays a read-only artefact.