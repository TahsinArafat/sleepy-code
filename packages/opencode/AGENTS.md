# AGENTS.md

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
- Prefer `const` over `let`. Use ternaries or early returns instead of reassignment.
- Avoid `try`/`catch` where possible; prefer Effect-based error handling.
- Avoid `else` statements; prefer early returns.

### Testing

- Avoid mocks as much as possible; test actual implementation.
- Each test should be self-contained and deterministic.
- Use `await using` for automatic cleanup of temporary resources.
- Run `bun typecheck` from the package directory before committing.

### Dependencies

- Keep dependencies minimal and well-justified.
- Prefer built-in APIs over external packages when functionality overlaps.
- Pin exact versions for production dependencies.
