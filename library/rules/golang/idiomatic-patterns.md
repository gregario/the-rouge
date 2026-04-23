---
id: golang-idiomatic-patterns
name: Idiomatic Go patterns
applies_to: [golang]
severity: warning
tier: language
origin: Rouge
---

# Idiomatic Go patterns

## Prefer

- Return `error` as the last value, handle at every call site
- Wrap errors with `fmt.Errorf("doing X: %w", err)` for context + unwrap chain
- Small interfaces at the consumer side ("accept interfaces, return structs")
- `context.Context` as the first parameter for anything I/O or cancellable
- `defer` for cleanup next to the acquire
- Table-driven tests
- `go vet` clean + `staticcheck` clean

## Avoid

- Blank identifier `_` to ignore errors without a comment explaining why
- `panic` / `recover` as control flow (reserved for truly unrecoverable bugs)
- Global state; prefer struct fields or context values
- Empty interface `interface{}` / `any` when a concrete type fits
- Stutter in naming: `pkg.PkgThing` — just `pkg.Thing`
- `init()` functions with side effects beyond simple registration

## Enforcement

- `go vet ./...` must pass
- `staticcheck ./...` must pass  
- `go test -race ./...` must pass
- `gofmt -s -l .` must be empty

## Error handling

Every `err` value must be handled at the call site. Ignoring with `_ = err` requires a comment:

```go
_ = closer.Close() // best-effort cleanup on shutdown path
```

## Why

Go's minimalism relies on convention. These patterns are what make a Go codebase readable by any Go developer without archaeological expertise.
