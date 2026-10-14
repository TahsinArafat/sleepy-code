# SleepyCode CLI — project memory

## What this repo is
`/Users/tahsinarafat/App_Dev/Sleepy/cli` is a **fork of OpenCode**, with an intermediate
Xiaomi MiMo-Code lineage also present (origin = TahsinArafat/sleepy-code,
upstream remote historically pointed at XiaomiMiMo/MiMo-Code).

User correction (2026-03-23): **sleepy is an OpenCode fork**. Treat leftover
`opencode` identifiers as possible intentional compatibility, not automatic bugs.
Re-evaluate SDK spawn (`opencode` binary, `OPENCODE_CONFIG_CONTENT`,
`opencode server listening`) against whether this fork still ships / accepts
those names.

Fork = OpenCode/MiMo lineage + (a) branding layer mimo/opencode→sleepy,
(b) Sleepy gateway/OAuth + TUI sidebar/mascot, (c) npm-scope `@sleepy-ai`,
package name `@sleepy-ai/cli`, bin `sleepy`.

## Upstream sync — the important bit
- `script/lib/branding.ts` = the branding layer (PROTECT, MAP, rebrand, debrand,
  audit, PATH_MAP, SKIP_CONTENT, shouldSkipContent, mapPath).
- **`debrand()` is LOSSY / not invertible.** MAP is not injective:
  `MiMo`+`Mimo`→`Sleepy`, and `MiMoCode`+`Mimocode`+`MimoCode`→`SleepyCode`.
  So `Mimo Code` → `Sleepy Code` → `MiMo Code` (wrong). **Never merge in debranded space**.
- **Correct approach: project all three merge sides FORWARD with `rebrand()` into sleepy space**.
- `rebrand` is idempotent on fork text except 5 files with *intentional* mimo mentions:
  LICENSE, README.md, .github/ISSUE_TEMPLATE/bug-report.yml,
  packages/opencode/.gitignore + .npmignore.

## Releases / fixes (2026-09)
- **v0.1.19 published to npm (COMPLETE):** `@sleepy-ai/cli@0.1.19` + 12 platform packages.
- **v0.1.18 TUI bug (fixed in 0.1.19):** `pinnedSleepyModels()` pins sleepy-auto if present
  else all non-deprecated sleepy models.
- **Commit a10c0e39** — sleepy credentials survive refresh failure (warn+fallback).

## Confirmed audit findings (2026-03-23, still valid after OpenCode-fork correction)
- HIGH: `sleepy run` does not await event loop before bootstrap dispose (`run.ts`).
- HIGH: `gateway.json` written 0644 (live file confirmed 0o644) with tokens.
- HIGH: Sleepy/Codex/CLI OAuth listen on 0.0.0.0; Sleepy callback has no CSRF state.
- MED: README claims macOS Application Support path; code uses ~/.local/share/sleepy.
- MED: Codex OAuth EADDRINUSE poisons later logins (xAI already fixed this).
- SDK spawn of `opencode` / OPENCODE_CONFIG_CONTENT: re-evaluate as OpenCode compat
  vs incomplete rebrand. Binary published is `sleepy`; serve banner is
  `sleepycode server listening`; config loader reads SLEEPYCODE_CONFIG_CONTENT.

## Fork-only features (must survive any sync)
Sleepy gateway provider + dynamic model/pricing, OAuth device-code login + JWT
auto-refresh, TUI sidebar (Plan & Limits, cost HUD, Neko), `sleepy doctor`,
`sleepy init`, config `sleepy.json`, bin `sleepy`, `SLEEPY_HOME`, phantom #9333ea.

## Env notes
- bun 1.3.14 at ~/.bun/bin/bun. No `timeout` on this macOS shell.
- `run_command` timeoutSeconds max is 120.
- gh CLI default repo may be upstream; pass `--repo TahsinArafat/sleepy-code`.
