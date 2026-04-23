---
id: common-error-handling
name: Error handling at boundaries only
applies_to: [common]
severity: blocking
tier: cross-cutting
origin: Rouge
---

# Error handling at boundaries only

Don't add error handling, fallbacks, or validation for scenarios that can't happen. Trust internal code and framework guarantees.

## Rules

- Validate at system boundaries only: user input, external APIs, file I/O, network
- Internal function calls: trust the caller. Don't re-validate args a type system already enforces.
- Don't swallow exceptions silently. If you catch, either handle meaningfully or re-throw with context.
- Don't add `try/except` or `try/catch` around code that can't throw.
- Don't "just in case" defaults for values that are always set by construction.

## Why

Excessive defensive code obscures real logic, invites false confidence, and grows the attack surface for bugs hiding behind swallowed exceptions.

## Detection

Reviewer agents flag:
- catch blocks that do nothing or just log
- validation on types the compiler already enforces
- defaults for parameters with required type constraints
