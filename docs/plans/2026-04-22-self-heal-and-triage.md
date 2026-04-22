# Self-Heal + Triage Architecture

Date: 2026-04-22
Status: in progress
Owner: self-assigned (Greg + Claude)

## Problem statement

The integrated build loop can enter unbounded retry cycles when an evaluator returns the same verdict repeatedly. Audit of four concurrent projects (`stack-rank`, `testimonial`, `uat-test`, `irish-planning`) on 2026-04-21 found:

- Zero out of four stalls required product-judgment input from the human.
- Three of four were Rouge-side bugs (schema enum drift, missing automation, wiring error).
- One (testimonial) was a real 1-bit taste call, but the loop asked it at cycle 87 instead of cycle 3.

The loop treats every stuck state as an escalation to the human. Most are not. The architecture needs to know which layer owns a failure (Rouge's code, product taste, external constraint) and route accordingly.

## Architectural additions

Two new subsystems, plus tightening of existing contracts:

1. **Triage classifier** — when a phase produces identical findings N times, classify the owning layer and route.
2. **Self-heal subsystem** — when the classifier says "Rouge-side", apply bounded fixes within strict zones.

The existing escalation pipeline is preserved for its actual purpose: product-direction calls, external constraints, taste disagreement, safety confirmations.

## Self-heal zone contract

**Green zone — auto-apply permitted** (test-gated, git-revertable, audit-logged):

- Bug fixes in `src/launcher/*.js` that are NOT `safety.js`, `deploy-blocking.js`, `self-improve-safety.js`, or `audit-trail.js`.
- Single-file change ≤ 30 lines.
- All existing tests pass post-apply.
- Additive schema extensions — new enum values the launcher already writes.
- Missing wiring between existing modules (e.g. calling an existing `loadProjectSecrets()` from a new site).
- Sanitisation fixes for invalid characters in generated identifiers, tags, paths.

**Yellow zone — draft PR, never auto-apply**:

- Anything in `src/prompts/**` (prompts cascade to every future product).
- Schema contract changes (shape, required fields, value removals).
- New launcher modules or refactors > 30 lines.
- New integration-catalog entries.

**Red zone — never self-heal, always human**:

- Phase-prompt content.
- Product-direction decisions (deploy-target swap, framework swap).
- Agentic actions outside Rouge's repo (Playwright against third-party accounts, account signups, modifying the user's product code outside the normal story flow).
- Safety-mechanism logic.
- `self-improve-safety.js` itself (the meta-gate cannot self-modify).

Every self-heal action, auto or drafted, emits:
- `audit-log.jsonl` entry (signed via existing `audit-trail.js`).
- Dedicated `rouge-self-heal/<timestamp>-<slug>` branch.
- Surface in `rouge doctor`.

## Waves

### Wave 1 — Foundational contracts

Parallel-safe, can ship together.

- **7.1** Fix `foundation.status = 'evaluating'` enum violation (`rouge-loop.js:695` vs `schemas/state.json:41`).
- **7.2** Schema-write invariant CI test — walk every `state.X = Y` assignment against the schema.
- **1.3** Promote schema validation from warn to enforce (safe once 7.1/7.2 land).
- **1.1** Findings-fingerprint contract — deterministic hash of evaluator findings, added to eval-report schemas.
- **4.1** Integration-manifest schema (`schemas/integration-manifest.json`). Fields: `target`, `kind`, `prerequisites`, `auto_remediate`, `health_check`, `build_output_dirs`, `env_vars`, `secrets_required`.
- **6.1** Checkpoint proliferation fix — `advanceState` writes a checkpoint unconditionally at its top; for escalation/no-transition ticks, this produces hundreds of identical snapshots. Gate the write on `if (next)` so only real transitions checkpoint. (Audit correction: testimonial's "$522 spend" was phantom — it came from summing `phase_cost_usd` across 500 stale escalation snapshots. Real spend was $90.38, exactly at cap. Cap IS halting; checkpoint proliferation was the only real bug.)

### Wave 2 — Build on contracts

- **1.2** Semantic-spin detector — compare consecutive evaluator fingerprints per phase; N identical → route to triage.
- **4.2** First four integration manifests: github-pages, vercel, cloudflare-pages, docker-compose.
- **4.3** Catalog reader (`src/launcher/integration-catalog.js`) — `getManifest`, `runPrerequisites`, `runHealthCheck`.
- **4.4** Phase integration — infrastructure-discipline + foundation + deploy handler read from catalog.
- **5.1** Provisioner uses `loadProjectSecrets()` exclusively.
- **5.2** Cloudflare helper symmetric with Supabase.
- **5.3** Dynamic escalation message at `rouge-loop.js:831` — name only the provider that failed.
- **5.4** Secrets-health as prerequisite check via catalog.
- **6.2** Cost-tracker fallback labelling — heuristic vs real cost, enforce cap on real only.
- **6.3** Escalation checkpoints charge $0, not $0.09 × heartbeat-count.

### Wave 3 — Triage + self-heal

- **2.1** Triage classifier module (`src/launcher/triage.js`).
- **2.2** Routing: self-heal-candidate / human-judgment-needed / mechanical-automation-missing / unknown.
- **2.3** Initial classifier heuristics.
- **3.1** Self-heal planner (`src/launcher/self-heal-planner.js`).
- **3.2** Zone enforcer (`src/launcher/self-heal-zones.js`).
- **3.3** Applier (`src/launcher/self-heal-applier.js`).
- **3.4** Rollback via git-revert.
- **3.5** `rouge doctor` + dashboard surfaces.
- **3.6** Kill switch in `rouge.config.json`.

### Wave 4 — Observability

- **8.1** Stuck-loop early warning (before budget cap).
- **8.2** Self-heal activity view.
- **8.3** Escalation-category trend analysis.

## Test strategy

- Unit tests for every new module under `tests/` or `dashboard/src/**/__tests__/` per the repo convention.
- A fixture project at `tests/fixtures/stuck-project/` intentionally broken in known ways (schema enum violation, missing wiring, identical-findings loop). End-to-end self-heal regression runs against it.
- Live-project validation deferred until wave 3 lands — existing stuck projects (stack-rank, testimonial, irish-planning) are the final proof.

## Non-goals

- Fixing evaluator prompt calibration directly. Prompts are red-zone; their drift is a separate taste conversation.
- Auto-remediating anything outside Rouge's own repo. The product under build is off-limits to self-heal.
- Replacing the existing escalation UX. Escalation remains the human handoff for the cases where a human is actually needed.

## Progress log

### Wave 1 — complete (2026-04-22)

- 7.1 ✓ `foundation.status='evaluating'` added to `schemas/state.json` enum.
- 7.2 ✓ `tests/schema-assignments.test.js` — acorn-based CI invariant walks literal-string assignments to enum-constrained paths. 8 checks, passes. Verified to fail when the schema reverts.
- 1.3 ✓ `schema-validator.js` gains strict mode (opts in via `{strict: true}` or `ROUGE_STRICT_SCHEMA=1`). `SchemaViolationError` throws instead of warns. `rouge-loop.js:writeJson` uses strict for state.json writes. 11 unit-test checks pass.
- 1.1 ✓ `src/launcher/findings-fingerprint.js` + 21 tests. Deterministic SHA-256 of eval-report content; ignores transient fields (timestamps, session IDs), case-insensitive verdicts, whitespace-normalised findings, 2-decimal confidence rounding. `hasIdenticalTail(fps, n)` helper for Wave-2 spin detection.
- 4.1 ✓ `schemas/integration-manifest.json` — structured knowledge schema for deploy/database/auth/payment/observability/storage/queue targets. Fields: prerequisites (with auto_remediate), env_vars, secrets_required, health_check with first-deploy grace window. 8 tests pass.
- 6.1 ✓ `advanceState` no longer writes a checkpoint on no-op ticks. Gated on `if (next)`. Corrects the checkpoint-proliferation pattern that produced testimonial's 500 identical escalation snapshots.

All 458 launcher tests pass (one CLI-probe test skipped — external claude-cli behavior, unrelated).

### Wave 2 — pending
### Wave 3 — pending
### Wave 4 — pending
