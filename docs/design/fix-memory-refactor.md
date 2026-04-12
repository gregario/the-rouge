# Fix Memory & Milestone Learnings — Design Document

**Date:** 2026-04-12
**Status:** PROPOSAL — awaiting implementation
**Issue:** #102
**Investigation:** Socrates audit comment (2026-04-10)

## Problem

`state.fix_memory` and `state.milestone_learnings` exist in the schema, are consumed by `context-assembly.js` (lines 106, 109), and are injected into every story's build context. But they are never meaningfully populated. Every project in the fleet shows `fix_memory: {}` and `milestone_learnings: []`.

The result: every story starts amnesic. Rouge has no memory of what went wrong in previous stories or what patterns emerged across milestones. The same TypeScript error that was debugged in story 3 gets re-investigated from scratch in story 7.

## Root Cause Analysis

### fix_memory

`recordFixMemory()` exists at `rouge-loop.js:326` and is called at lines 500 and 530 inside the `story-building` state handler. But the calls only fire when `ctx.story_result.outcome === 'fail'` or `'blocked'`.

**Why the writes never fire:** The builder phase (Claude running `01-building.md`) reports `story_result.outcome = 'pass'` when the phase completes — even when the resulting product has bugs. Real failures (failing tests, QA regressions, broken user flows) are detected in the *separate* `milestone-check` and `milestone-fix` phases, not surfaced as story-level outcomes. So the `'fail'` and `'blocked'` branches in the story-building handler almost never execute.

**Shape mismatch:** The current `fix_memory` is keyed by story ID (`state.fix_memory[story.id]`), designed for per-story retry context. The issue's proposed shape is keyed by *pattern name* (`state.fix_memory["typescript-never-on-insert"]`), designed for cross-story knowledge transfer. These serve different purposes.

### milestone_learnings

`milestone_learnings` is only written by the circuit breaker at `rouge-loop.js:756` (source: `circuit-breaker`) when `analysis_recommendation.mid_loop_correction` fires. It's then **cleared on milestone transition** at line 825 (`state.milestone_learnings = []`).

**Why it's always empty:** The clear-on-transition means learnings don't accumulate across milestones. And the circuit breaker is the only writer — milestone *completion* insights are never captured.

**Semantic conflict:** The current code uses `milestone_learnings` as a per-milestone scratchpad for corrective instructions. The issue wants it as a persistent log of insights across completed milestones. These are two different concepts.

## Design Decisions

### Decision 1: Two types of fix memory

Keep both models. They serve different purposes:

| | Per-story retry context | Cross-story pattern library |
|---|---|---|
| **Key** | `story.id` | Pattern slug (e.g., `supabase-typed-insert-never`) |
| **Field** | `state.fix_memory` (existing) | `state.fix_patterns` (NEW) |
| **Written when** | Story fails/blocks and retries | A fix-and-retry succeeds (the *resolution* is the pattern) |
| **Read when** | Same story is retried | Any story in the same project starts building |
| **Cleared** | Never (per-story history is always useful) | Never (patterns accumulate across the project lifetime) |
| **Consumed by** | `context-assembly.js` → `story_context.fix_memory` | `context-assembly.js` → `story_context.fix_patterns` |

### Decision 2: Pattern extraction without LLM calls

The pattern library (`fix_patterns`) needs a mechanism to extract patterns from raw failures. Two options:

**Option A — Mechanical extraction (recommended for V1):**
When a story transitions from `fail` → `pass` (retry succeeded), the entry is:
```json
{
  "pattern": "<escalation classification>",
  "symptom": "<story_result.symptom from the failing attempt>",
  "fix": "<story_result.fix_attempted from the succeeding attempt>",
  "story_id": "auth-setup",
  "first_seen": "2026-04-12T...",
  "occurrences": 1
}
```
The key is the escalation classification (e.g., `type-error`, `build-failure`, `test-failure`). Not as rich as an LLM-generated pattern name, but costs zero tokens and works mechanically.

**Option B — LLM-classified patterns (future enhancement):**
After mechanical extraction, pass the symptom + fix to a cheap model (Haiku) to generate a human-readable pattern slug and description. This is the "typescript-never-on-insert" quality the issue describes. Defer to a future PR.

### Decision 3: Milestone learnings — split the field

| | Circuit breaker scratchpad | Completion insights |
|---|---|---|
| **Field** | `state.milestone_learnings` (existing) | `state.shipped_insights` (NEW) |
| **Written when** | Circuit breaker injects corrective context | Milestone promotes (all stories done) |
| **Cleared** | On milestone transition (line 825 — keep existing behaviour) | NEVER (accumulates across milestones) |
| **Shape** | `{ source: 'circuit-breaker', diagnosis, instruction, timestamp }` | `{ milestone, completed_at, story_count, retry_count, patterns_discovered: [...] }` |
| **Read when** | Current milestone stories read for corrective context | All future stories read for awareness |

### Decision 4: Write-point relocation for fix_memory

Move the pattern-extraction write from the `story-building` handler to a new location: **when `advanceState()` detects a story transitioning from `attempts > 1` to `status: 'done'`**.

Currently at `rouge-loop.js:474-477`:
```js
if (outcome === 'pass') {
  story.status = 'done';
  story.completed_at = new Date().toISOString();
  // ... existing code
}
```

Add after the existing code:
```js
// If this story was retried (attempts > 1), extract a fix pattern
if ((story.attempts || 0) > 1 && state.fix_memory?.[story.id]?.length > 0) {
  const lastFailure = state.fix_memory[story.id].slice(-1)[0];
  const patternKey = lastFailure.classification || 'unknown';
  if (!state.fix_patterns) state.fix_patterns = {};
  if (state.fix_patterns[patternKey]) {
    state.fix_patterns[patternKey].occurrences += 1;
  } else {
    state.fix_patterns[patternKey] = {
      pattern: patternKey,
      symptom: lastFailure.symptom || '',
      fix: lastFailure.fix || result.fix_attempted || '',
      story_id: story.id,
      first_seen: new Date().toISOString(),
      occurrences: 1,
    };
  }
}
```

### Decision 5: Write-point for shipped_insights

At milestone promotion (`rouge-loop.js:810-818`), after `promoteMilestone()`:

```js
if (!state.shipped_insights) state.shipped_insights = [];
state.shipped_insights.push({
  milestone: state.current_milestone,
  completed_at: new Date().toISOString(),
  story_count: (milestone.stories || []).length,
  retry_count: (milestone.stories || []).reduce((sum, s) => sum + (s.attempts || 0), 0),
  patterns_discovered: Object.keys(state.fix_patterns || {}),
});
```

## Migration

### Existing state.json files

No breaking changes. Both `fix_patterns` and `shipped_insights` are new fields — existing state.json files without them will get `{}` and `[]` defaults when the code initialises them.

The existing `fix_memory` (per-story-id) is kept as-is. `context-assembly.js` continues to read it for per-story retry context.

### context-assembly.js changes

Add two new fields to story context:
```js
fix_patterns: state.fix_patterns || {},
shipped_insights: state.shipped_insights || [],
```

## Implementation Checklist

- [ ] Add `fix_patterns` extraction at story success (rouge-loop.js, story-building handler)
- [ ] Add `shipped_insights` write at milestone promotion (rouge-loop.js, analyzing handler)
- [ ] Update `context-assembly.js` to include `fix_patterns` and `shipped_insights` in story context
- [ ] Update `story_context.json` schema docs
- [ ] Add unit tests:
  - [ ] `fix_patterns` populated when retried story succeeds
  - [ ] `fix_patterns` increments occurrences on repeat pattern
  - [ ] `shipped_insights` populated on milestone promotion
  - [ ] `shipped_insights` survives milestone transition (not cleared)
  - [ ] Existing `milestone_learnings` clear-on-transition preserved
- [ ] Update `01-building.md` prompt to mention `fix_patterns` as a context source
- [ ] Update `story_context.json` assembly to surface patterns to the builder

## Future Enhancements (Not in this PR)

- LLM-classified pattern slugs (Option B above) — Haiku call after mechanical extraction
- Pattern deduplication across similar classifications
- Dashboard "Patterns Rouge has learned" panel consuming `fix_patterns`
- Cross-project pattern sharing (factory-level fix_patterns)
