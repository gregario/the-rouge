# Rouge Build Loop + Evaluation Flow - Bug Fix Checklist

**Date:** 2026-05-03  
**Source:** Combined audit from build-loop-state-machine.md + audit-evaluation-flow.md  
**Total bugs:** 14 (5 P1, 7 P2, 2 P3)

---

## Priority 1 (P1) - Data Corruption / Critical Flow Breaks

### BUILD-001: Stories skip in-progress status via pre-dispatch
- **File:** `src/launcher/rouge-loop.js:2148`
- **Symptom:** highlow progressing through stories but not marking them in-progress
- **Fix:** Make `advanceStory()` set `story.status = 'in-progress'` OR refactor pre-dispatch to call `beginStory()`
- **Test:** Create story, advance via pre-dispatch path, verify status transitions pending → in-progress → done
- **Status:** ⬜ TODO

### BUILD-002: Paused state not in SKIP_STATES, loop continues
- **File:** `src/launcher/rouge-loop.js:235` + `src/slack/bot.js:798,946,961,963,1074`
- **Symptom:** uat-test marked paused but progressed through a story
- **Fix:** Add `'paused'` to SKIP_STATES OR remove all Slack bot writes of paused (check ROUGE_SLACK_ALLOW_WRITES deprecation status first)
- **Test:** Pause via Slack, verify loop skips project
- **Status:** ⬜ TODO

### EVAL-001: PO NEEDS_IMPROVEMENT routes to milestone-fix instead of analyzing
- **File:** `src/launcher/rouge-loop.js:1378`
- **Symptom:** Quality improvements attempted via milestone-fix (bug fixes) instead of analyzing (new specs)
- **Fix:** Change line 1378 to only route to milestone-fix if QA FAIL or Design FAIL. Let NEEDS_IMPROVEMENT pass to analyzing.
- **Test:** Evaluation returns qa=PASS, po=NEEDS_IMPROVEMENT → verify routes to analyzing not milestone-fix
- **Status:** ⬜ TODO

### EVAL-003: Re-evaluation cycle not detected after analyzing deepen
- **File:** `src/launcher/rouge-loop.js` (before milestone-check dispatch after deepen cycle)
- **Symptom:** PO lens may be skipped after analyzing generates specs, wrong evaluation tier used
- **Fix:** Write `cycle_context.previous_phase = 'analyzing'` before dispatching milestone-check after deepen
- **Test:** analyzing recommends deepen → specs generated → milestone-check runs → verify cycle_type=re-evaluation in cycle_context
- **Status:** ⬜ TODO

### EVAL-004: Escalation feedback delayed if project not in escalation state
- **File:** `src/launcher/rouge-loop.js` (main loop start, before case switch)
- **Symptom:** User submits guidance during milestone-check, feedback not seen until loop returns to escalation (may never happen)
- **Fix:** Check for escalations with human_response at start of every tick, process immediately, write to cycle_context
- **Test:** Submit guidance while in milestone-check state → verify next phase sees it in preamble
- **Status:** ⬜ TODO

---

## Priority 2 (P2) - UX Confusion / Waste

### BUILD-003: Malformed human_response creates two pending escalations
- **File:** `src/launcher/rouge-loop.js:1740`
- **Symptom:** Dashboard shows two escalations, unclear which to resolve
- **Fix:** After detecting malformed response, mark original escalation as `blocked` not `pending`
- **Test:** Submit malformed response → verify only new malformed escalation is pending
- **Status:** ⬜ TODO

### BUILD-005: Hand-off can create dangling current_story pointer
- **File:** `src/launcher/rouge-loop.js:1850-1852`
- **Symptom:** Dashboard shows story id that doesn't exist after hand-off resolution
- **Fix:** Clear `current_story` when hand-off initiated if no milestone exists OR add fallback to null-check resumeStory
- **Test:** Escalate during foundation, hand-off, resume → verify no dangling pointer
- **Status:** ⬜ TODO

### BUILD-006: Budget cap escalation retries 3 times instead of stopping
- **File:** `src/launcher/rouge-loop.js:2667-2669`
- **Symptom:** Project hits budget cap, loop wastes budget on 3 doomed retries
- **Fix:** Check `result.budgetExceeded` in main loop, skip retries
- **Test:** Set budget cap low, exceed it → verify immediate escalation, no retries
- **Status:** ⬜ TODO

### EVAL-002: Design verdict "NEEDS_IMPROVEMENT" undefined in schema
- **File:** `src/prompts/loop/02e-evaluation.md` vs `src/launcher/rouge-loop.js:1377`
- **Symptom:** Launcher checks for designVerdict === 'NEEDS_IMPROVEMENT' but 02e only defines PASS|FAIL
- **Fix:** Remove the check from rouge-loop.js OR add NEEDS_IMPROVEMENT to 02e schema with routing rules
- **Test:** Check 02e output schema, verify it matches launcher expectations
- **Status:** ⬜ TODO

### EVAL-005: Re-walk infinite loop not capped
- **File:** `src/prompts/loop/02-evaluation-orchestrator.md:226`
- **Symptom:** If 02e and 02f disagree on evidence sufficiency, could spin indefinitely
- **Fix:** Add `cycle_context.re_walk_count` counter, cap at 1 re-walk per evaluation run
- **Test:** Force 02e to keep requesting re-walks → verify caps at 1
- **Status:** ⬜ TODO

### EVAL-006: Story-level spin uses counter not fingerprint
- **File:** `src/launcher/rouge-loop.js` (story-building failure path)
- **Symptom:** Circuit breaker fires after 3 failures even if they're 3 DIFFERENT issues
- **Fix:** Call recordEvalFingerprint for story QA failures, detect semantic spin, escalate immediately
- **Test:** Story fails 3x with same issue → verify semantic spin escalation, not circuit breaker
- **Status:** ⬜ TODO

### EVAL-007: PO improvement_items can block promotion indefinitely
- **File:** `src/prompts/loop/04-analyzing.md:303-320`
- **Symptom:** Loop keeps deepening if confidence improves slightly, never promotes
- **Fix:** Add hard cap: after 5 deepen:improvements cycles, promote anyway
- **Test:** Force analyzing to deepen 5+ times → verify caps and promotes
- **Status:** ⬜ TODO

### EVAL-008: human_resolution not visible to 02e-evaluation
- **File:** `src/prompts/loop/02e-evaluation.md` (What You Read section)
- **Symptom:** After hand-off fix, evaluation re-flags same issue because can't see resolution context
- **Fix:** Add human_resolution to 02e "What You Read" with instructions to check findings against it
- **Test:** Hand-off session fixes issue → milestone-check runs → verify 02e doesn't re-flag
- **Status:** ⬜ TODO

---

## Priority 3 (P3) - Cosmetic / Timing

### BUILD-004: Pre-dispatch advancement doesn't log transition immediately
- **File:** `src/launcher/rouge-loop.js:2149`
- **Symptom:** Dashboard shows story advanced but checkpoint timeline has gap
- **Fix:** Call advanceState() after pre-dispatch advancement to log immediately
- **Test:** Pre-dispatch advances story → verify checkpoint logged immediately
- **Status:** ⬜ TODO

---

## Fix Order (by dependency + impact)

1. ✅ EVAL-004 (escalation feedback at tick start) — unblocks feedback for all other fixes
2. ✅ EVAL-001 (verdict reconciliation) — fixes most common quality improvement path
3. ✅ BUILD-001 (in-progress status) — fixes visible UX bug
4. ✅ BUILD-002 (paused state) — fixes data corruption
5. ✅ EVAL-003 (re-evaluation detection) — fixes evaluation tier selection
6. ✅ BUILD-006 (budget retries) — stops waste
7. ✅ EVAL-008 (human_resolution visibility) — completes feedback loop
8. ✅ BUILD-003 (malformed escalation) — edge case but clean
9. ✅ EVAL-002 (design verdict schema) — clean up dead code or add schema
10. ✅ EVAL-005 (re-walk cap) — prevent spin
11. ✅ EVAL-006 (story-level fingerprint) — better spin detection
12. ✅ EVAL-007 (deepen cap) — prevent infinite quality pursuit
13. ✅ BUILD-005 (dangling pointer) — edge case cleanup
14. ✅ BUILD-004 (checkpoint timing) — cosmetic

---

## Test Strategy

After all fixes:
1. Run existing test suite: `npm test`
2. Manual integration test: seed XS project → build → force evaluation failures → verify routing
3. Verify both real symptoms resolved:
   - Create new project, watch story status transitions
   - Pause via Slack (if ROUGE_SLACK_ALLOW_WRITES), verify loop skips
4. Commit all fixes as atomic commits (one per bug where possible)

---

**Status: 8/14 complete**

## Fixed (2026-05-03)

- ✅ EVAL-004: Escalation feedback now checked at every tick start
- ✅ EVAL-001: PO NEEDS_IMPROVEMENT routes to analyzing (not milestone-fix)
- ✅ EVAL-002: Removed designVerdict NEEDS_IMPROVEMENT check (doesn't exist in schema)
- ✅ BUILD-002: Added 'paused' to SKIP_STATES
- ✅ EVAL-003: previous_phase='analyzing' written before re-evaluation
- ✅ BUILD-006: Budget cap skips retries
- ✅ EVAL-008: human_resolution added to 02e "What You Read"
- ✅ BUILD-003: Malformed escalation marks original as blocked
- ✅ EVAL-005: Re-walk counter cap added to orchestrator
- ✅ EVAL-006: Story-level semantic spin detection added
- ✅ EVAL-007: Hard cap (5 cycles) added to deepen:improvements
- ✅ BUILD-005: Hand-off clears current_story if no milestone exists
- ✅ BUILD-004: Checkpoint written after pre-dispatch advancement

## Remaining

- ⬜ BUILD-001: Audit agent misread — advanceStory() DOES set in-progress. Need to verify actual symptom.
