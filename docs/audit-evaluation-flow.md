# Evaluation Flow Audit Report

**Date:** 2026-05-03  
**Scope:** Milestone-check through escalation feedback incorporation  
**Auditor:** Claude Sonnet 4.5  

---

## Executive Summary

**Total bugs found:** 8  
**Highest severity:** P1  
**Feedback loop status:** INTACT with gaps  

The evaluation flow is architecturally sound but has **state transition race conditions**, **verdict reconciliation ambiguity**, and **missing feedback incorporation for some paths**. No data loss bugs found, but spin potential exists in edge cases.

---

## Evaluation Flow Diagram

```
                   milestone-check
                         |
                         v
    ┌────────────────────────────────────────────┐
    │  02-evaluation-orchestrator.md             │
    │  - Determine diff_scope                    │
    │  - Classify cycle_type (gate vs full)     │
    │  - Reset review_readiness_dashboard        │
    └────────────────────────────────────────────┘
                         |
         ┌───────────────┴───────────────┐
         v                               v
    [always run]                    [conditional]
         |                               |
    ┌────v────┐     ┌─────────┐    ┌────v────┐
    │ 02a     │ --> │  02c    │ -->│  02d    │
    │ test-   │     │ code-   │    │ product-│
    │ integrity│     │ review  │    │ walk    │
    └─────────┘     └─────────┘    └─────────┘
         |               |               |
         v               v               v
       FAIL?           (evidence)    (evidence)
         |               |               |
         |               +-------+-------+
         v                       v
    milestone-fix            ┌──────────┐
                             │   02e    │
                             │evaluation│
                             └──────────┘
                                  |
                         ┌────────┴────────┐
                         v                 v
                   re_walk_requests?    VERDICT
                         |                 |
                         v                 v
                      ┌──────┐       ┌─────────────┐
                      │ 02f  │       │ QA / Design │
                      │re-walk│       │ / PO        │
                      └──────┘       └─────────────┘
                         |                 |
                         +--------+--------+
                                  v
                            update gates
                                  |
                    ┌─────────────┴─────────────┐
                    v                           v
              ALL PASS?                    ANY FAIL?
                    |                           |
                    v                           v
              analyzing                  milestone-fix
                    |
         ┌──────────┴──────────┐
         v                     v
    PO quality gaps?      ALL GATES PASS
    (NEEDS_IMPROVEMENT)        |
         |                     v
         v                  promote
    analyzing              milestone
    (generates                |
     change specs)            v
                         next milestone
                            OR
                        vision-check
```

**Escalation paths:**

```
escalation
    |
    v
[human submits response via dashboard]
    |
    v
human_response written to state.escalations[N]
    |
    v
rouge-loop.js case 'escalation' reads human_response
    |
    ┌───────────┴────────────┐
    v                        v
type='guidance'        type='manual-fix-applied'
    |                        |
    v                        v
write to                 mark story done
cycle_context.human_guidance
    |                        |
    +────────────────────────+
                |
                v
         resume milestone-check
              OR
         next story-building
```

---

## Bug Checklist

### Bug 1: Verdict reconciliation undefined for PO NEEDS_IMPROVEMENT + QA PASS
- **Symptom:** When QA/Design pass but PO returns NEEDS_IMPROVEMENT, milestone-check routes to milestone-fix (per line 1378), but 02e-evaluation.md says "NEEDS_IMPROVEMENT → analyzing, these become new specs" (line 260). Conflicting routing instructions.
- **Root cause:** `rouge-loop.js:1378` treats `poVerdict === 'NEEDS_IMPROVEMENT'` as a hard failure routing to milestone-fix. But `02e-evaluation.md:260` and `04-analyzing.md:259` say NEEDS_IMPROVEMENT quality gaps are NOT bugs — they need re-specification via analyzing.
- **Impact:** Medium frequency. Occurs when product is functionally correct but quality is below bar. Loop routes to milestone-fix (which tries to patch code), when it should route to analyzing (which generates new specs for quality improvements).
- **Severity:** **P1** — causes wrong fix strategy, wastes cycles on code fixes when specs need refinement.
- **Fix:** Change `rouge-loop.js:1378` to exclude `NEEDS_IMPROVEMENT` from milestone-fix routing. Only `NOT_READY` should route to milestone-fix. `NEEDS_IMPROVEMENT` should pass to analyzing, which then decides whether to generate change specs (deepen) or promote.

---

### Bug 2: Design verdict "NEEDS_IMPROVEMENT" does not exist in 02e-evaluation.md
- **Symptom:** `rouge-loop.js:1377` checks for `designVerdict === 'NEEDS_IMPROVEMENT'`, but `02e-evaluation.md` only defines `design.verdict: PASS | FAIL` (line 122, 216). No "NEEDS_IMPROVEMENT" verdict exists for Design lens.
- **Root cause:** Mismatch between launcher expectations and prompt output schema.
- **Impact:** Low frequency (depends on whether 02e ever emits this non-standard verdict).
- **Severity:** **P2** — if 02e does emit NEEDS_IMPROVEMENT for design, launcher treats it as failure and routes to milestone-fix. If 02e never emits it, the check is dead code.
- **Fix:** Either (a) remove the `designVerdict === 'NEEDS_IMPROVEMENT'` check from rouge-loop.js, or (b) add NEEDS_IMPROVEMENT as a valid Design verdict in 02e with clear routing semantics.

---

### Bug 3: Re-evaluation after analyzing change specs does not re-run full milestone-check
- **Symptom:** `04-analyzing.md:81` mentions cycle_type "re-evaluation" when "PO Review requested re-check after analyzing phase generated new specs." But `02-evaluation-orchestrator.md:80-86` says cycle_type is detected from `previous_phase` and task classification. No explicit re-evaluation trigger exists in rouge-loop.js after analyzing → generating-change-spec → story-building → milestone-check.
- **Root cause:** `rouge-loop.js:1440-1443` milestone-fix → milestone-check is the only re-evaluation path. But analyzing (deepen) → generating-change-spec → story-building → milestone-check does NOT set `previous_phase = 'analyzing'` in cycle_context, so 02-evaluation-orchestrator cannot distinguish a post-analyzing re-evaluation from a normal feature-build cycle.
- **Impact:** Medium frequency. Every time analyzing recommends deepen, the next evaluation cycle will use wrong tier (feature-build instead of re-evaluation), possibly skipping PO lens when it should run.
- **Severity:** **P1** — PO lens may be incorrectly skipped, allowing quality regressions to slip through.
- **Fix:** rouge-loop.js should write `cycle_context.previous_phase = 'analyzing'` before dispatching milestone-check after a deepen cycle completes.

---

### Bug 4: Escalation feedback (human_guidance) only injected if escalation handler runs BEFORE next phase
- **Symptom:** User submits escalation response via dashboard. `human_guidance` is written to `cycle_context.json` by rouge-loop.js:1774 ONLY when escalation state handler runs. But if the project is in milestone-check or story-building when the response is submitted, the escalation handler won't run until the current phase completes and returns to escalation state.
- **Root cause:** State machine limitation. `case 'escalation'` only runs when `state.current_state === 'escalation'`. But phases that DON'T route through escalation (e.g., milestone-check → analyzing → story-building) never read the escalation response until the next time the loop enters escalation state — which may never happen if milestone-check keeps passing.
- **Impact:** Low frequency (only for guidance responses during non-escalation phases), but when it occurs, user feedback is silently ignored for multiple cycles.
- **Severity:** **P1** — breaks user feedback loop. Human provides guidance, loop ignores it, human sees no effect.
- **Fix:** rouge-loop.js should check for pending escalations with `human_response` at the START of every tick (before the case switch), not just in `case 'escalation'`. Process the response immediately and write to cycle_context before dispatching the next phase.

---

### Bug 5: Re-walk infinite loop not capped in 02-evaluation-orchestrator
- **Symptom:** `02-evaluation-orchestrator.md:226` says "Cap at one re-walk iteration per evaluation run." But the orchestrator prompt does not actually enforce this cap — it says "re-run only Sub-Phase 3 (Evaluation)" after re-walk, and "If the re-walked evaluation still has `re_walk_requests`, surface the gap in `evaluator_observations` and proceed."
- **Root cause:** The cap is stated as a rule but not implemented as a counter check in the orchestrator logic.
- **Impact:** Low frequency (requires 02f to keep requesting re-walks), but theoretically possible if 02e and 02f disagree on what evidence is sufficient.
- **Severity:** **P2** — spin risk. If 02e keeps requesting re-walks and 02f keeps fulfilling them, the loop could spin indefinitely within a single milestone-check invocation.
- **Fix:** 02-evaluation-orchestrator.md Step 3 Sub-Phase 4 should check `cycle_context.re_walk_count` (default 0) before running 02f. If count >= 1, skip 02f and log the gap. Increment the counter when 02f runs.

---

### Bug 6: Semantic spin detection only fires for milestone-check → milestone-fix, not for story-level spins
- **Symptom:** `rouge-loop.js:1386-1413` detects semantic spin when milestone-check returns the same verdict N times. But story-level spin (same story fails N times with identical findings) is NOT detected — the circuit breaker (consecutive_failures counter) triggers after 3 failures, but it doesn't fingerprint the findings, so it can't detect when the SAME issue recurs vs when different issues occur.
- **Root cause:** `recordEvalFingerprint` is only called for milestone-check (line 1386), not for story-building QA failures.
- **Impact:** Low-medium frequency. Story-level spin would be caught by circuit breaker after 3 failures, but those 3 failures could be 3 attempts at the SAME unfixable issue, burning budget unnecessarily.
- **Severity:** **P2** — wastes budget, but circuit breaker eventually escalates anyway.
- **Fix:** Call `recordEvalFingerprint` for story-level QA failures before incrementing consecutive_failures. If spin is detected at story level, escalate immediately instead of waiting for 3 failures.

---

### Bug 7: PO improvement_items with scope="this-milestone" can block promotion indefinitely
- **Symptom:** `04-analyzing.md:303-308` says if validated `this-milestone` improvement_items exist AND recommendation would otherwise be `promote`, override to `deepen:improvements`. But `04-analyzing.md:311-320` convergence guardrail only triggers after "2+ consecutive `deepen:improvements` cycles AND confidence delta is within +/-0.02." If confidence keeps improving slightly (delta > 0.02), the guardrail never fires, and the loop never promotes.
- **Root cause:** Convergence guardrail checks for plateau (confidence stable) but doesn't check for "improvement items persist across N cycles." If the loop keeps finding new this-milestone improvement items (or re-discovering old ones with different phrasing), it can deepen forever.
- **Impact:** Low frequency (requires 02e to keep emitting this-milestone items), but theoretically unbounded.
- **Severity:** **P2** — can prevent promotion indefinitely if 02e is overly critical or if the product is in a local quality maximum.
- **Fix:** Add a hard cap: if deepen:improvements has run 5+ times for the same milestone, promote anyway and move all remaining improvement_items to global_improvements.json. Log a phase_decision explaining the cap was reached.

---

### Bug 8: human_resolution from hand-off session not visible to 02e-evaluation.md
- **Symptom:** When user chooses "hand-off" escalation response, works in direct Claude Code session, then submits "resume-after-handoff", `rouge-loop.js:1841` writes `cycle_context.human_resolution` with commits and files_changed. But `02e-evaluation.md` does NOT read `human_resolution` — it only reads `evaluation_report`, `code_review_report`, `product_walk`, `active_spec`, `vision`. The human's fix context is invisible to the evaluation phase.
- **Root cause:** `02e-evaluation.md:16` "What You Read" section does not list `human_resolution`. The preamble-injector injects it into the prompt (line 152), but 02e prompt does not reference it, so Claude may ignore it.
- **Impact:** Low frequency (hand-off is rare), but when it occurs, evaluation may re-flag the same issue the human just fixed because it can't see the resolution context.
- **Severity:** **P2** — breaks hand-off feedback loop. Human fixes issue, evaluation doesn't acknowledge the fix.
- **Fix:** Add `human_resolution` to 02e-evaluation.md "What You Read" section with instructions: "If present, this contains commits from a human hand-off session. Check whether any findings in your evaluation were already addressed by these commits before emitting fix_tasks."

---

## Happy Path Trace

### Full evaluation after feature build (all pass)

1. **Trigger:** Story completes, milestone has no more pending stories → `rouge-loop.js` transitions to `milestone-check`
2. **milestone-check handler:** Reads `cycle_context.json`, checks for escalations with responses (line 1712), none found → dispatches `02-evaluation-orchestrator.md`
3. **02-evaluation-orchestrator Step 1:** Runs `src/rouge-diff-scope.sh`, writes `diff_scope` to `cycle_context.json`
4. **02-evaluation-orchestrator Step 1.5:** Classifies cycle_type from `previous_phase` and task classification, writes `evaluation_tier` (gate or full)
5. **02-evaluation-orchestrator Step 2:** Resets review_readiness_dashboard gates that will be re-earned
6. **02-evaluation-orchestrator Step 3 Sub-Phase 0:** Dispatches `02a-test-integrity.md` → verifies spec-test traceability → writes `test_integrity_report` → on PASS, proceeds
7. **02-evaluation-orchestrator Step 3 Sub-Phase 1:** Dispatches `02c-code-review.md` → runs ESLint, jscpd, madge, knip, npm audit → AI audit → security review → writes `code_review_report`
8. **02-evaluation-orchestrator Step 3 Sub-Phase 2:** Dispatches `02d-product-walk.md` (if frontend changed) → navigates staging URL → screenshots, interactive elements, journeys, Lighthouse → writes `product_walk`
9. **02-evaluation-orchestrator Step 3 Sub-Phase 3:** Dispatches `02e-evaluation.md` → reads `code_review_report` + `product_walk` → applies QA/Design/PO lenses → writes `evaluation_report` with verdicts
10. **02-evaluation-orchestrator Step 4:** Runs `src/review-readiness.sh status` and `check` → logs final dashboard state → writes `evaluator_observations`
11. **02-evaluation-orchestrator routing:** All verdicts PASS → writes `cycle_context.next_phase = "analyzing"` → commits
12. **milestone-check handler (line 1365-1378):** Reads verdicts from `evaluation_report`, all PASS → line 1434: `next = 'analyzing'`
13. **rouge-loop.js state transition (line 1450):** Enters `case 'analyzing'`, dispatches `04-analyzing.md`
14. **04-analyzing:** Reads `evaluation_report.po` → confidence >= 0.9, no critical gaps → `recommendation: "promote"` → writes `analysis_recommendation`
15. **analyzing handler (line 1495):** Reads `action = 'promote'` → marks milestone done → calls `promoteMilestone()` → transitions to next milestone OR `vision-check` if all milestones done
16. **End state:** Milestone promoted, next milestone starts OR project ships

**Data flow verified:** cycle_context.json written by each sub-phase → read by next sub-phase → final evaluation_report read by launcher → analyzing reads evaluation_report → launcher reads analysis_recommendation → state.json updated.

---

### Evaluation finds QA failures (bugs)

1-10. **Same as happy path** through evaluation
11. **02-evaluation-orchestrator routing:** QA verdict FAIL → writes `cycle_context.next_phase = "milestone-fix"`, includes `fix_tasks[]` from `evaluation_report.qa.fix_tasks`
12. **milestone-check handler (line 1380):** `qaVerdict === 'FAIL'` → line 1415: `next = 'milestone-fix'`
13. **milestone-fix handler (line 1440):** After fixes applied, transitions to `milestone-check` (line 1442)
14. **Re-evaluation:** milestone-check runs again (Steps 1-11 repeat) → if fixes worked, verdicts PASS → analyzing → promote

**Loop convergence:** milestone-fix attempts repairs, milestone-check re-evaluates. If fixes don't resolve issues, semantic spin detection (line 1386-1413) catches repeated identical verdicts after N cycles and escalates.

---

## Unhappy Path Traces

### Path 1: PO NEEDS_IMPROVEMENT but QA/Design pass

**Current behavior (BUG #1):**
1. 02e-evaluation returns `qa.verdict: PASS`, `design.verdict: PASS`, `po.verdict: NEEDS_IMPROVEMENT`
2. milestone-check handler (line 1378) sees `poVerdict === 'NEEDS_IMPROVEMENT'` → routes to milestone-fix
3. milestone-fix receives NO fix_tasks from QA (because QA passed) → may attempt to "fix" design issues, but the root cause is quality gaps needing new specs, not bugs
4. milestone-check re-evaluates → PO NEEDS_IMPROVEMENT persists → milestone-fix loop

**Expected behavior:**
1. 02e-evaluation returns NEEDS_IMPROVEMENT
2. milestone-check handler passes to analyzing (no lens failed hard)
3. analyzing reads `po.quality_gaps`, classifies root causes, generates change_spec_briefs
4. analyzing recommends `deepen:<area>` → routes to `generating-change-spec` → new specs written → story-building implements them
5. milestone-check re-evaluates with improved product → PO confidence increases → promote

**Break:** Line 1378 treats NEEDS_IMPROVEMENT as hard failure. Should only treat NOT_READY as hard failure.

---

### Path 2: Evaluation timeout or crash

**Current behavior:**
1. 02-evaluation-orchestrator runs, sub-phase crashes (e.g., browser timeout, OOM)
2. Prompt execution fails, launcher catches error (line 2382 in runPrompt)
3. No `evaluation_report` written to cycle_context.json
4. milestone-check handler (line 1365) reads `ctx?.evaluation_report?.qa?.verdict || 'PASS'` → defaults to PASS
5. Loop advances to analyzing with NO evaluation data

**Risk:** False PASS on crash. Loop promotes broken milestone.

**Mitigation needed:** milestone-check handler should check if `evaluation_report` exists before reading verdicts. If missing after running milestone-check phase, should escalate with "evaluation failed to produce report."

---

### Path 3: Browser QA can't reach staging URL

**Current behavior:**
1. 02d-product-walk tries to navigate to `deployment_url`
2. URL is down (deploy failed, staging crashed, network issue)
3. 02d logs error, may write partial `product_walk` or empty screens[]
4. 02e-evaluation reads empty/partial product_walk → may emit `unknown` verdicts for criteria
5. 02e-evaluation (line 266) says if denominator is 0 (all criteria unknown), verdict FAIL with "insufficient-evidence"
6. milestone-check routes to milestone-fix → but there's nothing to fix, the issue is environment

**Expected:** Should escalate to human with "staging unreachable" reason, not route to milestone-fix.

**Current mitigation:** 02e treats `unknown` criteria as re-walk requests. If staging is unreachable, re-walk will also fail, and after 1 re-walk attempt (per Bug #5 cap), evaluation proceeds with insufficient evidence → FAIL → milestone-fix → semantic spin detection eventually escalates.

**Improvement:** 02d-product-walk should detect "staging unreachable" (e.g., connection refused, 503 for every route) and write an explicit flag to `product_walk.staging_unreachable = true`. 02e reads this flag and routes directly to escalation instead of attempting evaluation.

---

### Path 4: PO verdict contradicts QA verdict

**Scenario:** QA PASS (all criteria met), PO NOT_READY (confidence < 0.7, rubric scores show systemic quality issues)

**Current behavior:**
1. 02e-evaluation: `qa.verdict: PASS`, `po.verdict: NOT_READY`
2. milestone-check handler (line 1378): `poVerdict === 'NOT_READY'` → lensFail = true → routes to milestone-fix
3. milestone-fix receives NO fix_tasks from QA (because QA passed) → receives quality gaps from PO
4. milestone-fix attempts to implement quality improvements (which should be change specs, not bug fixes)

**Expected behavior:** PO NOT_READY should route to analyzing (with capability-check per 04-analyzing Step 0), not milestone-fix. Analyzing determines if gaps are fixable autonomously or need human judgment.

**Current mitigation:** milestone-fix phase is flexible enough to handle quality gaps, but it's the wrong phase semantically. milestone-fix is for bugs. PO gaps are strategic, not bugs.

**Correct routing:** Line 1378 should only route to milestone-fix if QA FAIL OR Design FAIL. PO NOT_READY should pass through to analyzing, which then decides escalation vs deepen vs broaden.

---

### Path 5: Story fails, fix applied, re-evaluation sees same issues (spin)

**Story-level spin (before milestone-check):**
1. Story-building completes
2. Story QA phase evaluates → finds bugs → writes fix_memory
3. Builder fixes bugs, story QA re-evaluates → same bugs found
4. Repeat 3x → consecutive_failures counter hits 3 → circuit breaker (line 2550) calls analyzing with `_circuit_breaker = true`
5. analyzing produces `mid_loop_correction` with corrective instruction
6. Loop resumes with injected context

**Milestone-level spin (after milestone-check):**
1. milestone-check evaluates → PO NEEDS_IMPROVEMENT
2. Routes to milestone-fix → fixes applied
3. milestone-check re-evaluates → same PO verdict and findings
4. Repeat N times → `recordEvalFingerprint` (line 1386) detects identical findings → escalates with "semantic-spin"

**Gap (Bug #6):** Story-level spin is detected by counter (not fingerprint), so it can't distinguish "same issue 3 times" from "3 different issues." Milestone-level spin uses fingerprint, which is more precise.

---

## Feedback Loop Verification

### User submits escalation response with text → where does it go?

**Path 1: Guidance response**

1. **User action:** Dashboard submits `{ type: 'guidance', text: '<instructions>', submitted_at: '<ISO>' }` to `state.escalations[N].human_response`
2. **Launcher reads:** `rouge-loop.js` tick, enters `case 'escalation'` (line 1711)
3. **Validation:** Line 1724 validates human_response shape
4. **Processing:** Line 1772-1782 reads `type === 'guidance'`, writes `cycle_context.human_guidance = text`
5. **Resume:** Line 1780 picks resume target (next story or milestone-check)
6. **Preamble injection:** Next phase runs, `preamble-injector.js:197` reads `cycle_context.human_guidance`, injects into phase prompt as `## Human Guidance\n\n{text}`
7. **Phase sees it:** Phase reads preamble, sees guidance, incorporates into decisions

**VERIFIED:** Guidance text reaches next phase via cycle_context + preamble.

---

**Path 2: Manual-fix-applied response**

1. **User action:** Dashboard submits `{ type: 'manual-fix-applied', text: '<what was fixed>', submitted_at: '<ISO>' }` to `state.escalations[N].human_response`
2. **Launcher reads:** `rouge-loop.js` `case 'escalation'` (line 1783)
3. **Processing:** Marks story done (line 1786), does NOT write to cycle_context (fix is already in git)
4. **Resume:** Line 1788 picks resume target
5. **Next evaluation:** milestone-check runs, evaluation sees the fixed code (via git diff), judges it

**VERIFIED:** Manual fix is visible via git, no explicit cycle_context entry needed.

---

**Path 3: Hand-off → resume-after-handoff**

1. **User action 1:** Dashboard submits `{ type: 'hand-off' }` → launcher parks in escalation state (line 1825)
2. **User works:** Direct Claude Code session, makes commits
3. **User action 2:** Dashboard submits `{ type: 'resume-after-handoff', text: '<summary>' }` to `state.escalations[N].human_response`
4. **Launcher reads:** Line 1826, captures commits since `handoff_started_at` (line 1832)
5. **Writes:** `cycle_context.human_resolution = { note, commits, files_changed }` (line 1841)
6. **Resume:** Line 1856 resumes next story or milestone-check
7. **Preamble injection:** Next phase runs, `preamble-injector.js:200` reads `cycle_context.human_resolution`, injects into phase prompt
8. **Phase sees it:** Phase reads preamble, sees resolution commits and note

**VERIFIED with GAP (Bug #8):** human_resolution is injected by preamble, but 02e-evaluation.md does not explicitly reference it in "What You Read." Claude may see it in the preamble but not know to check findings against it.

---

### Does the next phase see the feedback?

**Yes, via preamble injection**, UNLESS:

- **Bug #4:** User submits escalation response while project is in milestone-check or story-building (not escalation state). Response is attached to escalation object but not processed until loop returns to escalation state. If milestone-check keeps passing, loop may never return to escalation, and response is never processed.

**Fix verification:** preamble-injector reads cycle_context at phase start. If human_guidance or human_resolution are present, they are injected. But the launcher must WRITE them to cycle_context first, which only happens in `case 'escalation'`.

**Recommendation:** Launcher should check for `escalations[].human_response` at the START of every tick (before the case switch), process the response immediately, and write to cycle_context. Then every subsequent phase will see the feedback.

---

### Does it affect the next evaluation?

**Guidance:** Yes, via preamble. But evaluation phases (02a-02e) do not explicitly read human_guidance — they read cycle_context fields like evaluation_report, product_walk, code_review_report. Guidance is meant for builder phases (story-building, milestone-fix), not evaluators.

**Manual-fix-applied:** Yes, evaluation sees fixed code via git diff.

**Resume-after-handoff:** Partial (Bug #8). 02e-evaluation does NOT read human_resolution in its "What You Read" section, so it may re-flag issues the human fixed.

---

## State Transitions

### Which states can milestone-check transition to?

1. **milestone-fix** (line 1415) — when any lens fails (QA FAIL, Design FAIL/NEEDS_IMPROVEMENT, PO NOT_READY/NEEDS_IMPROVEMENT)
2. **analyzing** (line 1434) — when all lenses pass
3. **escalation** (line 1410) — when semantic spin detected (same verdict N times)

**Not possible from milestone-check:** story-building, foundation, vision-check, shipping. Those require analyzing or other intermediaries.

---

### Which states can analyzing transition to?

From `rouge-loop.js` `case 'analyzing'` (line 1450):

1. **foundation** (line 1462) — when `action === 'insert-foundation'`
2. **story-building** (line 1485, via `startStory`) — when circuit-breaker mid-loop correction applied and eligible story exists
3. **milestone-check** (line 1490) — when circuit-breaker correction applied but no eligible stories
4. **next milestone story-building** (line 1505) — when `action === 'continue'` or `'promote'`, milestone marked done, next milestone has stories
5. **vision-check** (line 1512) — when `action === 'continue'` or `'promote'`, milestone marked done, no more milestones
6. **generating-change-spec** (implicit, line 1454 action check) — when `action.startsWith('deepen')` or `action === 'broaden'`
7. **escalation** (line 1564) — when `action === 'notify-human'` or other escalation conditions (not explicitly shown in this section, but analyzing escalate() calls route here)

**Not directly possible:** milestone-fix, foundation-eval, shipping. Those require other intermediaries.

---

## Story Generation Race Condition Check

**Question:** When analyzing says "generate fix stories", who writes them to task_ledger? Is there a race between task_ledger updates and state.json updates?

**Answer:** Task ledger writes are ONLY permitted by `05-generating-change-spec.md` phase (per CLAUDE.md line 158). Analyzing writes `change_spec_briefs[]` to `cycle_context.json` (not task_ledger). The launcher then routes to `generating-change-spec` phase, which reads the briefs and writes task_ledger.

**Flow:**
1. analyzing writes `analysis_recommendation.action = 'deepen:<area>'` + `analysis_result.change_spec_briefs[]` to cycle_context
2. Launcher reads `action.startsWith('deepen')` (rouge-loop.js line 1454 logic, not shown in offset but implied by action check)
3. Launcher transitions to `generating-change-spec`
4. generating-change-spec reads briefs, generates full specs, writes to task_ledger.json
5. Launcher transitions to story-building

**Race check:** No race. Analyzing does NOT write task_ledger. Only generating-change-spec writes task_ledger (gated by launcher). state.json and cycle_context.json are written sequentially (state via commitState, cycle_context via Claude writes in phase prompts).

**Concurrency:** Rouge is single-threaded per project (one launcher process per project directory). No concurrent writes possible.

---

## Recommendations

### Priority 1 (Fix immediately)

1. **Bug #1:** Change rouge-loop.js:1378 verdict reconciliation. PO NEEDS_IMPROVEMENT should NOT route to milestone-fix.
2. **Bug #3:** Write `cycle_context.previous_phase = 'analyzing'` when routing from analyzing-deepen back to milestone-check.
3. **Bug #4:** Check for escalations with human_response at every tick start, process immediately before case switch.

### Priority 2 (Fix in next sprint)

4. **Bug #2:** Clarify Design verdict schema (remove NEEDS_IMPROVEMENT or define it properly).
5. **Bug #5:** Add re-walk counter cap in 02-evaluation-orchestrator.
6. **Bug #6:** Add semantic spin detection for story-level failures.
7. **Bug #7:** Add hard cap on deepen:improvements cycles (5 max).
8. **Bug #8:** Add human_resolution to 02e-evaluation "What You Read" section.

### Priority 3 (Nice to have)

9. **Path 3 mitigation:** 02d should detect "staging unreachable" and set explicit flag, 02e routes to escalation.
10. **Path 2 mitigation:** milestone-check handler should check if evaluation_report exists before reading verdicts.

---

## Audit Conclusion

The evaluation flow is **structurally sound** but has **8 bugs ranging from P1 to P2**. The feedback loop is **INTACT** for most paths, but has gaps:

- **Guidance feedback:** Works when escalation state is entered, but delayed if project is in non-escalation state when response is submitted (Bug #4).
- **Manual-fix feedback:** Works correctly, visible via git.
- **Hand-off feedback:** Partially works, but 02e-evaluation does not explicitly check human_resolution (Bug #8).

**Highest priority fix:** Bug #1 (verdict reconciliation). This breaks the intended NEEDS_IMPROVEMENT → analyzing → deepen flow, forcing quality improvements through the wrong (milestone-fix) path.

**No data loss bugs found.** All findings are routing logic bugs, not data corruption bugs.
