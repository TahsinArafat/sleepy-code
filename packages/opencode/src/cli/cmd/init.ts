import { cmd } from "./cmd"
import fs from "fs/promises"
import path from "path"
import { UI } from "../ui"

const SLEEPY_JSON_TEMPLATE = JSON.stringify(
  {
    $schema: "https://opencode.ai/config.json",
    model: "anthropic/claude-sonnet-4-20250514",
    small_model: "anthropic/claude-sonnet-4-20250514",
    mcp: {
      supabase: {
        type: "remote",
        url: "https://mcp.supabase.com/sse",
      },
      websearch: {
        type: "local",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-brave-search"],
        env: {
          BRAVE_API_KEY: "YOUR_BRAVE_API_KEY",
        },
      },
    },
  },
  null,
  2,
)

const AGENTS_MD_TEMPLATE = `# AGENTS.md

## Workflow Guidelines

### Test-Driven Development (TDD)

All new features and bug fixes MUST follow TDD:

1. **Write a failing test first** — define the expected behavior before implementation.
2. **Implement the minimum code** — make the test pass with the simplest possible change.
3. **Refactor** — clean up while keeping tests green.
4. **Never skip tests** — untested code is incomplete code.

### Commit Guidelines

- Write clear, concise commit messages describing the change.
- Each commit should be a single logical unit of work.
- Include context in the commit body when the subject line is insufficient.
- Reference issue numbers where applicable.

### Code Quality

- Prefer functional array methods (flatMap, filter, map) over for loops.
- Use type inference; avoid explicit type annotations unless necessary.
- Prefer \`const\` over \`let\`. Use ternaries or early returns instead of reassignment.
- Avoid \`try\`/\`catch\` where possible; prefer Effect-based error handling.
- Avoid \`else\` statements; prefer early returns.

### Testing

- Avoid mocks as much as possible; test actual implementation.
- Each test should be self-contained and deterministic.
- Use \`await using\` for automatic cleanup of temporary resources.
- Run \`bun typecheck\` from the package directory before committing.

### Dependencies

- Keep dependencies minimal and well-justified.
- Prefer built-in APIs over external packages when functionality overlaps.
- Pin exact versions for production dependencies.
`

export const InitCommand = cmd({
  command: "init",
  describe: "Initialize a new Sleepy project in the current directory",
  async handler() {
    UI.empty()
    UI.println(UI.Style.TEXT_HIGHLIGHT_BOLD + "Initializing Sleepy project..." + UI.Style.TEXT_NORMAL)

    const cwd = process.cwd()
    const sleepyJsonPath = path.join(cwd, "sleepy.json")
    const agentsMdPath = path.join(cwd, "AGENTS.md")

    // Write sleepy.json
    await fs.writeFile(sleepyJsonPath, SLEEPY_JSON_TEMPLATE, "utf-8")
    UI.println(UI.Style.TEXT_DIM + "  Created sleepy.json" + UI.Style.TEXT_NORMAL)

    // Write AGENTS.md
    await fs.writeFile(agentsMdPath, AGENTS_MD_TEMPLATE, "utf-8")
    UI.println(UI.Style.TEXT_DIM + "  Created AGENTS.md" + UI.Style.TEXT_NORMAL)

    UI.println("")
    UI.println(UI.Style.TEXT_SUCCESS_BOLD + "✓ Project initialized!" + UI.Style.TEXT_NORMAL)
    UI.println(UI.Style.TEXT_DIM + "  Configuration saved to: " + UI.Style.TEXT_NORMAL + sleepyJsonPath)
    UI.println(UI.Style.TEXT_DIM + "  Workflow guidelines saved to: " + UI.Style.TEXT_NORMAL + agentsMdPath)
    UI.println("")
  },
})
