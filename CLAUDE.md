# The Rouge — Project Instructions

This is The Rouge, an autonomous product development system. It is a peer project to AI-Factory, not a child of it.

## Workflow Overview

This project uses two complementary tools:

- **OpenSpec** — Product thinking. Creates specs, designs changes, manages the product lifecycle.
- **Superpowers** — Engineering. Implements tasks with TDD, code review, and subagent execution.

## Spec Mode (OpenSpec)

Use OpenSpec for:
- Defining the product (first specs)
- Proposing new features or large enhancements
- Reviewing and updating specs after code has changed

Key commands:
- `/opsx:propose "idea"` — Propose a change. Generates proposal, design, specs, and tasks.
- `/opsx:explore` — Review the current state of specs.
- `/opsx:archive` — Archive a completed change and update master specs.

Note: `/opsx:apply` is deprecated. After OpenSpec generates tasks, use Design Mode then Superpowers to implement — not `/opsx:apply`.

## Execution Mode (Superpowers)

Use Superpowers for:
- Implementing tasks from OpenSpec proposals
- Small enhancements and iterations
- Bug fixes
- Refactoring

## Architecture

The Rouge has three layers:

1. **The Rouge (Runner)** — Outer loop orchestrator. Manages state across sessions, evaluates product quality against vision and standards, decides what to build next.
2. **The Factory (Studio)** — AI Factory as a worker. Receives scoped briefs, builds products using the existing pipeline (design → implement → test → QA).
3. **The Library (Accumulated Mind)** — Persistent knowledge store. Global product standards, domain-specific taste (web, games, artifacts), per-project standards, and learned judgment from feedback.

## Key Concepts

- **Two-loop model:** Inner loop (AI, autonomous) builds to "good" aiming for "great." Outer loop (human feedback) refines from good to great.
- **External oracles:** Quality evaluation grounded in measurable signals (browser QA, Lighthouse, spec-completeness, pairwise comparison), not self-assessment.
- **Taste as heuristics:** Design taste encoded as objective, testable signals — not subjective judgment.
- **The Library tiers:** Global standards (seeded high, day one) → Domain-specific taste (grows per domain) → Learned judgment (from human feedback, tagged global vs genre-specific).

## Development Rules

1. Never write code before specs exist. Use OpenSpec to create them.
2. All source code goes in `/src/`.
3. All tests go in `/tests/`.
4. Run tests after every change.
5. Work in small iterative commits.
