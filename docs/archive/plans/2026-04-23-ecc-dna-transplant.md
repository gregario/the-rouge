# ECC DNA Transplant — Evolution Plan

**Date:** 2026-04-23
**Branch:** `feat/ecc-dna-transplant`
**Owner:** Claude (autonomous execution)

## Why

Comparison of The Rouge against [everything-claude-code](https://github.com/affaan-m/everything-claude-code) surfaced concrete patterns ECC does well that Rouge can absorb without changing its core identity. The goal is not to become ECC — Rouge's autonomous-product-loop is the right shape. The goal is to borrow ECC's catalog discipline, variant-tracked learning, language-specific expertise, and CI rigor.

See chat session 2026-04-23 for full comparison analysis.

## Execution discipline

- **Strictly additive where existing paths have consumers.** `library/global/`, `library/integrations/`, `library/domain/` are consumed by prompts, launcher, tests. New surfaces (`library/skills/`, `library/rules/`, `library/agents/`) land as siblings.
- **Every change tested before commit.** `npm test` must pass.
- **Small commits per logical unit.** Revertable, auditable.
- **Parallelize independent work.** Language-rule files, schema files, agent files are all independent — spawn subagents.
- **Verify consumers before modifying emitters.** grep first, then edit.
- **Dashboard files left alone** (pre-existing WIP on `main`).
- **`rouge.config.json` self-improvement blocklist respected in spirit** — lean additive on `src/launcher/*.js`, never delete, prefer new modules over editing existing ones.

## Phased scope

### Phase 1 — Foundation (catalog shape + CI)
- Create `library/skills/`, `library/rules/`, `library/agents/`, `library/patterns/` as new surfaces
- Bootstrap core rule files: `common/*`, `typescript/*`, `python/*`, `rust/*`, `golang/*`, `web/*`
- Add CI validators: `scripts/ci/validate-{skills,rules,agents}.js`
- Add `c8` coverage tooling (non-gating initially)
- Add commitlint + markdownlint configs (non-gating initially)
- Extend `package.json` `files` block + `test` chain

### Phase 2 — Inner-loop muscle
- Language-specific reviewer agent files in `library/agents/`
- New skill: `library/skills/iterative-retrieval/`
- New skill: `library/skills/tdd-workflow/`
- Additive dispatch in `02c-code-review.md` with full fallback
- New prompt: `src/prompts/loop/02g-security-review.md`
- Config-protection pattern docs + safety-check extension

### Phase 3 — MCP fleet
- `mcp-configs/` directory with per-MCP manifests
- Doctor extension to health-check MCPs (additive)

### Phase 4 — Variant-tracked learning
- New schema: `schemas/library-entry-v2.json` with `variants[]`
- New module: `src/launcher/variant-tracker.js`
- New module: `src/launcher/amendify.js` (skeleton)
- Unit tests

### Phase 5 — Profile system
- `profiles/` directory with product-shape profiles
- New module: `src/launcher/profile-loader.js`
- Wire into preamble-injector with fallback to all-loaded behavior

### Phase 6 — Governance + structured retro
- New schema: `schemas/governance-event.json`
- New module: `src/launcher/governance.js` (writer)
- `schemas/cycle-context-v3.json` extension: `structured_retro` field (additive)

## Loop discipline (per phase)

1. Identify all parallel sub-tasks; spawn concurrent sub-agents or make parallel tool calls
2. Execute sequentially for ordering-dependent items
3. Run `npm test` — must pass
4. Run targeted consumer verification (grep, syntax check)
5. Commit with descriptive message
6. Move to next phase

## Out of scope for this pass

- Cross-harness adaptation (`.cursor/`, `.opencode/`) — Rouge is Claude-only by design
- Rust control plane — Rouge's `rouge-loop.js` is already the control plane
- Commands/ directory — Rouge doesn't have one; don't invent
- Full Windows port — PowerShell installer can be separate initiative
- Tkinter dashboard — Rouge's Next.js dashboard is already better
- AgentShield commercial dependency — reference OWASP categories only

## Risk management

- If `npm test` fails at any step, stop and fix before proceeding
- If a borrowed ECC pattern requires structural changes to existing consumers (prompts/launcher), prefer a SHADOW rollout behind a flag over replacement
- If scope balloons mid-phase, stop at a stable commit boundary — partial is better than broken

## Success criteria

- All existing tests still pass
- New surfaces discoverable by validators
- At least one language-specific reviewer agent wired in with fallback proven
- Variant-tracking infrastructure unit-tested and ready to activate
- Plan doc updated with what actually landed vs deferred

## Execution outcome (2026-04-23)

**Status:** all 6 phases landed on `feat/ecc-dna-transplant`. 461/461 existing tests pass. 103 new tests added, all green. 5 validators green. 68 files changed, +4,625 / −1 — strictly additive.

### What landed

**Phase 1 — Foundation** (commit `991af2c`)
- `library/skills/`, `library/rules/`, `library/agents/` surfaces
- 2 skills (iterative-retrieval, tdd-workflow)
- 10 rule files (common, typescript, python, rust, golang, web)
- 6 reviewer agents (typescript, python, rust, golang, security, silent-failure-hunter)
- 4 CI validators in `scripts/ci/`
- Non-gating polish: `.c8rc.json`, `commitlint.config.js`, `.markdownlint.json`

**Phase 2 — Inner-loop muscle** (commit `4f9168f`)
- Language-specific dispatch skill (`library/skills/language-specific-review/`)
- Additive Step 1.5 in `02c-code-review.md` with full fallback to existing behavior
- `src/launcher/config-protection.js` + 17 tests — detects linter/type/test/CI config weakening without rationale marker; not yet wired to safety-check
- `docs/design/config-protection.md` — rollout plan

**Phase 3 — MCP fleet** (commit `812d8d2`)
- `mcp-configs/` with 8 curated MCPs (supabase, github, context7, firecrawl, exa, playwright, vercel, cloudflare-workers)
- `scripts/ci/validate-mcp-configs.js`
- `src/launcher/mcp-health-check.js` + 10 tests — stateless manifest validator
- `docs/design/mcp-integration.md` — doctor wiring deferred

**Phase 4 — Variant-tracked learning** (commit `9e4fd7a`) — the highest-value borrow
- `schemas/library-entry-v2.json` — v1 back-compat via implicit baseline variant
- `src/launcher/variant-tracker.js` — 11 exported functions; recommendation gate with fail-rate regression check
- `src/launcher/amendify.js` — proposeAmendment / promoteAmendment / draftPR
- 37 new tests including back-compat test against all 15 existing library/global v1 entries

**Phase 5 — Profile system** (commit `e65e335`)
- 5 profiles: saas-webapp, api-service, mcp-server, cli-tool, internal-dashboard
- `src/launcher/profile-loader.js` with 'all' fallback preserving current behavior
- `scripts/ci/validate-profiles.js` + 11 tests

**Phase 6 — Governance + structured retro** (commit `9664974`)
- `schemas/governance-event.json` — 11 categories, 4 severities
- `src/launcher/governance.js` + 17 tests — append-only JSONL writer with query by category/project/severity/time
- `src/launcher/structured-retro.js` + 11 tests — worked/failed/untried + recurring-pattern detector

### What was intentionally deferred

These require changes beyond what's safe in a strictly-additive pass:

- **Wire `02c-code-review.md` Step 1.5 to actually execute language reviewer subagents.** Currently added as prompt guidance; the actual dispatch call from the orchestrator is Phase 2 follow-up.
- **Wire `config-protection.js` into `rouge-safety-check.sh`.** Needs human review on the safety-check file (self-improve blocklisted).
- **Wire `mcp-health-check.js` into `rouge doctor`.** Additive helper exists; doctor.js integration needs touching launcher code.
- **Wire `profile-loader.js` into `preamble-injector.js`.** Profile-aware preamble injection is the payoff; current preamble still loads everything.
- **Wire `variant-tracker.js` + `amendify.js` into retrospective + eval phases.** Infrastructure is tested and ready; wiring into `09-cycle-retrospective.md` and `02e-evaluation.md` to record variant stats needs careful prompt edits.
- **Wire `governance.js` + `structured-retro.js` into retrospective phase.** Same reason — module exists, prompt edits for the retrospective phase are follow-up.
- **New loop prompts (`02g-security-review.md` etc).** Blocked by `test/prompts/contract-validation.test.js` asserting exactly 17 loop prompts. Security review is instead layered into existing `02c-code-review.md`'s security_review section, referencing the new `security-reviewer` agent.
- **Cross-platform (PowerShell installer, Windows-safe paths).** Out of scope for this pass per plan.
- **80% coverage gate enforcement.** c8 config added with `"check-coverage": false`. Flip to `true` after a coverage pass establishes the real baseline.

### Risk notes

- The pre-existing flaky test `test/launcher/allowed-tools-behavior.test.js#denied Bash pattern in -p returns a string result, does not hang` flipped between pass/fail across runs. Depends on Claude Code harness permissions state. Passes cleanly in isolation. Not caused by this work.
- `dashboard/` files (4 pre-existing WIP mods) were left untouched.

### Follow-up PRs (in priority order)

1. **Language-reviewer dispatch wiring** — modify evaluation orchestrator to actually invoke `library/agents/<lang>-reviewer.md`. Verify against a test build. Highest product-quality ROI.
2. **Preamble-injector profile awareness** — switch default from 'all' to profile-gated loading once first live profile validates.
3. **Variant-tracker integration in eval phase** — record shadow variant runs in cycle_context, persist to sidecar JSONL.
4. **Retrospective structured output** — modify `09-cycle-retrospective.md` to produce `structured_retro` using `structured-retro.js`.
5. **Config-protection live-wire** — after human review of the safety-check change.
6. **Doctor MCP health check** — additive integration.
7. **Governance log integration** — write events from self-improve, ship-promote, safety overrides.
