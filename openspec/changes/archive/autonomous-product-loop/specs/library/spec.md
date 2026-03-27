## ADDED Requirements

### Requirement: Library stores global product standards as testable heuristics
The Library SHALL maintain global standards as concrete, testable heuristic entries. Each heuristic SHALL have a name, a natural-language rule, a measurement method, a pass/fail threshold, and a classification as functional or non-functional. These are not vague principles — they are assertions that can be evaluated programmatically or via LLM judgment against a deployed product.

#### Scenario: New product inherits all global heuristics
- **WHEN** the Runner begins a new project
- **THEN** The Library SHALL provide every active global heuristic as an evaluation criterion to The Evaluator

#### Scenario: Heuristic entry structure
- **WHEN** a heuristic is stored in The Library
- **THEN** it SHALL contain:
  - `id`: unique identifier (e.g., `global.product.hierarchy-primary`)
  - `name`: human-readable name (e.g., "Single primary element per screen")
  - `rule`: the assertion in plain English (e.g., "Every screen SHALL have exactly one visually dominant element that communicates the screen's primary purpose")
  - `measurement`: how to test it (e.g., "DOM analysis: identify element with largest font-size × weight product in the above-the-fold viewport. Verify no other element within 80% of that score exists")
  - `threshold`: pass/fail criteria (e.g., "Primary element score must be ≥1.5x the second-highest element")
  - `type`: `functional` or `non-functional`
  - `tier`: `global`, `domain`, or `personal`
  - `domain`: null for global, otherwise `web` | `game` | `artifact`
  - `source`: where this heuristic came from (e.g., "seed", "feedback:2026-03-20", "retrospective:2026-04-01")
  - `version`: integer, incremented on update
  - `status`: `active` | `deprecated`
  - `deprecated_reason`: null unless deprecated

#### Scenario: Day-one seed includes concrete heuristics
- **WHEN** The Library is initialized
- **THEN** it SHALL contain at minimum the following seeded heuristics:

**Product standards (functional):**
- `hierarchy-primary`: Every screen SHALL have exactly one visually dominant primary element. Measurement: DOM analysis of font-size, weight, and position. Threshold: primary score ≥1.5x secondary.
- `hierarchy-levels`: Every screen SHALL have distinguishable primary, secondary, and tertiary content levels. Measurement: identify 3 distinct visual weight tiers in the content area. Threshold: 3 tiers present.
- `three-click-rule`: Core user tasks SHALL complete in ≤3 clicks from the entry point. Measurement: automated user journey simulation counting click events. Threshold: ≤3 for each core task defined in the vision document.
- `five-state-coverage`: Every interactive screen SHALL handle 5 states: empty, loading, populated, error, overflow. Measurement: navigate to each screen, trigger each state, verify distinct UI renders. Threshold: all 5 states render without crash or blank screen.
- `progressive-disclosure`: Screens with >7 interactive elements SHALL use progressive disclosure — primary actions visible, secondary in menus/expandable sections. Measurement: count visible interactive elements on initial render. Threshold: ≤7 primary actions visible; remainder accessible via one interaction.
- `user-journey-completeness`: Every user journey defined in the vision document SHALL be completable end-to-end without dead ends. Measurement: automated journey simulation. Threshold: 100% of defined journeys complete successfully.
- `error-recovery`: Every error state SHALL offer a recovery action (retry, go back, contact support). Measurement: trigger error states, verify recovery CTA exists. Threshold: 100% of error states have a recovery path.

**Design standards (functional):**
- `visual-consistency`: Color palette, typography, and spacing SHALL be consistent across all screens. Measurement: extract computed styles from all screens, compare for variance. Threshold: ≤2 font families, ≤5 font sizes, ≤8 colors in active use.
- `interactive-feedback`: Every clickable element SHALL provide visual feedback on hover and click. Measurement: simulate hover and click on all interactive elements, verify style change. Threshold: 100% of interactive elements respond.
- `animation-state-transitions`: Navigation between screens and state changes (loading → populated, action → result) SHALL have transition animations. Measurement: monitor for CSS transitions or animation frames during state changes. Threshold: ≥80% of state transitions are animated.
- `mobile-responsive`: Web products SHALL be usable on viewport widths ≥375px. Measurement: render at 375px, 768px, 1024px, 1440px widths. Threshold: no horizontal scroll, no overlapping elements, all interactive elements ≥44px tap target.
- `empty-state-guidance`: Empty states SHALL guide the user toward the first action (not just "no data"). Measurement: trigger empty state on each screen, verify CTA or guidance text exists. Threshold: 100% of empty states have guidance.

**Engineering standards (non-functional):**
- `page-load-time`: Pages SHALL load in <2 seconds on a simulated 4G connection. Measurement: Lighthouse performance audit. Threshold: LCP <2000ms.
- `time-to-interactive`: Pages SHALL be interactive within 3 seconds. Measurement: Lighthouse TTI metric. Threshold: TTI <3000ms.
- `lighthouse-performance`: Lighthouse performance score SHALL be ≥80. Measurement: Lighthouse CI. Threshold: score ≥80.
- `lighthouse-accessibility`: Lighthouse accessibility score SHALL be ≥90. Measurement: Lighthouse CI. Threshold: score ≥90.
- `no-console-errors`: Pages SHALL produce zero uncaught console errors during normal usage. Measurement: browser QA with console monitoring. Threshold: 0 errors.
- `api-response-time`: API endpoints SHALL respond in <500ms for read operations and <1000ms for write operations. Measurement: automated API timing during user journey simulation. Threshold: p95 <500ms reads, <1000ms writes.

**Code quality standards (non-functional):**
- `code-complexity`: No source file SHALL exceed a cyclomatic complexity of 20 per function. Measurement: static analysis (ESLint complexity rule, or language-equivalent). Threshold: max complexity 20 per function, average <10 across codebase.
- `code-duplication`: No code block of ≥6 lines SHALL be duplicated more than twice in the codebase. Measurement: duplication detection tool (jscpd or language-equivalent). Threshold: ≤2 instances of any block ≥6 lines.
- `file-size`: No source file SHALL exceed 300 lines. Measurement: line count per file. Threshold: ≤300 lines per file. (Test files exempt up to 500 lines.)
- `dependency-count`: New external dependencies SHALL be justified in the Factory's `factory_decisions` context. Measurement: diff `package.json` (or equivalent) before and after build cycle. Threshold: every new dependency has a recorded justification. Unjustified additions are flagged.
- `static-analysis-warnings`: Zero new static analysis warnings SHALL be introduced per build cycle. Measurement: run linter before and after, diff warning counts. Threshold: new warnings = 0. (Pre-existing warnings tracked separately for reduction over time.)
- `dead-code`: No unreachable or unused exports SHALL exist in the codebase. Measurement: static analysis for unused exports, unreachable code paths. Threshold: 0 dead code items.
- `test-coverage-floor`: Code implementing acceptance criteria SHALL have ≥80% branch coverage. Measurement: coverage tool (c8, istanbul, or language-equivalent). Threshold: ≥80% branch coverage on feature code. (Utility/config files exempt.)

**Architectural integrity standards (non-functional):**
- `architecture-drift`: The implemented architecture SHALL match the architecture defined during design mode. Measurement: after each build cycle, generate an architecture diagram (module dependency graph) from the code and compare against the design mode's intended architecture. Threshold: no unintended cross-module dependencies, no circular dependencies, no components in the wrong architectural layer.
- `architecture-visualization`: After each build cycle, an architecture diagram SHALL be generated from the codebase and stored alongside the evaluation report. Measurement: automated dependency graph generation (e.g., Madge for JS, or language-equivalent). Threshold: diagram generated successfully and diff'd against previous cycle's diagram.
- `api-contract-stability`: Public API contracts (route signatures, request/response schemas) SHALL not change unintentionally between cycles. Measurement: generate API schema from code (OpenAPI extraction or equivalent), diff against previous cycle. Threshold: any changes must be present in the active spec. Unspecified changes are flagged.
- `layer-separation`: Code SHALL maintain clean separation between layers (presentation, business logic, data access). Measurement: static analysis of import paths — presentation layer files SHALL NOT import data access layer files directly. Threshold: zero cross-layer violations.

### Requirement: Library stores PO Review check templates
The Library SHALL maintain check templates — reusable given/when/then quality checks that get instantiated per product during seeding. Check templates define HOW to mechanically evaluate a quality dimension, independent of any specific product. The Seeder combines these templates with product context to generate product-specific PO checks.

Heuristics define WHAT to check at the screen level ("does this screen have information hierarchy?"). Check templates define HOW to check at the journey-step level ("for this specific interaction, is the feedback timely, is the transition animated, is the next action clear?").

#### Scenario: Check template structure
- **WHEN** a check template is stored in The Library
- **THEN** it SHALL contain:
  - `id`: unique identifier (e.g., `template.feedback.visual-response-time`)
  - `dimension`: which quality dimension this checks (`clarity` | `feedback` | `efficiency` | `delight` | `hierarchy` | `density` | `consistency` | `transitions`)
  - `applies_to`: what this template checks (`journey-step` | `screen` | `interaction`)
  - `given`: precondition (parameterized, e.g., "GIVEN the user has performed {action} on {element}")
  - `when`: trigger (parameterized, e.g., "WHEN {action} is executed")
  - `then`: expected outcome with measurement (e.g., "THEN within {threshold}ms there SHALL be a visual change on {element} or its container")
  - `measurement_method`: how to verify — `screenshot-diff` | `dom-query` | `timing-capture` | `viewport-analysis` | `style-extraction` | `llm-vision`
  - `default_threshold`: the default pass/fail value (overridable per product)
  - `parameters`: list of placeholders that the Seeder fills in per product (e.g., `{action}`, `{element}`, `{threshold}`)

#### Scenario: Day-one seed check templates — Feedback dimension
- **WHEN** The Library is initialized
- **THEN** it SHALL contain these feedback check templates:

  **Visual response time:**
  - `template.feedback.visual-response`: GIVEN the user clicks {element}. WHEN the click occurs. THEN within 200ms there SHALL be a visual change (highlight, color shift, spinner, ripple) on the element or its immediate container. Measurement: capture timestamp of click event, capture screenshot at +200ms, diff against pre-click screenshot. Pass: diff detected within element bounds. Fail: no diff.

  **Loading indicator:**
  - `template.feedback.loading-indicator`: GIVEN the user performs {action} that triggers a server request. WHEN the request takes >500ms. THEN a loading indicator SHALL be visible (spinner, skeleton, progress bar) within the {target_area}. Measurement: intercept network request, if response >500ms, capture screenshot at 600ms, verify loading element in DOM. Pass: loading element visible. Fail: static screen or no indicator.

  **Success confirmation:**
  - `template.feedback.success-confirmation`: GIVEN the user completes {action} (form submit, save, delete). WHEN the action succeeds. THEN there SHALL be a visible success indicator (toast, inline message, state change, redirect to success screen) within 1 second. Measurement: capture screenshot at +1s after action, verify new element or state change. Pass: confirmation visible. Fail: no visible change or generic/ambiguous response.

  **Error feedback:**
  - `template.feedback.error-specificity`: GIVEN the user performs {action} that fails. WHEN the error occurs. THEN the error message SHALL be specific to what went wrong (not "Something went wrong" but "Email already registered" or "File too large — max 5MB"). Measurement: trigger error, extract error message text, LLM judgment on specificity. Pass: message names the specific issue. Fail: generic or vague message.

#### Scenario: Day-one seed check templates — Clarity dimension
- **WHEN** The Library is initialized
- **THEN** it SHALL contain these clarity check templates:

  **Next action obvious:**
  - `template.clarity.next-action`: GIVEN the user is on {screen} at step {N} of {journey}. WHEN they look for the next action. THEN there SHALL be ≤2 visually prominent interactive elements competing for attention (the intended next action should be dominant). Measurement: screenshot the viewport, identify all interactive elements, measure visual prominence (size × contrast × position). Pass: the intended next action is the most or second-most prominent element. Fail: intended action is visually equal to 3+ alternatives or not visible.

  **Label descriptiveness:**
  - `template.clarity.label-quality`: GIVEN an interactive element on {screen}. WHEN the label is read. THEN it SHALL describe the outcome, not the mechanism (e.g., "Save Trip" not "Submit", "View on Map" not "Click Here"). Measurement: extract all button/link text on screen, LLM judgment per label — is it action-outcome descriptive? Pass: ≥90% of labels are descriptive. Fail: <90%.

  **Visual affordance:**
  - `template.clarity.affordance`: GIVEN a clickable element on {screen}. WHEN a user sees it. THEN it SHALL look interactive (styled as a button, link, or card with hover cursor). Measurement: for each clickable element, check computed styles — does it have button styling, underline, or pointer cursor? Pass: 100% of interactive elements have visual affordance. Fail: any interactive element styled as plain text/div without interaction cues.

#### Scenario: Day-one seed check templates — Efficiency dimension
- **WHEN** The Library is initialized
- **THEN** it SHALL contain these efficiency check templates:

  **Step necessity:**
  - `template.efficiency.step-necessity`: GIVEN step {N} in {journey}. WHEN the step's purpose is analyzed. THEN the step SHALL serve a purpose that cannot be merged with the previous or next step. Measurement: LLM judgment — "Could this step be eliminated or combined with an adjacent step without losing functionality?" Pass: step is necessary. Fail: step could be eliminated or merged.

  **Redundant confirmation:**
  - `template.efficiency.no-redundant-confirm`: GIVEN a non-destructive action in {journey}. WHEN the action is triggered. THEN there SHALL NOT be a "are you sure?" confirmation dialog. Measurement: perform action, check for confirmation modal/dialog. Pass: no confirmation for non-destructive actions. Fail: unnecessary confirmation dialog appears. (Note: destructive actions like delete SHOULD have confirmation — this template only applies to non-destructive actions.)

#### Scenario: Day-one seed check templates — Transitions dimension
- **WHEN** The Library is initialized
- **THEN** it SHALL contain these transition check templates:

  **Screen transition animation:**
  - `template.transitions.screen-change`: GIVEN the user navigates from {screen_a} to {screen_b}. WHEN the navigation occurs. THEN there SHALL be an animated transition (not an instant content swap). Measurement: capture 3 screenshots over 300ms during transition (0ms, 150ms, 300ms). Pass: frame at 150ms is visually different from both start and end frames (intermediate state exists). Fail: frame at 150ms matches the end frame (instant swap).

  **State transition animation:**
  - `template.transitions.state-change`: GIVEN a state change occurs on {screen} (loading→populated, action→result, expand→collapse). WHEN the state changes. THEN the transition SHALL be animated. Measurement: same 3-frame capture method. Pass: intermediate frame detected. Fail: instant swap.

#### Scenario: Day-one seed check templates — Delight dimension
- **WHEN** The Library is initialized
- **THEN** it SHALL contain these delight check templates:

  **Contextual copy:**
  - `template.delight.contextual-copy`: GIVEN a success/empty/error state on {screen}. WHEN the state message is displayed. THEN it SHALL be contextual to what the user just did (e.g., "Trip saved — 127km logged" not "Success"). Measurement: extract state message text, LLM judgment — is it contextual and specific? Pass: message references the user's action or data. Fail: generic message.

  **Microinteraction presence:**
  - `template.delight.microinteraction`: GIVEN an interactive element on {screen} in a core journey. WHEN the user interacts with it. THEN there SHALL be a microinteraction beyond basic state change (e.g., button ripple, icon animation, counter increment animation, card expand animation). Measurement: capture interaction as 5 frames over 500ms, identify animation frames. Pass: animation detected beyond simple opacity/display toggle. Fail: only basic toggle or no animation.

### Requirement: Library stores domain-specific taste as domain heuristic sets
The Library SHALL maintain separate heuristic sets for each product domain. Domain heuristics use the same entry structure as global heuristics but are scoped to their domain and only applied when evaluating products of that domain type.

#### Scenario: Domain taste informs evaluation
- **WHEN** The Evaluator assesses a web product
- **THEN** it SHALL apply global heuristics AND web domain heuristics, but NOT game or artifact domain heuristics

#### Scenario: Web domain seed heuristics
- **WHEN** The Library is initialized
- **THEN** the web domain SHALL be seeded with at minimum:
  - `web.nav-persistent`: Primary navigation SHALL be visible on every screen (sidebar, top bar, or bottom bar). Measurement: verify nav element present in DOM on every route. Threshold: 100% of routes.
  - `web.above-fold-value`: The above-the-fold area SHALL communicate the page's primary value proposition without scrolling. Measurement: screenshot at 1440×900, verify primary element is fully visible. Threshold: primary element ≥50% visible.
  - `web.form-validation-inline`: Form validation errors SHALL appear inline next to the offending field, not as a page-level banner. Measurement: submit forms with invalid data, check error placement. Threshold: 100% of validation errors are inline.
  - `web.breadcrumb-depth`: Pages ≥3 levels deep in navigation SHALL show breadcrumbs or equivalent wayfinding. Measurement: navigate to deep pages, check for breadcrumb/back-path UI. Threshold: 100% of pages ≥3 levels deep.

#### Scenario: Game and artifact domains start empty
- **WHEN** The Library is initialized
- **THEN** game and artifact domain heuristic sets SHALL be empty (populated through future usage and feedback)

#### Scenario: Domain taste grows from shipped products
- **WHEN** a product is shipped and the human provides domain-relevant feedback
- **THEN** the feedback SHALL be converted into a new domain heuristic entry with the same structure (id, rule, measurement, threshold) and added to that domain's set

### Requirement: Library stores personal taste fingerprint as weighted preferences
The personal taste fingerprint SHALL be a collection of weighted preference entries — not vague descriptors but specific, ranked tendencies observed from feedback patterns. Each preference has a strength (how consistently the human expresses it) and a recency weight (recent feedback counts more).

#### Scenario: Fingerprint entry structure
- **WHEN** a personal preference is recorded
- **THEN** it SHALL contain:
  - `id`: unique identifier (e.g., `personal.density-over-whitespace`)
  - `preference`: plain-English description (e.g., "Prefers information-dense layouts over generous whitespace")
  - `evidence`: list of feedback instances that support this preference, each with date and source quote
  - `strength`: float 0.0-1.0 based on consistency (0.3 = mentioned once, 0.7 = mentioned 3+ times, 1.0 = never contradicted across 5+ instances)
  - `last_expressed`: date of most recent supporting evidence
  - `contradictions`: list of any feedback instances that contradict this preference (weakens strength)
  - `applies_to`: `all` | `web` | `game` | `artifact` (scoped preference)

#### Scenario: Fingerprint pattern detection
- **WHEN** the human provides feedback for the 3rd time on the same dimension (e.g., information hierarchy complaints across 3 different products)
- **THEN** The Library SHALL automatically detect the pattern, create a fingerprint entry with strength ≥0.7, and flag it in the next morning briefing: "Socrates noticed you've flagged flat information hierarchy on 3 products. Added to your taste fingerprint."

#### Scenario: Fingerprint informs design phase
- **WHEN** The Factory enters design mode for a new project
- **THEN** The Library SHALL provide all fingerprint entries with strength ≥0.5 as design constraints, formatted as: "The human prefers X (strength: 0.8, based on 4 instances). Apply this as a default unless the vision document explicitly overrides it."

#### Scenario: Fingerprint decay
- **WHEN** a preference has not been expressed or reinforced in 6+ months
- **THEN** its effective strength SHALL decay by 0.1 per month, reaching a floor of 0.2 (never fully forgotten, but weakened)

### Requirement: Library separates functional and non-functional standards
Every heuristic entry in The Library SHALL be classified as `functional` (product/design decisions about what the product does) or `non-functional` (engineering constraints about how well it does it). The Evaluator SHALL report these dimensions separately.

#### Scenario: Functional failure reported separately
- **WHEN** a product passes all non-functional heuristics (fast, accessible, no errors) but fails functional heuristics (flat hierarchy, missing user journey)
- **THEN** the evaluation report SHALL show: "Non-functional: PASS (18/18). Functional: FAIL (14/20 — 6 failures)." The failures SHALL be listed individually.

#### Scenario: Non-functional failure reported separately
- **WHEN** a product passes all functional heuristics but fails non-functional (slow page load, poor Lighthouse score)
- **THEN** the evaluation report SHALL show: "Functional: PASS (20/20). Non-functional: FAIL (15/18 — 3 failures)." The failures SHALL be listed individually.

### Requirement: Library classifies incoming feedback automatically
The Library SHALL classify incoming human feedback into: global standard, domain-specific heuristic, or personal preference — and tag each as functional or non-functional. Classification SHALL be automated by LLM analysis of the feedback text, with human override via Slack reply.

#### Scenario: Feedback classification logic
- **WHEN** feedback is received (e.g., "the navigation on every SaaS product is always in the wrong place")
- **THEN** The Library SHALL analyze:
  1. Does this apply to all products or a specific domain? ("every SaaS product" → domain:web)
  2. Is this about what the product does or how well? ("navigation in wrong place" → functional)
  3. Is this a general standard or a personal preference? ("always" + structural concern → domain heuristic, not personal preference)
  4. Result: new `web` domain heuristic, functional, with rule derived from feedback

#### Scenario: Ambiguous feedback triggers confirmation
- **WHEN** feedback classification is ambiguous (e.g., "this feels slow" — could be non-functional page load or functional perception of too many steps)
- **THEN** The Library SHALL classify with its best guess AND send a confirmation via the Notifier: "Socrates classified 'this feels slow' as non-functional (page load). Is that right, or did you mean the workflow has too many steps (functional)?"

### Requirement: Library entries are versioned and prunable
Every Library entry SHALL have a version history. Entries can be updated (new version) or deprecated (excluded from evaluation but preserved in history).

#### Scenario: Entry update creates new version
- **WHEN** a heuristic threshold is adjusted (e.g., changing page load from <2s to <1.5s based on feedback)
- **THEN** the version SHALL increment, the previous version SHALL be preserved, and the changelog SHALL record: old value, new value, reason for change, date

#### Scenario: Deprecated entry excluded
- **WHEN** an entry is deprecated
- **THEN** it SHALL not be included in any future evaluation, its `status` SHALL be set to `deprecated`, and `deprecated_reason` SHALL explain why

#### Scenario: Conflicting entries detected
- **WHEN** two active entries conflict (e.g., "prefer whitespace" and "prefer density")
- **THEN** The Library SHALL flag the conflict in the next retrospective and present it to the human for resolution — either deprecate one, scope them to different domains, or merge into a nuanced rule
