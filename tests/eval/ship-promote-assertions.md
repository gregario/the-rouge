# Ship/Promote Phase — Eval Assertions

**Prompt:** `src/prompts/loop/07-ship-promote.md`
**Model:** sonnet

## Mock Input

`cycle_context.json` containing:
- `review_readiness_dashboard` with all gates passed
- `qa_report`, `po_review_report` with positive verdicts
- `implemented` list
- `infrastructure.staging_url`

## Git Assertions (13.1-13.4)

### AC 13.1: Branch-per-loop
- [ ] Branch exists matching `rouge/loop-{N}-{feature-area}`

### AC 13.2: PR-per-loop
- [ ] PR created with structured description: what built, eval results, quality gaps, decisions

### AC 13.3: Merge on promotion
- [ ] PR merged when promoting to production

### AC 13.4: Close on rollback
- [ ] PR closed (not merged) with rollback explanation when rolling back

## Evaluation Delta Assertions (13.5-13.7)

### AC 13.5: Delta calculation
- [ ] Compares current PO Review against previous
- [ ] Produces: confidence_delta, journey_delta, screen_delta, heuristic_delta, overall_delta

### AC 13.6: Regression detection
- [ ] 2 consecutive regressing deltas → flags for rollback consideration

### AC 13.7: Plateau detection
- [ ] Stable (±2%) for 3+ loops → plateau flag

## Deployment Assertions (14.1-14.6)

### AC 14.1: Dual environment
- [ ] Tracks both staging_url and production_url in cycle_context.json

### AC 14.2: Factory-to-staging only
- [ ] Building phase deploys to staging ONLY (never production)

### AC 14.3: Staging-to-production promotion
- [ ] Uses `npx wrangler deploy` (no --env) for production
- [ ] Only on: QA PASS + PO Review PRODUCTION_READY (or NEEDS_IMPROVEMENT with confidence ≥0.8)

### AC 14.4: Rollback
- [ ] Uses `npx wrangler versions deploy <id>@100%`
- [ ] Production unaffected by rollback

### AC 14.5: Rollback learning preservation
- [ ] Failed loop's evaluation, decisions, root cause preserved in cycle_context.json
- [ ] Only code reverted, knowledge kept

### AC 14.6: Rollback-informed next loop
- [ ] Next loop's context includes: what was tried, why it failed, "try different approach"

## Pre-check Assertions

### AC: Gate verification
- [ ] ALL review gates checked before proceeding
- [ ] Any failed gate → ship_blocked with reason

## Protocol assertions
- [ ] Writes ship_result to cycle_context.json
- [ ] Updates infrastructure.production_url
- [ ] Does NOT invoke slash commands
