---
id: python-idiomatic-patterns
name: Idiomatic Python patterns
applies_to: [python]
severity: warning
tier: language
origin: Rouge
---

# Idiomatic Python patterns

## Prefer

- `dataclasses` over manual `__init__` for data-holders
- `pathlib.Path` over `os.path` string manipulation
- Context managers (`with`) for resources
- Generators over building full lists when streaming suffices
- f-strings over `.format()` or `%` formatting
- `enumerate` over `range(len(...))`
- List/dict/set comprehensions over loops that build collections
- Walrus operator `:=` when it avoids duplicating work
- `functools.cached_property` for expensive computed attributes

## Avoid

- Mutable default arguments (`def f(x=[])`) — use `None` sentinel
- Bare `except:` — catch `Exception` at minimum, specific types preferred
- `from module import *`
- Monkey-patching in production code
- Global mutable state
- `eval` / `exec` on anything derived from user input

## Ruff / linting

Projects use `ruff` with:
- `E` (pycodestyle errors)
- `F` (pyflakes)
- `I` (isort)
- `B` (bugbear)
- `UP` (pyupgrade)
- `SIM` (simplify)

## Detection

Reviewer agent runs ruff and mypy; flags non-idiomatic patterns for warning, unused imports for blocking.
