# The Rouge

> **Experimental** — Rouge is a research project exploring autonomous product development. It is token-intensive (each phase invokes Claude Code via `claude -p`), not production-hardened, and should not be used for critical systems. Use at your own risk and monitor token usage.

An autonomous product development system that builds production-quality products through iterative self-evaluation, starting from a high baseline standard of "good" and developing design taste that improves across every project it ships.

## Three Layers

- **The Rouge** (Runner) — The outer loop. Manages state across sessions, evaluates quality, refuses to ship until the bar is met.
- **The Factory** (Studio) — AI Factory as a worker. Does the actual building — brainstorm, design, implement, test.
- **The Library** (Accumulated Mind) — Cross-project design intelligence. Global standards, domain taste, personal taste fingerprint.

## Status

Early design phase. See `docs/plans/` for the design vision and product taste brief.
