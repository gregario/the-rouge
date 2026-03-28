# Contributing to The Rouge

Thank you for your interest in contributing to The Rouge. This document explains how the project works and where contributions are most valuable.

## What is The Rouge?

The Rouge is an autonomous product development system. It is not a typical library or framework. Instead, it is a loop-based system where each phase is a self-contained prompt executed via `claude -p`. The system builds products through iterative self-evaluation, starting from a high baseline and developing design taste that improves across every project it ships.

### Architecture at a Glance

The system has three layers:

- **The Rouge (Runner)** -- The outer loop. Manages state across sessions, evaluates quality, and refuses to ship until the bar is met.
- **The Factory (Studio)** -- AI Factory as a worker. Receives scoped briefs and builds products through design, implementation, testing, and QA.
- **The Library (Accumulated Mind)** -- Persistent knowledge store. Global standards, domain-specific taste entries, and learned judgment from human feedback.

### How the Loop Works

Phase prompts live in `src/prompts/` and are organized into two stages:

- **Seeding** (`src/prompts/seeding/`) -- One-time phases that take a product from idea to first ship: brainstorming, competition review, taste evaluation, spec, design, legal, marketing.
- **Loop** (`src/prompts/loop/`) -- Repeating phases that iteratively improve a shipped product: building, evaluation, QA fixing, analysis, vision checks, shipping, retrospective.

Each phase prompt is a standalone document that gets assembled into a `claude -p` invocation by the launcher (`src/launcher/`). The Library (`library/`) provides heuristics and taste entries that feed into phase prompts as context.

## Where Contributions Are Welcome

### Library Heuristics

The Library is the system's accumulated design intelligence. Contributions that expand its knowledge are highly valuable:

- **Global standards** (`library/global/`) -- Universal product quality heuristics (accessibility, performance, error handling).
- **Domain-specific taste** (`library/domain/`) -- Heuristics for specific product domains (web apps, games, CLI tools, APIs). New domain entries or refinements to existing ones.
- **Templates** (`library/templates/`) -- Reusable patterns for common product structures.

### Phase Prompt Improvements

Phase prompts are the core of the system. Improvements to prompt clarity, evaluation criteria, or edge case handling are welcome, but changes should be well-tested. A small wording change in a phase prompt can cascade through the entire loop.

Before submitting prompt changes:
- Run the existing test suite (`npm test`).
- Test the affected phase against at least one sample project.
- Explain the reasoning in your PR description -- what problem does this solve, and how did you verify it?

### Integration Patterns

The Rouge supports tiered integration with external services. See the Integration Catalogue Contributions section below for how to add new services and patterns.

### Documentation

Improvements to documentation, examples, and guides are always welcome.

## Integration Catalogue Contributions

Rouge's integration catalogue grows as the community builds products. You can contribute at three tiers:

### Tier 1 — Stacks (core team review required)
Full project scaffolds (framework + build + deploy). High-impact, affects the entire loop.
Required files: `manifest.yaml`, `setup.md`, `build.md`, `template/`

### Tier 2 — Services (core team review required)
External service adapters (database, auth, payments). Moderate impact.
Required files: `manifest.yaml`, `setup.md`, `teardown.md`

### Tier 3 — Integrations (maintainer review required)
Code patterns within services. Low risk, high value.
Required files: `manifest.yaml`, `pattern.md`, `test.md`

### Submission Process
1. Fork the repository
2. Add your contribution under `library/integrations/tier-N/<id>/`
3. Run `bash src/launcher/validate-contribution.sh library/integrations/tier-N/<id>/`
4. Open a PR with: what it enables, which stacks it targets, whether it introduces paid dependencies

### Manifest Format
Every contribution needs a `manifest.yaml`:
```yaml
id: my-integration
name: My Integration
tier: 3
version: 1.0.0
description: What this does
maintainer: community
compatible_with: [nextjs-cloudflare]
```

## How to Contribute

1. **Fork** the repository.
2. **Create a branch** from `main` with a descriptive name (e.g., `library/add-game-ui-taste` or `fix/evaluation-prompt-scoring`).
3. **Make your changes.** Keep commits small and focused.
4. **Run tests** to verify nothing is broken:
   ```bash
   npm test
   ```
5. **Open a pull request** against `main`. Include:
   - What the change does.
   - Why it is needed.
   - How you tested it.

## Guidelines

- Keep PRs focused. One concern per PR.
- Phase prompt changes require extra scrutiny. Expect thorough review.
- Library entries should be objective and testable where possible -- taste as heuristics, not subjective opinion.
- Follow existing code style and naming conventions.
- Do not add dependencies without discussion.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold its standards.

## Questions?

Open an issue for questions about the architecture, contribution areas, or anything else. We are happy to help you find the right place to contribute.
