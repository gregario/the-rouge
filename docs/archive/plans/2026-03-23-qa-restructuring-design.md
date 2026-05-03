# QA Restructuring + Incremental QA — Design Document

**Date:** 2026-03-23
**Status:** Approved design, pending implementation
**Scope:** Replace monolithic QA gate + separate PO review with observe-once, judge-through-lenses architecture. Add incremental QA. Add final production readiness walkthrough.

## Problem Statement

The current QA pipeline walks the app 6 times across QA gate (3 browser walks) and PO review (3 browser walks). Each walk both observes AND judges. This causes:
- **52 min per cycle** (retro data from countdowntimer run)
- **QA gate variance 3-25 min** (opus thinking between monolithic sub-checks)
- **No incremental support** — full walks every cycle regardless of what changed
- **Inconsistent state** — app can change between walks
- **No observation reuse** — each walk's data is discarded

## Core Insight

**Separate observation from judgment.** The expensive part is walking the app in a browser. The cheap part is thinking about what you observed. Walk once, judge through multiple lenses.

## New Architecture

### Phase Flow (replaces qa-gate + po-review-journeys/screens/heuristics)

```
building → test-integrity → code-review → product-walk → evaluation → analyzing → ...
```

### Phase 1: Code Review (engineering lens, no browser)

**Replaces:** QA sub-checks 4 (code quality), 5 (AI code audit), 6 (security review)

**What it does:**
- ESLint, jscpd, madge, knip (CLI tools — deterministic, fast)
- AI code audit (7 dimensions: architecture, consistency, robustness, production risks, security, dead/hallucinated code, tech debt)
- Security review (5 OWASP categories) — only when `diff_scope.backend == true`
- npm audit for dependency vulnerabilities

**Scope rules for incremental:**
- Full build → full code review
- Bug fix / small change → changed files only (git diff)
- No-op build (area already built) → skip entirely

**Output:** `code_review_report` in cycle_context.json

**Estimated time:** 3-5 min

### Phase 2: Product Walk (pure observation, browser)

**Replaces:** QA sub-checks 1 (spec criteria), 2 (functional), 3 (Lighthouse), 7 (a11y), 8 (design) + PO journey/screen walks

**What it does:** Comprehensive browser session following a structured observation protocol. Does NOT judge — only observes and records.

**Observation protocol:**

```
1. SCREEN INVENTORY
   For each screen/route:
   - Navigate to screen
   - Screenshot (full page)
   - Record: URL, page title, load time, console output
   - Capture: full accessibility tree (landmarks, headings, ARIA)
   - Run: Lighthouse (performance, a11y, best practices, SEO)

2. INTERACTIVE ELEMENT INVENTORY
   For each screen:
   - Identify all interactive elements (buttons, links, forms, toggles, modals)
   - Click/interact with each one
   - Record: element, action taken, result, screenshot before/after
   - Test keyboard: Tab to element, Enter/Space to activate
   - Capture: hover states, focus states, active states

3. FORM TESTING
   For each form:
   - Submit with valid data → record result
   - Submit empty → record validation messages
   - Submit with invalid data → record rejection behavior
   - Tab through fields → record tab order

4. JOURNEY WALKS
   For each core user journey (from vision/spec):
   - Walk as first-time user with intent
   - Record: steps taken, click count, friction points, moments of confusion
   - Screenshot at each decision point
   - Note: anything that feels off, surprising, or delightful

5. RESPONSIVE CHECK
   For key screens:
   - Capture at 320px, 768px, 1440px widths
   - Record: layout breaks, overflow, truncation, touch target sizes

6. ANOMALY CAPTURE
   Throughout all steps:
   - If anything looks wrong, feels off, or surprises you — capture it
   - Don't judge it. Just record: what, where, screenshot, description
```

**Scope rules for incremental:**
- Full build → full protocol on all screens
- Small change → full protocol on changed screens + smoke check (step 1 only) on unchanged screens
- No-op build → skip entirely

**Output:** `product_walk` in cycle_context.json — structured observation artifact with embedded screenshot references

**Estimated time:** 10-15 min (but runs ONCE instead of 6 times)

### Phase 3: Evaluation (three lenses, no browser)

**Replaces:** QA verdict + health score + PO review verdicts

**What it does:** Reads `code_review_report` + `product_walk` from cycle_context. Applies three lenses:

**QA Lens:**
- Compare observations against each spec criterion
- For each criterion: pass / fail / partial + evidence from observations
- Functional correctness: console errors, dead elements, broken links (from walk data)
- Result: criteria_results[], criteria_pass_rate

**Design Lens:**
- Assess visual quality from screenshots and interaction observations
- 80-item design checklist scored from observation data
- AI slop detection from visual evidence
- A11y assessment from captured accessibility trees
- Result: design_score, a11y_verdict, ai_slop_score

**PO Lens:**
- Assess journey quality from journey walk observations
- Screen quality from screenshots + interaction data
- Vision alignment from overall product impression
- Customer delight assessment
- Result: po_verdict (PRODUCTION_READY / NEEDS_IMPROVEMENT / NOT_READY), confidence, recommended_action

**Unified output:** `evaluation_report` with sections for each lens + `health_score` computed from all three.

**Re-walk requests:** If any lens needs observations that weren't captured, it writes `re_walk_requests[]` — specific screens/states/interactions to observe. Triggers optional Phase 2b.

**Estimated time:** 5-8 min (no browser, just reading and judging)

### Phase 2b: Targeted Re-walk (optional, browser)

**Triggers:** Only when `evaluation_report.re_walk_requests` has items.

**What it does:** Visits specific screens/states requested by evaluation. Appends to `product_walk`. Evaluation re-runs on updated data.

**Estimated time:** 2-3 min (targeted, not comprehensive)

### Final Review (new state, end-of-project only)

**Triggers:** When `promoting` finds zero pending feature areas (all features complete).

**State:** `final-review` (new state between promoting and complete)

**Two parallel streams:**

1. **System walkthrough** — unscripted, holistic "use it like a customer" session. No checklist. Just: is this a production product? Does it feel polished? Would you pay for it?

2. **Human testing** — Slack notification with staging URL. Human tests at their own pace. Feedback via Slack DM or `/rouge feedback <project>`. No time pressure.

**Merging:** System walkthrough writes to `final_review_report` in cycle_context. Human feedback lands in `feedback.json`. The analyzing phase reads both when both are present.

**Outcomes:**
- Both pass → `complete` → deploy to production
- Issues found → `generating-change-spec` → refinement cycle
- Human not ready → stays in `final-review` (system walkthrough complete, waiting for human signal)

**Human signals via Slack:**
- `rouge ship <project>` — approve, deploy to production
- `rouge feedback <project> <text>` — issues found, generate change specs
- `rouge more-time <project>` — still testing, don't rush

## State Machine Changes

### Current
```
building → test-integrity → qa-gate → po-review-journeys → po-review-screens →
po-review-heuristics → analyzing → vision-checking → promoting
```

### Proposed
```
building → test-integrity → code-review → product-walk → evaluation →
[re-walk if needed → re-evaluation] → analyzing → vision-checking → promoting →
[if last area: final-review → complete]
```

### State mapping (for migration)
| Old State | New State | Notes |
|-----------|-----------|-------|
| qa-gate | product-walk | Browser observation only |
| po-review-journeys | (removed) | Absorbed into product-walk + evaluation |
| po-review-screens | (removed) | Absorbed into product-walk + evaluation |
| po-review-heuristics | (removed) | Absorbed into evaluation |
| (new) | code-review | Engineering lens, split from qa-gate |
| (new) | evaluation | Three lenses on walk data |
| (new) | re-walk | Optional targeted observation |
| (new) | final-review | End-of-project holistic check |

## Incremental QA

Incremental is a parameter on the product walk, not a separate mechanism:

| What Changed | Code Review | Product Walk | Evaluation |
|-------------|-------------|--------------|------------|
| New feature area | Full | Full protocol, all screens | All three lenses |
| Bug fix / small change | Changed files | Full protocol on changed screens, smoke on rest | All lenses, carry forward unchanged |
| Config / dependency change | Full | Smoke only (step 1) | Code + QA lenses only |
| No-op (already built) | Skip | Skip | Skip |

**How "changed screens" is determined:**
- Git diff of `src/` files → map changed files to routes/components
- Routes that import changed components are "changed screens"
- Everything else is "unchanged" — smoke check only (loads, no console errors)

## Lessons from V1 (pitfalls to avoid)

These are concrete mistakes from the first implementation that this design must not repeat.

### 1. Hard timeouts killed working phases
**What happened:** Fixed per-phase timeouts (10-25 min) killed opus sessions that were legitimately working but slow.
**Prevention:** Use the progress-based watchdog (already implemented). Product walk is the longest phase — it should report progress as it completes each screen. Evaluation is fast and unlikely to hit ceilings.

### 2. Rate limits wasted 95 executions
**What happened:** Rate limit backoff was 60-120s when reset was hours away.
**Prevention:** Already fixed (smart backoff parses reset time). But new phases must still detect rate limits in stdout, not just stderr. Use the existing `isRateLimited()` + stdout check pattern.

### 3. Feature-area cycling caused redundant reviews
**What happened:** Promoting iterated through feature areas, running full QA/PO review per area even when already built.
**Prevention:** Already fixed (no-op detection skips review when build delta ≤ 0). The new phases inherit this — if building produces nothing, code-review/product-walk/evaluation all skip.

### 4. State.json was overwritten by phases
**What happened:** The claude -p session sometimes wrote to state.json, overwriting the launcher's state tracking.
**Prevention:** FIX-6 already saves state before phase and restores if overwritten. New phases must NOT write to state.json — only cycle_context.json. The launcher manages state transitions.

### 5. PO review was too heavy for small projects
**What happened:** 3 PO review sub-phases × 6 min each = 18 min of review for a 6-screen timer app.
**Prevention:** The evaluation phase is ONE session reading pre-captured data. It should scale naturally — fewer screens = less observation data = faster evaluation. No separate sub-phases.

### 6. The QA prompt was a 500-line monolith
**What happened:** One massive prompt trying to do 8 sub-checks. Opus would think for 10+ min between sub-checks.
**Prevention:** The new architecture splits into 3 focused prompts (code-review, product-walk, evaluation). Each has a clear single responsibility. No prompt should exceed 200 lines.

### 7. Observations weren't reusable across cycles
**What happened:** Each QA run started fresh. No comparison to previous cycle's findings.
**Prevention:** `product_walk` and `evaluation_report` persist in cycle_context.json. The evaluation phase should explicitly compare against `previous_cycles` data. "Contrast ratio was 3.2:1 last cycle, now 4.8:1 — improvement."

### 8. No smoke testing for unchanged areas
**What happened:** Either full QA or nothing. No middle ground.
**Prevention:** The product walk protocol has explicit scope rules. Unchanged screens get a smoke check (loads, no console errors, screenshot for visual regression comparison). This is designed in, not bolted on.

### 9. Screenshots weren't tracked across cycles
**What happened:** Screenshots captured but only for the current cycle. No visual diff capability.
**Prevention:** Product walk screenshots go to `screenshots/cycle-{N}/`. Visual comparison is done by the evaluation phase reading current vs previous cycle screenshots. The `capture-screenshots.js` module already supports this — wire it into the product walk.

### 10. Promoting timeout was too short
**What happened:** 5 min timeout on promoting, opus averaged 4.1 min — barely fit.
**Prevention:** Already fixed (10 min timeout, plus watchdog replaces hard timeouts). But the new `final-review` state will be longer-running. It should use the watchdog with a generous ceiling (30+ min for the unscripted walkthrough).

### 11. Stale detection flagged normal opus thinking
**What happened:** "Phase stale (no output for 480s)" logged repeatedly during normal opus processing.
**Prevention:** The progress-based watchdog (already implemented) distinguishes between "stale but process alive" and "truly stuck." Product walk should emit progress events per screen ("Walking screen 3/8: /settings") so the watchdog sees continuous progress.

## Estimated Impact

| Metric | Current | After Restructuring |
|--------|---------|-------------------|
| Browser walks per cycle | 6 | 1 (+optional re-walk) |
| Review phases per cycle | 4 (qa + 3×po) | 3 (code-review + walk + eval) |
| Estimated cycle time | 52 min | 22-28 min |
| Incremental cycle time | 52 min (no incremental) | 8-12 min |
| Final-review (once per project) | N/A | 15-20 min + human time |

## Implementation Order

1. Add new states to STATE_TO_PROMPT map and SKIP_STATES
2. Write `code-review` prompt (~100 lines)
3. Write `product-walk` prompt with observation protocol (~150 lines)
4. Write `evaluation` prompt with three lenses (~200 lines)
5. Update advanceState for new state transitions
6. Add `final-review` state and Slack integration
7. Add incremental scope detection (git diff → changed screens mapping)
8. Write `re-walk` prompt (~50 lines)
9. Update eval suite for new phase structure
10. Migration: update existing projects' state.json if mid-cycle
