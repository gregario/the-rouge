> **Architecture note:** The Seeder is the ONE phase that runs interactively with the human present. It is NOT invoked by the Karpathy Loop launcher. Instead, the human starts a Claude Code session and runs the seeding skill directly (or seeds interactively via Slack — see Notifier spec). All other phases are autonomous. After seeding completes and the human approves, the Seeder writes `state.json` with `current_state: "ready"` (not `"building"`). The autonomous loop does NOT begin automatically — the human must explicitly trigger it via `rouge start` command or equivalent. The launcher picks it up on its next loop only after that explicit start.

## ADDED Requirements

### Requirement: Seeder runs an interactive non-linear swarm
The Seeder SHALL facilitate a multi-discipline session where brainstorming, competition review, product taste, OpenSpec, and design challenge each other. Disciplines can loop back — a design finding can invalidate a spec decision, a spec detail can trigger a product taste re-evaluation.

#### Scenario: Swarm discipline list
- **WHEN** seeding begins
- **THEN** the Seeder SHALL engage these disciplines in any order, revisiting as needed:
  1. **Brainstorming**: What's the 10x version? What's the user outcome? What are the delight opportunities?
  2. **Competition review**: What exists? What's the gap? What's the differentiation angle?
  3. **Product taste**: Is this the right problem? Who is this for? Expand/hold/reduce scope?
  4. **Spec definition**: What are the feature areas? What are the user journeys? What are the acceptance criteria?
  5. **Design challenge**: Can this spec produce good UX? Are the journeys under 3 clicks? Is progressive disclosure possible? Where will information hierarchy be hard?

#### Scenario: Design challenges spec — loop-back trigger
- **WHEN** the design discipline identifies that a spec'd user journey requires >3 clicks for a core task
- **THEN** the Seeder SHALL:
  1. Present the issue to the human: "The {journey} journey requires {N} clicks. The 3-click rule says core tasks need ≤3. Options: (A) Merge steps {X} and {Y}, (B) Add a shortcut from {screen}, (C) Override the rule for this journey with justification."
  2. Based on the human's choice, loop back to spec definition to revise the journey
  3. Then re-run the design challenge on the revised journey

#### Scenario: Product taste challenges brainstorm scope — loop-back trigger
- **WHEN** product taste determines the scope is too broad (trying to do too much for V1) or too narrow (not enough to validate the core value prop)
- **THEN** the Seeder SHALL present the taste verdict to the human with the specific expansion/reduction recommendation, loop back to brainstorming to adjust, then re-run product taste on the adjusted scope

#### Scenario: Spec surfaces missing competition — loop-back trigger
- **WHEN** writing specs reveals a capability that a competitor handles well
- **THEN** the Seeder SHALL loop back to competition review to analyze how the competitor handles it, then inform the spec with the competitive insight

#### Scenario: Swarm convergence
- **WHEN** all disciplines have been run at least once AND no discipline has raised a new loop-back trigger in the last pass
- **THEN** the Seeder SHALL declare convergence and move to artifact production

> **Note:** Swarming (non-linear back-and-forth between disciplines) is used ONLY during seeding. Autonomous phases use tight Karpathy loops instead — if something fails, the state machine iterates mechanically. This reduces the need for autonomous judgment about when to loop back.

### Requirement: Seeder produces a structured vision document
The vision document SHALL be structured so The Evaluator can parse it programmatically. It is NOT a prose document — it is a structured artifact with defined sections that map to evaluation inputs.

#### Scenario: Vision document schema
- **WHEN** the vision document is produced
- **THEN** it SHALL contain these sections:
  ```
  vision:
    name: product name
    one_liner: one-sentence description
    persona: who this is for (concrete, named)
    problem: what problem this solves (user outcome, not feature list)
    emotional_north_star: what using this should feel like (e.g., "feels like the first time you used Twitter")

    reference_products:
      - name: e.g., "Stripe Dashboard"
        dimensions:
          - name: e.g., "navigation"
            description: "persistent sidebar with clear hierarchy"
          - name: e.g., "data density"
            description: "high information density, every pixel earns its place"
        url: public URL for screenshot capture (if available)

    feature_areas:
      - name: e.g., "trip-history"
        description: brief description
        user_journeys:
          - name: e.g., "view past trips"
            entry_point: URL path or screen name
            goal: what the user achieves
            steps:
              - action: what the user does
                expected: what should happen
            max_clicks: 3 (or justified override)
        acceptance_criteria:
          - "User can see a list of all past trips with date, distance, and fuel cost"
          - "User can click a trip to see it on a map"
          - "Map shows route, key stops, and CO2 emissions"

    product_standard:
      overrides: [] # per-project overrides of global Library heuristics
      additions: [] # project-specific heuristics not in the global set
      reference_screenshots: [] # paths to cached reference product screenshots
  ```

#### Scenario: Vision document enables automated criteria extraction
- **WHEN** The Evaluator reads the vision document
- **THEN** it SHALL be able to extract:
  - Every acceptance criterion as a testable assertion (from `acceptance_criteria` lists)
  - Every user journey as a simulatable flow (from `user_journeys` with steps)
  - Every reference product comparison dimension (from `reference_products`)
  - The per-project product standard (from `product_standard`)
  — without any human interpretation or clarification needed

### Requirement: Seeder produces a per-project product standard
The product standard layers project-specific quality criteria on top of The Library's global and domain standards.

#### Scenario: Product standard structure
- **WHEN** a product standard is produced
- **THEN** it SHALL contain:
  - `inherits`: `global` + the relevant domain (e.g., `web`)
  - `overrides`: list of Library heuristic IDs with modified thresholds and justification (e.g., "override `three-click-rule` for the admin settings page because it's an infrequent task — allow 5 clicks")
  - `additions`: list of project-specific heuristics in the same format as Library entries (id, rule, measurement, threshold) for requirements unique to this product
  - `definition_of_done`: a plain-English summary of what "production-ready" means for this product, referencing the heuristic counts: "Production-ready when: all acceptance criteria pass, ≥85% of heuristics pass, all user journeys complete, Lighthouse performance ≥80, zero console errors, and reference comparison shows ≥3/5 dimensions at 'approaching-reference' or better."

#### Scenario: Product standard reviewed by human
- **WHEN** the product standard is generated
- **THEN** it SHALL be presented to the human as part of the seed approval, with: total heuristic count (global + domain + project-specific), any overrides highlighted, and the definition of done

### Requirement: Seeder generates product-specific PO checks from Library check templates
The Seeder SHALL instantiate The Library's check templates into concrete, product-specific PO checks for every user journey step, screen, and key interaction. These instantiated checks are what the PO Review agent mechanically executes — no hand-waving, no "assess."

#### Scenario: Check instantiation for a journey step
- **WHEN** a user journey step is defined (e.g., "click trip row to view on map")
- **THEN** the Seeder SHALL generate PO checks by filling in template parameters:
  - From `template.feedback.visual-response`: GIVEN the user clicks the trip row. WHEN the click occurs. THEN within 200ms there SHALL be a visual change on the row (highlight, expansion, or loading indicator). Measurement: screenshot diff at +200ms. Pass: diff detected on row element.
  - From `template.feedback.loading-indicator`: GIVEN the user clicks a trip row that loads map data. WHEN the request takes >500ms. THEN a loading indicator SHALL be visible in the map area. Measurement: intercept request, screenshot at 600ms. Pass: spinner/skeleton in map container.
  - From `template.clarity.next-action`: GIVEN the user is on the trip detail/map screen. WHEN they want to return to the list. THEN there SHALL be ≤2 prominent interactive elements competing (back button or breadcrumb should dominate). Measurement: visual prominence analysis. Pass: return action is most prominent interactive element.
  - From `template.transitions.screen-change`: GIVEN navigation from trip list to trip detail. WHEN navigation occurs. THEN animated transition (not instant swap). Measurement: 3-frame capture. Pass: intermediate frame detected.
  - From `template.delight.contextual-copy`: GIVEN the trip detail screen loads. WHEN trip data is displayed. THEN the header SHALL include contextual info (e.g., "Trip to Edinburgh — March 15" not "Trip Detail"). Measurement: extract heading text, LLM judgment on contextuality. Pass: heading references trip-specific data.

#### Scenario: Check instantiation for a screen
- **WHEN** a screen is identified in the product (e.g., "dashboard")
- **THEN** the Seeder SHALL generate PO checks from screen-level templates:
  - From screen hierarchy heuristics: what is the primary element on this specific screen? (e.g., "the total fleet mileage metric should be the primary element on the dashboard")
  - From screen density heuristics: what density is appropriate for this screen? (e.g., "dashboard = high density, display ≥5 data points above fold")
  - From screen consistency heuristics: what design system elements should be present?
  - Each check has the template's measurement method and threshold, now parameterized with this screen's specific elements

#### Scenario: Check instantiation for interactions
- **WHEN** a key interaction is identified (e.g., "save trip form", "delete vehicle button")
- **THEN** the Seeder SHALL generate PO checks:
  - Feedback checks parameterized for this specific element
  - For destructive actions (delete): verify confirmation dialog exists
  - For forms: verify inline validation, success confirmation with contextual message
  - For data loading: verify skeleton/spinner appears during load

#### Scenario: Generated checks stored in the seed
- **WHEN** all PO checks have been generated
- **THEN** they SHALL be stored in the seed spec as a `po_checks` section alongside the acceptance criteria:
  ```
  feature_areas:
    - name: trip-history
      acceptance_criteria:   # ← QA uses these (does it work?)
        - "User can see list of trips"
        - "User can click trip to view on map"
      po_checks:             # ← PO Review uses these (is it good?)
        journey_checks:
          - journey: "view past trip on map"
            step: "click trip row"
            checks:
              - template: feedback.visual-response
                element: "trip row"
                threshold_ms: 200
              - template: transitions.screen-change
                from: "trip list"
                to: "trip detail"
              - template: clarity.next-action
                screen: "trip detail"
                intended_action: "return to trip list"
        screen_checks:
          - screen: "/dashboard"
            primary_element: "total fleet mileage"
            density: "high"
            min_datapoints_above_fold: 5
          - screen: "/trips"
            primary_element: "trip list table"
            density: "medium"
        interaction_checks:
          - element: "save trip form"
            type: "form-submit"
            success_message_context: "trip name and distance"
          - element: "delete vehicle button"
            type: "destructive"
            requires_confirmation: true
  ```

#### Scenario: Check count presented at seed approval
- **WHEN** the seed is presented for human approval
- **THEN** the summary SHALL include: total QA criteria count AND total PO check count, so the human can see the depth of quality evaluation. Example: "47 acceptance criteria (QA) + 128 PO quality checks across 12 journeys, 8 screens, and 23 key interactions."

### Requirement: Seeder produces a seed spec with depth proportional to product complexity
The seed spec SHALL be comprehensive enough that the Factory can build feature areas without coming back to ask questions, but not so prescriptive that it constrains implementation approach.

#### Scenario: Seed spec depth for a feature area
- **WHEN** a feature area is defined in the seed spec
- **THEN** it SHALL include:
  - Feature area name and description
  - All user journeys with step-by-step flows (from the vision document)
  - All acceptance criteria (testable assertions)
  - Data model sketch: what entities exist, what fields they have, how they relate (not schema-level detail, but enough to build from)
  - Key interaction patterns: "this uses a data table with sort/filter" or "this uses a map with markers" — naming the component pattern, not the implementation
  - Edge cases: what happens with no data, too much data, invalid input, network failure
  - What this feature area does NOT include (explicit scope boundary)

#### Scenario: Seed spec for small product (whole-product granularity)
- **WHEN** the product is small enough for whole-product cycling
- **THEN** the seed spec SHALL have the same depth as above but for the entire product in a single document, with clear separation between functional areas even if they're not cycled separately

#### Scenario: Seed spec records infrastructure requirements
- **WHEN** the seed spec is produced
- **THEN** it SHALL include an `infrastructure` section specifying:
  - `needs_database`: boolean (true for web apps with data, false for static sites, CLI tools, MCP servers)
  - `needs_auth`: boolean
  - `needs_storage`: boolean
  - `deployment_target`: `cloudflare-workers` | `cloudflare-pages` | `npm` | `other`
- **AND** the Runner SHALL use this to skip unnecessary provisioning steps

#### Scenario: Seed spec leaves implementation approach open
- **WHEN** the seed spec describes a feature
- **THEN** it SHALL NOT specify: which framework/library to use, file structure, API endpoint design, component hierarchy, or state management approach — those are Factory decisions informed by the relevant stack profile

### Requirement: Seeder requires human approval before autonomous handoff
The Seeder SHALL present the complete seed (vision document + product standard + seed spec) for human review and approval. The autonomous loop SHALL NOT begin until the human explicitly approves.

#### Scenario: Seed presentation for approval
- **WHEN** the seed is ready for review
- **THEN** the Seeder SHALL present a summary:
  - Product name and one-liner
  - Feature area count and names
  - Total acceptance criteria count
  - Total user journey count
  - Total heuristic count (global + domain + project-specific)
  - Definition of done
  - Estimated cycle count (feature areas × estimated iterations per area)
  - "Approve to start autonomous loop, or request changes?"

#### Scenario: Human requests revision
- **WHEN** the human requests changes (e.g., "the trip history feature area is too light — add map interaction details")
- **THEN** the Seeder SHALL re-enter the swarm, targeting the specific area of feedback, and re-present the revised seed

#### Scenario: Human approves
- **WHEN** the human approves the seed
- **THEN** the Seeder SHALL:
  1. Write the vision document, product standard, and seed spec to the project directory
  2. Write `state.json` with `current_state: "ready"` and a pointer to all three artifacts
  3. The autonomous loop SHALL NOT begin until the human explicitly triggers it via `rouge start` command or equivalent
