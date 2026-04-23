---
id: python-type-hints
name: Full type hints on public surfaces
applies_to: [python]
severity: blocking
tier: language
origin: Rouge
---

# Full type hints on public surfaces

Every public function, method, and class attribute has type hints. Private helpers (underscore prefix) are encouraged but not required.

## Rules

- Function signatures: `def foo(x: int, y: str) -> bool:`
- Methods on public classes: same
- Class attributes: `self.x: int = 0` or typed dataclass fields
- Avoid `Any`. Use `object` for truly unknown or narrow with `TypeVar`.
- Use `Optional[T]` or `T | None` (3.10+) explicitly — don't imply None by omission.
- Prefer modern union syntax `X | Y` (3.10+) over `Union[X, Y]` in new code.
- `list[T]` / `dict[K, V]` (3.9+) over `List[T]` / `Dict[K, V]` in new code.

## Check

`mypy --strict` or `pyright` must pass with zero errors before commit.

## Exceptions

- Test files: type hints on fixtures optional
- Third-party shim files: `from typing import Any` permitted with comment explaining why

## Why

Rouge's factory produces production code that real users run. Type hints catch a class of bugs static analysis would otherwise miss, and are documentation future maintainers actually read.
