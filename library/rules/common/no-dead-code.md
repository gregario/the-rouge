---
id: common-no-dead-code
name: No commented-out code, no unreachable branches
applies_to: [common]
severity: blocking
tier: cross-cutting
origin: Rouge
---

# No dead code

Commented-out code, unreachable branches, and unused exports are dead code. Git remembers the past; the current file should describe the present.

## Rules

- No commented-out code. Delete it. Git has it.
- No `if (false)` / `if (0)` / unreachable branches
- No unused imports, unused variables, unused exports (unless marked as public API)
- No "legacy" / "deprecated" files kept around "just in case" — delete them or move to `archive/`
- No `// TODO: remove this` that's older than one cycle

## Why

Dead code confuses readers, breaks grep results, and hides real bugs. Every line is a liability.

## Exceptions

- Public API exports documented in README
- Intentional unused parameters matching interface contracts (prefix with `_`)

## Detection

- Linters (eslint no-unused-vars, TS noUnusedLocals, ruff F401)
- Reviewer agents flag dead branches, commented blocks > 3 lines
