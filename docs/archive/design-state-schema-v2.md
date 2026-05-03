# State Schema V2

> ⚠️ **Historical reference (V2).** Superseded by [`state-schema-v3.md`](state-schema-v3.md). Still cited by the V3 doc for the `global_improvements.json` shape (§ global_improvements), which carries forward unchanged. New work should reference the V3 doc; this file remains for the cross-reference and for V2→V3 transition history.

> Canonical schema reference for the V2 granularity refactor. All launcher code and prompts reference this document.

**Supersedes:** The state.json schema documented in `docs/architecture.md` (V1).

---

## state.json

The state machine position. Read by the launcher to determine which prompt to invoke. Written by the launcher after each phase completes.

```json
{
  "project": "string — project slug",
  "status": "seeding | ready | building | complete",

  "current_state": "string — one of the V2 states (see State Machine below)",
  "current_milestone": "string | null — milestone name",
  "current_story": "string | null — story ID",

  "milestones": [
    {
      "name": "string — milestone name (e.g., 'map-core', 'vehicle-registry')",
      "status": "pending | in-progress | complete | partial",
      "stories": [
        {
          "id": "string — story ID (e.g., 'add-vehicle')",
          "name": "string — human-readable name",
          "status": "pending | in-progress | done | blocked | skipped | retrying",
          "attempts": 0,
          "blocked_by": "string | null — escalation ID or dependency story ID",
          "depends_on": ["string — story IDs this story depends on"],
          "affected_entities": ["string — entity names this story touches"],
          "affected_screens": ["string — screen IDs this story touches"],
          "env_limitations": ["string — documented environment limitations"],
          "completed_at": "ISO 8601 | null",
          "files_changed": ["string — file paths changed by this story"]
        }
      ]
    }
  ],

  "escalations": [
    {
      "id": "string — escalation ID",
      "tier": "0 | 1 | 2 | 3",
      "classification": "implementation-bug | design-problem | infrastructure-gap | environment-limitation | prompt-limitation",
      "summary": "string — what happened",
      "story_id": "string — which story triggered this",
      "status": "pending | waiting-for-human | resolved",
      "resolution": "string | null — how it was resolved",
      "created_at": "ISO 8601",
      "resolved_at": "ISO 8601 | null"
    }
  ],

  "fix_memory": {
    "<story-id>": [
      {
        "attempt": 1,
        "symptom": "string — what was observed",
        "diagnosis": "string — root cause identified",
        "classification": "string — failure type",
        "fix": "string — what was changed",
        "outcome": "pass | fail | partial | blocked",
        "files_changed": ["string"]
      }
    ]
  },

  "foundation": {
    "status": "pending | in-progress | evaluating | complete",
    "scope": ["string — infrastructure items"],
    "completed_at": "ISO 8601 | null"
  },

  "consecutive_failures": 0,
  "milestone_learnings": [],

  "detected_profile": "string | null — complexity profile",
  "seeded_at": "ISO 8601",
  "seeded_by": "string",
  "human_approved": true,
  "timestamp": "ISO 8601"
}
```

### Key changes from V1

| V1 | V2 | Why |
|----|-----|-----|
| `feature_areas[]` with name + status | `milestones[]` with `stories[]` nested | Story-level granularity (D-9, P-2) |
| `current_feature_area` | `current_milestone` + `current_story` | Two levels of tracking |
| `qa_fix_attempts` (integer) | `fix_memory` (per-story structured history) | Context consolidation (D-17) |
| `foundation.completed_by: "seeding"` allowed | `foundation.status` must reach `"complete"` via evaluator | Foundation evaluation enforcement (D-25) |
| No escalation tracking | `escalations[]` with tier + classification | Four-tier escalation (D-13) |
| No dependency tracking | `stories[].depends_on` | Story dependencies (D-21) |
| No consecutive failure tracking | `consecutive_failures` counter | Mid-loop circuit breaker (D-26) |
| `walk_pass`, `re_walk_count` | Removed from state (milestone-level, tracked in cycle_context) | Milestone cadence |
| `confidence_history` | Stays (written by vision-check) | Unchanged |

### State Machine V2

```
States:
  seeding           → interactive, human present
  ready             → seeded, awaiting start
  foundation        → horizontal infrastructure build
  foundation-eval   → structural review (ENFORCED — no bypass)
  story-building    → TDD on one story
  story-diagnosis   → Tier 0 self-check on stuck story
  milestone-check   → batched regression + evaluation
  milestone-fix     → targeted fixes from regression
  analyzing         → decide next action
  vision-check      → strategic alignment (before final review)
  escalation        → waiting for resolution
  shipping          → promote/deploy
  final-review      → holistic customer-perspective review
  complete          → done

Transitions:
  seeding → ready
  ready → foundation (if needed) | story-building (if no foundation needed)

  Foundation (ENFORCED):
    foundation → foundation-eval (ALWAYS)
    foundation-eval → [pass] → story-building
    foundation-eval → [fail] → foundation

  Story loop:
    story-building → [pass] → story-building (next story)
    story-building → [fail, self-diagnosable] → story-building (same invocation)
    story-building → [fail, can't self-diagnose] → story-diagnosis
    story-building → [blocked] → story-building (skip, next story)
    story-building → [batch done] → milestone-check
    story-building → [3+ consecutive failures] → analyzing (circuit breaker)
    story-diagnosis → [fixed] → story-building
    story-diagnosis → [can't fix] → escalation

  Milestone loop:
    milestone-check → [pass] → analyzing
    milestone-check → [regressions] → milestone-fix
    milestone-fix → milestone-check
    milestone-fix → [stuck] → escalation

  Progression:
    analyzing → story-building (next milestone)
    analyzing → vision-check (all milestones done)
    analyzing → escalation (structural/strategic)
    analyzing → foundation (insert-foundation)
    vision-check → shipping (aligned)
    vision-check → escalation (drift/pivot)
    shipping → final-review
    final-review → complete
    final-review → story-building (refinements)

  Escalation:
    escalation → [resolved] → story-building (retry unblocked stories)
    escalation → [human input] → depends on resolution
```

---

## Compatibility

The V2 schema is NOT backwards-compatible with V1 state.json files. Existing projects (fleet-manager, countdowntimer, fruit-and-veg) retain their V1 state files. V2 schema applies only to projects seeded after the refactor.

Migration path for existing projects: re-seed with V2 spec discipline, or manually decompose feature_areas into milestones/stories.

---

## Improvement Backlog

### Per-Milestone Improvements (In-Loop)

The evaluation phase (02e) emits `improvement_items[]` in the PO lens output. These are non-blocking product completeness observations (missing logout button, user identity not shown, etc.) that would be lost on promotion if not captured.

The analyzing phase (04) routes them by scope:
- `this-milestone` → generates `change_spec_briefs`, recommends `deepen:improvements` instead of `promote`
- `global` → appends to `global_improvements.json` (persistent file at project root)
- `future-milestone` → dropped (handled when that milestone runs)

No launcher changes needed: `deepen:improvements` matches the existing `action.startsWith('deepen')` transition to `generating-change-spec`.

**Convergence guardrail:** If the same improvements persist across 2+ consecutive `deepen:improvements` cycles with no confidence change (delta within +/-0.02), the analyzing phase promotes anyway and moves remaining items to `global_improvements.json`. This prevents infinite polish loops.

### New Fields in evaluation_report.po

| Field | Type | Description |
|-------|------|-------------|
| `confidence_adjusted` | number (0.0-1.0) | Confidence with env_limited features excluded. Used by analyzing for all threshold decisions. |
| `env_limited_impact` | object | What was excluded and why: `excluded_criteria[]`, `excluded_journeys[]`, `excluded_screens[]`, `rationale`. |
| `improvement_items` | array | Non-blocking improvement observations. Each with `id`, `description`, `evidence`, `scope` (this-milestone/global/future-milestone), `severity` (low/medium), `grounding`. |

### New Fields in analysis_result

| Field | Type | Description |
|-------|------|-------------|
| `improvement_routing` | object | Counts: `this_milestone_count`, `global_persisted_count`, `future_dropped_count`, `convergence_guardrail_triggered`, `deepen_improvements_cycle_count`. |

### New Fields in final_review_report

| Field | Type | Description |
|-------|------|-------------|
| `global_improvements_observed` | array | Global improvement items observed during walkthrough. Each with `id`, `still_present` (boolean), `customer_impact` (string). |
| `global_improvements_resolved` | array of strings | IDs of global improvements that appear to have been fixed by later milestones. |

### global_improvements.json

Persistent file at the project root. Created by the analyzing phase when `global`-scoped improvement items are identified. Read by vision-check (06) and final-review (10).

```json
[
  {
    "id": "global-001",
    "milestone_spotted": "string — milestone name when spotted",
    "cycle": 3,
    "description": "string — what is missing or wrong",
    "evidence": "string — screen route and element reference",
    "category": "navigation | a11y | polish | consistency",
    "grounding": "string — which criterion or vision statement makes this a real requirement"
  }
]
```

Append-only during the loop. Final-review reports which items are `still_present` vs resolved.
