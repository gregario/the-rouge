## ADDED Requirements

---

# PHASE 0: TEST INTEGRITY GATE

The Test Integrity Gate answers: **"Are our tests still valid?"**

Before QA checks the product, we check the tests. Tests are derived from specs — if the spec changed, the tests must change. If a test doesn't map to a current spec criterion, it's orphaned. If a spec criterion has no test, there's a coverage gap. Without this gate, QA can pass falsely (stale tests testing old behaviour) or fail misleadingly (tests testing something that was intentionally changed).

---

### Requirement: Every test must be traceable to a spec criterion or PO check
Tests are not independent artifacts. Every test SHALL map to a specific acceptance criterion (for QA tests) or a specific PO check (for PO Review tests). Tests without a mapping are orphaned and should not run.

#### Scenario: Test-to-spec traceability
- **WHEN** the test suite is examined
- **THEN** every test SHALL have a `criterion_id` or `po_check_id` annotation that maps it to the spec. Example: test "trip row click shows map" maps to criterion `trip-history.AC-3`.

#### Scenario: Orphaned test detection
- **WHEN** a test's `criterion_id` does not match any criterion in the current active spec
- **THEN** the test SHALL be flagged as orphaned. Orphaned tests are: excluded from QA runs (they'd test something that's no longer specified), reported in the integrity check report, and queued for removal or re-mapping.

### Requirement: Test integrity check runs before every QA gate
Before QA executes, the Test Integrity Gate SHALL verify that the test suite accurately reflects the current spec.

#### Scenario: Integrity check procedure
- **WHEN** the Runner is about to enter `qa-gate` state
- **THEN** the Test Integrity Gate SHALL:
  1. Parse the current active spec for all acceptance criteria (extract IDs and descriptions)
  2. Parse the current PO check set for all instantiated checks (extract IDs)
  3. Scan the test suite for all test annotations (`criterion_id` and `po_check_id` mappings)
  4. Produce three lists:
     - **Covered**: spec criteria/PO checks that have matching tests ✅
     - **Uncovered**: spec criteria/PO checks that have NO matching test ❌ (coverage gap)
     - **Orphaned**: tests that map to criteria/checks no longer in the spec 🔴 (stale)
  5. Check for **stale tests**: for each covered criterion, has the criterion text changed since the test was last generated? If yes, the test may be testing old behaviour.

#### Scenario: Integrity check passes
- **WHEN** there are zero uncovered criteria, zero orphaned tests, and zero stale tests
- **THEN** the integrity check passes and QA proceeds normally

#### Scenario: Coverage gaps detected
- **WHEN** uncovered criteria are found (spec has criteria with no tests)
- **THEN** the Test Integrity Gate SHALL:
  1. Generate tests for the uncovered criteria using the spec's acceptance criteria text and the criterion's verification method
  2. Add the generated tests to the suite with proper `criterion_id` mapping
  3. Log: "Generated {N} new tests for uncovered criteria: {list}"
  4. Re-run the integrity check to confirm full coverage, then proceed to QA

#### Scenario: Orphaned tests detected
- **WHEN** orphaned tests are found (tests mapping to criteria no longer in spec)
- **THEN** the Test Integrity Gate SHALL:
  1. Exclude orphaned tests from the QA run
  2. Mark them for removal in the next commit
  3. Log: "Excluded {N} orphaned tests: {list} — these map to criteria no longer in the active spec"

#### Scenario: Stale tests detected
- **WHEN** stale tests are found (criterion text changed since test was generated)
- **THEN** the Test Integrity Gate SHALL:
  1. Regenerate the stale tests from the updated criterion text
  2. Replace the old test with the regenerated version
  3. Log: "Regenerated {N} stale tests for modified criteria: {list}"
  4. Re-run integrity check, then proceed to QA

#### Scenario: Spec changes trigger test regeneration, not patching
- **WHEN** a change spec modifies acceptance criteria
- **THEN** the Test Integrity Gate SHALL regenerate tests for the modified criteria from scratch (using the new criterion text), NOT attempt to patch the existing tests. This prevents test drift from accumulated patches.

### Requirement: Test coverage is measured against the spec, not the code
The north star for test completeness is: "every spec criterion has a test." Code coverage (branch, line, statement) is a supplementary signal collected during QA, but spec coverage is the primary measure.

#### Scenario: Spec coverage reported
- **WHEN** the test integrity check completes
- **THEN** it SHALL report:
  - `spec_coverage`: {covered} / {total criteria} = {percentage}%
  - `po_check_coverage`: {covered} / {total PO checks} = {percentage}%
  - `orphaned_count`: {N}
  - `stale_regenerated`: {N}
  - `newly_generated`: {N}

#### Scenario: Spec coverage threshold
- **WHEN** spec coverage is below 100%
- **THEN** the Test Integrity Gate SHALL block QA and generate the missing tests first. QA SHALL NOT run with coverage gaps — a missing test means a criterion goes unchecked, which defeats the purpose of the QA gate.

---

# PHASE 1: QA GATE

QA answers one question: **"Does what we built match what we said we'd build?"**

QA checks the product against the spec — acceptance criteria, user journeys, functional correctness. It is binary pass/fail. QA does NOT judge quality, aesthetics, production-readiness, or whether the spec itself was good enough. If the spec says "show a list of trips" and the product shows a list of trips, QA passes — even if the list is ugly, the hierarchy is flat, and the interaction is clunky.

**QA runs with a verified test suite.** The Test Integrity Gate has already confirmed that every spec criterion has a current, non-stale test. QA can trust its tests.

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

### Requirement: QA collects code quality baselines
QA SHALL collect code quality metrics after each build cycle. Like performance, these are non-functional signals — they do not block QA but are passed to PO Review and the Runner for trend analysis. However, if code quality degrades below critical thresholds, the Runner SHALL flag it.

#### Scenario: Static analysis metrics collected
- **WHEN** QA runs after a build cycle
- **THEN** it SHALL run static analysis and collect:
  - Cyclomatic complexity per function (max and average)
  - Code duplication report (blocks ≥6 lines duplicated >2 times)
  - File size distribution (count of files exceeding 300 lines)
  - New static analysis warnings introduced in this cycle (diff against previous cycle)
  - Dead code detection (unused exports, unreachable paths)
  - Test coverage on feature code (branch coverage %)

#### Scenario: Architecture integrity check
- **WHEN** QA runs after a build cycle
- **THEN** it SHALL:
  1. Generate a module dependency graph from the codebase
  2. Check for circular dependencies (threshold: zero)
  3. Check for cross-layer violations (presentation importing data access directly — threshold: zero)
  4. Diff the dependency graph against the previous cycle's graph and against the design mode's intended architecture
  5. Generate and store an architecture visualization for the evaluation report
  6. If API contracts exist, extract the current schema and diff against previous cycle — flag unspecified changes

#### Scenario: Code quality data passed through
- **WHEN** code quality metrics are collected
- **THEN** they SHALL be included in the QA report as `code_quality_baseline` alongside `performance_baseline` — informational data for the PO Review and Runner, NOT used to determine QA pass/fail

#### Scenario: Critical code quality degradation flagged
- **WHEN** code quality metrics show critical degradation:
  - Cyclomatic complexity max >30 (any function)
  - Code duplication >5% of codebase
  - New static analysis warnings >10 in a single cycle
  - Circular dependencies introduced
  - Test coverage drops below 60%
- **THEN** QA SHALL flag a `code_quality_warning` in the report. This does NOT fail QA (the product may still work) but the Runner SHALL treat it as a signal that the codebase is degrading and may need a refactoring cycle before further feature work

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

    code_quality_baseline:
      complexity_max: N
      complexity_avg: N
      duplication_percentage: N%
      files_over_300_lines: N
      new_warnings: N
      dead_code_items: N
      test_coverage_branch: N%
      circular_dependencies: N
      cross_layer_violations: N
      architecture_diff: [{ added_dependency, removed_dependency, unintended }]
      api_contract_changes: [{ endpoint, change_type, in_spec: bool }]
      code_quality_warning: bool

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

### Requirement: PO Review executes instantiated journey checks mechanically
The PO Review SHALL NOT "assess" journey quality via open-ended judgment. It SHALL execute the product-specific PO checks that the Seeder generated from Library check templates. Each check is a given/when/then with a measurement method and pass/fail threshold — same mechanical execution as QA, just checking quality instead of correctness.

#### Scenario: Journey check execution procedure
- **WHEN** PO Review evaluates a user journey
- **THEN** for each journey step that passed QA, it SHALL:
  1. Load the instantiated PO checks for this step from the seed spec's `po_checks.journey_checks` section
  2. Navigate to the step's screen
  3. Execute EACH check mechanically:
     - Read the check's `given` (precondition), `when` (trigger), `then` (expected outcome)
     - Perform the trigger action
     - Execute the measurement method (screenshot-diff, timing-capture, DOM query, LLM vision, etc.)
     - Compare result against threshold
     - Record: check ID, template source, pass/fail, measured value, threshold, evidence (screenshot or data)
  4. After all checks for this step: compute step quality from check results
  5. After all steps: compute journey quality from step results

#### Scenario: Step quality derived from check results
- **WHEN** all checks for a journey step have been executed
- **THEN** the step's per-dimension quality SHALL be derived from the check results:
  - `clarity`: derived from clarity template checks (next-action, label-quality, affordance). All pass = `clear`. Any fail = `ambiguous`. Multiple fail = `confusing`.
  - `feedback`: derived from feedback template checks (visual-response, loading-indicator, success-confirmation, error-specificity). All pass = `satisfying`. Any fail = `adequate`. Multiple fail = `missing`.
  - `efficiency`: derived from efficiency template checks (step-necessity, no-redundant-confirm). All pass = `optimal`. Any fail = `acceptable`. Multiple fail = `wasteful`.
  - `delight`: derived from delight template checks (contextual-copy, microinteraction). All pass = `delightful`. Any fail = `neutral`. Multiple fail = `frustrating`.
  - Step overall: `strong` (no dimension below adequate) | `weak` (one dimension below adequate) | `failing` (multiple dimensions below adequate)

#### Scenario: Journey verdict derived from step results
- **WHEN** all steps in a journey have been evaluated
- **THEN** the journey verdict SHALL be:
  - `production-ready`: no step rated `failing`, at most 1 step rated `weak`
  - `acceptable-with-improvements`: no step rated `failing`
  - `not-production-ready`: any step rated `failing`

#### Scenario: Failed checks generate quality gaps with full context
- **WHEN** a PO check fails
- **THEN** the PO Review SHALL generate a quality gap entry containing:
  - Which journey, which step, which check failed
  - The check's template source (so the gap references a Library-defined standard)
  - What was measured and what the threshold was
  - Evidence (screenshot, timing data, DOM snapshot)
  - What "good" looks like: the template's description of the expected outcome
  - Improvement category: derived from the check's dimension (feedback checks → interaction_improvement, clarity checks → design_change, efficiency checks → flow_restructure, delight checks → interaction_improvement)

### Requirement: PO Review executes instantiated screen checks mechanically
The PO Review SHALL execute the product-specific screen checks that the Seeder generated, plus the Library's screen-level heuristics. Each screen check has a measurement and threshold — no open-ended assessment.

#### Scenario: Screen check execution procedure
- **WHEN** PO Review evaluates a screen
- **THEN** it SHALL:
  1. Load the instantiated screen checks from the seed spec's `po_checks.screen_checks` section for this screen
  2. Navigate to the screen URL
  3. Execute each product-specific screen check:
     - **Hierarchy check**: The seed spec defines what the primary element on this screen should be (e.g., "total fleet mileage"). Measure: find that element in DOM, calculate its visual prominence score (font-size × weight × position), compare against all other elements. Pass: named primary element is the most visually prominent. Fail: another element is more prominent or elements are equal weight.
     - **Density check**: The seed spec defines the expected density and minimum datapoints above fold. Measure: count distinct data-bearing elements in the above-fold viewport. Pass: count ≥ specified minimum. Fail: count below minimum.
  4. Execute Library heuristics applicable to screens:
     - `hierarchy-primary`: primary score ≥1.5x secondary (generic, applied to all screens)
     - `hierarchy-levels`: 3 visual weight tiers present
     - `visual-consistency`: compare computed styles against other screenshotted screens
     - `mobile-responsive`: render at 375px, check for overflow/overlap
     - `empty-state-guidance`: trigger empty state, verify CTA exists
     - `five-state-coverage`: trigger each state, verify distinct renders
  5. Each check: record pass/fail, measurement, threshold, evidence

#### Scenario: Screen quality derived from check results
- **WHEN** all checks for a screen have been executed
- **THEN** the screen SHALL receive per-dimension verdicts derived from check results:
  - `hierarchy`: from hierarchy checks. All pass = `production-ready`. Any fail = `needs-work`. Primary element wrong = `failing`.
  - `layout`: from density checks + LLM vision "does this have intentional structure?" All pass = `production-ready`. Fail = `needs-work` or `failing`.
  - `consistency`: from visual-consistency heuristic. Pass = `production-ready`. Fail = `needs-work`.
  - `density`: from product-specific density check. Pass = `production-ready`. Fail = `needs-work`.
  - `edge_states`: from five-state-coverage + empty-state-guidance. All pass = `production-ready`. Any fail = `needs-work`. Critical state missing = `failing`.
  - `mobile`: from mobile-responsive heuristic. Pass = `production-ready`. Fail = `needs-work` (minor issues) or `failing` (unusable).
  - Overall: `production-ready` (no failing, ≤1 needs-work) | `acceptable` (no failing) | `not-production-ready` (any failing)

### Requirement: PO Review executes instantiated interaction checks mechanically
The PO Review SHALL execute the product-specific interaction checks from the seed spec, plus the Library's interaction-level heuristics. Each check has a measurement — no subjective assessment.

#### Scenario: Interaction check execution procedure
- **WHEN** PO Review evaluates an interaction defined in `po_checks.interaction_checks`
- **THEN** it SHALL:
  1. Navigate to the element's screen
  2. Execute checks based on the interaction type:
     - **All interactions**: run `template.feedback.visual-response` (hover state + click feedback). Measure: simulate hover, screenshot-diff for style change. Simulate click, screenshot-diff at +200ms.
     - **Form submits**: run `template.feedback.success-confirmation` (contextual success message). Measure: submit form, capture confirmation text, LLM judgment on contextuality.
     - **Destructive actions**: verify confirmation dialog exists before execution.
     - **Data loading actions**: run `template.feedback.loading-indicator` (spinner/skeleton during load).
     - **State transitions**: run `template.transitions.state-change` (animated transition, not instant swap).
  3. Each check: record pass/fail, measurement, threshold, evidence

#### Scenario: Interaction quality derived from check results
- **WHEN** all checks for an interaction have been executed
- **THEN** the interaction SHALL be rated:
  - `polished`: all checks pass (hover responds, click gives feedback, loading shows indicator, success confirms contextually, transitions are animated)
  - `functional`: ≥50% of checks pass (it works but lacks polish)
  - `raw`: <50% of checks pass (minimal or no quality signals)
- **AND** `raw` interactions SHALL generate quality gaps with the specific failing checks, their evidence, and what the template defines as "good"

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

### Requirement: Test Integrity, QA, and PO Review are sequential
The evaluation flow SHALL be strictly sequential: Test Integrity Gate first, then QA, then PO Review. Each phase must pass before the next runs.

#### Scenario: Full evaluation flow
- **WHEN** the Factory completes a build
- **THEN** the evaluation flow SHALL be:
  ```
  Factory completes build
      │
      ▼
  TEST INTEGRITY GATE
  "Are our tests still valid?"
      │
      ├── Coverage gaps → generate missing tests
      ├── Stale tests → regenerate from updated spec
      ├── Orphaned tests → exclude and remove
      │
      ├── ALL CLEAR ▼
      │
  QA GATE
  "Does it match the spec?" (with verified tests)
      │
      ├── FAIL → Bug fix brief → Factory → rebuild → Test Integrity → QA again
      │
      ├── PASS ▼
      │
  PO REVIEW
  "Is the spec-compliant product good enough?"
      │
      ├── PRODUCTION_READY → promote to production → next feature area or notify human
      │
      ├── NEEDS_IMPROVEMENT → generate new specs from gaps
      │       │               → Factory (full pipeline) → Test Integrity → QA → PO Review
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
