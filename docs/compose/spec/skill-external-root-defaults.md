---
feature: skill-external-root-defaults
status: delivered
updated: 2026-09-20
branch: feat/skill-external-root-defaults
commits: 895ae523..9797f74f
---

# Skill External Root Defaults

## Report

**What was built** — External skill discovery defaults to sleepycode +
open-standard `.agents`. Brand roots (`.claude` / `.codex` / `.opencode`) are
opt-in via `SLEEPYCODE_ENABLE_*_SKILLS`; agents turns off with
`SLEEPYCODE_DISABLE_AGENTS_SKILLS`. External scans no longer match dotted path
segments, so host-private namespaces such as Codex `skills/.system` never
enter the catalog. `SLEEPYCODE_DISABLE_EXTERNAL_SKILLS` and brand
`SLEEPYCODE_DISABLE_*_SKILLS` skill gates are gone; `SLEEPY_ONLY` /
`SLEEPYCODE_DISABLE_CLAUDE_CODE` no longer affect skill roots. Same-name clashes
are layered last-wins (home brands → project brands → sleepycode → paths/urls),
with `.agents` last among brands in each home/project brand pass.

**Verification** — `bun typecheck` (packages/opencode) PASS;
`bun test test/skill` 91 pass / 0 fail (and 23 pass after the agents-order
change on the two focused files); related tool/prompt skill suites 21 pass /
3 skip (pre-existing); `test/agent/agent.test.ts` 52 pass. Independent review
follow-ups: `ENABLE_OPENCODE` coverage, layered clash documented in S2.3b,
misleading test name fixed; retired keys stay out of shipped docs.

**Journey log**

1. Codex `skills/.system` is a SYSTEM install cache (marker
   `.codex-system-skills.marker`), not user skills — `dot: false` is enough;
   no marker special-case.
2. Flat `agents > all brands` would break project-over-home layering; keep
   layered scope and document it instead of forcing a total order.
3. Shipped comments/README must describe live behavior only; retired env
   names belong in the PR body, not the product surface.

## [S1] Problem

External skill discovery treats every `SKILL.md` under a brand root as a user
skill. Codex Desktop/CLI installs **SYSTEM** skills into
`$CODEX_HOME/skills/.system/` (marker: `.codex-system-skills.marker`). Those
bodies are Codex-private (imagegen CLI, OpenAI docs self-knowledge, Codex
plugin/skill installers). SleepyCode scans `~/.codex` with
`skills/**/SKILL.md` and `dot: true`, so `.system/*/SKILL.md` enters the
catalog whenever Codex compatibility is on.

Harm: polluted `available_skills`, name collisions with bundled skills
(`imagegen`, `skill-creator`), and instructions that point at Codex-only tools.

Two structural defects behind that:

1. **`dot: true` on external scans** — any dotted segment under `skills/`
   (`.system`, `.trash`, `.hidden`) is treated as a skill container.
2. **All brand roots default-on** — `.claude` / `.codex` / `.opencode` are
   scanned unless an env kill-switch is set. OpenCode's fork-era
   `*_DISABLE_CLAUDE_CODE*` / `SLEEPYCODE_SLEEPY_ONLY` gates are a blunt Claude
   inheritance switch, not a skill-root policy. Desktop already defaults to
   open-standard `agents` only via `skillPathCompat`, but the engine default
   does not match, and enabling a brand root still pulls that brand's private
   namespaces.

Claude Code has the same class of reserved locations under `.claude/skills/`
(`synced/`, `.trash/`). Out of scope here except that `dot: false` also stops
`.trash` from being loaded.

## [S2] Design

### S2.1 External scan never matches dotted path segments

Keep `EXTERNAL_SKILL_PATTERN = "skills/**/SKILL.md"` (nested skills stay
discoverable). Drop `dot: true` from the two external `scan` call sites in
`packages/opencode/src/skill/index.ts` (global home roots and project `up()`
roots). Native patterns (`SLEEPYCODE_SKILL_PATTERN`, `SKILL_PATTERN`,
`BUILTIN_SKILL_PATTERN`) already omit `dot` and stay unchanged.

Effect: `~/.codex/skills/.system/**` and `~/.claude/skills/.trash/**` never
match. Claude's reserved name `synced` is **not** special-cased (accepted
leak; non-dotted).

### S2.2 Default root set = sleepycode + agents; brand roots are opt-in

| Root | Default | Control |
| --- | --- | --- |
| `.sleepycode/skill(s)`, config `skills.paths` / `skills.urls`, builtin & compose bundles | on | existing dedicated flags only |
| `.agents/skills` (home + project up) | **on** | `SLEEPYCODE_DISABLE_AGENTS_SKILLS` |
| `.claude/skills` | **off** | `SLEEPYCODE_ENABLE_CLAUDE_CODE_SKILLS` |
| `.codex/skills` | **off** | `SLEEPYCODE_ENABLE_CODEX_SKILLS` |
| `.opencode/skills` | **off** | `SLEEPYCODE_ENABLE_OPENCODE_SKILLS` |

Enabling Codex compatibility loads user skills under `~/.codex/skills/<name>/`
only; `.system` remains invisible because of S2.1.

### S2.3 Env contract (Active only in shipped docs)

User-facing controls are **only** these four envs. Shipped comments, README, and
sleepycode-docs describe live behavior only — they do not list retired key names.

| Env | Default | Meaning |
| --- | --- | --- |
| `SLEEPYCODE_DISABLE_AGENTS_SKILLS` | unset = agents on | Turn off the open-standard `.agents` root |
| `SLEEPYCODE_ENABLE_CLAUDE_CODE_SKILLS` | unset = off | Opt in `.claude/skills` |
| `SLEEPYCODE_ENABLE_CODEX_SKILLS` | unset = off | Opt in `.codex/skills` |
| `SLEEPYCODE_ENABLE_OPENCODE_SKILLS` | unset = off | Opt in `.opencode/skills` |

`SLEEPYCODE_DISABLE_EXTERNAL_SKILLS` and brand `SLEEPYCODE_DISABLE_*_SKILLS` keys
are no longer part of the skill-root surface (changelog / PR description only).
`SLEEPYCODE_SLEEPY_ONLY` / `SLEEPYCODE_DISABLE_CLAUDE_CODE` still govern Claude
prompt inheritance and provider env detection; they are not skill-root controls.

Predicate (sole source of truth for `EXTERNAL_DIRS` filtering):

```text
scan .agents    ⇔  ¬ DISABLE_AGENTS_SKILLS
scan .claude    ⇔  ENABLE_CLAUDE_CODE_SKILLS
scan .codex     ⇔  ENABLE_CODEX_SKILLS
scan .opencode  ⇔  ENABLE_OPENCODE_SKILLS
```

Implementation note: `Flag` exposes lazy getters for the four keys above.
Remove the outer `if (!Flag.SLEEPYCODE_DISABLE_EXTERNAL_SKILLS)` guard around
external discovery. `SLEEPYCODE_SKILL_PATTERN` keeps accepting `skill` and
`skills` under `.sleepycode/` for compatibility; shipped prompts may mention
either — do not treat path spelling as this feature's contract.

### S2.3b Same-name clash order (layered, last non-bundled wins)

`add()` lets a later non-bundled match overwrite an earlier one; bundled never
overwrites non-bundled. Discovery is **layered by scope**, not a single flat
authority chain:

1. builtin bundle → compose bundle
2. **home** brand roots in `EXTERNAL_DIRS` order
   `[.claude, .codex, .opencode, .agents]` (agents last → wins among home brands)
3. **project** brand roots via `fsys.up` (targets in the same order per ancestor;
   parent ancestors load after nearer dirs)
4. `.sleepycode` / config skill dirs
5. `skills.paths`, then `skills.urls`

Consequences (accepted):

- Within one scope, `.agents` beats brand copies of the same name.
- A **project** brand skill can still beat a **home** `.agents` skill (more
  specific scope). Do not claim a total order `agents > all brands` across
  scopes.
- `.sleepycode` and explicit `skills.paths`/`urls` beat every external root.

### S2.4 Desktop alignment (`sleepy-desktop`)

`SkillPathCompat` default is already
`{ agents: true, claude: false, codex: false, opencode: false }` — identical
to the new engine default. `engineSkillScanEnvFromCompat` injects only deltas
from that default and stops emitting deprecated keys:

```ts
const env: Record<string, string> = {}
if (!compat.agents) env.SLEEPYCODE_DISABLE_AGENTS_SKILLS = "true"
if (compat.claude) env.SLEEPYCODE_ENABLE_CLAUDE_CODE_SKILLS = "true"
if (compat.codex) env.SLEEPYCODE_ENABLE_CODEX_SKILLS = "true"
if (compat.opencode) env.SLEEPYCODE_ENABLE_OPENCODE_SKILLS = "true"
return env
```

| Desktop prefs | Injected env | Engine scan set |
| --- | --- | --- |
| default | `{}` | sleepycode + agents |
| all off | `{ SLEEPYCODE_DISABLE_AGENTS_SKILLS: "true" }` | sleepycode/config/bundle only |
| agents + codex | `{ SLEEPYCODE_ENABLE_CODEX_SKILLS: "true" }` | + `.codex` user skills (no `.system`) |

Desktop enumeration / import / same-name checks keep reading the same
`skillPathCompat` prefs. Any Desktop-side filesystem scan of brand roots must
also use non-dot matching so lists and engine agree.

Write authority stays the sleepycode skills root; brand roots remain read-only
compatibility (existing skill-path-compat contract).

### S2.5 Docs

- `README*.md` env tables and `sleepycode-docs` `reference/config.md`: **Active
  keys only** plus the non-dot scan rule and default load surface. Do not list
  retired key names in shipped docs (PR / changelog only).
- State migration for TUI/CLI users who relied on unset-env scanning of
  `~/.claude` or `~/.codex` (in the PR body; optional one-line README note).

## [S3] Out of Scope

- Claude reserved name `synced` (any capitalization).
- Codex `.codex-system-skills.marker` special-case (covered by `dot: false`).
- Deleting `SLEEPYCODE_SLEEPY_ONLY` / `SLEEPYCODE_DISABLE_CLAUDE_CODE*` from
  prompt / MCP / commands / provider-env surfaces (separate feature if wanted).
- `.skillignore` / config exclusion lists.
- Changing `skills/**` to single-level `skills/*`.
- Writing into or relocating Codex's `.system` cache.
- OpenCode upstream changes.

## Tasks

- [x] T1: External skill scans use non-dot glob matching — acceptance: with a
  fixture `~/.codex/skills/.system/x/SKILL.md` and
  `~/.codex/skills/user-skill/SKILL.md` plus
  `SLEEPYCODE_ENABLE_CODEX_SKILLS=true`, discovery lists only `user-skill`;
  `~/.claude/skills/.trash/y/SKILL.md` is likewise invisible when claude is
  enabled. (covers: S2.1)
- [x] T2: Flip engine external-root defaults and replace env gates —
  acceptance: default discovery includes `.agents` and excludes
  `.claude`/`.codex`/`.opencode`; each `SLEEPYCODE_ENABLE_*_SKILLS` opts in only
  its root; `SLEEPYCODE_DISABLE_AGENTS_SKILLS` drops agents; setting
  `SLEEPYCODE_DISABLE_EXTERNAL_SKILLS` or brand `SLEEPYCODE_DISABLE_*_SKILLS`
  does not change the predicate; `SLEEPYCODE_SLEEPY_ONLY` /
  `SLEEPYCODE_DISABLE_CLAUDE_CODE` do not affect skill roots. (covers: S2.2;
  S2.3; depends: T1)
- [x] T3: Update engine skill tests and env hygiene — acceptance: `test/skill`
  covers default surface (no brand without opt-in), each opt-in including
  `ENABLE_OPENCODE_SKILLS`, agents disable, dotted-dir negative, and existing
  brand-discovery cases pass with `ENABLE_*` set where they expect brand roots.
  (covers: S2.1; S2.2; S2.3; depends: T2)
- [x] T4: Align Desktop `engineSkillScanEnvFromCompat` and related unit tests —
  acceptance: default prefs inject `{}`; open brand injects only its
  `SLEEPYCODE_ENABLE_*_SKILLS`; all-off injects only
  `SLEEPYCODE_DISABLE_AGENTS_SKILLS`; injected keys are exactly the four Active
  keys; unit matrix matches S2.4. (covers: S2.4; depends: T2)
- [x] T5: Document Active env surface — acceptance: README and sleepycode-docs
  list only the four Active keys as controls, state default load surface =
  sleepycode + agents with brand roots opt-in, and do not list retired key names
  in shipped docs. (covers: S2.5; depends: T2)
