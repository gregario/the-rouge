# V3 State Machine — Complete Transition Map

> Extends `docs/design/state-machine-v2-transitions.md`. Same states, updated invariants, new cost tracking and spin detection.

---

## States

Identical to V2. No states added or removed.

| State | Prompt | Purpose |
|-------|--------|---------|
| seeding | seeding/00-swarm-orchestrator.md | Interactive product seeding (human present) |
| ready | (skip) | Seeded, awaiting human trigger |
| foundation | loop/00-foundation-building.md | Execute infrastructure decisions from manifest |
| foundation-eval | loop/00-foundation-evaluating.md | Evaluate foundation (ENFORCED) |
| story-building | loop/01-building.md | TDD on one story |
| story-diagnosis | loop/03-qa-fixing.md | Tier 0 self-check on stuck story |
| milestone-check | loop/02-evaluation-orchestrator.md | Batched evaluation (test, review, walk, eval) |
| milestone-fix | loop/03-qa-fixing.md | Fix regressions from milestone eval |
| analyzing | loop/04-analyzing.md | Decide next action |
| generating-change-spec | loop/05-change-spec-generation.md | Produce fix stories, append to task_ledger |
| vision-check | loop/06-vision-check.md | Strategic alignment before shipping |
| shipping | loop/07-ship-promote.md | Version, changelog, PR, deploy |
| final-review | loop/10-final-review.md | Holistic customer walkthrough |
| escalation | (skip) | Waiting for human or structural resolution |
| complete | (skip) | Done |

---

## Transitions

```
FOUNDATION (enforced — no bypass):
  foundation         → foundation-eval         [always]
  foundation-eval    → foundation              [FAIL — retry]
  foundation-eval    → story-building          [PASS — find first milestone/story]
  foundation-eval    → escalation              [no eligible milestone or story]

STORY LOOP (inner, fast):
  story-building     → story-building          [story pass — next story in batch]
  story-building     → story-building          [story blocked — skip, next story]
  story-building     → milestone-check         [batch complete — all stories done/blocked/skipped]
  story-building     → analyzing               [circuit breaker — 3+ consecutive failures]
  story-building     → escalation              [data error — no milestone or story]
  story-building     → escalation              [budget cap reached]

  story-diagnosis    → story-building          [diagnosis fixed it]
  story-diagnosis    → escalation              [diagnosis failed]

MILESTONE LOOP (outer, batched evaluation):
  milestone-check    → analyzing               [QA PASS]
  milestone-check    → milestone-fix           [QA FAIL — regressions found]
  milestone-check    → escalation              [deploy failure after 3 retries]

  milestone-fix      → milestone-check         [always — re-verify after fix]
  milestone-fix      → escalation              [stuck — same failures after retry]

PROGRESSION:
  analyzing          → story-building          [promote — advance to next milestone]
  analyzing          → milestone-check         [next milestone, no eligible stories yet]
  analyzing          → vision-check            [ALL milestones done]
  analyzing          → generating-change-spec  [deepen or broaden]
  analyzing          → foundation              [insert-foundation — Scale 2 pivot]
  analyzing          → escalation              [notify-human or rollback]

  generating-change-spec → story-building      [fix stories added, next story found]
  generating-change-spec → milestone-check     [no fix stories to build]
  generating-change-spec → escalation          [no milestone found]

  vision-check       → shipping                [vision aligned]
  vision-check       → escalation              [vision drift or pivot]

  shipping           → final-review            [always]

  final-review       → complete                [production ready]
  final-review       → escalation              [major rework needed]
  final-review       → generating-change-spec  [needs refinement]

ESCALATION:
  escalation         → story-building          [resolved — unblocked story found]
  escalation         → milestone-check         [resolved — no eligible story]
```

---

## V3 Invariants

### 1. Milestone Lock
Once a milestone is promoted, it cannot regress. The launcher maintains `promoted_milestones[]` in every checkpoint. Before writing a checkpoint, the launcher verifies that `promoted_milestones` is a strict superset of the previous checkpoint's list. Any attempt to remove a promoted milestone is a fatal launcher error.

### 2. Spin Detection
The launcher detects spin before each story-building invocation and routes to escalation if any of the following are true:
- **Zero-delta spin:** 3+ consecutive stories complete with no files changed
- **Duplicate name spin:** the proposed story name matches a previously completed story in any milestone
- **Time spin:** 30 minutes elapsed since the last story with `result: pass`

All three conditions are checked against `checkpoints.jsonl`. No prompt-level changes required.

### 3. Deploy Blocking
The shipping phase attempts deploy up to 3 times. If all 3 attempts fail, the launcher routes to escalation rather than final-review. This prevents final-review from running against a non-deployed product. The escalation entry records `classification: infrastructure-gap` and the deploy error output.

### 4. Story Dedup
Completed stories are skipped across milestones. Before dispatching a story, the launcher checks `story_results` across all checkpoints. If `story_results[story_id]` is `pass` in any prior checkpoint, the story is marked `skipped` without invoking the prompt. This is relevant for fix stories that may duplicate earlier work.

### 5. Budget Cap
If `cumulative_cost_usd` in the last checkpoint meets or exceeds `config.budget_cap_usd`, the launcher routes to escalation before invoking the next phase. The escalation entry records `classification: budget-cap-reached` with the cumulative cost. The loop does not resume until the human updates `config.budget_cap_usd` or explicitly overrides.

### 6. Cost Tracking
Every checkpoint records per-phase and cumulative token + USD cost. The launcher is responsible for measuring phase cost (tokens returned by the model API) and appending it to the checkpoint. Prompts do not track cost — the launcher owns this entirely.

---

## Foundation Simplified (V3)

In V2, foundation had to discover and decide on infrastructure. In V3, the INFRASTRUCTURE seeding discipline makes all infrastructure decisions during seeding and writes them to `infrastructure_manifest.json`.

Foundation in V3:
1. Reads `infrastructure_manifest.json`
2. Executes the decisions (scaffold database, configure deploy, wire auth)
3. Does NOT re-evaluate decisions — that happened at seeding time
4. Incompatibilities listed in `incompatibilities_resolved[]` are applied without debate

This makes foundation faster and more deterministic.

---

## Branch and Tag Strategy

Single branch per project build:

```
rouge/build-{project-name}
```

Milestone tags applied by shipping when a milestone is promoted:

```
milestone/{milestone-name}
```

Tags are immutable once written. If the launcher detects a tag already exists for a milestone name, it skips tagging (the milestone was already promoted in a prior session).

---

## Per-Phase Model Selection

Each phase selects the appropriate model based on task type. The launcher passes the model to the prompt runner. The model used is recorded in `cycle_context.json` under `model_used`.

| Phase | Model | Rationale |
|-------|-------|-----------|
| foundation | Opus | Architectural decisions, env setup |
| foundation-eval | Opus | Structural judgment |
| story-building | Sonnet | Mechanical TDD, fast iteration |
| story-diagnosis | Opus | Root cause reasoning |
| milestone-check | Sonnet | Test runner, evaluation orchestration |
| milestone-fix | Sonnet | Targeted fixes |
| analyzing | Opus | Strategic routing, promotion decisions |
| generating-change-spec | Opus | Spec writing |
| vision-check | Opus | Strategic alignment |
| shipping | Sonnet | Mechanical: version bump, changelog, PR |
| final-review | Opus | Customer-perspective holistic judgment |

---

## Two-Loop Cadence (unchanged from V2)

```
STORY LOOP (80% of compute):
  story-building ──► story-building ──► story-building ──► milestone-check
       │                  │                  │
       └── pass           └── pass           └── batch done

MILESTONE LOOP (20% of compute):
  milestone-check ──► analyzing ──► next milestone (story loop)
       │                  │
       └── QA FAIL        └── QA PASS → promote
       │
       ▼
  milestone-fix ──► milestone-check (re-verify)
```
