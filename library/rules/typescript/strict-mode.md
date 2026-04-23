---
id: typescript-strict-mode
name: TypeScript strict mode required
applies_to: [typescript]
severity: blocking
tier: language
origin: Rouge
---

# TypeScript strict mode required

Every TypeScript project the factory builds must have `strict: true` in `tsconfig.json`, with no exceptions enabled below it.

## Rules

- `tsconfig.json` must set `"strict": true`
- `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitThis`, `alwaysStrict` — all default to true under `strict`, leave them on
- No `any` types. Use `unknown` + narrowing if the type genuinely can't be known.
- No `// @ts-ignore` or `// @ts-nocheck` unless the comment includes a linked issue explaining why and when it's removable.
- No `as` casts without a runtime check proving the cast is safe (or `satisfies` if type-narrowing is the goal).

## Exceptions

- Test files: `any` permitted for mocking, but prefer typed mock helpers
- Third-party declarations: use `declare module` with narrowest possible types

## Why

Rouge ships to real users. `any` leaks runtime errors past type checking; `@ts-ignore` hides the error from future maintainers.

## Detection

- Reviewer agent greps for `any`, `@ts-ignore`, `@ts-nocheck`, `as any`
- `tsc --noEmit` must pass with 0 errors before any commit
