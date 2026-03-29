# The Rouge — Project Instructions

## Start here

Read `VISION.md` before making any changes. It defines what Rouge is, who it's for, and what quality means. Every change should make Rouge better at what it's trying to be.

## Working on Rouge

When you want to improve Rouge, follow this process:

### 1. Check the vision

Read `VISION.md` and `rouge-vision.json`. Is your proposed change in scope? Does it align with Rouge's North Star?

### 2. Check existing issues

Browse open issues: `gh issue list --state open`

Is there already an issue for what you want to do? If yes, work on that. If no, create one.

### 3. Assess feasibility (for new capabilities)

If you're adding a new integration, stack, or evaluation capability:

```bash
rouge feasibility "description of what you want to add"
```

This checks scope, knowledge, tools, and testability. Don't start building if the verdict is `defer`.

### 4. Determine scope

- **Small** (fix a prompt, add a catalogue entry, update docs) — work directly on a branch, commit, PR.
- **Medium** (new CLI command, new phase prompt) — create an issue, write a brief plan, branch, implement with tests, PR.
- **Large** (new decomposition capability, new evaluation architecture) — create issues, write a detailed plan in `docs/plans/`, use worktrees, subagent-driven development, PR with review.

### 5. Branch and implement

Always work on a feature branch. Never commit directly to main.

```bash
git checkout -b feature/your-change
```

Follow open source best practices: small commits, tests, descriptive PR.

### 6. Test

```bash
npm test                    # Run all tests
rouge doctor                # Verify nothing broke
rouge feasibility "..."     # For new capabilities
```

### 7. PR

All changes go through pull requests. Nothing auto-merges. Describe what the change does, why it's needed, and how you tested it.

## Architecture

The Rouge has three layers:

1. **The Rouge (Runner)** — Outer loop orchestrator. Manages state across sessions, evaluates product quality against vision and standards, decides what to build next.
2. **The Factory (Studio)** — AI Factory as a worker. Receives scoped briefs, builds products using the existing pipeline (design, implement, test, QA).
3. **The Library (Accumulated Mind)** — Persistent knowledge store. Global product standards, domain-specific taste (web, games, artifacts), per-project standards, and learned judgment from feedback.

### Key concepts

- **Two-loop model:** Inner loop (AI, autonomous) builds to "good" aiming for "great." Outer loop (human feedback) refines from good to great.
- **External oracles:** Quality evaluation grounded in measurable signals (browser QA, Lighthouse, spec-completeness, pairwise comparison), not self-assessment.
- **Taste as heuristics:** Design taste encoded as objective, testable signals — not subjective judgment.
- **The Library tiers:** Global standards (seeded high, day one) → Domain-specific taste (grows per domain) → Learned judgment (from human feedback, tagged global vs genre-specific).

## Project structure

```
src/
  launcher/     — CLI, loop runner, secrets, deploy, safety hooks, feasibility
  prompts/
    seeding/    — one-time interactive phases (brainstorm, competition, taste, spec, design...)
    loop/       — repeating autonomous phases (build, evaluate, analyse, ship...)
    final/      — final validation gate
  slack/        — Slack bot and control plane
schemas/        — JSON schemas for state, vision, cycle-context
library/        — accumulated design intelligence (heuristics, integrations)
tests/          — test suites
docs/           — guides, design docs, diagrams
```

## Key files

- `rouge-vision.json` — machine-readable North Star (read by feasibility gate and phases)
- `VISION.md` — human-readable North Star
- `rouge.config.json` — safety hooks and deploy configuration
- `src/launcher/rouge-loop.js` — the Karpathy Loop launcher
- `src/launcher/rouge-cli.js` — CLI entry point (all `rouge` commands)
- `src/launcher/feasibility.js` — feasibility assessment module
- `src/launcher/secrets.js` — secret management (never hardcode keys)
- `src/launcher/deploy-to-staging.js` — staging deployment
- `src/launcher/rouge-safety-check.sh` — safety hook enforcement

## Conventions

- All phase prompts are self-contained markdown files in `src/prompts/`.
- Prompts NEVER invoke external slash commands — they call CLI tools directly.
- State lives on disk (`state.json`, `cycle_context.json`) — no long-running process.
- Git is the audit trail — every phase commits.
- The Library (`library/`) is machine-readable context, not documentation.
- Integration catalogue entries follow the `manifest.yaml` standard (see `CONTRIBUTING.md`).
- Tests: `npm test` runs secrets + CLI tests. `node tests/feasibility.test.js` for feasibility.

## What NOT to do

- Don't commit directly to main.
- Don't auto-install MCPs or unknown tools.
- Don't modify phase prompts without understanding the cascade effect (a small wording change can affect every product build).
- Don't add integration patterns without running them through the feasibility gate.
- Don't hardcode API keys or personal paths.
