## ADDED Requirements

### Requirement: Runner orchestrates the build-evaluate-iterate loop
The Runner SHALL manage the full autonomous cycle as a state machine with defined states and transitions. Each state persists to disk so the loop can survive crashes and resume.

#### Scenario: State machine definition
- **WHEN** the Runner is operating
- **THEN** it SHALL transition through these states:
  1. `seeding` → Seeder is active, human is interacting. Exit: human approves seed.
  2. `building` → Factory is building a scoped brief. Exit: Factory reports build complete with deployment URL.
  3. `evaluating` → Evaluator is assessing the built product. Exit: Evaluator produces composite quality report.
  4. `analyzing` → Runner is processing the evaluation report, deciding next action. Exit: decision made (continue, deepen, broaden, or notify).
  5. `generating-change-spec` → Runner is creating a change spec for identified gaps. Exit: change spec written.
  6. `vision-checking` → Runner is comparing overall progress against the vision document. Exit: vision check passes or escalation triggered.
  7. `waiting-for-human` → Notifier has sent a message, Runner is paused waiting for response. Exit: human responds.
  8. `complete` → All feature areas meet the quality bar. Product is ready for human review.

#### Scenario: State transition persistence
- **WHEN** the Runner transitions to a new state
- **THEN** it SHALL write the following to `state.json` in the project directory:
  - `current_state`: the state name
  - `cycle_number`: integer, incremented after each full build-evaluate loop
  - `feature_areas`: list of all feature areas with status (`pending`, `in-progress`, `complete`)
  - `current_feature_area`: which feature area is active (null for whole-product)
  - `last_evaluation`: the most recent composite quality report
  - `change_specs_pending`: list of change specs not yet sent to Factory
  - `vision_check_results`: array of past vision check outcomes
  - `confidence_history`: array of confidence scores from each cycle (for trend detection)
  - `timestamp`: ISO 8601

#### Scenario: Crash recovery
- **WHEN** a Runner session is interrupted at any state
- **THEN** upon restart, the Runner SHALL:
  1. Read `state.json`
  2. If state is `building`, check if Factory completed (look for deployment artifacts). If not, restart the build.
  3. If state is `evaluating`, restart evaluation (evaluation is idempotent).
  4. If state is `analyzing` or `generating-change-spec`, re-run analysis from the last evaluation report.
  5. If state is `waiting-for-human`, check Slack for responses received while down.
  6. Log: "Resumed from state: {state}, cycle: {N}"

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

### Requirement: Runner processes evaluation reports and decides next action
The Runner SHALL read the Evaluator's composite quality report and decide the next action based on the recommended action and confidence trend.

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

### Requirement: Runner generates change specs from evaluation gaps
The Runner SHALL translate evaluation gap reports into structured change specs that The Factory can implement.

#### Scenario: Change spec structure
- **WHEN** a change spec is generated
- **THEN** it SHALL contain:
  - `target_feature_area`: which feature area this addresses
  - `type`: `deepen` | `broaden` | `fix`
  - `gaps`: list of evaluation failures driving this change, each with:
    - `source`: which evaluation component found it (criteria, heuristic, product-sense, browser-qa)
    - `description`: what's wrong in plain English
    - `evidence`: screenshot URL or data from the evaluation
    - `acceptance_criterion`: what "fixed" looks like, expressed as a testable assertion
  - `library_context`: relevant heuristics and standards from The Library that apply
  - `reference_comparison`: if pairwise comparison found gaps, include the specific dimensions and reference screenshots
  - `scope_hint`: which screens, components, or files likely need changes (from the evaluation's DOM analysis)

#### Scenario: Change spec prioritization
- **WHEN** multiple gaps are identified in a single evaluation
- **THEN** the change spec SHALL prioritize:
  1. `missing-feature` gaps (criteria check: not implemented) — highest priority
  2. `broken-interaction` gaps (criteria check: built but broken) — high priority
  3. Major friction points from product sense check — high priority
  4. Heuristic failures from global tier — medium priority
  5. Heuristic failures from domain tier — medium priority
  6. Heuristic failures from personal tier — lower priority
  7. Non-functional failures — lowest priority (unless below critical threshold)

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
