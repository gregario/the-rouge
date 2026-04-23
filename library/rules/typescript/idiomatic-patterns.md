---
id: typescript-idiomatic-patterns
name: Idiomatic TypeScript patterns
applies_to: [typescript]
severity: warning
tier: language
origin: Rouge
---

# Idiomatic TypeScript patterns

## Prefer

- `type` aliases for unions, intersections, simple shapes
- `interface` for extendable object contracts
- `readonly` for arrays/properties that shouldn't mutate
- `satisfies` operator over `as` casts
- Discriminated unions over enums for variant types
- `Array<T>` vs `T[]` — pick one per project, stay consistent
- `async/await` over raw Promises
- Optional chaining (`?.`) and nullish coalescing (`??`) over manual checks
- `const` assertions for literal types

## Avoid

- `namespace` keyword — use modules
- `enum` when a discriminated union would do
- Non-null assertion (`!`) — narrow explicitly instead
- Default exports in library code — named exports compose better
- Overly generic signatures where concrete types work

## Detection

Reviewer agent checks for non-idiomatic patterns and suggests alternatives. Non-blocking.
