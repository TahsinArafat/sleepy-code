<h1 align="center">SleepyCode</h1>

<p align="center"><strong>Sleepy Code: Where Models and Agents Co-Evolve</strong></p>

<p align="center">
  <a href="README.zh.md">中文</a> | English
</p>

<p align="center">
  <a href="https://www.sleepyai.org">Website</a> | <a href="https://www.sleepyai.org/blog">Blog</a>
</p>

---

SleepyCode is a terminal-native AI coding assistant. It can read and write code, run commands, manage Git, and use a persistent memory system to keep a deep understanding of your project across sessions while continuously improving itself.

Sleepy Auto is built in as a free-for-limited-time channel, so you can start with zero configuration. SleepyCode also supports connecting to any mainstream LLM provider API.

---

## Why SleepyCode is Better Than OpenCode & MiMo-Code

SleepyCode is designed to solve real-world friction in CLI AI coding tools. Compared to OpenCode and MiMo-Code:

1. **Native Specialist Primary Agents Out of the Box**:
   - **OpenCode / MiMo-Code**: Only ship standard `build`, `plan`, and `compose` modes.
   - **SleepyCode**: Includes 5 additional specialized primary agents (`apex (builder)`, `phantom (debugger)`, `pivot (prototyper)`, `forge (reviewer)`, `stack (architect)`).

2. **Smart Agent Switching & Context Restoration**:
   - `plan_enter` and `plan_exit` intelligently track your previous active builder agent. When you finish planning, you return directly to `phantom (debugger)` or `apex (builder)` rather than being reset to a basic build mode.

3. **IDE Integration (`/editor`)**:
   - Running `/editor` (or `Ctrl+X E`) opens your active project workspace directly in VS Code (`code .`), maintaining seamless flow between your terminal UI and your IDE.

4. **Fault-Tolerant Usage & Limit Sync**:
   - Includes automatic retry logic, windowed limit bars (5h / 24h / Weekly / Monthly), and JWT expiration fallback decoders. Your Plan & Limits sidebar never goes blank mid-session due to transient auth refresh lags.

5. **Linux / WSL Clipboard Stability**:
   - Cleaned up stdout buffer contamination that previously broke `xclip`/`wl-copy`/`xsel` on Linux distributions and WSL environments.

---

## Quick Start

```bash
# One-line install
curl -fsSL https://www.sleepyai.org/install | bash

# Or install via npm
npm install -g @sleepy-ai/cli

# Run
sleepy
```

The first launch guides you through configuration automatically. Supported options:
- **Sleepy Auto (free for a limited time)** — anonymous channel, zero configuration
- **Sleepy Platform** — OAuth login
- **Import from Claude Code** — migrate existing authentication in one step
- **Custom Provider** — add any OpenAI-compatible API in the TUI

<details>
<summary><strong>WSL: clipboard issues</strong></summary>

If you encounter garbled text when copying on WSL, install `xsel`:
```bash
sudo apt install xsel
```
</details>

---

## Core Features

### Specialized & Custom Agents

| Agent | Description |
|--------|------|
| **apex (builder)** | Advanced primary coding builder for complex implementation tasks |
| **phantom (debugger)** | Forensic bug hunter with hypothesis-first investigation discipline |
| **pivot (prototyper)** | Rapid hackathon-style ship specialist with high bias for action |
| **forge (reviewer)** | Adversarial security and quality auditor |
| **stack (architect)** | Systems-level architecture planner with strict plan-mode constraints |
| **build** | Default. Full tool permissions for development |
| **plan** | Read-only analysis mode for code exploration and solution design |
| **compose** | Orchestration mode for specs-driven development and skill-driven workflows |

Press `Tab` or `Shift+Tab` to switch between primary agents.

### Persistent Memory

Cross-session memory powered by SQLite FTS5 full-text search:

- **Project memory** (`MEMORY.md`) — persistent project knowledge, rules, and architecture decisions
- **Session checkpoint** (`checkpoint.md`) — structured state snapshots maintained automatically by the checkpoint-writer subagent
- **Scratch notes** (`notes.md`) — temporary note area for agents
- **Task progress** (`tasks/<id>/progress.md`) — per-task logs

### Intelligent Context Management

- **Automatic checkpoints** — decides when to save session state based on the model context window
- **Context reconstruction** — when context approaches the limit, rebuilds it from the latest checkpoint, project memory, task progress, and retained recent messages
- **Budgeted injection** — uses a token budget to control how much checkpoint, memory, and notes content enters context

### Workflows

Workflows are sandboxed JavaScript scripts that orchestrate multiple subagents concurrently. SleepyCode ships with built-in workflows:
- `compose`: Brainstorm → Design → Implement → Verify → Review → Report → Merge
- `deep-research`: Multi-source web search, fact extraction, and 3-juror adversarial verification report generator

---

## License

MIT License. See [LICENSE](LICENSE) for details.
