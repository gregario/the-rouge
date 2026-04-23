---
id: rust-idiomatic-patterns
name: Idiomatic Rust patterns
applies_to: [rust]
severity: warning
tier: language
origin: Rouge
---

# Idiomatic Rust patterns

## Prefer

- `Result<T, E>` for recoverable errors, `panic!` only for programming bugs
- `thiserror` for library error enums, `anyhow` for application-level errors
- `?` operator for error propagation
- `if let Some(x) = ...` and `let ... else` over unwrap_or patterns
- Iterator chains (`.map().filter().collect()`) over manual loops
- `&str` in function parameters, `String` in struct fields that own data
- `impl Trait` in arguments for ergonomics, concrete types in return values when possible
- `#[derive(Debug, Clone, ...)]` over manual impls unless performance-critical
- `clippy::pedantic` clean

## Avoid

- `.unwrap()` in production code — use `?` or explicit `.expect("reason")`
- `.clone()` as a borrow checker workaround without thinking about ownership
- `unsafe` without a `// SAFETY:` comment explaining invariants
- `Box<dyn Trait>` when a generic would do
- Overuse of macros for what functions can express

## Enforcement

- `cargo clippy --all-targets --all-features -- -D warnings` must pass
- `cargo fmt --check` must pass
- `cargo test --all-features` must pass

## Why

Rust's compiler already enforces the important constraints. These are about readability and ergonomics — the things that make Rust code feel Rust-y vs. C-with-lifetimes.
