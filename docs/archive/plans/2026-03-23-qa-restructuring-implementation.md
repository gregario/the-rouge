# QA Restructuring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the monolithic QA gate + separate PO review with observe-once, judge-through-lenses architecture. Add incremental QA. Add final production readiness walkthrough.

**Architecture:** Three new phases (code-review, product-walk, evaluation) replace four old phases (qa-gate, po-review-journeys, po-review-screens, po-review-heuristics). Backwards compatible: evaluation writes to existing `qa_report` + `po_review_report` keys so analyzing phase and eval suite work unchanged.

**Tech Stack:** Node.js launcher (rouge-loop.js), Markdown phase prompts, GStack browser ($B commands), Slack bot (Bolt.js)

**Design doc:** `docs/plans/2026-03-23-qa-restructuring-design.md`

---

### Task 1: Write the code-review prompt

**Files:**
- Create: `src/prompts/loop/02c-code-review.md`

**Step 1: Write the prompt**

The code-review prompt replaces QA sub-checks 4 (code quality), 5 (AI code audit), and 6 (security review). ~100 lines. It must:

- Read `cycle_context.json` for `active_spec`, `diff_scope`, `implemented`, `previous_cycles`
- Run CLI tools: ESLint, jscpd, madge, knip, npm audit, file size analysis
- Run AI code audit (7 dimensions from the existing QA prompt — copy verbatim)
- Run security review (5 OWASP categories) only when `diff_scope.backend == true`
- For incremental: scope to changed files only (use `git diff --name-only HEAD~1`)
- Write `code_review_report` to cycle_context.json with: code_quality_baseline, ai_code_audit, security_review
- Do NOT write to `qa_report` — that's the evaluation phase's job
- Emit progress events: "ESLint: 0 errors", "Code audit: 87/100", "Security: PASS"
- Commit any generated reports: `git commit -m "eval(code-review): cycle <N> — audit <score>/100"`

**Step 2: Verify prompt is self-contained**

Read it as if you have zero context. Can an opus session follow it without ambiguity? Check:
- Are all file paths absolute or relative to project dir?
- Are all CLI commands complete with flags?
- Is the output schema fully specified?
- Are scope conditions (when to skip security) clear?

**Step 3: Commit**

```bash
git add src/prompts/loop/02c-code-review.md
git commit -m "feat(prompt): add code-review phase prompt — engineering lens"
```

---

### Task 2: Write the product-walk prompt

**Files:**
- Create: `src/prompts/loop/02d-product-walk.md`

**Step 1: Write the prompt**

The product-walk prompt is pure observation — it does NOT judge. ~150 lines. It must:

- Read `cycle_context.json` for `deployment_url`, `active_spec`, `vision` (for journey definitions), `diff_scope`
- Determine walk scope:
  - Full build or first cycle: full protocol on all screens
  - Incremental: full protocol on changed screens (from `diff_scope.changed_routes` or git diff → route mapping), smoke check (load + console + screenshot) on unchanged screens
- Execute the observation protocol (copy from design doc):
  1. Screen inventory (navigate, screenshot, load time, console, a11y tree, Lighthouse)
  2. Interactive element inventory (click, record outcomes, keyboard tab, hover/focus states)
  3. Form testing (valid, empty, invalid submissions)
  4. Journey walks (first-time user, returning user — from vision.user_journeys)
  5. Responsive check (320px, 768px, 1440px for key screens)
  6. Anomaly capture (anything unexpected — record, don't judge)
- Write `product_walk` to cycle_context.json with structured observations per screen:
  ```json
  {
    "product_walk": {
      "timestamp": "...",
      "scope": "full|incremental",
      "screens_walked": 8,
      "screens_smoked": 0,
      "screens": [
        {
          "route": "/",
          "name": "Home",
          "screenshot": "screenshots/cycle-N/home.png",
          "load_time_ms": 210,
          "console_errors": [],
          "a11y_tree_summary": "...",
          "lighthouse": { "performance": 91, "accessibility": 100, ... },
          "interactive_elements": [
            { "element": "Start button", "action": "click", "result": "Timer starts", "keyboard": "Space works" }
          ],
          "anomalies": []
        }
      ],
      "journeys": [
        {
          "name": "First focus session",
          "steps": [
            { "step": 1, "action": "Click Start", "result": "Timer counting down", "screenshot": "...", "friction": null }
          ],
          "click_count": 1,
          "delight_moments": ["Glow animation on start"],
          "friction_points": []
        }
      ],
      "responsive": { ... },
      "forms": [ ... ]
    }
  }
  ```
- Emit progress events per screen: "Walking screen 3/8: /settings"
- Commit screenshots: `git commit -m "eval(walk): cycle <N> — <screens_walked> screens, <journeys> journeys"`
- Do NOT judge, score, or verdict anything. Only observe and record.

**Step 2: Verify prompt captures enough for all three evaluation lenses**

Check against each lens's needs:
- QA lens: needs criteria evidence (interactive element results map to spec criteria) ✓
- Design lens: needs screenshots, hover states, responsive captures ✓
- PO lens: needs journey walks with friction/delight, a11y tree ✓

**Step 3: Commit**

```bash
git add src/prompts/loop/02d-product-walk.md
git commit -m "feat(prompt): add product-walk phase prompt — pure observation"
```

---

### Task 3: Write the evaluation prompt

**Files:**
- Create: `src/prompts/loop/02e-evaluation.md`

**Step 1: Write the prompt**

The evaluation prompt reads code-review + product-walk data and applies three lenses. ~200 lines. It must:

- Read `cycle_context.json` for `code_review_report`, `product_walk`, `active_spec`, `vision`, `previous_cycles`
- Apply three lenses in sequence:

**QA Lens:**
- For each spec criterion in `active_spec`, find matching observations in `product_walk.screens[].interactive_elements` and journey data
- Verdict per criterion: pass / fail / partial + evidence (reference specific observation)
- Functional correctness summary: console_errors, dead_elements, broken_links (aggregated from walk data)
- Output: `criteria_results[]`, `functional_correctness`

**Design Lens:**
- Score the 80-item design checklist from screenshots and interaction observations
- AI slop detection from visual evidence
- A11y assessment from captured accessibility trees and keyboard test results
- Output: `design_review` (overall_score, category_scores, ai_slop_score, notable_positives, notable_issues), `a11y_review` (verdict, findings)

**PO Lens:**
- Journey quality from journey walk observations (clarity, feedback, efficiency, delight per step)
- Screen quality from screenshots + responsive captures
- Vision alignment assessment
- Compute confidence score
- Output: `journey_quality[]`, `screen_quality[]`, `heuristic_results`, `verdict`, `confidence`, `recommended_action`

**Health score:** Compute from all three lenses using existing weighted methodology (copy from current QA prompt sub-check 9).

**Re-walk requests:** If any lens needs observations that weren't captured:
```json
{ "re_walk_requests": [{ "screen": "/settings", "need": "dark mode state", "lens": "design" }] }
```

**CRITICAL — backwards compatibility:** Write output to BOTH legacy keys AND new key:
```json
{
  "qa_report": { "verdict": "...", "health_score": ..., "criteria_results": [...], ... },
  "po_review_report": { "verdict": "...", "confidence": ..., "journey_quality": [...], ... },
  "evaluation_report": { "qa": { ... }, "design": { ... }, "po": { ... }, "re_walk_requests": [] }
}
```
This ensures the analyzing phase, eval suite, and any other consumers work unchanged.

- Emit progress events: "QA: 37/37 criteria pass", "Design: 82/100", "PO: confidence 0.91"
- Commit: `git commit -m "eval(evaluation): cycle <N> — health <score>, QA <verdict>, PO <verdict>"`

**Step 2: Verify backwards compatibility**

Check that `qa_report` matches the schema the eval suite expects (verdict, health_score, criteria_results, functional_correctness, code_quality_baseline, performance_baseline). Code quality and performance come from code-review and product-walk respectively — the evaluation phase must aggregate them.

**Step 3: Commit**

```bash
git add src/prompts/loop/02e-evaluation.md
git commit -m "feat(prompt): add evaluation phase prompt — three lenses"
```

---

### Task 4: Write the re-walk prompt

**Files:**
- Create: `src/prompts/loop/02f-re-walk.md`

**Step 1: Write the prompt**

Short targeted prompt. ~50 lines. It must:

- Read `evaluation_report.re_walk_requests` from cycle_context.json
- For each request: navigate to the screen, perform the specific observation, capture evidence
- Append results to `product_walk.screens[]` (update existing screen entry or add new observations)
- Commit: `git commit -m "eval(re-walk): cycle <N> — <count> targeted observations"`

**Step 2: Commit**

```bash
git add src/prompts/loop/02f-re-walk.md
git commit -m "feat(prompt): add re-walk phase prompt — targeted observation"
```

---

### Task 5: Write the final-review prompt

**Files:**
- Create: `src/prompts/loop/10-final-review.md`

**Step 1: Write the prompt**

Unscripted holistic walkthrough. ~100 lines. It must:

- Read vision, all previous cycle evaluation reports, deployment URL
- Use the product as a real customer would — no checklist, no spec
- Answer: "Is this a production product? Would I pay for it? Would I recommend it?"
- Note: polish gaps, rough edges, moments of confusion, moments of delight
- Write `final_review_report` to cycle_context.json:
  ```json
  {
    "final_review_report": {
      "production_ready": true|false,
      "confidence": 0.0-1.0,
      "polish_gaps": [...],
      "delight_moments": [...],
      "overall_impression": "...",
      "recommendation": "ship|refine|major-rework"
    }
  }
  ```
- If `feedback.json` exists (human feedback), incorporate it into the assessment
- Commit: `git commit -m "eval(final-review): production readiness — <verdict>"`

**Step 2: Commit**

```bash
git add src/prompts/loop/10-final-review.md
git commit -m "feat(prompt): add final-review phase prompt — production readiness"
```

---

### Task 6: Update STATE_TO_PROMPT map

**Files:**
- Modify: `src/launcher/rouge-loop.js:30-46`

**Step 1: Update the state-to-prompt mapping**

Replace:
```javascript
const STATE_TO_PROMPT = {
  seeding: 'seeding/00-swarm-orchestrator.md',
  building: 'loop/01-building.md',
  'test-integrity': 'loop/02a-test-integrity.md',
  'qa-gate': 'loop/02b-qa-gate.md',
  'qa-fixing': 'loop/03-qa-fixing.md',
  'po-reviewing': 'loop/02c-po-review.md',
  'po-review-journeys': 'loop/02c-po-review.md',
  'po-review-screens': 'loop/02c-po-review.md',
  'po-review-heuristics': 'loop/02c-po-review.md',
  analyzing: 'loop/04-analyzing.md',
  ...
};
```

With:
```javascript
const STATE_TO_PROMPT = {
  seeding: 'seeding/00-swarm-orchestrator.md',
  building: 'loop/01-building.md',
  'test-integrity': 'loop/02a-test-integrity.md',
  'code-review': 'loop/02c-code-review.md',
  'product-walk': 'loop/02d-product-walk.md',
  'evaluation': 'loop/02e-evaluation.md',
  're-walk': 'loop/02f-re-walk.md',
  'qa-fixing': 'loop/03-qa-fixing.md',
  analyzing: 'loop/04-analyzing.md',
  'generating-change-spec': 'loop/05-change-spec-generation.md',
  'vision-checking': 'loop/06-vision-check.md',
  promoting: 'loop/07-ship-promote.md',
  'rolling-back': 'loop/07-ship-promote.md',
  'final-review': 'loop/10-final-review.md',
};
```

Keep old `qa-gate` and `po-review-*` mappings commented out for reference during migration.

**Step 2: Commit**

```bash
git add src/launcher/rouge-loop.js
git commit -m "feat(launcher): update STATE_TO_PROMPT for new phase architecture"
```

---

### Task 7: Rewrite advanceState for new phase flow

**Files:**
- Modify: `src/launcher/rouge-loop.js:192-399` (the entire advanceState switch)

**Step 1: Replace old QA/PO cases with new flow**

The new state transition logic:

```
building (with changes) → test-integrity → code-review → product-walk → evaluation →
  [if re_walk_requests: re-walk → evaluation] →
  [if health < 70 or criteria < 90%: qa-fixing → test-integrity → ...] →
  analyzing → vision-checking → promoting →
  [if last area: final-review → complete]
```

Key changes to advanceState cases:

- `test-integrity` → next: `code-review` (was: `qa-gate`)
- NEW `code-review` → next: `product-walk` (always)
- NEW `product-walk` → next: `evaluation` (always, screenshots captured here not in qa-gate)
- NEW `evaluation` → read `evaluation_report`:
  - If `re_walk_requests` has items AND this is the first evaluation (not re-evaluation): next = `re-walk`
  - If `qa_report.verdict === 'FAIL'`: next = `qa-fixing` (with retry limit)
  - If `qa_report.verdict === 'PASS'`: next = `analyzing`
- NEW `re-walk` → next: `evaluation` (re-run evaluation with updated walk data)
- `qa-fixing` → next: `test-integrity` (unchanged — redeploy + re-test)
- `analyzing` → reads `evaluation_report.po.recommended_action` (was: `po_review_report.recommended_action` — both are written for compatibility)
- `promoting` (last area) → next: `final-review` (was: `complete`)
- NEW `final-review` → next: `complete` (or `generating-change-spec` if issues found)

Remove old cases: `qa-gate`, `po-review-journeys`, `po-review-screens`, `po-review-heuristics`, `po-reviewing`.

Also remove the PO review sub-phase scope injection (`poSubPhaseScope` object in runPhase) — no longer needed since PO review is absorbed into the evaluation lens.

**Step 2: Add re-walk loop guard**

Prevent infinite re-walk loops:
```javascript
case 're-walk':
  state.re_walk_count = (state.re_walk_count || 0) + 1;
  if (state.re_walk_count > 2) {
    log(`[${projectName}] Max re-walks reached, proceeding with available data`);
    next = 'evaluation'; // but skip re-walk requests this time
    state.skip_re_walk = true;
  } else {
    next = 'evaluation';
  }
  break;
```

And in the evaluation case:
```javascript
case 'evaluation': {
  const ctx = readJson(contextFile);
  const reWalkRequests = ctx?.evaluation_report?.re_walk_requests || [];
  if (reWalkRequests.length > 0 && !state.skip_re_walk && (state.re_walk_count || 0) < 2) {
    next = 're-walk';
  } else {
    // ... normal flow
    state.re_walk_count = 0;
    state.skip_re_walk = false;
  }
}
```

**Step 3: Update final-review → complete transition**

```javascript
case 'final-review': {
  const ctx = readJson(contextFile);
  const finalReport = ctx?.final_review_report;
  if (finalReport?.production_ready) {
    next = 'complete';
    log(`[${projectName}] Final review: SHIP IT`);
  } else {
    // Issues found — generate change specs for refinement
    next = 'generating-change-spec';
    log(`[${projectName}] Final review: needs refinement — ${finalReport?.recommendation || 'unknown'}`);
  }
  break;
}
```

**Step 4: Update promoting to route to final-review**

Change the "no pending areas" branch:
```javascript
} else {
  next = 'final-review'; // was: 'complete'
  log(`[${projectName}] All feature areas complete — entering final review`);
}
```

**Step 5: Commit**

```bash
git add src/launcher/rouge-loop.js
git commit -m "feat(launcher): rewrite advanceState for observe-once architecture"
```

---

### Task 8: Update Slack bot for new states

**Files:**
- Modify: `src/slack/bot.js:256-271` (STATE_EMOJI map)
- Modify: `src/slack/bot.js` (add `rouge ship` and `rouge feedback` commands)

**Step 1: Add new state emojis**

```javascript
const STATE_EMOJI = {
  building: '🔨',
  'test-integrity': '🧪',
  'code-review': '🔍',       // NEW
  'product-walk': '🚶',      // NEW
  'evaluation': '📊',         // NEW
  're-walk': '🔄',            // NEW
  'qa-fixing': '🔧',
  analyzing: '🧠',
  'generating-change-spec': '📝',
  'vision-checking': '🔭',
  promoting: '🚀',
  'rolling-back': '⏪',
  'final-review': '🏁',      // NEW
  complete: '✅',
  'waiting-for-human': '⏸️',
  ready: '📋',
  seeding: '🌱',
};
```

**Step 2: Add `rouge ship` command**

In the message handler's command switch:
```javascript
case 'ship': {
  if (!projectName) { await say('Usage: `rouge ship <project>`'); return; }
  const state = readState(projectName);
  if (state?.current_state !== 'final-review') {
    await say(`\`${projectName}\` is \`${state?.current_state}\`, not in final-review.`);
    return;
  }
  // Write approval to trigger transition
  const projectDir = path.join(PROJECTS_DIR, projectName);
  const ctx = readJson(path.join(projectDir, 'cycle_context.json'));
  if (ctx) {
    ctx.final_review_report = ctx.final_review_report || {};
    ctx.final_review_report.human_approved = true;
    ctx.final_review_report.approved_by = event.user;
    ctx.final_review_report.approved_at = new Date().toISOString();
    writeJson(path.join(projectDir, 'cycle_context.json'), ctx);
  }
  state.current_state = 'complete';
  writeState(projectName, state);
  await say(`🚀 \`${projectName}\` approved for production! Launcher will deploy.`);
  return;
}
```

**Step 3: Add `rouge feedback` command**

```javascript
case 'feedback': {
  if (!projectName) { await say('Usage: `rouge feedback <project> <text>`'); return; }
  const feedbackText = args.slice(2).join(' ');
  if (!feedbackText) { await say('Usage: `rouge feedback <project> your feedback here`'); return; }
  writeFeedback(projectName, JSON.stringify({
    text: feedbackText,
    source: 'human',
    user: event.user,
    timestamp: new Date().toISOString(),
  }));
  await say(`📝 Feedback recorded for \`${projectName}\`. The system will incorporate it.`);
  return;
}
```

**Step 4: Add to slash command handler too**

Mirror the `ship` and `feedback` commands in the `/rouge` slash command handler.

**Step 5: Commit**

```bash
git add src/slack/bot.js
git commit -m "feat(slack): add new state emojis + rouge ship/feedback commands"
```

---

### Task 9: Update eval suite for new phase structure

**Files:**
- Modify: `tests/eval/run-eval.js`

**Step 1: Update assertions**

The eval suite currently checks `qa_report` and `po_review_report`. Since evaluation writes to both legacy keys AND `evaluation_report`, the existing assertions should still pass. Add new assertions for the new structure:

```javascript
// ============================================================================
// Code Review Phase (NEW)
// ============================================================================
console.log('\n🔍 CODE REVIEW PHASE');

const cr = ctx.code_review_report;
if (cr) {
  check('Code review report exists', true);
  check('Has code_quality_baseline', cr.code_quality_baseline != null);
  check('Has ai_code_audit', cr.ai_code_audit != null);
  if (cr.ai_code_audit) {
    check('AI audit: has score', typeof cr.ai_code_audit.score === 'number');
  }
} else {
  // Legacy: code quality was in qa_report
  skipCheck('Code review report', 'legacy structure or phase not yet reached');
}

// ============================================================================
// Product Walk Phase (NEW)
// ============================================================================
console.log('\n🚶 PRODUCT WALK PHASE');

const walk = ctx.product_walk;
if (walk) {
  check('Product walk exists', true);
  check('Has screens', Array.isArray(walk.screens) && walk.screens.length > 0);
  check('Has scope', walk.scope === 'full' || walk.scope === 'incremental');
  if (walk.screens?.length > 0) {
    check('Screen has route', walk.screens[0].route != null);
    check('Screen has screenshot', walk.screens[0].screenshot != null);
  }
} else {
  skipCheck('Product walk', 'legacy structure or phase not yet reached');
}

// ============================================================================
// Evaluation Phase (NEW)
// ============================================================================
console.log('\n📊 EVALUATION PHASE');

const evalReport = ctx.evaluation_report;
if (evalReport) {
  check('Evaluation report exists', true);
  check('Has QA section', evalReport.qa != null);
  check('Has design section', evalReport.design != null);
  check('Has PO section', evalReport.po != null);
} else {
  skipCheck('Evaluation report', 'legacy structure or phase not yet reached');
}
```

**Step 2: Keep existing QA/PO assertions**

Don't remove them — they validate backwards compatibility. Both old and new structures should pass.

**Step 3: Commit**

```bash
git add tests/eval/run-eval.js
git commit -m "feat(eval): add assertions for code-review, product-walk, evaluation phases"
```

---

### Task 10: Update resume pipeline for new states

**Files:**
- Modify: `src/launcher/rouge-loop.js` (resume from waiting-for-human pipeline list)
- Modify: `src/slack/bot.js` (skip phase action handler pipeline list)

**Step 1: Update the resume pipeline in runPhase**

In the `waiting-for-human` resume handler (~line 412), update the pipeline:
```javascript
const pipeline = ['building', 'test-integrity', 'code-review', 'product-walk', 'evaluation', 'analyzing', 'vision-checking', 'promoting', 'final-review'];
```

**Step 2: Update the skip handler in bot.js**

In the `skip_` action handler, update the pipeline:
```javascript
const pipeline = ['building', 'test-integrity', 'code-review', 'product-walk', 'evaluation', 'analyzing', 'vision-checking', 'promoting', 'final-review'];
```

**Step 3: Commit**

```bash
git add src/launcher/rouge-loop.js src/slack/bot.js
git commit -m "feat(launcher): update resume and skip pipelines for new phase architecture"
```

---

### Task 11: Remove old QA/PO prompt scope injection

**Files:**
- Modify: `src/launcher/rouge-loop.js` (remove poSubPhaseScope object in runPhase)

**Step 1: Remove the PO sub-phase scope injection**

Delete the `poSubPhaseScope` object and the `if (poSubPhaseScope[currentState])` block from runPhase (~line 443-466). These were used to scope PO review sub-phases — no longer needed.

**Step 2: Commit**

```bash
git add src/launcher/rouge-loop.js
git commit -m "chore(launcher): remove legacy PO sub-phase scope injection"
```

---

### Task 12: Integration test — dry run with countdowntimer

**Step 1: Reset countdowntimer to test-integrity state**

```bash
cd projects/countdowntimer
python3 -c "
import json
with open('state.json') as f: s = json.load(f)
s['current_state'] = 'test-integrity'
s['completed_phases'] = ['building']
with open('state.json', 'w') as f: json.dump(s, f, indent=2)
"
```

**Step 2: Run launcher with haiku for quick validation**

```bash
ROUGE_MODEL=haiku ROUGE_LOOP_DELAY=5 node src/launcher/rouge-loop.js
```

**Step 3: Verify the new state flow**

Watch logs for:
```
test-integrity → code-review → product-walk → evaluation → analyzing → ...
```

Verify cycle_context.json has:
- `code_review_report` (from code-review phase)
- `product_walk` (from product-walk phase)
- `evaluation_report` (from evaluation phase)
- `qa_report` (backwards compat, from evaluation phase)
- `po_review_report` (backwards compat, from evaluation phase)

**Step 4: Run eval suite**

```bash
node tests/eval/run-eval.js projects/countdowntimer
```

Expect: all assertions pass (both legacy and new).

**Step 5: Commit test results**

```bash
git add -A
git commit -m "test(integration): verify new QA architecture with countdowntimer"
```

---

## Execution Notes

**Migration safety:** Old prompts (`02b-qa-gate.md`, `02c-po-review.md`) are NOT deleted. They stay as reference. Old STATE_TO_PROMPT entries are commented out. If the new architecture has issues, uncommenting restores the old flow.

**Incremental scope detection:** Task 2 (product-walk prompt) references `diff_scope.changed_routes`. This is populated by the building phase when it writes `cycle_context.json`. If not present, the walk defaults to full scope. No additional code needed in the launcher — the prompt handles the fallback.

**Final-review Slack integration:** Task 8 adds `rouge ship` and `rouge feedback`. The final-review phase checks for `feedback.json` and `final_review_report.human_approved`. The launcher stays in `final-review` until either the phase writes `production_ready: true` OR the human sends `rouge ship`.

**Parallel human testing:** The final-review phase runs autonomously. The human tests on the same staging URL at their own pace. Whichever finishes first, the other's input is merged when both are present. No special parallelism code needed — the launcher loops and the phase checks for feedback.json on each run.
