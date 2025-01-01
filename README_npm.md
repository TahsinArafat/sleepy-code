<h1 align="center">SleepyCode</h1>

<p align="center"><strong>Sleepy Code: Where Models and Agents Co-Evolve</strong></p>

<p align="center">
  <a href="https://www.sleepyai.org">Website</a> | <a href="https://www.sleepyai.org/blog">Blog</a> | <a href="https://github.com/TahsinArafat/sleepy-ai">GitHub</a>
</p>

---

SleepyCode is a terminal-native AI coding assistant. It can read and write code, run commands, manage Git, and use a persistent memory system to keep a deep understanding of your project across sessions while continuously improving itself.

Sleepy Auto is built in as a free-for-limited-time channel, so you can start with zero configuration. SleepyCode also supports connecting to any mainstream LLM provider API.

---

## Quick Start

```bash
# One-line install (macOS / Linux)
curl -fsSL https://www.sleepyai.org/install | bash

# One-line install (Windows PowerShell)
powershell -ep Bypass -c "irm https://mimo.xiaomi.com/install.ps1 | iex"

# Or install via npm (all platforms)
# Mirror registries (e.g. cnpm/taobao) may have delayed platform package sync
npm install -g @sleepy-ai/cli --registry https://registry.npmjs.org

# Run
sleepy
```

The first launch guides you through configuration automatically. Supported options:
- **Sleepy Auto (free for a limited time)** — anonymous channel, zero configuration
- **Sleepy Platform** — OAuth login
- **Codex (ChatGPT Pro/Plus)** — OpenAI OAuth login
- **Import from Claude Code** — migrate existing authentication in one step
- **Provider list** — connect catalog providers by API key, or OAuth where supported (e.g. xAI/Grok)
- **Custom Provider** — add any OpenAI-compatible API in the TUI

---

## Core Features

- **Multiple Agents** — build (default), plan (read-only analysis), compose (specs-driven orchestration); press `Tab` to switch
- **Persistent Memory** — cross-session project knowledge, checkpoints, and task progress powered by SQLite FTS5
- **Intelligent Context Management** — automatic checkpoints, context reconstruction, and budgeted injection to stay within model limits
- **Task Tracking** — tree-shaped task system integrated with the checkpoint system
- **Subagent System** — parallel subagents with lifecycle tracking, cancellation, and background execution
- **Goal / Stop Condition** — judge model prevents premature stops during autonomous work
- **Compose Mode** — structured workflow for specs-driven development; recommended via the `/compose-next` skill on the build agent
- **Builtin Skills** — 20+ reusable instruction sets (PDF/Office generation, research, design, and more), invoked via `/skill-name` or auto-matched by relevance
- **Workflows** — deterministic multi-agent orchestration scripts, including built-in compose, deep-research, fact-check, and research-experiment pipelines
- **Voice Input** — real-time streaming voice input powered by TenVAD and Sleepy ASR
- **Dream & Distill** — extract knowledge into memory (`/dream`) and discover reusable workflows (`/distill`)

For detailed documentation, configuration options, and troubleshooting, see the [GitHub repository](https://github.com/XiaomiMiMo/MiMo-Code).

---

## License

Source code is licensed under the [MIT License](https://github.com/XiaomiSleepy/Sleepy-Code/blob/main/LICENSE).

Use of SleepyCode is also subject to the [Use Restrictions](https://github.com/XiaomiSleepy/Sleepy-Code/blob/main/USE_RESTRICTIONS.md).
Use of Sleepy-hosted services is subject to the [Sleepy Terms of Service](https://www.sleepyai.org/terms).
Use of the Sleepy name, logo, and trademarks is subject to the Sleepy Trademark Policy.
