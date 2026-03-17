## ADDED Requirements

### Requirement: Runner orchestrates the build-evaluate-iterate loop
The Runner SHALL manage the full autonomous cycle as a state machine with defined states and transitions. Each state persists to disk so the loop can survive crashes and resume.

#### Scenario: State machine definition
- **WHEN** the Runner is operating
- **THEN** it SHALL transition through these states:
  1. `seeding` → Seeder is active, human is interacting. Exit: human approves seed.
  2. `building` → Factory is building a scoped brief. Exit: Factory reports build complete with deployment URL.
  3. `qa-gate` → QA phase running: checking if build matches spec. Exit: QA verdict PASS or FAIL.
  4. `qa-fixing` → QA failed, Factory is fixing bugs against existing spec. Exit: Factory re-deploys, return to `qa-gate`.
  5. `po-reviewing` → PO Review phase running: checking if spec-compliant product meets production quality bar. Exit: PO Review report with verdict and quality gaps.
  6. `analyzing` → Runner is processing the PO Review report, deciding next action. Exit: decision made (continue, deepen, broaden, or notify).
  7. `generating-change-spec` → Runner is creating NEW specs from quality gaps (not bug fixes — design+implementation changes). Exit: change specs written.
  8. `vision-checking` → Runner is comparing overall progress against the vision document. Exit: vision check passes or escalation triggered.
  9. `waiting-for-human` → Notifier has sent a message, Runner is paused waiting for response. Exit: human responds.
  10. `complete` → All feature areas meet the quality bar. Product is ready for human review.

#### Scenario: State transition persistence
- **WHEN** the Runner transitions to a new state
- **THEN** it SHALL write the following to `state.json` in the project directory:
  - `current_state`: the state name
  - `cycle_number`: integer, incremented after each full build-evaluate loop
  - `feature_areas`: list of all feature areas with status (`pending`, `in-progress`, `complete`)
  - `current_feature_area`: which feature area is active (null for whole-product)
  - `last_qa_report`: the most recent QA gate report
  - `last_po_review`: the most recent PO Review report
  - `change_specs_pending`: list of change specs not yet sent to Factory
  - `vision_check_results`: array of past vision check outcomes
  - `confidence_history`: array of confidence scores from each cycle (for trend detection)
  - `timestamp`: ISO 8601

#### Scenario: Crash recovery
- **WHEN** a Runner session is interrupted at any state
- **THEN** upon restart, the Runner SHALL:
  1. Read `state.json`
  2. If state is `building` or `qa-fixing`: check if Factory completed (look for deployment artifacts). If not, restart the build.
  3. If state is `qa-gate`: restart QA (idempotent).
  4. If state is `po-reviewing`: restart PO Review (idempotent).
  5. If state is `analyzing` or `generating-change-spec`: re-run analysis from the last PO Review report.
  6. If state is `waiting-for-human`: check Slack for responses received while down.
  7. Log: "Resumed from state: {state}, cycle: {N}"

### Requirement: Runner decides cycle granularity during seeding
The Runner SHALL determine whether to cycle through the product as a whole or by feature area, based on the seed spec structure.

#### Scenario: Granularity detection
- **WHEN** the seed spec is approved
- **THEN** the Runner SHALL:
  1. Count the number of top-level feature areas in the seed spec
  2. If 1 feature area (or no explicit feature areas): set granularity to `whole-product`
  3. If 2+ feature areas: set granularity to `feature-area`, create a feature area queue ordered by dependency (foundational features first, cross-cutting features like analytics last)

#### Scenario: Feature area ordering
- **WHEN** granularity is `feature-area`
- **THEN** the Runner SHALL order feature areas by:
  1. Dependencies: if feature B requires feature A's data/UI, A comes first
  2. Foundation: shared infrastructure (auth, navigation, data models) before domain features
  3. Cross-cutting: features that aggregate or span other features (dashboards, analytics, search) come last
  4. The order SHALL be presented to the human during seeding for approval/override

### Requirement: Runner manages the two-phase evaluation flow
The Runner SHALL manage QA and PO Review as sequential phases. QA must pass before PO Review runs. QA failures produce bug fix briefs (same spec). PO Review failures produce new specs (quality improvements).

#### Scenario: QA fail loop
- **WHEN** QA verdict is FAIL
- **THEN** the Runner SHALL transition to `qa-fixing`, send the QA failure report to the Factory as a bug fix brief (not a new spec — fix the code to match the existing spec), and upon Factory completion, return to `qa-gate` for re-testing

#### Scenario: QA fix retry limit
- **WHEN** QA has failed and been re-attempted 3 times on the same criteria
- **THEN** the Runner SHALL escalate to human: "QA has failed 3 times on these criteria: {list}. The Factory cannot fix them. This may indicate a spec issue rather than an implementation bug."

#### Scenario: QA pass advances to PO Review
- **WHEN** QA verdict is PASS
- **THEN** the Runner SHALL transition to `po-reviewing`, passing the QA report (including performance baseline and partial warnings) as context to the PO Review phase

### Requirement: Runner processes PO Review reports and decides next action
The Runner SHALL read the PO Review report and decide the next action based on the verdict, quality gaps, and confidence trend.

#### Scenario: Continue to next feature area
- **WHEN** recommended action is `continue` AND there are remaining feature areas
- **THEN** the Runner SHALL mark the current feature area as `complete`, advance to the next feature area in the queue, and generate a build brief for it

#### Scenario: Continue and product is complete
- **WHEN** recommended action is `continue` AND all feature areas are complete (or granularity is whole-product)
- **THEN** the Runner SHALL transition to `vision-checking` for a final holistic check before notifying the human

#### Scenario: Deepen a feature area
- **WHEN** recommended action is `deepen:<area>`
- **THEN** the Runner SHALL:
  1. Extract the failing criteria and heuristics from the report
  2. Generate a change spec that targets those specific gaps
  3. The change spec SHALL reference the original acceptance criteria and include: what's wrong, what "fixed" looks like (referencing the heuristic threshold or criterion), and the scope (which files/components likely need changes)
  4. Send the change spec to Factory for another build cycle on the same feature area

#### Scenario: Broaden to add missing capability
- **WHEN** recommended action is `broaden:<missing>`
- **THEN** the Runner SHALL:
  1. Create a mini-spec for the missing capability, deriving requirements from the vision document and Library heuristics
  2. Check: does this expand scope beyond the original vision? If yes, log the expansion with rationale.
  3. If confidence remains >80%: proceed autonomously with the expansion
  4. If confidence is 70-80%: proceed but flag the expansion in the next briefing
  5. If confidence <70%: escalate to human before expanding

#### Scenario: Deepen/broaden retry limit
- **WHEN** the same feature area has been through 5 deepen/broaden cycles without reaching `continue`
- **THEN** the Runner SHALL escalate to human with: "Feature area {X} has been through 5 iteration cycles and still has {N} failing criteria. Here's what's been tried and what keeps failing. Socrates recommends: {recommendation}."

### Requirement: Runner generates new specs from PO Review quality gaps
The Runner SHALL translate PO Review quality gaps into NEW change specs. These are NOT bug fixes — they are design and implementation changes that go through the Factory's full pipeline (design mode → implementation → QA → PO Review).

#### Scenario: Quality improvement spec structure
- **WHEN** a new spec is generated from PO Review gaps
- **THEN** it SHALL contain:
  - `target_feature_area`: which feature area this addresses
  - `type`: `deepen` | `broaden` (never `fix` — bug fixes come from QA, not PO Review)
  - `requires_design_mode`: true (quality improvements always go through design mode, not straight to code)
  - `gaps`: list of quality gaps from the PO Review driving this change, each with:
    - `source`: which PO Review component found it (journey-quality, screen-quality, interaction-quality, heuristic, reference-comparison)
    - `description`: what's wrong in plain English
    - `evidence`: screenshot or data from the PO Review
    - `what_good_looks_like`: description or reference screenshot showing the target quality level
    - `improvement_category`: design_change | interaction_improvement | content_change | flow_restructure | performance_improvement
  - `library_context`: relevant heuristics and standards from The Library that define "good" for these gaps
  - `reference_comparison`: if pairwise comparison found gaps, include the specific dimensions and reference screenshots
  - `affected_screens`: which screens need changes (from PO Review screen quality assessment)
  - `affected_journeys`: which user journeys are impacted (from PO Review journey quality assessment)

#### Scenario: Quality improvement spec prioritization
- **WHEN** multiple quality gaps are identified in a single PO Review
- **THEN** the new specs SHALL prioritize:
  1. Critical quality gaps (journey rated not-production-ready, screen rated failing) — highest priority
  2. Flow restructure gaps (user journey efficiency, click count violations) — high priority
  3. Design change gaps (information hierarchy, layout structure, density) — high priority
  4. Interaction improvement gaps (missing feedback, raw interactions) — medium priority
  5. Content change gaps (empty state guidance, error messages) — medium priority
  6. Performance improvement gaps (non-functional heuristic failures) — lower priority (unless user-perceptible)
  7. Personal fingerprint heuristic gaps — lowest priority (nice-to-have, not blocking)

#### Scenario: Quality improvement specs go through full Factory pipeline
- **WHEN** a quality improvement spec is sent to the Factory
- **THEN** the Factory SHALL process it through: design mode (produce updated design for affected screens/interactions) → implementation (code the design) → QA (verify the new spec is met) → PO Review (verify the quality gap is actually closed). This is a full cycle, not a patch.

### Requirement: Runner performs periodic vision checks
The Runner SHALL step back after each feature area completion and re-evaluate the product holistically against the original vision.

#### Scenario: Vision check procedure
- **WHEN** a vision check runs
- **THEN** the Runner SHALL:
  1. Re-read the original vision document
  2. Review what's been built so far (all completed feature areas)
  3. Ask (via LLM judgment): "Does the product as built so far align with the original vision? Specifically:
     - Are the completed features serving the stated user outcome?
     - Has building revealed that the vision itself is incomplete or wrong?
     - Are there emergent interactions between features that change the product direction?
     - Does the remaining work still make sense given what's been built?"
  4. Produce a vision check report with: alignment assessment, any discovered gaps in the vision, scope expansion recommendations, confidence level

#### Scenario: Vision check triggers scope expansion
- **WHEN** the vision check reveals a missing capability that the vision document didn't anticipate but that's clearly needed for the product to work (e.g., building a trip history feature reveals the need for a map component)
- **THEN** the Runner SHALL add the capability to the feature area queue, log the expansion with rationale, and continue autonomously if confidence > 80%

#### Scenario: Vision check triggers pivot discussion
- **WHEN** the vision check reveals that the fundamental premise of the product may be wrong (not just missing features, but wrong direction)
- **THEN** the Runner SHALL: pause the loop, compile evidence (what was built, what's failing, why the premise seems wrong), and notify the human with a structured pivot proposal: "The original vision was X. Building revealed Y. Socrates recommends pivoting to Z because [evidence]."

### Requirement: Runner tracks confidence trends
The Runner SHALL maintain a confidence history across cycles and use trend analysis to detect degradation early.

#### Scenario: Confidence trend detection
- **WHEN** confidence has decreased for 3 consecutive cycles
- **THEN** the Runner SHALL flag a downward trend in the next briefing, even if absolute confidence is still above 80%. Include: the trend data, which evaluation components are degrading, and a hypothesis for why.

#### Scenario: Confidence plateau detection
- **WHEN** confidence has stayed within ±2% for 5 consecutive cycles on the same feature area
- **THEN** the Runner SHALL flag a plateau: "Feature area {X} has plateaued at {N}% confidence after 5 cycles. The remaining gaps may require a different approach or human input." Include the specific failing items that aren't improving.

### Requirement: Runner invokes The Factory with scoped briefs
The Runner SHALL invoke the AI Factory as a worker, passing it everything needed to build without further context gathering.

#### Scenario: Build brief contents
- **WHEN** the Runner initiates a build cycle
- **THEN** it SHALL pass The Factory a brief containing:
  - The spec to implement (seed spec for first cycle, change spec for subsequent cycles)
  - The per-project product standard
  - Relevant Library heuristics (global + domain + personal fingerprint)
  - Reference product details (names, dimensions to match, cached screenshots)
  - Previous evaluation report (so Factory knows what failed and why)
  - Deployment target (local dev server URL or remote deploy URL)

#### Scenario: Factory reports completion
- **WHEN** The Factory completes a build cycle
- **THEN** it SHALL report: deployment URL, list of what was implemented, list of what was skipped and why, any decisions made during implementation that diverged from the brief

### Requirement: Runner supports the meta-loop for Factory improvement
The Runner SHALL periodically analyze cross-product quality patterns and generate improvement specs for the AI Factory itself.

#### Scenario: Cross-product pattern detection
- **WHEN** the same Library heuristic fails on 3+ different products
- **THEN** the Runner SHALL analyze: is this a product-level issue (each product has a unique fix) or a factory-level issue (the Factory's default design/implementation patterns produce this failure)?
- **IF** factory-level: generate a change spec targeting the Factory's stacks, skills, or design mode templates

#### Scenario: Meta-loop frequency
- **WHEN** 5 products have been completed
- **THEN** the Runner SHALL run a meta-analysis: aggregate all evaluation reports, identify the top 5 most common failures, determine which are addressable at the Factory level, and generate improvement specs if any are found
