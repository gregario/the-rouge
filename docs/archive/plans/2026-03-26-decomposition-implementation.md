# Decomposition Innovation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement composable decomposition so Rouge can build complex products (fleet management, marketplaces) not just simple ones (timers), with foundation cycles, complexity profiles, integration catalogue, and the backwards flow.

**Architecture:** Six composable capabilities that activate based on measurements from the complexity profile. No switch statements. Capabilities: foundation cycle, dependency ordering, parallel building, integration pass, integration escalation, foundation evaluation. Two new state machine states. New library tier for integration patterns. See `docs/design/decomposition-complete-vision.md` for full vision.

**Tech Stack:** Node.js (launcher), Markdown (phase prompts), JSON (schemas), YAML (catalogue entries), Bash (validation scripts)

**GitHub Issue:** #27

**Vision doc (MUST READ FIRST):** `docs/design/decomposition-complete-vision.md`

---

## Pre-Implementation Checklist

Before starting ANY task, the implementing engineer MUST:
- [ ] Read `docs/design/decomposition-complete-vision.md` in full (450+ lines)
- [ ] Read `docs/content/substack-article-4-decomposition.md` (the narrative)
- [ ] Understand: capabilities activate from MEASUREMENTS, not product categories
- [ ] Understand: the Capability Avoidance Problem (silent degradation is the enemy)
- [ ] Understand: the backwards flow (Scale 2 pivots — go back to foundation when decomposition was wrong)

---

## Task 1: Schema Changes (state.json, vision.json, cycle-context.json)

**Files:**
- Modify: `schemas/state.json`
- Modify: `schemas/vision.json`
- Modify: `schemas/cycle-context.json`

**Step 1: Update state.json — add foundation states**

Add `foundation-building` and `foundation-evaluating` to the `current_state` enum. Also sync the enum with the actual STATE_TO_PROMPT map (the schema is out of date — still has `qa-gate` and `po-reviewing` which are deprecated).

New enum values:
```
"seeding", "ready",
"foundation-building", "foundation-evaluating",
"building", "test-integrity",
"code-review", "product-walk", "evaluation", "re-walk",
"qa-fixing", "analyzing", "generating-change-spec",
"vision-checking", "promoting", "rolling-back",
"waiting-for-human", "complete"
```

Add new properties to state.json:
```json
"foundation": {
  "type": "object",
  "properties": {
    "status": { "type": "string", "enum": ["pending", "not-needed", "in-progress", "complete"] },
    "scope": { "type": "array", "items": { "type": "string" } },
    "completed_at": { "type": "string", "format": "date-time" }
  }
},
"detected_profile": {
  "type": "object",
  "properties": {
    "primary": { "type": "string", "enum": ["single-page", "multi-route", "stateful", "api-first", "full-stack"] },
    "secondary": { "type": "array", "items": { "type": "string" }, "maxItems": 1 },
    "detection_method": { "type": "string", "enum": ["explicit", "stack-inferred", "feature-analysis"] },
    "capabilities_activated": { "type": "array", "items": { "type": "string" } }
  }
}
```

**Step 2: Update vision.json — add complexity_profile**

Add optional `complexity_profile` field:
```json
"complexity_profile": {
  "type": "object",
  "properties": {
    "primary": {
      "type": "string",
      "enum": ["single-page", "multi-route", "stateful", "api-first", "full-stack"]
    },
    "secondary": {
      "type": "array",
      "items": { "type": "string", "enum": ["single-page", "multi-route", "stateful", "api-first", "full-stack"] },
      "maxItems": 1
    }
  },
  "required": ["primary"]
}
```

Also add `services` field to infrastructure:
```json
"services": {
  "type": "array",
  "items": { "type": "string" },
  "description": "External services needed: supabase, stripe, mapbox, etc."
}
```

**Step 3: Update cycle-context.json — add foundation_spec and decomposition_strategy**

Add:
```json
"foundation_spec": {
  "type": "object",
  "description": "Foundation cycle spec — shared schema, integrations, auth, UI shell. Same shape as active_spec."
},
"decomposition_strategy": {
  "type": "object",
  "properties": {
    "complexity_profile": { "type": "object" },
    "capabilities_activated": { "type": "array", "items": { "type": "string" } },
    "build_order": { "type": "array", "items": { "type": "string" } },
    "foundation_scope": { "type": "array", "items": { "type": "string" } },
    "integration_blockers": { "type": "array", "items": { "type": "string" } },
    "cross_cutting_concerns": { "type": "array", "items": { "type": "string" } }
  }
}
```

**Step 4: Validate schemas parse correctly**

Run: `node -e "JSON.parse(require('fs').readFileSync('schemas/state.json', 'utf8')); console.log('state.json OK')"` (repeat for each)

**Step 5: Commit**

```bash
git add schemas/
git commit -m "feat(schemas): add foundation states, complexity profile, decomposition strategy"
```

---

## Task 2: Launcher State Machine — Foundation Cycle Support

**Files:**
- Modify: `src/launcher/rouge-loop.js` (STATE_TO_PROMPT map + advanceState)

**Step 1: Add foundation states to STATE_TO_PROMPT**

After line ~68 (the seeding entry), add:
```javascript
'foundation-building': 'loop/00-foundation-building.md',
'foundation-evaluating': 'loop/00-foundation-evaluating.md',
```

**Step 2: Add foundation transitions to advanceState**

In the `advanceState` function, add cases:

```javascript
case 'foundation-building':
  // After foundation builds, run test integrity
  state.foundation.status = 'in-progress';
  state.current_state = 'test-integrity';
  state._foundation_context = true; // Flag so test-integrity knows to route to foundation-eval
  break;

case 'foundation-evaluating':
  const foundationVerdict = ctx?.foundation_eval_report?.verdict || 'PASS';
  if (foundationVerdict === 'PASS') {
    state.foundation.status = 'complete';
    state.foundation.completed_at = new Date().toISOString();
    state.current_state = 'building'; // First vertical feature
    delete state._foundation_context;
  } else {
    state.current_state = 'foundation-building'; // Retry
  }
  break;
```

Modify the `test-integrity` case to route to `foundation-evaluating` when in foundation context:
```javascript
case 'test-integrity':
  if (verdict === 'PASS') {
    state.current_state = state._foundation_context ? 'foundation-evaluating' : 'code-review';
  } else {
    // retry test-integrity
  }
  break;
```

Modify the `building` case entry point — if foundation is needed but not done, redirect:
```javascript
case 'building':
  // Check if foundation needed but not complete
  if (state.foundation && state.foundation.status === 'pending') {
    state.current_state = 'foundation-building';
    break;
  }
  // ... existing building logic
```

Modify the `analyzing` case — add ability to insert foundation cycle mid-flight:
```javascript
case 'analyzing':
  const action = ctx?.analysis_recommendation?.action || 'continue';
  if (action === 'insert-foundation') {
    state.foundation.status = 'pending';
    state.foundation.scope = ctx.analysis_recommendation.foundation_scope || [];
    state.current_state = 'foundation-building';
    break;
  }
  // ... existing analyzing logic
```

**Step 3: Test state transitions manually**

Create a test script that simulates foundation cycle flow:
```bash
# Create test state.json with foundation.status = 'pending'
# Run advanceState and verify it routes to foundation-building
# Simulate foundation pass and verify it routes to building
```

**Step 4: Commit**

```bash
git add src/launcher/rouge-loop.js
git commit -m "feat(launcher): add foundation cycle state transitions and mid-flight insertion"
```

---

## Task 3: Foundation Building Phase Prompt

**Files:**
- Create: `src/prompts/loop/00-foundation-building.md`

**Step 1: Write the foundation building prompt**

This prompt builds ONLY horizontal infrastructure. No user-facing features. It reads the foundation_spec from cycle_context.json and builds:
- Unified data model (all entities referenced by 2+ feature areas)
- Integration scaffolds (API wrappers, client libraries)
- Auth flows (registration, login, session, roles)
- Shared UI components (app shell, navigation, layout, theme)
- Deployment pipeline (staging/production)
- Test fixtures (seed data for every entity)

Key sections:
1. **Phase Contract** — reads: foundation_spec, decomposition_strategy, vision. Writes: implementation artifacts, foundation completion status.
2. **Context Tier** — T3 (Full). Foundation needs complete vision to build correctly.
3. **What You Build** — exhaustive list from foundation_spec.scope
4. **What You Do NOT Build** — user-facing features. No screens. No journeys. Only infrastructure.
5. **Integration Research Step** — For each required integration, RESEARCH the problem space before selecting a solution. Web search best practices. Evaluate trade-offs (scale, cost, free tier). Pick the right tool, not the familiar one. Log reasoning to factory_decisions.
6. **Hard Blocking Rule** — If an integration pattern is needed and cannot be built (requires paid API key not yet configured, or API doesn't exist), HARD BLOCK. Write to factory_questions. Do NOT substitute. Do NOT silently degrade.
7. **TDD Workflow** — Same as 01-building.md (red-green-refactor)
8. **Write to cycle_context.json** — Update foundation_spec with what was built, write foundation_eval_criteria

**Step 2: Review against vision doc**

Check every principle in `docs/design/decomposition-complete-vision.md` is reflected. Especially:
- No silent degradation
- Research before selection
- Hard blocking on missing integrations
- Foundation evaluation criteria (structural, not user journeys)

**Step 3: Commit**

```bash
git add src/prompts/loop/00-foundation-building.md
git commit -m "feat(prompts): add foundation building phase — horizontal infrastructure before vertical features"
```

---

## Task 4: Foundation Evaluating Phase Prompt

**Files:**
- Create: `src/prompts/loop/00-foundation-evaluating.md`

**Step 1: Write the foundation evaluation prompt**

Different from feature evaluation. No user journeys. Evaluates:
- **Schema completeness:** Does the schema support ALL feature areas? Cross-reference vision.json feature_areas against foundation schema.
- **Integration scaffold quality:** Do API wrappers work? Are env vars configured? Do test stubs pass?
- **Auth flow completeness:** Register, login, logout, session persistence all work?
- **Shared component export:** Are all shared components importable? Do they render?
- **Deployment pipeline:** Does staging deploy work?
- **Test fixture quality:** Does seed data cover all entities? Is it realistic?

Output: `foundation_eval_report` with verdict (PASS/FAIL), structural_gaps[], integration_gaps[], recommendations[].

On FAIL: write specific feedback about what's missing so foundation-building can fix it on retry.

**Step 2: Commit**

```bash
git add src/prompts/loop/00-foundation-evaluating.md
git commit -m "feat(prompts): add foundation evaluation phase — structural review, not user journeys"
```

---

## Task 5: Complexity Profile Detection in Building Phase

**Files:**
- Modify: `src/prompts/loop/01-building.md` (add Step 2.5, rewrite Step 3)

**Step 1: Add Step 2.5 — Detect Complexity Profile**

Insert between Step 2 (Create Loop Branch) and Step 3 (Extract Tasks). Three-input detection pipeline:

1. **Explicit declaration** — read `vision.json.complexity_profile`. If present, use it.
2. **Stack inference** — if no explicit declaration, infer from project structure:
   - `@modelcontextprotocol/sdk` in deps → `api-first`
   - `bin` field in package.json → `api-first`
   - Godot project → `stateful`
   - Next.js + Supabase → `full-stack`
   - Next.js without database → `multi-route`
   - Single HTML file → `single-page`
3. **Feature area validation** — cross-check detected profile against feature areas:
   - If `multi-route` but feature areas reference state machines → escalate to `stateful`
   - If `multi-route` but `infrastructure.needs_database` → escalate to `full-stack`
   - If only 1 feature area → downgrade to `single-page`

Write result to `state.json.detected_profile` and log decision to `factory_decisions`.

**Step 2: Derive Decomposition Strategy**

After profile detection, derive the strategy:

```
Read vision.json → count entities, relationships, integrations
Build dependency graph from feature_areas.dependencies
Calculate graph density
Identify cross-cutting concerns
Determine which capabilities activate:
  - foundation_cycle: needs_unified_schema OR integrations.required.length > 0
  - dependency_ordering: graph_density > 0.2
  - parallel_building: independent_clusters > 1
  - integration_pass: cross_cutting.length > 0
  - integration_escalation: check catalogue for missing patterns
  - foundation_evaluation: foundation_cycle activated
```

Write `decomposition_strategy` to `cycle_context.json`.

**Step 3: Rewrite Step 3 — Profile-Aware Task Extraction**

Replace the current hardcoded "foundation first, core flows second" with a dispatch table:

| Profile | Foundation Pass | Vertical Unit | Task Granularity |
|---------|----------------|---------------|-----------------|
| `single-page` | None | Entire product | 1 task |
| `multi-route` | Layout, routing, shared components | Feature area (screen group) | 1 per feature area |
| `stateful` | State machine skeleton, game loop | Individual state + transitions | 1 per state node |
| `api-first` | Project scaffold, shared types, test harness | Single tool/command/endpoint | 1 per public interface unit |
| `full-stack` | DB schema, API skeleton, auth, deploy | Full vertical slice (migration + API + UI) | 1 per feature area spanning all layers |

If foundation cycle should have run but `foundation.status !== 'complete'`, write `current_state: "foundation-building"` to state.json and EXIT. The launcher picks up the new state.

**Step 4: Add dependency ordering**

When `dependency_ordering` capability is active, sort feature areas by the DAG. Use existing module hierarchy logic in rouge-loop.js as reference. Feature areas with no unmet dependencies build first.

**Step 5: Commit**

```bash
git add src/prompts/loop/01-building.md
git commit -m "feat(building): add complexity profile detection and profile-aware task extraction"
```

---

## Task 6: Analyzing Phase — Foundation Insertion and Decomposition Feedback

**Files:**
- Modify: `src/prompts/loop/04-analyzing.md`

**Step 1: Add foundation detection to analyzing phase**

After the existing root cause classification (Step 2), add a new step:

**Step 2.5: Decomposition Health Check**

Before recommending next action, check:
1. Does the next pending feature area require infrastructure that doesn't exist?
2. Cross-reference pending feature areas against `foundation.scope` (what was built) and the integration catalogue
3. If shared infrastructure is missing and would benefit 2+ pending areas → recommend `insert-foundation`
4. If an integration is missing from the catalogue → recommend `insert-foundation` with scope including building that integration pattern

This is the **backwards flow**. The analyzing phase can autonomously insert a foundation cycle when it discovers the decomposition was wrong.

**Autonomy rule:** Insert foundation autonomously when restructure is bounded (<50% rework). Escalate to human when restructure scope exceeds bounds.

**Step 2: Update recommendation logic**

Add new action to Step 3:
```
ACTIONS:
- continue → vision-checking (feature quality acceptable)
- deepen → generating-change-spec (feature needs work)
- broaden → generating-change-spec (scope expansion)
- insert-foundation → foundation-building (decomposition was wrong, need infrastructure first)
- notify-human → waiting-for-human (too complex for autonomous decision)
- rollback → rolling-back (quality regression)
```

Write `analysis_recommendation.action = 'insert-foundation'` and `analysis_recommendation.foundation_scope = [...]` to cycle_context.json when applicable.

**Step 3: Commit**

```bash
git add src/prompts/loop/04-analyzing.md
git commit -m "feat(analyzing): add foundation insertion and decomposition feedback loop"
```

---

## Task 7: Integration Catalogue — Directory Structure and Initial Entries

**Files:**
- Create: `library/integrations/tier-2/supabase.yaml`
- Create: `library/integrations/tier-2/stripe.yaml`
- Create: `library/integrations/tier-2/sentry.yaml`
- Create: `library/integrations/tier-2/counterscale.yaml`
- Create: `library/integrations/tier-3/stripe-checkout-session.yaml`
- Create: `library/integrations/tier-3/stripe-webhook-handler.yaml`
- Create: `library/integrations/tier-3/supabase-rls-pattern.yaml`
- Create: `library/integrations/tier-3/supabase-auth-nextjs.yaml`
- Create: `library/integrations/tier-3/sentry-react-boundary.yaml`
- Create: `library/integrations/drafts/.gitkeep`

**Step 1: Create directory structure**

```bash
mkdir -p library/integrations/{tier-1,tier-2,tier-3,drafts}
touch library/integrations/drafts/.gitkeep
```

**Step 2: Write Tier 2 entries**

Each entry follows the schema from the vision doc. Include: id, name, tier, category, description, cost_tier, requires (env_vars, packages, cli_tools), setup_steps, teardown_steps, tested_with, free_tier_limits, staleness_date.

Write entries for: Supabase, Stripe, Sentry, Counterscale.

**Step 3: Write Tier 3 entries**

Each entry follows the pattern schema. Include: id, name, tier, service (links to Tier 2), category, tags, description, applies_when, requires, code_patterns (file + pattern), tested_with, scale_considerations.

The `scale_considerations` field captures the research-before-selection principle: what works at what scale, trade-offs, alternatives.

Write entries for: stripe-checkout-session, stripe-webhook-handler, supabase-rls-pattern, supabase-auth-nextjs, sentry-react-boundary.

**Step 4: Commit**

```bash
git add library/integrations/
git commit -m "feat(library): add integration catalogue with initial Tier 2 + Tier 3 entries"
```

---

## Task 8: Contribution Standard — Manifest Validation

**Files:**
- Create: `src/launcher/validate-contribution.sh`
- Modify: `CONTRIBUTING.md` (add catalogue contribution section)

**Step 1: Write validation script**

Six validation rules:
1. manifest.yaml parses as valid YAML (requires `yq`)
2. All required fields present (id, name, tier, version, description, maintainer, compatible_with)
3. id is kebab-case, env_vars are SCREAMING_SNAKE_CASE
4. Every compatible_with entry matches an existing Tier 1 stack ID (or is "all")
5. version follows semver
6. id is unique across all tiers

```bash
#!/usr/bin/env bash
# Usage: rouge validate-contribution library/integrations/tier-2/mapbox/
```

**Step 2: Update CONTRIBUTING.md**

Add section explaining:
- Three-tier model
- Required files per tier
- How to submit
- Review policy (Tier 1-2: core team, Tier 3: two community approvals)

**Step 3: Commit**

```bash
git add src/launcher/validate-contribution.sh CONTRIBUTING.md
git commit -m "feat(contributions): add catalogue validation script and contribution guide"
```

---

## Task 9: Seeding — Complexity Profile Confirmation

**Files:**
- Modify: `src/prompts/seeding/04-spec.md` (add decomposition assessment after spec)

**Step 1: Add decomposition assessment to spec phase**

After spec generation, the spec phase should:
1. Analyse the spec for entity relationships, integrations, dependencies
2. Derive a suggested complexity profile
3. Present to human for confirmation: "Based on your spec, this product has [measurements]. Suggested profile: full-stack with foundation cycle. Does this match your vision?"
4. Write confirmed profile to vision.json

**Step 2: Add integration manifest to spec output**

The spec phase should also produce an integration manifest:
- List every external capability the product requires
- For each, check the catalogue
- Flag missing patterns as blockers
- Present to human: "This product needs [maps, payments, email]. Maps pattern is missing from the catalogue — Rouge will build it during foundation, or you can provide one."

**Step 3: Commit**

```bash
git add src/prompts/seeding/04-spec.md
git commit -m "feat(seeding): add complexity profile detection and integration manifest"
```

---

## Task 10: Soft Dependencies (BENEFITS_FROM)

**Files:**
- Modify: `src/prompts/loop/01-building.md` (add benefits_from header)
- Modify: `src/prompts/loop/03-qa-fixing.md` (add benefits_from header)
- Modify: `src/prompts/loop/04-analyzing.md` (add benefits_from header)
- Modify: `.claude/skills/partials/autonomous-mode.md` (add benefits_from execution logic)

**Step 1: Define the BENEFITS_FROM protocol in autonomous-mode.md**

Add section to the shared partial:
```markdown
## Soft Dependencies (BENEFITS_FROM)

Before main work begins, check if any declared benefits_from phases are available:
1. Read the phase's benefits_from list
2. For each: check if the capability exists and is fast (<30s) and cheap (<$0.10)
3. If available: execute inline (subagent), absorb output into context
4. If unavailable or failed: proceed without — phase works correctly either way
5. Log: factory_decisions += { soft_dep: "library-lookup", status: "used" | "skipped" }
```

**Step 2: Add benefits_from to building phase**

```yaml
benefits_from:
  - library-lookup    # Check Library for relevant patterns before building
  - test-integrity    # Quick pre-build sanity check
```

**Step 3: Add benefits_from to qa-fixing and analyzing**

qa-fixing benefits from test-integrity (run tests before each fix).
analyzing benefits from library-lookup (check for similar quality gaps in past projects).

**Step 4: Commit**

```bash
git add src/prompts/ .claude/skills/partials/autonomous-mode.md
git commit -m "feat(prompts): add BENEFITS_FROM soft dependency protocol"
```

---

## Task 11: Backwards Compat Shim Cleanup

**Files:**
- Modify: `src/launcher/rouge-loop.js` (remove commented legacy entries)
- Modify: `src/prompts/loop/02e-evaluation.md` (remove dual-write shims)
- Archive: `src/prompts/loop/02b-qa-gate.md` → `docs/archive/`
- Archive: `src/prompts/loop/02c-po-review.md` → `docs/archive/`

**Step 1: Remove commented STATE_TO_PROMPT legacy entries**

Delete the commented-out lines for qa-gate, po-reviewing, po-review-journeys, etc.

**Step 2: Remove dual-write shims from evaluation prompt**

In 02e-evaluation.md, remove the backwards-compat writes of `qa_report` and `po_review_report`. Write only `evaluation_report`. Update rouge-loop.js to read `evaluation_report` instead of `qa_report` for verdict checking.

**Step 3: Archive old prompt files**

```bash
mv src/prompts/loop/02b-qa-gate.md docs/archive/
mv src/prompts/loop/02c-po-review.md docs/archive/
```

**Step 4: Update schemas**

Remove `qa_report` and `po_review_report` from cycle-context.json schema. Replace with `evaluation_report`.

**Step 5: Run full test to verify nothing breaks**

Run rouge-loop.js dry-run against a test project to verify state transitions work without the legacy fields.

**Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove backwards compat shims — legacy QA/PO dual-writes and archived prompts"
```

---

## Task 12: Update Retrospective and Documentation

**Files:**
- Modify: `src/prompts/loop/09-cycle-retrospective.md`
- Modify: `README.md` (if decomposition changes public interface)
- Modify: `docs/architecture.md` (update with foundation cycle flow)

**Step 1: Update retrospective to track foundation vs feature cycles**

Add to the retrospective prompt:
- Detect whether the current cycle was foundation or feature
- Track foundation investment (time, complexity) vs feature productivity post-foundation
- Track decomposition feedback events (how many times did analyzing insert a foundation cycle?)
- Track integration escalation events (how many times did the builder hard-block vs silently degrade?)

**Step 2: Update architecture docs**

Add the foundation cycle flow diagram and complexity profile explanation to docs/architecture.md.

**Step 3: Commit**

```bash
git add src/prompts/loop/09-cycle-retrospective.md docs/architecture.md
git commit -m "docs: update retrospective and architecture for decomposition innovation"
```

---

## Execution Order and Dependencies

```
Task 1 (schemas) ← no deps, do first
Task 2 (launcher) ← depends on Task 1
Task 3 (foundation-building prompt) ← depends on Task 1
Task 4 (foundation-evaluating prompt) ← depends on Task 1
Task 5 (building phase rewrite) ← depends on Tasks 1, 7 (needs catalogue to exist)
Task 6 (analyzing phase update) ← depends on Tasks 1, 2
Task 7 (integration catalogue) ← no deps, can parallel with Tasks 2-4
Task 8 (contribution standard) ← depends on Task 7
Task 9 (seeding update) ← depends on Tasks 1, 7
Task 10 (BENEFITS_FROM) ← depends on Tasks 3, 5
Task 11 (shim cleanup) ← do LAST, after everything else works
Task 12 (docs) ← do LAST
```

Parallelisable groups:
- **Group A** (schemas + launcher): Tasks 1 → 2
- **Group B** (prompts): Tasks 3, 4 (parallel, both depend on Task 1)
- **Group C** (catalogue): Task 7 → 8 (can run parallel to Group B)
- **Group D** (after A+B+C): Tasks 5, 6, 9
- **Group E** (last): Tasks 10, 11, 12

---

## Review Checkpoints

After each group, pause and verify:

**After Group A+B:** Can the launcher route through foundation-building → test-integrity → foundation-evaluating → building? Dry-run test.

**After Group C:** Do catalogue entries parse? Does validate-contribution.sh pass on all seed entries?

**After Group D:** Does the building phase correctly detect complexity profiles? Does analyzing correctly recommend insert-foundation when infrastructure is missing?

**After Group E:** Full integration test — simulate a complex product lifecycle from seeding through foundation through feature building. Verify the backwards flow works (analyzing inserts foundation mid-flight).

---

## What This Plan Does NOT Cover

- Parallel building via worktrees (deferred to post-V1)
- Integration pass as a separate cycle type (deferred — cross-cutting concerns handled within feature cycles for now)
- Meta Rouge / cross-domain composition (internal vision only)
- Testimonial Wall hook project (separate work after decomposition lands)
