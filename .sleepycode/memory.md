# SleepyCode CLI — project memory

## What this repo is
`/Users/tahsinarafat/App_Dev/Sleepy/cli` is a **fork of https://github.com/XiaomiMiMo/MiMo-Code**
(reported by user as the "main fork source"). Remote names: `origin` = TahsinArafat/sleepy-code,
`upstream` = XiaomiMiMo/MiMo-Code.

Fork = upstream + (a) a global **branding layer** mimo→sleepy, (b) Sleepy gateway/OAuth +
TUI sidebar/mascot features, (c) npm-scope `@sleepy-ai`, package name `@sleepy-ai/cli`.

## Upstream sync — the important bit
- `script/lib/branding.ts` = the branding layer (PROTECT, MAP, rebrand, debrand, audit,
  PATH_MAP, SKIP_CONTENT, shouldSkipContent, mapPath).
- **`debrand()` is LOSSY / not invertible.** MAP is not injective:
  `MiMo`+`Mimo`→`Sleepy`, and `MiMoCode`+`Mimocode`+`MimoCode`→`SleepyCode`.
  So `Mimo Code` → `Sleepy Code` → `MiMo Code` (wrong). **Never merge in debranded space** —
  it silently masks real upstream changes. (The doc comment in branding.ts claiming
  "merging in debranded space cut conflicts 285→58" describes this broken approach.)
- **Correct approach: project all three merge sides FORWARD with `rebrand()` into sleepy space**
  (base' = rebrand(base), upstream' = rebrand(upstream), fork is already sleepy), then 3-way
  merge. Branding-only files become `fork == base'` exactly → git auto-merges them with zero
  conflict. No inverse function needed.
- `rebrand` is idempotent on fork text except 5 files with *intentional* mimo mentions:
  LICENSE (Xiaomi copyright attribution), README.md ("Better Than OpenCode & MiMo-Code"),
  .github/ISSUE_TEMPLATE/bug-report.yml, packages/opencode/.gitignore + .npmignore
  (`.mimocode-test-fixtures-*`, `.mimocode/`). Treat these as deliberate, not branding gaps.

## Divergence as of 2026-09 (measured)
- merge-base `6e9f946b` = "chore: bump version to 0.1.4" (2026-06-29).
- Fork `origin/main` tip `1d40b6e6` = v0.1.17 (2026-07-21). **140 commits ahead, 975 behind.**
- upstream/main tip `d17e176b` (2026-09-01), pkg version 0.1.13, name `@mimo-ai/cli`.
- Naive `git merge-tree origin/main upstream/main` → **92 conflicts** (87 content, 5 modify/delete).
- Of 218 files both sides touched: **158 are pure branding** (auto-resolve), only **54 have real
  fork logic** changes needing human merge.
- Upstream adds 698 new files, deletes 34.

## Fork-only features (must survive any sync)
Sleepy gateway provider + dynamic model/pricing mapping, OAuth device-code login + JWT
auto-refresh, startup login enforcement, onboarding page w/ Login button, TUI sidebar
(Plan & Limits progress bars 5h/24h/weekly/monthly/credit, session-stats, animated cat/Neko
mascot, context bar), cost HUD, `sleepy doctor`, `sleepy init`, config file `sleepy.json`,
bin `sleepy`, `SLEEPY_HOME` env, phantom agent color #9333ea.

## Env notes
- bun 1.3.14 at ~/.bun/bin/bun. `timeout` command NOT available on this macOS shell.
- `run_command` timeoutSeconds max is 120. Use `terminal_start`/`terminal_read` for long jobs.
- `git fetch upstream --tags` partially rejects: fork re-used upstream tag names
  (v0.1.6, v0.1.8..v0.1.13) → "would clobber existing tag". Branches fetch fine.
- Untracked local artifacts present: `packages/packages` (symlink → sdks/vscode/packages),
  `script/lib/` (branding.ts + my probes). `bun.lock` has a benign version 0.1.16→0.1.17 drift.
