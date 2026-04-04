# V2 State Machine — Complete Transition Map

> Generated from code analysis of `src/launcher/rouge-loop.js`. Use this to produce diagrams.

## States

| State | Prompt | Purpose |
|-------|--------|---------|
| seeding | seeding/00-swarm-orchestrator.md | Interactive product seeding (human present) |
| ready | (skip) | Seeded, awaiting human trigger |
| foundation | loop/00-foundation-building.md | Build shared infrastructure |
| foundation-eval | loop/00-foundation-evaluating.md | Evaluate foundation (ENFORCED) |
| story-building | loop/01-building.md | TDD on one story |
| story-diagnosis | loop/03-qa-fixing.md | Tier 0 self-check on stuck story |
| milestone-check | loop/02-evaluation-orchestrator.md | Batched evaluation (test, review, walk, eval) |
| milestone-fix | loop/03-qa-fixing.md | Fix regressions from milestone eval |
| analyzing | loop/04-analyzing.md | Decide next action |
| generating-change-spec | loop/05-change-spec-generation.md | Produce fix stories |
| vision-check | loop/06-vision-check.md | Strategic alignment before shipping |
| shipping | loop/07-ship-promote.md | Version, changelog, PR, deploy |
| final-review | loop/10-final-review.md | Holistic customer walkthrough |
| escalation | (skip) | Waiting for human/structural resolution |
| complete | (skip) | Done |

## Transitions

```
FOUNDATION (enforced — no bypass):
  foundation         → foundation-eval         [always]
  foundation-eval    → foundation              [FAIL — retry]
  foundation-eval    → story-building          [PASS — provision infra, find first milestone/story]
  foundation-eval    → escalation              [no eligible milestone or story]

STORY LOOP (inner, fast):
  story-building     → story-building          [story pass — next story in batch]
  story-building     → story-building          [story blocked — skip, next story]
  story-building     → milestone-check         [batch complete — all stories done/blocked/skipped]
  story-building     → analyzing               [circuit breaker — 3+ consecutive failures]
  story-building     → escalation              [data error — no milestone or story]

  story-diagnosis    → story-building          [diagnosis fixed it]
  story-diagnosis    → escalation              [diagnosis failed]

MILESTONE LOOP (outer, batched evaluation):
  milestone-check    → analyzing               [QA PASS]
  milestone-check    → milestone-fix           [QA FAIL]

  milestone-fix      → milestone-check         [always — re-verify after fix]

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
  final-review       → escalation              [major rework]
  final-review       → generating-change-spec  [needs refinement]

ESCALATION:
  escalation         → story-building          [resolved — unblocked story found]
  escalation         → milestone-check         [resolved — no eligible story]
```

## Two-Loop Cadence

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

## Key Invariants

1. **Foundation eval always runs** — no `completed_by: seeding` bypass
2. **Evaluation orchestrator never routes to shipping** — always to analyzing
3. **Final review only runs after ALL milestones** — via vision-check → shipping → final-review
4. **Circuit breaker fires at 3 consecutive failures** — routes to analyzing in diagnostic mode
5. **Fix stories are added to state.json** — generating-change-spec reads cycle_context, writes to state
6. **Deploy happens before milestone-check** — not after every story
7. **Provisioning happens once** — after foundation-eval passes
