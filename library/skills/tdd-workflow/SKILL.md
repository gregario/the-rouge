---
name: tdd-workflow
description: Test-driven development discipline for the factory phase. Tests before code, coverage floor, edge cases, boundaries.
origin: ECC
tier: global
stage: [loop]
status: active
---

# TDD Workflow

Borrowed from ECC's `tdd-workflow` skill. Rouge's factory phase already does TDD-like work; this skill formalizes the discipline so it's versionable, measurable, and consistent.

## When to activate

Every story in the building phase. Every fix story from change-spec-generation.

## Core principles

### 1. Tests BEFORE code
Write tests for acceptance criteria first. Run them — they must fail initially (proves they actually test the thing). Then implement.

### 2. Coverage floor
- Unit + integration + E2E combined: 80% lines / 80% branches minimum
- Per-file coverage: no file below 60%
- New code added without tests: hard block

### 3. Edge cases
- All documented error paths in the spec
- Empty / null / undefined inputs
- Boundary values (0, -1, MAX_INT, empty string, max string length)
- Concurrent / race conditions where applicable

### 4. Test types
- **Unit** — pure functions, isolated classes
- **Integration** — module boundaries, DB access, HTTP calls (mocked)
- **E2E** — user-facing journeys via Playwright

## Factory invocation

In `01-building.md`, activate this skill at the start of each story. Reference by name:

> Follow `library/skills/tdd-workflow` for this story.

## Enforcement

Pre-commit hook `scripts/hooks/quality-gate.js` (see Phase 2) runs `npm test` + coverage check before allowing `git commit`. Exit code 1 blocks.

## Anti-patterns

- Writing the test after the code ("verification theater")
- Lowering coverage thresholds to make commits pass (blocked by config-protection hook)
- Mocking the thing under test
