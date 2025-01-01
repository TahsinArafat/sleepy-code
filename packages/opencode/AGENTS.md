# AGENTS.md

This file extends the root [AGENTS.md](/AGENTS.md) with package-specific conventions for `packages/opencode`.

---

## Workflow Guidelines

### Test-Driven Development (TDD)

All new features and bug fixes MUST follow TDD:

1. **Write a failing test first** — define the expected behavior before implementation.
2. **Implement the minimum code** — make the test pass with the simplest possible change.
3. **Refactor** — clean up while keeping tests green.
4. **Never skip tests** — untested code is incomplete code.

Concrete TDD cycle example:

```ts
// 1. Write the failing test first
test("parses config from YAML string", () => {
  const result = parseConfig("key: value")
  expect(result).toEqual({ key: "value" })
})

// 2. Implement the minimum
const parseConfig = (input: string) => ({ key: "value" })

// 3. Refactor after all tests pass
// (only when there are multiple test cases demanding real parsing)
```

### Testing Conventions

- Place tests in the `test/` directory, mirroring the `src/` structure. E.g., `src/tool/bash.ts` → `test/tool/bash.test.ts`.
- Name test files with the pattern `<module>.test.ts` — no `.spec.ts`, no `__tests__` dirs.
- Each test file should test one module or one feature area.
- Avoid mocks as much as possible; test the actual implementation.
- Each test should be self-contained and deterministic.
- Use `await using` for automatic cleanup of temporary resources.
- Run `bun typecheck` from the package directory (`packages/opencode`) before committing.

### Parallel Tool Usage

- ALWAYS USE PARALLEL TOOLS WHEN APPLICABLE — independent file reads, writes, globs, greps, and bash commands should run in a single turn.
- When reading multiple files or searching multiple patterns, batch them into one message.

### Commit Guidelines

- Write clear, concise commit messages describing the change (subject line ≤ 72 chars).
- Each commit should be a single logical unit of work.
- Include context in the commit body when the subject is insufficient.
- Reference issue numbers where applicable.
- Never amend commits after pushing. Create new commits instead.
- Never skip hooks (`--no-verify`, `--no-gpg-sign`) unless explicitly asked.

## Code Style

### General Principles

- Keep things in one function unless composable or reusable.
- Avoid `try`/`catch` where possible — use early returns and type guards instead.
- Avoid the `any` type. Prefer `unknown` when the type truly isn't known.
- Use Bun APIs when possible (e.g., `Bun.file()`, `Bun.write()`).
- Rely on type inference; avoid explicit type annotations or interfaces unless needed for exports or clarity.
- Prefer functional array methods (`flatMap`, `filter`, `map`) over `for` loops; use type guards on `filter` to preserve type inference downstream.
- In `src/config`, follow the existing self-export pattern: `export * as ConfigAgent from "./agent"`.

### Variable Discipline

Reduce total variable count by inlining when a value is only used once:

```ts
// Good
const journal = await Bun.file(path.join(dir, "journal.json")).json()

// Bad
const journalPath = path.join(dir, "journal.json")
const journal = await Bun.file(journalPath).json()
```

Prefer `const` over `let`. Use ternaries or early returns instead of reassignment:

```ts
// Good
const foo = condition ? 1 : 2

// Bad
let foo
if (condition) foo = 1
else foo = 2
```

### Destructuring

Avoid unnecessary destructuring. Use dot notation to preserve context:

```ts
// Good
obj.a
obj.b

// Bad
const { a, b } = obj
```

### Control Flow

Avoid `else` statements. Prefer early returns:

```ts
// Good
function foo() {
  if (condition) return 1
  return 2
}

// Bad
function foo() {
  if (condition) return 1
  else return 2
}
```

### Schema Definitions (Drizzle)

Use snake_case for field names so column names don't need to be redefined as strings:

```ts
// Good
const table = sqliteTable("session", {
  id: text().primaryKey(),
  project_id: text().notNull(),
  created_at: integer().notNull(),
})

// Bad
const table = sqliteTable("session", {
  id: text("id").primaryKey(),
  projectID: text("project_id").notNull(),
  createdAt: integer("created_at").notNull(),
})
```

## Git Safety

- Stage specific files by name — avoid `git add -A` / `git add .` (risk of committing `.env`, credentials, binaries).
- Run `git status` and `git diff --stat` before staging to understand what's changing.
- Never use `git rebase -i`, `git add -i`, or any interactive git command (not supported in CLI agent environment).
- Before `git reset --hard`, `git push --force`, or `git checkout --`, ask if there's a safer alternative.
- Never update git config.

## Dependencies

- Keep dependencies minimal and well-justified.
- Prefer built-in APIs over external packages when functionality overlaps.
- Pin exact versions for production dependencies (`"dependencies"`), use `"^"` range for dev dependencies only when the project convention requires it.
