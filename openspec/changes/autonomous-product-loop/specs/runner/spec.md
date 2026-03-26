## ADDED Requirements

### Requirement: Runner executes as a Karpathy Loop of short-lived phases
The Runner SHALL NOT be a long-running process. Each state transition SHALL be executed as an independent `claude -p` invocation that reads state from disk, executes one phase, writes results back, and exits. A launcher script manages the loop externally.

#### Scenario: Phase invocation
- **WHEN** the launcher detects a project's `state.json` indicates a phase to execute
- **THEN** it SHALL spawn `claude -p --project <project-dir> --dangerously-skip-permissions --model <model>` with a phase-specific prompt
- **AND** the Claude Code session SHALL read `state.json` and `cycle_context.json`, execute the phase, write results back to both files, git commit, and exit

#### Scenario: Model selection per phase
- **WHEN** the launcher spawns a phase
- **THEN** it SHALL use `--model opus` for: building, qa-fixing, po-reviewing, analyzing, generating-change-spec, vision-checking
- **AND** it SHALL use `--model sonnet` for: test-integrity, qa-gate, promoting, rolling-back

#### Scenario: Multi-project round-robin
- **WHEN** the launcher loops
- **THEN** it SHALL iterate through all project directories, read each `state.json`, skip projects in `waiting-for-human`, `complete`, or `ready` states, and execute one phase for each active project per loop iteration

### Requirement: Runner orchestrates the build-evaluate-iterate loop
The Runner SHALL manage the full autonomous cycle as a state machine with defined states and transitions. Each state persists to disk so the loop can survive crashes and resume.

#### Scenario: State machine definition
- **WHEN** the Runner is operating
- **THEN** it SHALL transition through these states:
  1. `seeding` → Seeder is active, human is interacting. Exit: human approves seed.
  1.5. `ready` → Seeding complete, human has approved the seed. Waiting for explicit trigger to begin autonomous loop. Exit: human sends "rouge start" via Slack or triggers manually.
  2. `building` → Factory is building on a loop branch, deploying to staging. Exit: Factory reports build complete with staging URL.
  3. `test-integrity` → Test Integrity Gate running: verifying tests match current spec. Exit: tests verified (gaps filled, stale regenerated, orphans removed).
  4. `qa-gate` → QA phase running with verified tests: checking if build matches spec. Exit: QA verdict PASS or FAIL.
  5. `qa-fixing` → QA failed, Factory is fixing bugs against existing spec. Exit: Factory re-deploys to staging, return to `test-integrity`.
  6. `po-reviewing` → PO Review phase running: checking if spec-compliant product meets production quality bar. Exit: PO Review report with verdict, quality gaps, and delta.
  7. `analyzing` → Runner is processing the PO Review report and delta, deciding next action. Exit: decision made (promote, deepen, broaden, rollback, or notify).
  8. `promoting` → Merging loop PR to production branch, promoting staging to production. Exit: production updated.
  9. `rolling-back` → Abandoning loop — closing PR, reverting staging, preserving learnings. Exit: staging reverted to previous known-good.
  10. `generating-change-spec` → Runner is creating NEW specs from quality gaps (not bug fixes — design+implementation changes). Exit: change specs written.
  11. `vision-checking` → Runner is comparing overall progress against the vision document. Exit: vision check passes or escalation triggered.
  12. `waiting-for-human` → Notifier has sent a message, Runner is paused waiting for response. Exit: human responds.
  13. `complete` → All feature areas meet the quality bar. Product promoted to production. Ready for human review.

#### Scenario: State transition persistence
- **WHEN** the Runner transitions to a new state
- **THEN** it SHALL write the following to `state.json` in the project directory:
  - `current_state`: the state name
  - `cycle_number`: integer, incremented after each full build-evaluate loop
  - `feature_areas`: list of all feature areas with status (`pending`, `in-progress`, `complete`)
  - `current_feature_area`: which feature area is active (null for whole-product)
  - `last_evaluation_report`: the most recent evaluation report (contains `.qa`, `.po`, `.design`, `.health_score`)
  - `last_po_review`: the most recent PO Review report
  - `change_specs_pending`: list of change specs not yet sent to Factory
  - `vision_check_results`: array of past vision check outcomes
  - `confidence_history`: array of confidence scores from each cycle (for trend detection)
  - `timestamp`: ISO 8601

#### Scenario: Crash recovery
- **WHEN** a phase invocation fails (non-zero exit, timeout, or rate limit)
- **THEN** the launcher SHALL log the error, wait 30-60 seconds, and re-invoke the same phase. State.json was not updated (the phase didn't complete), so re-running is safe — each phase is idempotent.
- **AND** if the same phase fails 3 consecutive times, the launcher SHALL transition the project to `waiting-for-human` and notify via Slack: "Phase {state} failed 3 times for {project}. Error: {last error}."

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

### Requirement: Runner uses shared-context orchestration, not sequential handover
The Runner SHALL NOT use a sequential handover pattern where Agent A summarises work and passes it to Agent B. Sequential handover loses context at every boundary — if the Factory misinterprets a brief, the Evaluator catches symptoms without understanding root cause, and the Runner generates change specs blind to the Factory's reasoning. Instead, the Runner SHALL maintain a shared context document that all phases read from and write to, like a product team's shared workspace where the PRD, designs, decisions, and questions are all visible to everyone.

#### Scenario: Shared context document structure
- **WHEN** a cycle begins
- **THEN** the Runner SHALL maintain a `cycle_context.json` for the current cycle containing:
  - `vision`: the full vision document (not a summary)
  - `product_standard`: the full product standard
  - `active_spec`: the current spec being implemented (seed or change spec)
  - `library_heuristics`: all applicable heuristics with full definitions
  - `reference_products`: names, dimensions, cached screenshots
  - `previous_evaluations`: full QA and PO Review reports from prior cycles (not summaries)
  - `factory_decisions`: decisions the Factory made during implementation — what it chose, what it rejected, and why
  - `factory_questions`: any ambiguities the Factory encountered and how it resolved them
  - `evaluator_observations`: raw observations from QA and PO Review, not just pass/fail verdicts
  - `runner_analysis`: the Runner's interpretation of evaluation results and rationale for next action
  - `evaluation_deltas`: per-loop delta tracking (confidence_delta, journey_delta, screen_delta, heuristic_delta, overall_delta)
  - `journey_log`: array of journey entries per loop (number, what_attempted, delta, confidence, outcome, decisions, learnings, rollback_reason)
  - `staging_url`: current staging deployment URL
  - `production_url`: current production deployment URL
  - `loop_branch`: current git branch for this loop cycle

#### Scenario: Factory reads full context, writes decisions back
- **WHEN** the Factory builds
- **THEN** it SHALL:
  1. Read the full `cycle_context.json` — not a summarised brief
  2. During implementation, write `factory_decisions` back to the context: every significant design choice, every ambiguity resolved, every deviation from the spec with rationale
  3. If the Factory encounters something that contradicts the spec or vision, it SHALL write a `factory_question` to the context and proceed with its best judgment, flagging the question for the Evaluator

#### Scenario: Evaluator reads Factory decisions for root cause analysis
- **WHEN** the Evaluator (QA or PO Review) finds a failure
- **THEN** it SHALL read `factory_decisions` and `factory_questions` to determine:
  - Did the Factory misinterpret the spec? (Root cause: spec ambiguity → fix the spec, not just the code)
  - Did the Factory make a reasonable design choice that produced a bad outcome? (Root cause: design constraint → change the approach)
  - Did the Factory flag a question and proceed incorrectly? (Root cause: missing context → clarify and rebuild)
  - The evaluation report SHALL include root cause classification alongside the failure, so the Runner can generate the right kind of response

#### Scenario: Runner reads full context for change spec generation
- **WHEN** the Runner generates a change spec from evaluation failures
- **THEN** it SHALL read the full `cycle_context.json` including Factory decisions and Evaluator root cause analysis, so the change spec addresses the actual root cause — not just the symptom. If the root cause is spec ambiguity, the change spec fixes the spec. If it's a design choice, the change spec provides clearer design direction. If it's missing context, the change spec adds context.

#### Scenario: Refinement loop within a cycle (back-and-forth)
- **WHEN** the Evaluator identifies a failure whose root cause is spec ambiguity
- **THEN** instead of completing the full evaluation and generating a change spec, the Runner SHALL trigger a **refinement loop**: send the ambiguity back to the relevant discipline (spec, design, or vision) for clarification, update the shared context, and resume the current cycle — not start a new one. This mirrors agile refinement where questions go back to the PM/designer before the story is re-estimated.

#### Scenario: Context accumulates across cycles
- **WHEN** a new cycle begins (change spec → Factory → Evaluator)
- **THEN** the `cycle_context.json` SHALL carry forward the full history of prior cycles' decisions, questions, and observations — so the Factory in cycle 5 knows what was tried and rejected in cycles 1-4. Context is appended, not replaced.

### Requirement: Runner invokes The Factory with full shared context
The Runner SHALL provide the Factory with the complete shared context, not a summarised brief.

#### Scenario: Factory invocation is a claude -p session
- **WHEN** the Runner's launcher invokes the building phase
- **THEN** it SHALL spawn `claude -p --project <target-project-dir>` where the target project has the required skills installed
- **AND** the phase prompt SHALL instruct Claude Code to read `cycle_context.json` for full context, build the feature area, deploy to staging, and write `factory_decisions` and `factory_questions` back to `cycle_context.json`

#### Scenario: Factory receives full context
- **WHEN** the Runner initiates a build cycle
- **THEN** it SHALL provide the Factory with the full `cycle_context.json` including: vision document, product standard, active spec, Library heuristics (full definitions), reference products, all previous evaluation reports, all previous Factory decisions and questions, and the Runner's analysis of what needs to change and why

#### Scenario: Factory reports back into shared context
- **WHEN** The Factory completes a build cycle
- **THEN** it SHALL write to `cycle_context.json`:
  - `deployment_url`: where the product is deployed
  - `implemented`: list of what was built
  - `skipped`: list of what was skipped and why
  - `factory_decisions`: every significant choice with rationale
  - `factory_questions`: ambiguities encountered and how they were resolved
  - `divergences`: any places where the implementation diverged from the spec, with reasoning

### Requirement: Runner manages git branches and PRs per loop cycle
Each autonomous loop cycle SHALL produce a git branch and PR that serves as the auditable record of what was attempted, what was found, and whether it moved the product toward or away from the vision.

#### Scenario: Branch-per-loop
- **WHEN** a new loop cycle begins (Factory is about to build)
- **THEN** the Runner SHALL create a git branch named `rouge/loop-{N}-{feature-area}` (e.g., `rouge/loop-3-trip-history`) from the current production branch

#### Scenario: PR-per-loop with structured description
- **WHEN** a loop cycle completes evaluation (QA + PO Review)
- **THEN** the Runner SHALL create a PR with structured description:
  ```
  ## Loop {N}: {feature area}

  ### What was built
  - {list of implemented items from Factory report}

  ### Evaluation results
  - QA: {PASS/FAIL} — {summary}
  - PO Review: {verdict} — confidence {score}%
  - Delta from previous loop: {improving/stable/regressing}

  ### Quality gaps found
  - {list of gaps with categories}

  ### Decisions made
  - {key Factory decisions from shared context}

  ### Vision alignment
  - {closer/further from vision + reasoning}
  ```

#### Scenario: Merge on success, abandon on rollback
- **WHEN** a loop cycle passes evaluation and is promoted to production
- **THEN** the PR SHALL be merged to the production branch
- **WHEN** a loop cycle is rolled back
- **THEN** the PR SHALL be closed (not merged) with a comment explaining: why it was rolled back, what was learned, what will be tried differently next loop

### Requirement: Runner tracks evaluation delta between loops
The Runner SHALL compare each loop's evaluation results against the previous loop's results to determine whether the product is improving, stable, or regressing.

#### Scenario: Delta calculation
- **WHEN** a PO Review report is produced
- **THEN** the Runner SHALL calculate delta against the previous loop's PO Review:
  - `confidence_delta`: current confidence minus previous confidence
  - `journey_delta`: change in % of journeys at production-ready or acceptable
  - `screen_delta`: change in % of screens at production-ready or acceptable
  - `heuristic_delta`: change in functional heuristic pass rate
  - `overall_delta`: `improving` (confidence +2% or more), `stable` (within ±2%), `regressing` (confidence -2% or more)

#### Scenario: Delta feeds Runner decisions
- **WHEN** overall_delta is `regressing` for 2 consecutive loops
- **THEN** the Runner SHALL flag: "Product is regressing. Last 2 loops made things worse. Consider rollback to loop {N-2} state." Include: what changed, what got worse, hypothesis for why.
- **WHEN** overall_delta is `improving`
- **THEN** the Runner SHALL continue with the next planned action (deepen, broaden, or next feature area)
- **WHEN** overall_delta is `stable` for 3+ loops
- **THEN** the Runner SHALL flag a plateau (same as existing confidence plateau detection)

### Requirement: Runner supports rollback of bad loops
The Runner SHALL be able to abandon a loop that made the product worse, reverting to the previous known-good state while preserving the learnings from the failed loop.

#### Scenario: Rollback triggered
- **WHEN** the Runner determines a loop should be rolled back (regression detected, or evaluation shows critical degradation)
- **THEN** the Runner SHALL:
  1. Close the loop's PR without merging (with rollback explanation)
  2. Revert the staging environment to the previous loop's deployment
  3. Record a rollback entry in the journey log: loop number, what was attempted, why it was rolled back, what was learned
  4. Write the learnings to the shared context so the next loop knows what was tried and why it failed
  5. The next loop SHALL incorporate the rollback learnings: "Loop {N} tried {X} and it made {Y} worse because {Z}. Try a different approach."

#### Scenario: Rollback preserves learnings
- **WHEN** a rollback occurs
- **THEN** the failed loop's evaluation report, Factory decisions, and root cause analysis SHALL be preserved in the shared context. Only the code is reverted — the knowledge is kept.

### Requirement: Runner manages staging and production dual environments
The Runner SHALL maintain two deployment environments per project: staging (where the Factory deploys and evaluation runs) and production (the known-good state the human reviews).

#### Scenario: Factory always deploys to staging
- **WHEN** the Factory completes a build
- **THEN** it SHALL deploy to the staging environment URL, never directly to production

#### Scenario: Promotion to production on evaluation pass
- **WHEN** QA passes AND PO Review verdict is PRODUCTION_READY or NEEDS_IMPROVEMENT with confidence ≥0.8
- **THEN** the Runner SHALL promote the staging deployment to production (merge PR, update production deployment)

#### Scenario: Staging rollback on evaluation fail or regression
- **WHEN** evaluation fails or regression is detected and rollback is triggered
- **THEN** the Runner SHALL revert staging to the previous production state. Production is unaffected — the human's last-reviewed version remains live.

#### Scenario: Human always reviews production
- **WHEN** the human is notified "we have something"
- **THEN** the notification SHALL include the production URL (not staging). The human always sees the best version, not work-in-progress.

### Requirement: Runner maintains a journey log for meta-narrative
The Runner SHALL maintain a `journey.json` that accumulates the full history of the product's evolution across all loops — what was attempted, what worked, what was rolled back, and how confidence tracked over time.

#### Scenario: Journey log entry per loop
- **WHEN** a loop cycle completes (whether promoted, rolled back, or ongoing)
- **THEN** the Runner SHALL append an entry to `journey.json`:
  ```json
  {
    "loop": 3,
    "feature_area": "trip-history",
    "branch": "rouge/loop-3-trip-history",
    "pr_number": 7,
    "timestamp_start": "2026-03-18T02:30:00Z",
    "timestamp_end": "2026-03-18T03:45:00Z",
    "duration_minutes": 75,
    "what_attempted": "Deepen trip history: add map interaction, improve information hierarchy",
    "change_spec_type": "deepen",
    "qa_verdict": "PASS",
    "po_verdict": "NEEDS_IMPROVEMENT",
    "confidence": 0.78,
    "confidence_delta": "+0.05",
    "overall_delta": "improving",
    "quality_gaps_found": 4,
    "quality_gaps_resolved": 2,
    "outcome": "promoted",
    "key_decisions": [
      "Used Leaflet for map instead of Mapbox (lower complexity)",
      "Moved trip metadata to sidebar instead of overlay"
    ],
    "learnings": [
      "Map overlay obscured trip route — sidebar layout works better for data-dense screens"
    ],
    "rollback_reason": null
  }
  ```

#### Scenario: Journey log for rolled-back loops
- **WHEN** a loop is rolled back
- **THEN** the entry SHALL have `"outcome": "rolled_back"` with `"rollback_reason"` populated and `"learnings"` capturing what was learned from the failure

#### Scenario: Journey log supports visualization
- **WHEN** the journey log is read
- **THEN** it SHALL be renderable as:
  - A timeline showing loops, outcomes (promoted/rolled-back), and confidence trend
  - A feature evolution view showing what was added/changed per loop
  - A learnings summary across all loops
  - This data feeds the Saturday demo and can be adapted into Substack content

#### Scenario: Journey log included in morning briefings
- **WHEN** a morning briefing is compiled
- **THEN** it SHALL include a mini-timeline from the journey log: last N loops, their outcomes, confidence trend direction, and any rollbacks

### Requirement: Runner manages Supabase slot rotation
The Runner SHALL track active Supabase projects and manage the 2-slot free tier limit.

#### Scenario: Slot check before provisioning
- **WHEN** a phase needs to create or unpause a Supabase project
- **THEN** the Runner SHALL check the active project count via Management API (`GET /v1/projects` filtered by status)
- **AND** if at the 2-project limit, pause the least-recently-active project (`POST /v1/projects/{ref}/pause`) before proceeding
- **AND** log the swap in the journey log

#### Scenario: Not all products need Supabase
- **WHEN** a new product is seeded
- **THEN** the Seeder SHALL record in the vision document whether the product requires a database
- **AND** the Runner SHALL skip Supabase provisioning for products that don't need one (static sites, CLI tools, MCP servers)

### Requirement: Runner supports the meta-loop for Factory improvement
The Runner SHALL periodically analyze cross-product quality patterns and generate improvement specs for the AI Factory itself.

#### Scenario: Cross-product pattern detection
- **WHEN** the same Library heuristic fails on 3+ different products
- **THEN** the Runner SHALL analyze: is this a product-level issue (each product has a unique fix) or a factory-level issue (the Factory's default design/implementation patterns produce this failure)?
- **IF** factory-level: generate a change spec targeting the Factory's stacks, skills, or design mode templates

#### Scenario: Meta-loop frequency
- **WHEN** 5 products have been completed
- **THEN** the Runner SHALL run a meta-analysis: aggregate all evaluation reports, identify the top 5 most common failures, determine which are addressable at the Factory level, and generate improvement specs if any are found

### Requirement: Runner supports explicit project activation via Slack commands
The Runner SHALL NOT automatically begin building after seeding. Projects enter a `ready` state after seeding and require an explicit trigger to begin the autonomous loop. This trigger can come via Slack commands or manual state file edits.

#### Scenario: Project activation
- **WHEN** a Slack command "rouge start {project-name}" is received
- **THEN** the Slack bot SHALL verify the project exists and is in `ready` state
- **AND** check Supabase slot availability (if project needs a database)
- **AND** transition `state.json` to `building`
- **AND** the launcher SHALL pick it up on its next loop iteration
- **AND** confirm via Slack: "Starting {project-name}. First phase: building."

#### Scenario: Project pause
- **WHEN** a Slack command "rouge pause {project-name}" is received
- **THEN** the Slack bot SHALL transition the project to `waiting-for-human` state regardless of current state
- **AND** if a `claude -p` phase is currently running for this project, it will complete its current phase but the launcher will not start the next one
- **AND** confirm via Slack: "{project-name} paused at state: {current_state}."

#### Scenario: Project resume
- **WHEN** a Slack command "rouge resume {project-name}" is received
- **THEN** the Slack bot SHALL transition the project back to its previous state (stored in `state.json` as `paused_from_state`)
- **AND** confirm via Slack: "Resuming {project-name} from state: {state}."

#### Scenario: Status check
- **WHEN** a Slack command "rouge status" is received
- **THEN** the Slack bot SHALL read all project `state.json` files and respond with a summary:
  - Active projects: name, current state, cycle number, confidence
  - Ready projects: name (waiting to be started)
  - Paused projects: name, paused-from state
  - Complete projects: name, production URL
