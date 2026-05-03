# Build Loop State Machine Audit

**Date:** 2026-05-03  
**Auditor:** Claude Sonnet 4.5  
**Scope:** State transition bugs in `/Users/gregario/Projects/ClaudeCode/The-Rouge/src/launcher/rouge-loop.js`

## Executive Summary

Found **6 bugs** with severity ranging from P1 to P3. Highest severity: **P1** (data corruption).

**Top 3 Most Impactful:**
1. **BUG-001**: Story status never transitions to `in-progress` during pre-dispatch advancement (P1)
2. **BUG-002**: Paused state removed but Slack bot still writes it (P1) 
3. **BUG-003**: Escalation state allows work to continue when human_response is malformed (P2)

## State Machine Diagram

```
                    ┌─────────────┐
                    │   seeding   │ (SKIP)
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │    ready    │ (SKIP)
                    └──────┬──────┘
                           │
                    ┌──────▼──────────┐
             ┌──────┤  foundation     │
             │      └──────┬──────────┘
             │             │
             │      ┌──────▼──────────────┐
             └──────┤ foundation-eval     │
                    └──────┬───────┬──────┘
                           │       │ FAIL (semantic spin)
                           │       └──────────────┐
                           │ PASS                 │
                    ┌──────▼──────────┐    ┌──────▼──────────┐
          ┌─────────┤ story-building  │    │   escalation    │◄─────┐
          │         └──────┬──────────┘    └──────┬──────────┘      │
          │ next story     │ batch complete       │ resolved        │
          └────────────────┘      │                └─────────────────┤
                           │                                         │
                    ┌──────▼──────────────┐                         │
             ┌──────┤ milestone-check     │                         │
             │      └──────┬───────┬──────┘                         │
             │             │       │ semantic spin                  │
             │             │       └────────────────────────────────┘
             │ FAIL        │ PASS
             │      ┌──────▼──────────┐
             └──────┤ milestone-fix   │
                    └──────┬──────────┘
                           │
                    ┌──────▼──────────┐
                    │   analyzing     │──┐
                    └──────┬──────────┘  │ deepen/broaden
                           │             │
                           │      ┌──────▼──────────────────┐
                           │      │ generating-change-spec  │
                           │      └──────┬──────────────────┘
                           │             │
                           │             └───────────┐
                           │                         │
                    ┌──────▼──────────┐              │
                    │  vision-check   │              │
                    └──────┬──────────┘              │
                           │                         │
                    ┌──────▼──────────┐              │
                    │   shipping      │              │
                    └──────┬──────────┘              │
                           │                         │
                    ┌──────▼──────────┐              │
             ┌──────┤ final-review    │              │
             │      └──────┬──────────┘              │
             │             │ production_ready        │
             │ refinement  │                         │
             └─────────────┼─────────────────────────┘
                           │
                    ┌──────▼──────────┐
                    │   complete      │ (SKIP)
                    └─────────────────┘

                    ┌─────────────────┐
                    │ waiting-for-    │ (SKIP, terminal after max retries)
                    │     human       │
                    └─────────────────┘

Legend:
  SKIP = listed in SKIP_STATES, loop doesn't process
  ───► = state transition via advanceState()
```

## Bug Checklist

### BUG-001: Story status not updated to `in-progress` during pre-dispatch
- **Bug:** When `runPhase()` pre-dispatch advances from a done story to the next pending story, it calls `advanceStory()` which sets status to `in-progress`, but this only happens when the current story is already done. If the story wasn't done in the previous tick, the transition from `pending` → `in-progress` never happens.
- **Symptom:** Stories complete but never show `in-progress` status (highlow symptom #2)
- **Root cause:** `rouge-loop.js:2148` — `advanceStory()` is only called in pre-dispatch path when current story is already done. The normal `beginStory()` path at `rouge-loop.js:1047` and `rouge-loop.js:1505` DOES set `in-progress`, but pre-dispatch bypasses the normal state machine transition.
- **Impact:** Every build — pre-dispatch optimization means stories frequently skip `in-progress` status
- **Severity:** P1 (data corruption — analytics/dashboard show wrong status timeline)

### BUG-002: `paused` state removed from state machine but Slack bot still writes it
- **Bug:** Comment at line 231-234 states `'paused' was removed from this set after a codebase audit: it was listed here but no code path ever wrote it to current_state`. However, `src/slack/bot.js:798`, `946`, `961`, `963`, `1074` all write `state.current_state = 'paused'` or `state.paused_from_state`.
- **Symptom:** Project shows `status=paused` but work continues because `paused` is not in `SKIP_STATES` (uat-test symptom #1)
- **Root cause:** 
  - `rouge-loop.js:235` — `SKIP_STATES` does not include `'paused'`
  - `slack/bot.js:798, 946` — writes `paused` state
  - `rouge-loop.js:2082` — `if (SKIP_STATES.has(currentState)) return { success: true };` does not skip `paused`
- **Impact:** Rare (only triggered by Slack bot pause command, which requires `ROUGE_SLACK_ALLOW_WRITES`)
- **Severity:** P1 (data corruption — state says paused but loop continues)

### BUG-003: Escalation resolution path proceeds even when `human_response` validation fails
- **Bug:** When `validateHumanResponse()` fails at line 1724-1740, the code deletes `human_response` and pushes a new malformed-response escalation, then breaks. But because `next` is not set, the `advanceState()` function returns without transitioning, leaving the project in `escalation` state with TWO pending escalations (original + malformed). On the next tick, if someone submits a valid response to the original escalation, the loop proceeds as if nothing happened, potentially ignoring the fact that the first resolution attempt was corrupt.
- **Symptom:** Escalation appears to resolve on dashboard but project doesn't advance; or project advances but audit trail shows two escalations were "resolved" when only one should have been.
- **Root cause:** `rouge-loop.js:1740` — `break` exits the switch but doesn't prevent future ticks from resolving the original escalation
- **Impact:** Edge case (only when dashboard submits malformed response)
- **Severity:** P2 (UX confusion — user sees two escalations, unclear which to resolve)

### BUG-004: Pre-dispatch advancement doesn't call `advanceState()` after setting state
- **Bug:** When pre-dispatch at line 2142-2149 advances to next story, it calls `commitState()` but doesn't call `advanceState()`, so the outer loop tick completes without triggering a checkpoint write. The next tick will write the checkpoint, but the phase transition isn't logged immediately.
- **Symptom:** Dashboard shows story advanced but no transition log line until next tick; checkpoint timeline shows gap
- **Root cause:** `rouge-loop.js:2149` — `advanceStory()` returns `null` (meaning "stay in story-building"), so `advanceState()` at line 2078 doesn't log a transition
- **Impact:** Every build where pre-dispatch fires
- **Severity:** P3 (cosmetic — audit trail is accurate but delayed)

### BUG-005: Escalation hand-off can create dangling `current_story` pointer
- **Bug:** When escalation is resolved via `hand-off` (line 1807-1825), the code sets `pendingEsc.status = 'pending'` and stays in `escalation` state, but doesn't clear `current_story`. If the escalation was raised during foundation-eval (before any stories exist), `current_story` might be null or point to a story that doesn't exist yet. When the user submits `resume-after-handoff` (line 1826-1867), the code tries to find `resumeStory` by `current_story` id, but if that story doesn't exist, `resumeStory` is undefined and `retryStory()` isn't called, so the loop resumes with a dangling pointer.
- **Symptom:** After hand-off resolution, dashboard shows a story id that doesn't exist in any milestone
- **Root cause:** `rouge-loop.js:1850-1852` — `retryStory()` only called if `resumeStory` is truthy, no fallback to clear the dangling pointer
- **Impact:** Edge case (only when escalation raised before stories exist, then hand-off used)
- **Severity:** P2 (UX confusion — dashboard shows wrong story)

### BUG-006: Budget cap escalation doesn't prevent phase from running
- **Bug:** At line 2112-2127, when budget cap is exceeded, the code sets `current_state = 'escalation'` and pushes an escalation, then returns `{ success: false, budgetExceeded: true }`. But the caller in `main()` at line 2641-2669 only checks `result.success` and `result.rateLimited` — it doesn't check `result.budgetExceeded`, so the retry logic treats this as a generic failure and retries 3 times.
- **Symptom:** Project hits budget cap but loop retries 3 times before giving up, wasting more budget
- **Root cause:** `rouge-loop.js:2667-2669` — retry counter increments on `success: false` regardless of `budgetExceeded` flag
- **Impact:** Every build that hits budget cap
- **Severity:** P2 (waste — burns extra budget on retries that will always fail)

## Happy Path Trace

### Normal build progression (no errors):

1. **ready** → (user triggers start) → **foundation**
   - Initial state, no milestones yet
   - Transition: `advanceState()` case never explicitly handles `ready`, but `runPhase()` skips it via `SKIP_STATES`

2. **foundation** → **foundation-eval**
   - Builds infrastructure, deploys staging
   - Transition: `advanceState()` line 784-790
   - State mutation: `state.foundation.status = 'evaluating'`

3. **foundation-eval** → **story-building** (first milestone)
   - Evaluator checks completeness
   - Transition: `advanceState()` line 793-1049
   - State mutations:
     - `state.foundation.status = 'complete'`
     - Loads milestones from `task_ledger.json` if missing (line 865-878)
     - Finds first milestone via `findNextMilestone()` (line 1020)
     - `milestone.status = 'in-progress'` (line 1033)
     - Finds first story via `findNextStory()` (line 1034)
     - Calls `startStory()` which calls `beginStory()`:
       - `story.status = 'in-progress'` (line 79 of state-transitions.js)
       - `state.current_milestone = milestone.name`
       - `state.current_story = story.id`

4. **story-building** → **story-building** (next story) OR **milestone-check** (batch complete)
   - Builds one story
   - Transition: `advanceState()` line 1056-1320
   - On pass (line 1095-1133):
     - `story.status = 'done'`
     - `state.consecutive_failures = 0`
     - Tracks execution (line 1104-1111)
   - If batch complete (line 1248-1296):
     - Deploy to staging
     - → **milestone-check**
   - Else find next story (line 1300-1318):
     - Calls `startStory()` which sets `story.status = 'in-progress'`
     - Stays in **story-building**

5. **milestone-check** → **analyzing** (pass) OR **milestone-fix** (fail)
   - Evaluates milestone quality
   - Transition: `advanceState()` line 1326-1437
   - Checks QA, Design, PO verdicts (line 1365-1378)
   - If fail (line 1380-1415): → **milestone-fix**
   - If pass (line 1416-1436):
     - Captures screenshots (line 1418-1433)
     - → **analyzing**

6. **milestone-fix** → **milestone-check**
   - Fixes regressions
   - Transition: `advanceState()` line 1440-1443
   - Immediate transition back to evaluation

7. **analyzing** → **story-building** (next milestone) OR **vision-check** (all done)
   - Analyzes results, recommends action
   - Transition: `advanceState()` line 1450-1575
   - If `continue` or `promote` (line 1495-1561):
     - Marks milestone done (line 1518-1522)
     - Promotes milestone via `promoteMilestone()` (line 1525)
     - Tags milestone (line 1526-1532)
     - Finds next milestone (line 1545)
     - If found:
       - `nextMs.status = 'in-progress'` (line 1547)
       - Finds first story, calls `startStory()`
       - → **story-building**
     - If no more milestones:
       - → **vision-check**

8. **vision-check** → **shipping**
   - Checks alignment with vision
   - Transition: `advanceState()` line 1632-1660
   - If aligned (line 1657-1659): → **shipping**

9. **shipping** → **final-review**
   - Version bump, changelog, PR
   - Transition: `advanceState()` line 1663-1665

10. **final-review** → **complete**
    - Customer walkthrough
    - Transition: `advanceState()` line 1667-1704
    - If production_ready (line 1670-1673): → **complete**

11. **complete**
    - Terminal state, in SKIP_STATES
    - Loop skips this project forever

## Unhappy Path Traces

### Error: Foundation eval fails

**Path:** foundation-eval → foundation (retry) OR escalation (semantic spin)

- `advanceState()` line 797-854
- If verdict != PASS (line 797):
  - Records fingerprint via `recordEvalFingerprint()` (line 804-809)
  - If semantic spin detected (3 identical eval reports):
    - Attempts `attemptSelfHeal()` (line 818)
    - Pushes escalation (line 826-845)
    - → **escalation**
  - Else:
    - → **foundation** (retry)

**Bug:** None (path correct)

### Error: Story building fails

**Path:** story-building → story-building (retry) OR analyzing (circuit breaker) OR escalation (spin)

- `advanceState()` line 1169-1244
- On fail (line 1169-1184):
  - `story.status = 'pending'` (line 1172)
  - `story.attempts += 1`
  - `state.consecutive_failures += 1`
  - Records fix memory (line 1175-1183)
- Spin detection (line 1196-1218):
  - If 3+ zero-delta stories OR 30min stall:
    - Pushes escalation
    - → **escalation**
- Circuit breaker (line 1221-1244):
  - If 3+ consecutive failures:
    - Writes `_circuit_breaker` flag to cycle_context (line 1226-1240)
    - → **analyzing**

**Bug:** None (path correct)

### Error: Milestone all blocked

**Path:** story-building → escalation

- `advanceState()` line 1248-1268
- If batch complete and all blocked (line 1253-1267):
  - Pushes escalation (line 1256-1264)
  - → **escalation**

**Bug:** None (path correct)

### Error: Deploy fails

**Path:** story-building → escalation

- `advanceState()` line 1270-1296
- If `deployWithRetry()` fails after 3 attempts (line 1274):
  - Pushes escalation (line 1282-1290)
  - → **escalation**

**Bug:** None (path correct)

### Error: Milestone check fails repeatedly

**Path:** milestone-check → milestone-fix → milestone-check (loop) OR escalation (semantic spin)

- `advanceState()` line 1380-1415
- Records fingerprint (line 1386-1391)
- If semantic spin detected (identical findings N times):
  - Pushes escalation (line 1394-1408)
  - → **escalation**
- Else:
  - → **milestone-fix**

**Bug:** None (path correct)

### Error: Budget cap exceeded

**Path:** (any state) → escalation

- `runPhase()` line 2112-2127
- Checks budget cap before running phase
- If exceeded:
  - Sets `current_state = 'escalation'`
  - Pushes escalation
  - Returns `{ success: false, budgetExceeded: true }`

**Bug:** BUG-006 — main loop retries 3 times instead of stopping immediately

### Error: Phase fails 3 times

**Path:** (any state) → escalation

- `main()` line 2671-2703
- After 3 retries:
  - Sets `current_state = 'escalation'`
  - Pushes escalation with `classification: 'launcher-retry-exhausted'`

**Bug:** None (path correct)

### Error: Escalation with human_response

**Path:** escalation → (resume target varies)

- `advanceState()` line 1711-1915
- Validates `human_response` (line 1724)
- If invalid:
  - Deletes `human_response`
  - Pushes new malformed escalation
  - Breaks (stays in escalation)
- If valid:
  - `type = 'guidance'`: → resume target (story-building or milestone-check or foundation-eval)
  - `type = 'manual-fix-applied'`: marks story done → resume target
  - `type = 'dismiss-false-positive'`: marks story retrying → resume target
  - `type = 'abort-story'`: marks story blocked → resume target
  - `type = 'hand-off'`: stays in escalation (line 1825)
  - `type = 'resume-after-handoff'`: captures commits → resume target

**Bug:** BUG-003 — malformed response creates two pending escalations  
**Bug:** BUG-005 — hand-off can create dangling `current_story` pointer

## Recommendations

### Fix Priority Order

1. **BUG-002 (P1)**: Add `'paused'` to `SKIP_STATES` OR remove all Slack bot writes of `paused` state
2. **BUG-001 (P1)**: Refactor pre-dispatch to call `beginStory()` instead of `advanceStory()`, or make `advanceStory()` handle the `pending → in-progress` transition
3. **BUG-006 (P2)**: Add `result.budgetExceeded` check in main loop, skip retries
4. **BUG-003 (P2)**: After malformed response, mark original escalation as blocked, not pending
5. **BUG-005 (P2)**: Clear `current_story` when hand-off is initiated if no milestone exists
6. **BUG-004 (P3)**: Call `advanceState()` after pre-dispatch advancement to log transition immediately

### Architectural Notes

- **Story status lifecycle is inconsistent**: `beginStory()` sets `in-progress`, but pre-dispatch uses `advanceStory()` which assumes the story was already `pending`. Need unified story advancement helper.

- **Pause state is ambiguous**: Comment says it was removed, Slack bot still writes it. Either restore it properly (add to SKIP_STATES, add resume logic in runPhase) or remove all Slack bot writes.

- **Escalation resolution is complex**: 6 different response types with different semantics. The malformed-response path is error-prone because it creates a second escalation while the first is still pending.

- **Pre-dispatch optimization bypasses state machine**: Lines 2131-2186 mutate state directly instead of going through advanceState(), which means checkpoints aren't written immediately. Consider refactoring to call advanceState() after pre-dispatch mutations.

## Test Coverage Gaps

1. No test for `paused` state (because it was "removed" but still written by Slack bot)
2. No test for malformed `human_response` validation
3. No test for budget cap with retries
4. No test for hand-off escalation resolution with pre-story escalations
5. No test for pre-dispatch advancement checkpoint timing

---

**Audit complete.** 6 bugs found, 2 P1 (data corruption), 2 P2 (UX confusion), 2 P3 (cosmetic).
