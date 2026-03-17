## ADDED Requirements

---

# PHASE 1: QA GATE

QA answers one question: **"Does what we built match what we said we'd build?"**

QA checks the product against the spec — acceptance criteria, user journeys, functional correctness. It is binary pass/fail. QA does NOT judge quality, aesthetics, production-readiness, or whether the spec itself was good enough. If the spec says "show a list of trips" and the product shows a list of trips, QA passes — even if the list is ugly, the hierarchy is flat, and the interaction is clunky.

QA failures go back to the Factory as bug fixes, not as new specs.

---

### Requirement: QA extracts testable criteria from the spec
The QA phase SHALL extract every acceptance criterion from the seed spec (or change spec) and convert each into a binary test.

#### Scenario: Criteria extraction
- **WHEN** QA begins
- **THEN** it SHALL parse the active spec's `acceptance_criteria` sections and produce a checklist of testable assertions. Each assertion has: an ID, the criterion text, the screen/URL to test on, and the verification method (DOM query, interaction simulation, screenshot + LLM vision).

#### Scenario: Criteria are spec-scoped, not vision-scoped
- **WHEN** QA extracts criteria
- **THEN** it SHALL only extract criteria from the spec being verified (the current change spec or seed spec for this cycle), NOT from the full vision document. The vision document is the PO Review's input, not QA's.

### Requirement: QA verifies acceptance criteria via browser automation
The QA phase SHALL verify each criterion against the deployed product using automated browser testing.

#### Scenario: Criteria tested via browser interaction
- **WHEN** a criterion describes a user-facing interaction (e.g., "user can click a piece to select it")
- **THEN** QA SHALL: navigate to the relevant screen, perform the described interaction, capture before/after state, and determine pass/fail. Pass = the described behavior occurs. Fail = it does not.

#### Scenario: Criteria tested via DOM analysis
- **WHEN** a criterion describes a structural property (e.g., "dashboard shows trip history with date, distance, and fuel cost")
- **THEN** QA SHALL: navigate to the screen, query the DOM for expected elements, verify they are present and contain data (not empty containers or placeholder text).

#### Scenario: Criteria failure report
- **WHEN** a criterion fails
- **THEN** the QA report SHALL include: criterion ID, criterion text, expected behavior, actual behavior, screenshot, screen URL, and classification:
  - `not-implemented`: no evidence the feature was built
  - `broken`: feature exists but the criterion fails (bug)
  - `partial`: feature partially works (e.g., list renders but missing columns)

### Requirement: QA runs functional correctness checks
Beyond acceptance criteria, QA SHALL verify that the product functions correctly at a baseline level — pages load, interactions respond, forms work, navigation is intact.

#### Scenario: Page load check
- **WHEN** QA runs
- **THEN** it SHALL navigate to every route in the sitemap and verify: HTTP 200 response, page renders (not blank), no crash/error screens

#### Scenario: Console error check
- **WHEN** QA navigates any page
- **THEN** it SHALL monitor the browser console and capture any uncaught errors or unhandled promise rejections. Zero console errors = pass.

#### Scenario: Interactive element check
- **WHEN** QA encounters a button, link, form input, or clickable element
- **THEN** it SHALL verify the element responds to interaction (hover state changes, click triggers an action or navigation, input accepts text). Dead/orphaned elements are failures.

#### Scenario: Form submission check
- **WHEN** QA encounters a form
- **THEN** it SHALL:
  1. Submit with valid data → verify success feedback (message, redirect, or state change)
  2. Submit with empty/invalid data → verify validation messages appear inline

#### Scenario: Navigation check
- **WHEN** QA encounters navigation elements
- **THEN** it SHALL verify: every nav link reaches a real page, back button returns to the previous page, no infinite redirect loops

### Requirement: QA collects performance baselines
QA SHALL collect non-functional metrics as data, not as pass/fail gates. Performance is reported to the PO Review phase but does not block QA.

#### Scenario: Lighthouse metrics collected
- **WHEN** QA runs on a web product
- **THEN** it SHALL run Lighthouse on key pages (landing, primary nav destinations, core journey endpoints — 3-10 pages) and extract: Performance score, Accessibility score, SEO score, LCP, FID/INP, CLS, TTI

#### Scenario: Performance data passed through
- **WHEN** Lighthouse metrics are collected
- **THEN** they SHALL be included in the QA report as `performance_baseline` — informational data for the PO Review phase, NOT used to determine QA pass/fail

### Requirement: QA produces a gate report with pass/fail verdict
The QA phase SHALL produce a structured report that determines whether the product passes to PO Review or goes back to the Factory for fixes.

#### Scenario: QA report structure
- **WHEN** QA completes
- **THEN** the report SHALL contain:
  ```
  qa_report:
    timestamp: ISO 8601
    product: name
    deployment_url: URL tested
    cycle_number: N
    spec_tested: which spec (seed spec or change spec ID)

    verdict: PASS | FAIL

    criteria_check:
      total: N
      passed: N
      failed: N
      failures: [{ id, criterion, expected, actual, screenshot, url, classification }]

    functional_correctness:
      pages_tested: N
      pages_passing: N
      console_errors: [{ url, error, stack }]
      dead_elements: [{ selector, url }]
      form_issues: [{ form_id, url, issue }]
      navigation_issues: [{ link, url, issue }]

    performance_baseline:
      pages_audited: N
      scores: [{ url, performance, accessibility, seo, lcp, tti }]

    spec_completeness:
      total_criteria: N
      implemented_and_passing: N
      implemented_but_failing: N
      not_implemented: N
      percentage: N%
  ```

#### Scenario: QA pass condition
- **WHEN** the QA report is assembled
- **THEN** verdict SHALL be `PASS` when ALL of:
  - Zero `not-implemented` criteria (everything in the spec was at least attempted)
  - Zero `broken` criteria (everything attempted actually works)
  - Zero console errors
  - Zero dead interactive elements on core journey pages
  - All forms submit successfully with valid data
  Note: `partial` criteria count as a warning, not a failure — they pass QA but are flagged for the PO Review

#### Scenario: QA fail → back to Factory
- **WHEN** QA verdict is `FAIL`
- **THEN** the Runner SHALL send the QA report back to the Factory as a bug fix brief. The Factory SHALL fix the issues and re-deploy. QA SHALL re-run. This loop continues until QA passes. The PO Review phase is NOT entered until QA passes.

#### Scenario: QA pass → advance to PO Review
- **WHEN** QA verdict is `PASS`
- **THEN** the Runner SHALL advance to the PO Review phase, passing the QA report (including performance baseline and any `partial` warnings) as input context.

---

# PHASE 2: PO REVIEW

PO Review answers a different question: **"Is the spec-compliant product actually good enough for production?"**

PO Review checks the product against The Library's quality standards, the project's product standard, reference product comparisons, and simulated user experience. It does NOT re-check whether the spec is implemented (QA already did that). It checks whether the RESULT of implementing the spec meets a production bar.

PO Review failures generate NEW SPECS — not bug fixes. "The information hierarchy is flat" is not a bug. It's a quality gap that requires new design and implementation work.

---

### Requirement: PO Review evaluates each user journey for production quality
The PO Review SHALL simulate each user journey NOT to check if it completes (QA did that) but to assess whether the experience is production-quality.

#### Scenario: Journey quality assessment procedure
- **WHEN** PO Review evaluates a user journey
- **THEN** for each journey that passed QA, it SHALL:
  1. Start at the journey's entry point
  2. Walk through the journey as a first-time user would (LLM-driven, not scripted)
  3. At EACH STEP, assess against quality dimensions:
     - **Clarity**: Is it obvious what to do next? Would a first-time user hesitate?
     - **Feedback**: Did the product acknowledge my action? Was there visual/animated feedback?
     - **Efficiency**: Could this step be eliminated or combined with another? Does it respect the 3-click rule?
     - **Delight**: Does anything about this step feel surprisingly good? Or does it feel utilitarian/boring?
  4. At JOURNEY END, assess:
     - **Completeness**: Did the journey feel finished? Was there a clear success state?
     - **Satisfaction**: Would a user feel accomplished? Or confused about what just happened?
  5. Produce per-journey quality report with step-by-step assessment and overall verdict: `production-ready`, `acceptable-with-improvements`, `not-production-ready`

#### Scenario: Journey quality dimensions scored
- **WHEN** each journey step is assessed
- **THEN** it SHALL receive per-dimension ratings:
  - `clarity`: clear | ambiguous | confusing
  - `feedback`: satisfying | adequate | missing
  - `efficiency`: optimal | acceptable | wasteful
  - `delight`: delightful | neutral | frustrating
  And the step gets an overall: `strong` (no dimension below adequate) | `weak` (one dimension below adequate) | `failing` (multiple dimensions below adequate)

#### Scenario: Weak steps generate quality gaps
- **WHEN** a journey step is rated `weak` or `failing`
- **THEN** the PO Review SHALL generate a quality gap entry: which journey, which step, which dimensions failed, what "good" would look like for this step (referencing Library heuristics and reference products), and suggested improvement category (design change, interaction improvement, content change, flow restructure)

### Requirement: PO Review evaluates each screen for production quality
The PO Review SHALL assess every screen visited during journey evaluation for design and information quality — independent of whether the journeys on that screen passed.

#### Scenario: Screen quality assessment procedure
- **WHEN** PO Review evaluates a screen
- **THEN** it SHALL capture a full-page screenshot and assess:
  1. **Information hierarchy**: Is there a clear primary element? Distinct secondary? Tertiary? Or is everything the same visual weight? (References Library heuristic `hierarchy-primary` and `hierarchy-levels`)
  2. **Layout structure**: Does the layout have intentional structure (grid, clear sections, logical grouping)? Or is it a flat list of elements?
  3. **Visual consistency**: Does this screen match the design system? Same fonts, colors, spacing as other screens?
  4. **Density appropriateness**: Is the information density right for the screen's purpose? (Dashboard = high density. Onboarding = low density. Settings = medium density.)
  5. **Empty/edge states**: If testable, trigger empty and error states — do they have guidance, or are they blank/generic?
  6. **Mobile readiness**: Resize to 375px — does it degrade gracefully or break?

#### Scenario: Screen quality scored
- **WHEN** screen assessment completes
- **THEN** each screen SHALL receive:
  - Per-dimension verdict: `production-ready` | `needs-work` | `failing`
  - An overall screen quality: `production-ready` (no dimension failing, at most 1 needs-work) | `acceptable` (no dimension failing) | `not-production-ready` (any dimension failing)
  - For `needs-work` and `failing` dimensions: specific observation and reference to what "good" looks like (Library heuristic or reference product screenshot)

### Requirement: PO Review evaluates interactions for production quality
The PO Review SHALL assess the quality of individual interactions — not whether they work (QA) but whether they feel professional.

#### Scenario: Interaction quality assessment
- **WHEN** PO Review encounters an interactive element during journey or screen evaluation
- **THEN** it SHALL assess:
  1. **Hover state**: Does the element change on hover? Does the cursor change? Is the hover state visually distinct?
  2. **Click feedback**: Is there immediate visual feedback on click (ripple, color change, animation)? Or does the element just... do something eventually?
  3. **Loading states**: If the action triggers loading, is there an indicator (spinner, skeleton, progress bar)? Or does the UI freeze?
  4. **Success states**: After the action completes, is there clear confirmation? Or does the user wonder if it worked?
  5. **Transition animations**: Are transitions between states smooth? Abrupt? Non-existent?

#### Scenario: Interaction patterns rated
- **WHEN** interaction assessment completes
- **THEN** each interaction SHALL be rated: `polished` (all dimensions good) | `functional` (works but lacks polish) | `raw` (minimal or no feedback)
- **AND** `raw` interactions SHALL generate quality gaps with reference to Library heuristic `interactive-feedback` and `animation-state-transitions`

### Requirement: PO Review applies Library taste heuristics
The PO Review SHALL apply every active Library heuristic (global + domain + personal fingerprint) as quality checks. These are the "is it good enough?" checks that sit above QA's "does it work?" checks.

#### Scenario: Heuristic evaluation in PO Review context
- **WHEN** PO Review runs heuristics
- **THEN** for each active heuristic, it SHALL:
  1. Execute the heuristic's defined measurement method
  2. Compare against the threshold
  3. Record: heuristic id, tier, pass/fail, measured value, threshold, evidence
  4. For failures: generate a quality gap entry (not a bug — a new spec needed)

#### Scenario: Heuristic failures are NOT bugs
- **WHEN** a Library heuristic fails
- **THEN** it SHALL be classified as a `quality-gap`, NOT a `bug`. The distinction: bugs go back to Factory as fixes within the current spec. Quality gaps generate NEW specs that go through the Factory's full pipeline (potentially including design mode).

### Requirement: PO Review performs pairwise reference comparison
The PO Review SHALL compare the product against reference products specified in the vision document, judging quality on specific named dimensions.

#### Scenario: Reference comparison dimensions
- **WHEN** the vision document specifies a reference product (e.g., "navigation should feel like Linear")
- **THEN** PO Review SHALL compare on:
  1. **Layout structure**: screenshot reference nav → screenshot product nav → LLM pairwise judgment
  2. **Visual polish**: compare typography, spacing, color harmony, alignment
  3. **Information density**: compare visible useful information per screen
  4. **Interaction patterns**: compare hover, click feedback, transitions, animations
  5. Each dimension: `matches-reference` | `approaching-reference` | `significantly-below-reference`

#### Scenario: Reference product screenshot capture
- **WHEN** pairwise comparison runs
- **THEN** it SHALL:
  - Use cached reference screenshots from Library (if available and <30 days old)
  - Otherwise navigate to the reference product's public URL and capture fresh screenshots
  - Cache new screenshots for future comparisons

#### Scenario: Comparison output
- **WHEN** comparison completes
- **THEN** the report SHALL include: reference name, per-dimension verdict, side-by-side screenshots, specific observations (e.g., "Product uses 3 font sizes where Linear uses 2 — visual noise is higher")
- **AND** any dimension at `significantly-below-reference` SHALL generate a quality gap with the reference screenshot as evidence of what "good" looks like

### Requirement: PO Review produces a quality report with gap analysis
The PO Review SHALL produce a structured report that identifies every quality gap and provides enough context for each gap to generate a new spec.

#### Scenario: PO Review report structure
- **WHEN** PO Review completes
- **THEN** the report SHALL contain:
  ```
  po_review_report:
    timestamp: ISO 8601
    product: name
    deployment_url: URL
    cycle_number: N

    verdict: PRODUCTION_READY | NEEDS_IMPROVEMENT | NOT_READY

    journey_quality:
      journeys_assessed: N
      production_ready: N
      acceptable: N
      not_ready: N
      details: [{
        journey_name: string
        verdict: production-ready | acceptable-with-improvements | not-production-ready
        steps: [{
          step_number: N
          action: string
          clarity: clear | ambiguous | confusing
          feedback: satisfying | adequate | missing
          efficiency: optimal | acceptable | wasteful
          delight: delightful | neutral | frustrating
          overall: strong | weak | failing
        }]
        quality_gaps: [{ step, dimensions_failed, what_good_looks_like, improvement_category }]
      }]

    screen_quality:
      screens_assessed: N
      production_ready: N
      acceptable: N
      not_ready: N
      details: [{
        screen_url: string
        screenshot: path
        hierarchy: production-ready | needs-work | failing
        layout: production-ready | needs-work | failing
        consistency: production-ready | needs-work | failing
        density: production-ready | needs-work | failing
        edge_states: production-ready | needs-work | failing
        mobile: production-ready | needs-work | failing
        overall: production-ready | acceptable | not-production-ready
        quality_gaps: [{ dimension, observation, reference, improvement_category }]
      }]

    interaction_quality:
      interactions_assessed: N
      polished: N
      functional: N
      raw: N
      details: [{
        element: string
        screen_url: string
        hover: good | adequate | missing
        click_feedback: good | adequate | missing
        loading: good | adequate | missing
        success: good | adequate | missing
        transitions: good | adequate | missing
        overall: polished | functional | raw
      }]

    heuristic_results:
      total: N
      passed: N
      failed: N
      functional_pass_rate: N%
      nonfunctional_pass_rate: N%
      failures: [{ heuristic_id, tier, expected, measured, evidence }]

    reference_comparison:
      reference_name: string
      dimensions: [{ name, verdict, observation, screenshot_pair }]

    quality_gaps:
      total: N
      by_category:
        design_change: N
        interaction_improvement: N
        content_change: N
        flow_restructure: N
        performance_improvement: N
      gaps: [{
        id: string
        source: journey | screen | interaction | heuristic | reference
        description: string
        what_good_looks_like: string
        evidence: screenshot or data
        category: design_change | interaction_improvement | content_change | flow_restructure | performance_improvement
        priority: critical | high | medium | low
        library_heuristics_relevant: [heuristic IDs]
      }]

    confidence_score: 0.0-1.0
    recommended_action: continue | deepen:<area> | broaden:<missing> | notify-human:<reason>
  ```

#### Scenario: PO Review verdict logic
- **WHEN** the report is assembled
- **THEN** verdict SHALL be:
  - `PRODUCTION_READY`: zero critical/high quality gaps, all journeys production-ready or acceptable, all screens production-ready or acceptable, heuristic functional pass rate ≥85%, reference comparison has zero `significantly-below-reference` dimensions
  - `NEEDS_IMPROVEMENT`: zero critical quality gaps but has high/medium gaps. Product works and has quality but needs another pass.
  - `NOT_READY`: has critical quality gaps, or multiple journeys/screens rated not-production-ready, or heuristic functional pass rate <70%, or reference comparison has 2+ `significantly-below-reference` dimensions

#### Scenario: Quality gaps become new specs
- **WHEN** PO Review verdict is `NEEDS_IMPROVEMENT` or `NOT_READY`
- **THEN** the Runner SHALL:
  1. Group quality gaps by category and affected feature area
  2. For each group, generate a NEW change spec — not a bug fix but a design+implementation change
  3. Each change spec SHALL include: the gaps it addresses (with evidence), what "good" looks like (from Library/reference), the affected screens/journeys, and the improvement category
  4. These change specs go through the Factory's full pipeline: design mode → implementation → QA (pass?) → PO Review (good enough?)

---

# PHASE RELATIONSHIP: THE EVALUATION FLOW

---

### Requirement: QA and PO Review are sequential, not parallel
The evaluation flow SHALL be strictly sequential: QA first, then PO Review. PO Review SHALL NOT run until QA passes.

#### Scenario: Full evaluation flow
- **WHEN** the Factory completes a build
- **THEN** the evaluation flow SHALL be:
  ```
  Factory completes build
      │
      ▼
  QA GATE
  "Does it match the spec?"
      │
      ├── FAIL → Bug fix brief → Factory → rebuild → QA again
      │
      ├── PASS ▼
      │
  PO REVIEW
  "Is the spec-compliant product good enough?"
      │
      ├── PRODUCTION_READY → next feature area or notify human
      │
      ├── NEEDS_IMPROVEMENT → generate new specs from gaps
      │       │               → Factory (full pipeline) → QA → PO Review
      │       │
      ├── NOT_READY → generate new specs from gaps
      │               → if confidence ≥0.7: Factory → QA → PO Review
      │               → if confidence <0.7: notify human
      │
      ▼
  Runner decides next action based on PO Review report
  ```

#### Scenario: QA failures never reach PO Review
- **WHEN** QA fails
- **THEN** the PO Review SHALL NOT run. There is no point assessing the quality of a product that doesn't even meet its own spec. Fix the bugs first.

#### Scenario: PO Review has QA context
- **WHEN** PO Review runs
- **THEN** it SHALL receive the QA report as context — specifically the `partial` warnings and the `performance_baseline`. PO Review can use this to inform its assessment (e.g., a `partial` criterion might indicate a quality issue, and performance data feeds into non-functional heuristic evaluation).

### Requirement: The output types are different
QA and PO Review produce fundamentally different outputs that drive different actions.

#### Scenario: QA output = bug fixes (same spec)
- **WHEN** QA fails
- **THEN** the output is a bug fix brief: "This specific acceptance criterion failed. Here's what was expected, here's what happened. Fix it." The Factory fixes the code to match the existing spec. No new design work needed.

#### Scenario: PO Review output = new specs (quality improvements)
- **WHEN** PO Review identifies quality gaps
- **THEN** the output is one or more NEW change specs: "The dashboard's information hierarchy is flat. Here's what it looks like (screenshot). Here's what it should look like (reference screenshot, heuristic). Design a new layout with clear primary/secondary/tertiary and implement it." This goes through design mode, not just code fixes.

#### Scenario: The distinction matters for the Factory
- **WHEN** the Factory receives a bug fix brief (from QA)
- **THEN** it SHALL go directly to implementation — fix the code, re-deploy
- **WHEN** the Factory receives a quality improvement spec (from PO Review)
- **THEN** it SHALL go through the full pipeline: design mode (how should this look/feel?) → implementation → QA → PO Review

### Requirement: Confidence score uses PO Review, not QA
The confidence score that the Runner uses to decide next actions SHALL be calculated from the PO Review report, not the QA report. QA is binary — it either passes or it doesn't. Confidence is a measure of quality beyond correctness.

#### Scenario: Confidence calculation
- **WHEN** the PO Review report is assembled
- **THEN** confidence SHALL be calculated as:
  - Journey quality (% of journeys at production-ready or acceptable): 30% weight
  - Screen quality (% of screens at production-ready or acceptable): 20% weight
  - Heuristic functional pass rate: 20% weight
  - Spec completeness (from QA report, passed through): 15% weight
  - Reference comparison (% of dimensions at matches or approaching): 15% weight
  - Non-functional heuristic results are reported separately, not included in confidence score (they affect "is it fast?" not "is it good?")

#### Scenario: Recommended action from PO Review
- **WHEN** confidence ≥ 0.9 AND verdict is PRODUCTION_READY
- **THEN** recommended action: `continue` (next feature area, or notify human if all areas done)
- **WHEN** confidence 0.7-0.9 AND verdict is NEEDS_IMPROVEMENT AND gaps are concentrated in one area
- **THEN** recommended action: `deepen:<feature-area>` with the quality gaps listed
- **WHEN** confidence 0.7-0.9 AND PO Review discovered capabilities needed but not in the spec
- **THEN** recommended action: `broaden:<missing-capability>`
- **WHEN** confidence < 0.7 OR verdict is NOT_READY with critical gaps
- **THEN** recommended action: `notify-human:<summary of critical gaps>`
