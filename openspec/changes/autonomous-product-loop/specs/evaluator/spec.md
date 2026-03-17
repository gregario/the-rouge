## ADDED Requirements

### Requirement: Evaluator runs criteria checking against the vision document
The Evaluator SHALL extract testable acceptance criteria from the vision document's structured format and verify each against the deployed product. Criteria are binary pass/fail — not scored.

#### Scenario: Criteria extraction from vision document
- **WHEN** evaluation begins
- **THEN** the Evaluator SHALL parse the vision document's `acceptance_criteria` section and extract each criterion as a testable assertion. Example: vision says "user can select a source piece to move" → criterion: navigate to game board, click on a piece, verify selection state appears (highlight, outline, or indicator)

#### Scenario: Criteria tested via browser automation
- **WHEN** a criterion describes a user-facing interaction (e.g., "dice roll has visible animation")
- **THEN** the Evaluator SHALL test it by: navigating to the relevant screen, triggering the interaction, capturing before/after screenshots, and using LLM vision to verify the expected visual change occurred

#### Scenario: Criteria tested via DOM analysis
- **WHEN** a criterion describes a structural property (e.g., "dashboard shows trip history")
- **THEN** the Evaluator SHALL test it by: navigating to the relevant screen, querying the DOM for expected elements (data tables, maps, charts), and verifying they contain data (not empty containers)

#### Scenario: Criteria failure report
- **WHEN** a criterion fails
- **THEN** the report SHALL include: the criterion text, the expected behavior, what was actually observed (with screenshot), the screen/URL where failure occurred, and a classification: `missing-feature` (not built yet), `broken-interaction` (built but doesn't work), `incomplete-implementation` (partially built)

### Requirement: Evaluator runs product sense checks via simulated user journeys
The Evaluator SHALL simulate a real user's first experience with the product — not checking criteria, but using the product naturally and reporting what feels wrong. This uses the user journeys defined in the vision document.

#### Scenario: User journey simulation procedure
- **WHEN** a product sense check runs
- **THEN** for each user journey defined in the vision document, the Evaluator SHALL:
  1. Start at the journey's entry point (URL)
  2. Read the screen and decide the next action a first-time user would take (LLM judgment, not scripted)
  3. Perform the action (click, type, navigate)
  4. Observe the result — screenshot + DOM state
  5. Assess: "Did this feel right? Was the response what a user would expect? Was there feedback for the action?"
  6. Continue until the journey's goal is reached or 10 actions have been taken without progress
  7. Report: steps taken, friction points, moments of confusion, dead ends, and overall journey assessment

#### Scenario: Friction point detection
- **WHEN** the simulated user takes an action and the result is ambiguous (e.g., clicked a button, nothing visibly changed, no loading indicator)
- **THEN** the Evaluator SHALL flag this as a friction point with: the action taken, the expected feedback, what actually happened, severity (minor: cosmetic, moderate: confusing, major: blocking)

#### Scenario: Journey fails to complete
- **WHEN** the simulated user cannot complete a defined journey within 10 actions
- **THEN** the Evaluator SHALL report: the journey name, how far it got, where it got stuck, what the user tried, and why progress stopped — classified as `missing-feature`, `broken-flow`, or `confusing-ux`

#### Scenario: Undiscovered flows
- **WHEN** the simulated user notices interactive elements or navigation options NOT covered by any defined journey
- **THEN** the Evaluator SHALL explore them (up to 3 undocumented paths) and report: what was found, whether it works, and whether it seems intentional or accidental

### Requirement: Evaluator collects external signals via browser QA
The Evaluator SHALL invoke browser-based QA testing on the deployed product to collect functional correctness signals.

#### Scenario: Browser QA test suite
- **WHEN** browser QA runs
- **THEN** it SHALL execute:
  1. **Page load check**: navigate to every route in the sitemap, verify HTTP 200, no blank pages, no crash screens
  2. **Console error check**: monitor browser console during all navigation, capture any uncaught errors or warnings
  3. **Interactive element check**: for every button, link, form input, and clickable element on each page, verify it responds to interaction (not dead/orphaned)
  4. **Form submission check**: for every form, submit with valid data and verify success feedback; submit with empty/invalid data and verify validation messages appear
  5. **Navigation check**: verify every nav link reaches a real page, back button works, no infinite loops

#### Scenario: Browser QA output format
- **WHEN** browser QA completes
- **THEN** it SHALL produce a structured report:
  - `pages_tested`: count and list of URLs
  - `pages_passing`: count of pages with zero issues
  - `console_errors`: list of errors with URL, error message, and stack trace
  - `dead_elements`: list of interactive elements that don't respond, with selector and page URL
  - `form_issues`: list of forms with missing validation or broken submission
  - `navigation_issues`: list of broken links or routing problems

### Requirement: Evaluator collects performance signals via Lighthouse
The Evaluator SHALL run Lighthouse audits on key pages and extract scores as non-functional quality signals.

#### Scenario: Lighthouse audit procedure
- **WHEN** performance evaluation runs
- **THEN** the Evaluator SHALL run Lighthouse on: the landing/home page, each primary navigation destination, and any page identified as a core journey endpoint — minimum 3 pages, maximum 10

#### Scenario: Lighthouse metrics extracted
- **WHEN** a Lighthouse audit completes
- **THEN** the Evaluator SHALL extract: Performance score (0-100), Accessibility score (0-100), SEO score (0-100), LCP (ms), FID/INP (ms), CLS (score), TTI (ms). Each metric SHALL be compared against the Library's non-functional heuristic thresholds.

### Requirement: Evaluator calculates spec-completeness
The Evaluator SHALL measure what percentage of the seed spec's defined features and acceptance criteria have been implemented and verified.

#### Scenario: Spec-completeness calculation
- **WHEN** evaluation runs
- **THEN** the Evaluator SHALL:
  1. Parse the seed spec for all defined features and acceptance criteria
  2. For each, determine status: `implemented-and-verified` (criteria check passed), `implemented-but-failing` (code exists but criteria check fails), `not-implemented` (no evidence of implementation)
  3. Report: total criteria count, implemented-and-verified count, percentage, and list of unimplemented/failing items

#### Scenario: Feature-area completeness for large products
- **WHEN** the product has multiple feature areas
- **THEN** spec-completeness SHALL be reported both per-feature-area and as an overall percentage, so the Runner can identify which areas need attention

### Requirement: Evaluator performs pairwise comparison against reference products
The Evaluator SHALL compare the built product against reference products on specific, named dimensions. Comparison uses LLM vision judgment on screenshots — "which is closer to the reference?" — the mode where LLM accuracy is ~93%.

#### Scenario: Reference comparison dimensions
- **WHEN** the vision document specifies a reference product (e.g., "navigation should feel like Linear")
- **THEN** the Evaluator SHALL compare on these dimensions:
  1. **Layout structure**: screenshot the reference's navigation, screenshot the product's navigation, ask "which more closely matches professional navigation patterns — A or B?" with the reference identified
  2. **Visual polish**: compare overall visual quality — typography consistency, spacing regularity, color harmony, element alignment
  3. **Information density**: compare how much useful information is visible without scrolling
  4. **Interaction patterns**: compare hover states, click feedback, loading indicators, transition animations
  5. Each dimension gets a verdict: `matches-reference`, `approaching-reference`, `significantly-below-reference`

#### Scenario: Reference product screenshots
- **WHEN** pairwise comparison runs
- **THEN** the Evaluator SHALL either:
  - Use cached reference screenshots from The Library (if the reference product has been screenshotted before)
  - Navigate to the reference product's public URL and capture fresh screenshots
  - If the reference product requires authentication or is unavailable, use the cached version and note the cache date

#### Scenario: Pairwise comparison output
- **WHEN** comparison completes
- **THEN** the report SHALL include: reference product name, each dimension compared, verdict per dimension, side-by-side screenshots (product vs reference), and specific observations (e.g., "Product uses 3 font sizes where Linear uses 2 — visual noise is higher")

### Requirement: Evaluator applies Library heuristics
The Evaluator SHALL apply every active heuristic from The Library (global + relevant domain + personal fingerprint) using each heuristic's defined measurement method and threshold.

#### Scenario: Heuristic evaluation procedure
- **WHEN** heuristic evaluation runs
- **THEN** for each active heuristic, the Evaluator SHALL:
  1. Read the heuristic's `measurement` field
  2. Execute the measurement (DOM analysis, screenshot + LLM vision, Lighthouse metric extraction, automated interaction, or journey simulation — depending on the measurement type)
  3. Compare the result against the `threshold`
  4. Record: heuristic id, pass/fail, measured value, threshold value, evidence (screenshot or data)

#### Scenario: Measurement method types
- **WHEN** executing a heuristic measurement
- **THEN** the measurement type SHALL be one of:
  - `dom-analysis`: query the DOM for structural properties (element counts, sizes, positions, styles)
  - `screenshot-llm`: capture a screenshot and use LLM vision to make a judgment call (e.g., "does this have clear visual hierarchy?")
  - `lighthouse-metric`: extract a specific Lighthouse metric and compare against threshold
  - `interaction-test`: simulate a user interaction and verify the response
  - `journey-test`: run a multi-step user journey and verify completion
  - `api-test`: make API calls and measure response times or validate responses

### Requirement: Evaluator produces a composite quality report
The Evaluator SHALL produce a single structured report after each evaluation cycle that The Runner uses to decide the next action.

#### Scenario: Report structure
- **WHEN** evaluation completes
- **THEN** the report SHALL contain:
  ```
  evaluation_report:
    timestamp: ISO 8601
    product: name and version
    deployment_url: URL tested against
    cycle_number: which iteration this is

    criteria_check:
      total: N
      passed: N
      failed: N
      failures: [{ criterion, expected, observed, screenshot, classification }]

    product_sense:
      journeys_tested: N
      journeys_completed: N
      friction_points: [{ action, expected, actual, severity }]
      dead_ends: [{ journey, stuck_at, reason }]

    browser_qa:
      pages_tested: N
      console_errors: N
      dead_elements: N
      form_issues: N
      details: { ... }

    performance:
      pages_audited: N
      avg_performance_score: N
      avg_accessibility_score: N
      worst_lcp: Nms
      worst_tti: Nms
      details_per_page: [{ url, scores }]

    spec_completeness:
      total_criteria: N
      verified: N
      percentage: N%
      unimplemented: [list]
      failing: [list]

    reference_comparison:
      reference_product: name
      dimensions: [{ name, verdict, observation }]

    heuristics:
      total_evaluated: N
      passed: N
      failed: N
      functional_pass_rate: N%
      nonfunctional_pass_rate: N%
      failures: [{ heuristic_id, expected, measured, tier }]

    confidence_score: 0.0-1.0
    recommended_action: continue | deepen:<area> | broaden:<missing> | notify-human:<reason>
  ```

#### Scenario: Confidence score calculation
- **WHEN** the report is assembled
- **THEN** confidence SHALL be calculated as a weighted composite:
  - Spec completeness: 30% weight
  - Criteria check pass rate: 25% weight
  - Heuristic pass rate: 20% weight
  - Product sense (journeys completed / journeys tested): 15% weight
  - Reference comparison (% of dimensions at `matches-reference` or `approaching-reference`): 10% weight
  - Non-functional scores are NOT included in confidence (they don't affect "is this product right?" — they affect "is this product fast?") but ARE reported separately

#### Scenario: Recommended action logic
- **WHEN** confidence ≥ 0.9 AND all criteria pass AND no major friction points
- **THEN** recommended action SHALL be `continue` (move to next feature area or notify human if all areas done)
- **WHEN** confidence 0.7-0.9 AND failures are concentrated in a specific feature
- **THEN** recommended action SHALL be `deepen:<feature-area>` with the failing criteria listed
- **WHEN** confidence 0.7-0.9 AND failures indicate missing features not in the spec
- **THEN** recommended action SHALL be `broaden:<missing-capability>` with what's missing
- **WHEN** confidence < 0.7
- **THEN** recommended action SHALL be `notify-human:<reason>` with a summary of what's wrong
