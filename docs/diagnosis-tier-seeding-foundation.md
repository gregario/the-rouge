# Diagnosis: Tier-Based Seeding Flow and Foundation Phase Failures

**Diagnosis Date:** 2026-05-03  
**Investigator:** Claude Sonnet 4.5 (Agent Mode)  
**Trigger Incident:** highlow (XS game) — stuck in seeding with only 1/9 disciplines complete, emitted SEEDING_COMPLETE with empty task_ledger, foundation spinning 90+ minutes with no completion

---

## Executive Summary

Three critical bugs found in Rouge's tier-based seeding and foundation systems:

1. **Orchestrator hallucinated discipline completion** — The seeding orchestrator claimed 7 disciplines complete in the final approval gate when seeding-state.json showed only 1 (brainstorming). This false completion claim bypassed validation and allowed SEEDING_COMPLETE to fire.

2. **Finalization validator does not check discipline completion** — `finalizeSeeding()` in `dashboard/src/bridge/seeding-finalize.ts` checks for artifact files (task_ledger.json, seed_spec/, vision.json, product_standard.json) but does NOT verify that all applicable disciplines for the project tier actually ran. An orchestrator that writes partial artifacts can pass validation.

3. **Foundation phase has no completion signal** — The foundation building prompt (`src/prompts/loop/00-foundation-building.md`) instructs the agent to "write to cycle_context.json" and "exit" but provides no marker or state transition mechanism. The loop runner's foundation case handler (rouge-loop.js:784-790) expects the phase to complete so it can transition to foundation-eval, but the phase never signals completion. This causes foundation to run indefinitely.

**Severity:** High. XS/S projects cannot complete seeding or foundation reliably.

**Affected Tiers:** XS, S, and likely M (any project where disciplines are skipped based on tier).

---

## Tier Gating Status

### Expected Behavior (from discipline-registry.js)

| Tier | Disciplines that SHOULD run | Disciplines SKIPPED |
|------|---------------------------|---------------------|
| XS   | brainstorming, taste, sizing, spec (4 total) | competition, infrastructure, design, legal-privacy, marketing (5 skipped) |
| S    | brainstorming, taste, sizing, spec, infrastructure, design, legal-privacy (7 total) | competition, marketing (2 skipped) |
| M    | All 9 disciplines | None |
| L    | All 9 disciplines | None |
| XL   | All 9 disciplines | None |

### Actual Behavior (from highlow incident)

| Project | Declared Size | Disciplines that RAN | Disciplines in final-approval claim | Seeding Complete? | Foundation Status |
|---------|--------------|---------------------|-----------------------------------|------------------|------------------|
| highlow | S | brainstorming, competition (2) | brainstorming, taste, sizing, spec, infrastructure, design, legal-privacy (7) | YES (invalid) | pending (spinning) |
| testimonial | unknown (no sizing.json) | All 8 non-sizing disciplines | 8 | YES | complete |
| construction-coordinator | unknown (no sizing.json) | brainstorming, competition, taste, spec, infrastructure (5) | Not checked | YES | N/A (different era) |

**Pattern:** Projects without sizing.json completed seeding successfully (pre-tier-gating era). The first S-tier project (highlow) to use tier gating hit ALL three bugs.

---

## Evidence: highlow Seeding Failure

### Seeding Timeline

- **16:22:21** — Seeding session started
- **16:27:27** — BRAINSTORMING complete (verified: /seed_spec/brainstorming.md exists, 15KB)
- **16:27:27** — SIZING ran (verified: /seed_spec/sizing.json exists, project_size: "S")
- **16:33:35** — Final approval gate presented: "Disciplines completed: brainstorming, taste, sizing, spec, infrastructure, design, legal-privacy"
- **16:35:07** — User approved with "approve"
- **16:35:07** — SEEDING_COMPLETE emitted
- **17:56:39** — Foundation starts (first commit: "feat(scaffold): initialize project foundation")
- **19:00:59** — Foundation last commit ("chore(scaffold): add README...")
- **20:08** (now) — Foundation still running, no evaluation, state.json shows current_state: "foundation", foundation.status: "pending"

### Seeding Artifacts on Disk

```
seed_spec/
  brainstorming.md            — 15KB (real content)
  sizing.json                 — 584B (project_size: "S", decided_by: "classifier")
  infrastructure_manifest.json— 1.2KB (deploy.target: "github-pages")
  milestones.json            — 11.8KB (1 milestone, 6 stories, 49 ACs)
  product_standard.json       — 784B
  vision.json                — 1.8KB
```

**Missing discipline artifacts:**
- No `seed_spec/taste.md` or graveyard entry (TASTE never ran)
- No `seed_spec/competition.md` (COMPETITION started but did not complete)
- No `design/` directory (DESIGN never ran)
- No `legal/` directory (LEGAL-PRIVACY never ran)

### Seeding State vs Orchestrator Claim

**seeding-state.json (ground truth):**
```json
{
  "disciplines_complete": ["brainstorming"],
  "disciplines_prompted": ["brainstorming", "competition"],
  "current_discipline": "competition",
  "seeding_complete": null
}
```

**Orchestrator's final-approval gate claim (hallucinated):**
> "**Disciplines completed:** brainstorming, taste, sizing, spec, infrastructure, design, legal-privacy"

**Reality:** Only brainstorming completed. The orchestrator wrote milestones.json (which is SPEC's artifact) without ever emitting `[DISCIPLINE_COMPLETE: spec]` and without the seed-handler recording spec as complete.

### Task Ledger vs State Milestones

**task_ledger.json:**
```json
{
  "milestones": []
}
```

**state.json.milestones:**
```json
{
  "milestones": [
    {
      "name": "Playable Game",
      "status": "pending",
      "stories": [
        { "id": "deck-and-shuffle", "name": "Deck Initialization & Shuffle", ... },
        { "id": "guess-and-reveal", ... },
        { "id": "scoring", ... },
        { "id": "card-rendering", ... },
        { "id": "animations-and-feedback", ... },
        { "id": "game-over-and-restart", ... }
      ]
    }
  ]
}
```

The orchestrator wrote milestones to state.json but NOT to task_ledger.json. The V3 launcher reads task_ledger.json as the source of truth (rouge-loop.js:867-874), so foundation started with zero stories to build toward.

---

## Root Causes

### 1. Orchestrator Prompt Logic Error (CRITICAL)

**File:** `/Users/gregario/Projects/ClaudeCode/The-Rouge/src/prompts/seeding/00-swarm-orchestrator.md`  
**Lines:** 263-295 (final approval gate section)

**Bug:** The orchestrator is instructed to present a "SEED SUMMARY" as the H-final-approval gate AFTER "all disciplines have run and no new triggers fire" (line 263). However, the prompt does not require the orchestrator to verify discipline completion against seeding-state.json before composing the summary. The orchestrator hallucinates completed disciplines based on what SHOULD have run (per the tier table) rather than what ACTUALLY ran (per seeding-state.json).

**Evidence:** highlow's final-approval gate listed 7 disciplines complete when only 1 was recorded in seeding-state.json. The orchestrator likely reasoned: "This is an S-tier project, so TASTE/SIZING/SPEC/INFRASTRUCTURE/DESIGN/LEGAL-PRIVACY should have run by now, therefore I'll list them as complete."

**Fix:** Before composing the SEED SUMMARY, the orchestrator must read seeding-state.json and report only disciplines in `disciplines_complete[]`. Add a pre-gate validation step:
```markdown
Before presenting the H-final-approval gate, read `seeding-state.json` to verify which disciplines are actually complete. The summary MUST list only disciplines present in `seeding_complete[]`. If disciplines that should have run (per the tier table) are missing, DO NOT proceed to final approval — loop back to the first missing discipline.
```

### 2. Finalization Validator Incomplete (HIGH)

**File:** `/Users/gregario/Projects/ClaudeCode/The-Rouge/dashboard/src/bridge/seeding-finalize.ts`  
**Lines:** 112-156 (finalizeSeeding function)

**Bug:** `finalizeSeeding()` checks for artifact files (task_ledger.json, seed_spec/, vision.json, product_standard.json) but does NOT verify that all applicable disciplines for the project tier actually ran. An orchestrator that writes partial artifacts (e.g., milestones.json without running SPEC) passes validation.

**Current validation:**
```typescript
const missing: string[] = []
if (!existsSync(join(projectDir, 'task_ledger.json'))) {
  missing.push('task_ledger.json')
}
if (!fileLooksReal(join(projectDir, 'vision.json'))) {
  missing.push('vision.json')
}
// ... etc
```

**What's missing:** No check that `seeding-state.json.disciplines_complete` contains all applicable disciplines for the project's tier.

**Fix:** Add tier-aware discipline completion validation:
```typescript
// After artifact checks, verify discipline completion
const sizingPath = join(projectDir, 'seed_spec/sizing.json')
if (existsSync(sizingPath)) {
  const sizing = JSON.parse(readFileSync(sizingPath, 'utf-8'))
  const projectSize = sizing.project_size
  const seedingStatePath = join(projectDir, 'seeding-state.json')
  if (existsSync(seedingStatePath)) {
    const seedingState = JSON.parse(readFileSync(seedingStatePath, 'utf-8'))
    const completed = seedingState.disciplines_complete || []
    const applicable = listApplicable(projectSize) // from discipline-registry
    const missingDisciplines = applicable.filter(d => !completed.includes(d))
    if (missingDisciplines.length > 0) {
      missing.push(`disciplines: ${missingDisciplines.join(', ')} (required for ${projectSize}-tier project)`)
    }
  }
}
```

### 3. Foundation Phase No Completion Signal (CRITICAL)

**File:** `/Users/gregario/Projects/ClaudeCode/The-Rouge/src/prompts/loop/00-foundation-building.md`  
**Lines:** 505-514 (Step 11: Exit Clean)

**Bug:** The foundation prompt instructs the agent to "write to cycle_context.json" and "exit" but provides no marker or state transition mechanism. The rouge-loop.js foundation case handler expects the phase to complete so it can transition to foundation-eval automatically (line 788: `next = 'foundation-eval'`), but this transition only fires when rouge-loop.js's `advanceState()` is called AFTER the foundation phase returns. The phase has no way to signal "I'm done."

**Current instruction (line 513):**
> 7. Report results; phase routing is the Runner's job. Your output is the foundation work plus the `cycle_context.json` writeback; the Runner decides what phase runs next.

**Problem:** There is no "report results" mechanism. The phase writes cycle_context.json and exits, but rouge-loop.js never knows the phase completed because:
1. The phase is invoked via `claude -p` with a prompt file
2. The subprocess exits after the prompt completes
3. rouge-loop.js checks cycle_context.json for completion signals
4. But cycle_context.json has no `phase_complete` or `foundation_done` field

**Evidence from highlow:**
- cycle_context.json has `foundation_completion` object (written by the phase)
- BUT cycle_context.json has no `foundation_eval_report` (evaluator never ran)
- state.json shows `current_state: "foundation"` (loop never advanced)
- foundation.status is still "pending" (not "evaluating" as line 786 would set it)

**Fix:** Add a completion marker convention to cycle_context.json. The foundation phase must write:
```json
{
  "foundation_completion": { ... },
  "_phase_complete": "foundation"
}
```

And rouge-loop.js's foundation case handler must check for this marker before transitioning:
```javascript
case 'foundation': {
  const ctx = readJson(contextFile);
  if (ctx?._phase_complete !== 'foundation') {
    // Phase hasn't signaled completion yet
    log(`[${projectName}] Foundation still running...`);
    next = 'foundation'; // stay in foundation
    break;
  }
  // Phase signaled completion — advance to eval
  state.foundation = state.foundation || {};
  state.foundation.status = 'evaluating';
  await commitState(projectDir, state);
  next = 'foundation-eval';
  log(`[${projectName}] Foundation build done — evaluating`);
  break;
}
```

### 4. Task Ledger Not Written During Seeding (HIGH)

**File:** `/Users/gregario/Projects/ClaudeCode/The-Rouge/src/prompts/seeding/00-swarm-orchestrator.md`  
**Lines:** 285-294 (state.json writeback instructions)

**Bug:** The orchestrator is instructed to write milestones to state.json (line 291: "Write `milestones[]` with nested `stories[]`") but there is NO instruction to write task_ledger.json. The V3 launcher expects task_ledger.json to be the source of truth for story tracking (rouge-loop.js:867: "const ledgerPath = path.join(projectDir, 'task_ledger.json')").

**Current instruction (lines 291-293):**
> - Write `milestones[]` with nested `stories[]` (not the deprecated `feature_areas[]` shape)
> - Each story has: `id`, `name`, `status: "pending"`, `depends_on`, `affected_entities`, `affected_screens`
> - Each milestone has: `name`, `status: "pending"`, `stories[]`

**What's missing:** No instruction to ALSO write task_ledger.json with the same milestones structure.

**Evidence:** highlow's task_ledger.json contains `{"milestones": []}` while state.json contains 1 milestone with 6 stories.

**Fix:** Add explicit task_ledger.json writeback instruction:
```markdown
5. **On human approval**, write all artifacts to the project directory:
   - `task_ledger.json` — V3 story/milestone tracking (schema: `schemas/task-ledger-v1.json`). Write the SAME milestones structure as state.json — this file is the launcher's source of truth for which stories to build.
   - `seed_spec/milestones.json` — legacy schema for backwards compatibility
   - `vision.json` — structured vision document
   - ...
```

---

## Foundation Spin Analysis

### Why Foundation Loops Forever

The foundation phase ran for 90+ minutes without completing because:

1. **No completion criteria defined** — The prompt instructs "Exit" (line 514) but doesn't define what "done" means. The agent writes foundation_completion to cycle_context.json and keeps running, waiting for some signal that never comes.

2. **No autonomous exit mechanism** — Regular building phases use `claude -p --max-turns N` and the launcher monitors for `implemented[]` in cycle_context.json. Foundation has no equivalent. The prompt says "Report results; phase routing is the Runner's job" but the Runner has no way to detect the report.

3. **Launcher waits for state transition** — rouge-loop.js's foundation case handler (line 784-790) expects to run after the foundation phase completes, but it only runs when manually invoked or when a watchdog fires. There's no watchdog for foundation.

4. **Subagent invocation confusion** — The prompt mentions "subagent-driven development" (line 324) but provides no mechanism for tracking subagent completion. If the orchestrator invokes a subagent and the subagent writes cycle_context.json, the orchestrator has no way to know the subagent finished.

### Completion Criteria Bug

The prompt's Step 11 "Exit Clean" checklist (lines 505-514) says:

> 1. Run the full test suite one final time. All tests must pass.
> 2. Verify the staging deployment is accessible (if deployed).
> 3. Verify `cycle_context.json` is valid JSON and contains all required fields.
> 4. Verify `foundation_completion` accurately reflects what was built and what's missing.
> 5. Write only to `cycle_context.json` for state; the launcher owns transitions.
> 6. Skip PR creation — that happens in the ship-promote phase.
> 7. Report results; phase routing is the Runner's job.
> 8. Exit.

**Problem:** Steps 1-4 are verification steps (no output). Step 5 says "write to cycle_context.json" (already done throughout the phase). Step 6 says "skip PR" (no action). Step 7 says "report results" (no mechanism defined). Step 8 says "exit" (but the subprocess already exited after writing cycle_context.json).

**What's missing:** A marker that the launcher can poll for. Either:
- A `_phase_complete: "foundation"` field in cycle_context.json, OR
- A `FOUNDATION_COMPLETE` marker emitted to stdout (like seeding's `SEEDING_COMPLETE`)

---

## Recommendations (Priority Order)

### P0: Fix Foundation Completion Signal (blocks all XS/S/M projects)

**File:** `src/prompts/loop/00-foundation-building.md`  
**Change:** Add to Step 11 (line 511):

```markdown
5. Write the completion signal to `cycle_context.json`:
   ```json
   {
     "_phase_complete": "foundation",
     "foundation_completion": { ... }
   }
   ```
   The launcher polls for `_phase_complete` to know the phase is done. Without this marker, the loop will not advance to foundation-eval.
```

**File:** `src/launcher/rouge-loop.js`  
**Change:** Update foundation case handler (line 784-790):

```javascript
case 'foundation': {
  const ctx = readJson(contextFile);
  if (ctx?._phase_complete !== 'foundation') {
    // Phase hasn't signaled completion yet — stay in foundation
    log(`[${projectName}] Foundation still running (no completion signal)...`);
    next = 'foundation';
    break;
  }
  // Phase signaled completion — advance to eval
  state.foundation = state.foundation || {};
  state.foundation.status = 'evaluating';
  await commitState(projectDir, state);
  next = 'foundation-eval';
  log(`[${projectName}] Foundation build done — evaluating`);
  break;
}
```

**Impact:** Fixes the infinite foundation spin. Foundation will complete and transition to eval.

---

### P0: Fix Orchestrator Discipline Validation (blocks all tier-gated projects)

**File:** `src/prompts/seeding/00-swarm-orchestrator.md`  
**Change:** Add pre-gate validation before line 263:

```markdown
## Pre-Gate Validation

**Before presenting the H-final-approval gate**, verify that all applicable disciplines for this project's tier have actually run:

1. Read `seed_spec/sizing.json` to get the project's `project_size`.
2. Read `seeding-state.json` to get `disciplines_complete[]`.
3. Compare against the tier table (lines 10-19). For an S-tier project, you should have completed: brainstorming, taste, sizing, spec, infrastructure, design, legal-privacy. For M+ projects, all 9 disciplines.
4. If any applicable discipline is missing from `disciplines_complete[]`, DO NOT proceed to final approval. Instead, loop back to the first missing discipline and run it.
5. The SEED SUMMARY's "Disciplines completed" line MUST list only disciplines in `disciplines_complete[]` — not disciplines you THINK should have run.

This prevents the orchestrator from hallucinating completion based on what "should" happen rather than what "actually" happened.
```

**Impact:** Prevents orchestrator from claiming disciplines complete when they haven't run. Forces the orchestrator to actually run all applicable disciplines before final approval.

---

### P1: Add Discipline Completion Check to Finalization

**File:** `dashboard/src/bridge/seeding-finalize.ts`  
**Change:** Add tier-aware validation after line 151:

```typescript
// Validate that all applicable disciplines for the project tier completed.
const sizingPath = join(projectDir, 'seed_spec/sizing.json')
if (existsSync(sizingPath)) {
  try {
    const sizing = JSON.parse(readFileSync(sizingPath, 'utf-8'))
    const projectSize = sizing.project_size
    if (projectSize && ['XS', 'S', 'M', 'L', 'XL'].includes(projectSize)) {
      const seedingStatePath = join(projectDir, 'seeding-state.json')
      if (existsSync(seedingStatePath)) {
        const seedingState = JSON.parse(readFileSync(seedingStatePath, 'utf-8'))
        const completed = new Set(seedingState.disciplines_complete || [])
        const { listApplicable } = require('../../src/launcher/discipline-registry.js')
        const applicable = listApplicable(projectSize)
        const missingDisciplines = applicable.filter(d => !completed.has(d))
        if (missingDisciplines.length > 0) {
          missing.push(
            `disciplines incomplete: ${missingDisciplines.join(', ')} ` +
            `(required for ${projectSize}-tier, only ${[...completed].join(', ')} completed)`
          )
        }
      }
    }
  } catch (err) {
    // sizing.json malformed — artifact check will catch it
  }
}
```

**Impact:** Prevents seeding from finalizing if the orchestrator skipped disciplines. Provides a safety net if the orchestrator validation fails.

---

### P1: Fix Task Ledger Writeback

**File:** `src/prompts/seeding/00-swarm-orchestrator.md`  
**Change:** Update final approval writeback instructions (line 285):

```markdown
5. **On human approval** (the human replied `approve` or similar to the H-final-approval gate), write all artifacts to the project directory:
   - **`task_ledger.json`** — V3 story/milestone tracking (schema: `schemas/task-ledger-v1.json`). Write the SAME milestones structure as state.json. This file is the launcher's source of truth for which stories to build. Each milestone has `name`, `status: "pending"`, `stories[]`. Each story has `id`, `name`, `status: "pending"`, `depends_on`, `affected_entities`, `affected_screens`. Example:
     ```json
     {
       "milestones": [
         {
           "name": "Milestone Name",
           "status": "pending",
           "stories": [
             {
               "id": "story-id",
               "name": "Story Name",
               "status": "pending",
               "depends_on": [],
               "affected_entities": ["Entity1"],
               "affected_screens": ["screen1"]
             }
           ]
         }
       ]
     }
     ```
   - `seed_spec/milestones.json` — legacy format for backwards compatibility (keep writing this too)
   - `vision.json` — structured vision document
   - ...
```

**Impact:** Ensures task_ledger.json is populated with milestones so foundation and build loops have work to do.

---

### P2: Add Foundation Watchdog Timeout

**File:** `src/launcher/rouge-loop.js`  
**Change:** Add timeout detection for foundation (after line 790):

```javascript
case 'foundation': {
  const ctx = readJson(contextFile);
  const foundationStarted = state.foundation?.started_at;
  const now = Date.now();
  
  // Timeout if foundation has been running for more than 2 hours without completing
  if (foundationStarted) {
    const elapsedMs = now - new Date(foundationStarted).getTime();
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    if (elapsedMs > TWO_HOURS && ctx?._phase_complete !== 'foundation') {
      log(`[${projectName}] Foundation timeout after ${Math.floor(elapsedMs / 60000)}min — escalating`);
      if (!state.escalations) state.escalations = [];
      state.escalations.push({
        id: `esc-foundation-timeout-${Date.now()}`,
        tier: 1,
        classification: 'phase-timeout',
        phase: 'foundation',
        summary: `Foundation phase ran for ${Math.floor(elapsedMs / 60000)} minutes without completing. Last git commit: ${state.last_commit || 'unknown'}. Cycle context has foundation_completion but no _phase_complete marker.`,
        status: 'pending',
        created_at: new Date().toISOString(),
      });
      await commitState(projectDir, state);
      next = 'escalation';
      break;
    }
  }
  
  if (ctx?._phase_complete !== 'foundation') {
    if (!foundationStarted) {
      state.foundation.started_at = new Date().toISOString();
      await commitState(projectDir, state);
    }
    log(`[${projectName}] Foundation still running (no completion signal)...`);
    next = 'foundation';
    break;
  }
  // Phase signaled completion — advance to eval
  state.foundation = state.foundation || {};
  state.foundation.status = 'evaluating';
  await commitState(projectDir, state);
  next = 'foundation-eval';
  log(`[${projectName}] Foundation build done — evaluating`);
  break;
}
```

**Impact:** Prevents foundation from spinning forever. Escalates after 2 hours so the human can investigate.

---

### P3: Add Seeding Discipline Trace Logging

**File:** `dashboard/src/bridge/seed-handler.ts`  
**Change:** Add trace logging when disciplines complete (after line 77):

```typescript
export async function markDisciplineComplete(projectDir: string, discipline: string): Promise<void> {
  await withStateLock(projectDir, async () => {
    const state = readSeedingState(projectDir)
    const complete = state.disciplines_complete ?? []
    if (!complete.includes(discipline)) {
      complete.push(discipline)
      state.disciplines_complete = complete
      console.log(`[seeding] ${projectDir}: discipline ${discipline} complete (${complete.length} total)`)
    }
    state.current_discipline = nextDiscipline(complete)
    state.last_activity = new Date().toISOString()
    writeSeedingState(projectDir, state)
    await updateDisciplineStatusInStateUnlocked(projectDir, discipline, 'complete')
  })
}
```

**Impact:** Makes it easier to debug discipline completion issues by logging when each discipline is marked complete.

---

## Summary

**Bug Count:** 4 critical bugs + 1 observability gap

**Highest Severity:** P0 — Foundation completion signal bug blocks ALL projects that reach foundation phase

**Single Most Impactful Fix:** Add `_phase_complete` marker convention to foundation phase and update rouge-loop.js to poll for it. This unblocks highlow and all future XS/S/M projects immediately.

**Estimated Fix Time:**
- P0 fixes: 2-3 hours (foundation completion signal + orchestrator validation)
- P1 fixes: 1-2 hours (finalization validator + task ledger writeback)
- P2 fixes: 1 hour (watchdog timeout)
- P3 fixes: 30 minutes (trace logging)

**Total:** ~6 hours to fix all issues and deploy.

**Deployment Risk:** Low. All fixes are additive (new validation, new markers, new logs). No destructive changes to existing projects.

**Testing Plan:**
1. Fix bugs in order (P0 → P1 → P2 → P3)
2. Test with highlow (currently stuck) — should complete seeding and foundation
3. Test with a fresh XS project (calculator) — should skip 5 disciplines correctly
4. Test with a fresh M project — should run all 9 disciplines
5. Regression test with testimonial (already complete) — should not break

---

## Appendix: Investigation Commands Used

```bash
# Check seeding completion status
cat ~/.rouge/projects/*/seeding-state.json | jq -c '{seeding_complete, disciplines_complete, started_at, status}'

# Check sizing and task ledger
cat ~/.rouge/projects/highlow/seed_spec/sizing.json | jq '{project_size}'
cat ~/.rouge/projects/highlow/task_ledger.json

# Check state vs milestones
cat ~/.rouge/projects/highlow/.rouge/state.json | jq '{current_state, foundation, milestones: (.milestones | length)}'

# Check foundation completion
cat ~/.rouge/projects/highlow/cycle_context.json | jq '{foundation_completion, deployment_url}'

# Check git commits
cd ~/.rouge/projects/highlow && git log --format="%H %ai %s" | head -10

# Check seeding chat for discipline activity
cat ~/.rouge/projects/highlow/seeding-chat.jsonl | jq -r 'select(.metadata.discipline != null) | .metadata.discipline' | sort -u
```

---

**End of Diagnosis**
