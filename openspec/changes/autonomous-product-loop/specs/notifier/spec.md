## ADDED Requirements

### Requirement: Notifier uses Slack Bot API with Socket Mode for bidirectional communication
The Notifier SHALL use a lightweight Slack bot (Bolt.js, ~50 lines) with Socket Mode for receiving human feedback, and either `chat.postMessage` or incoming webhooks for sending structured notifications. The Notifier SHALL NOT use MCP for Slack — MCP only works within active Claude Code sessions and cannot handle asynchronous notifications.

#### Scenario: Sending notifications from phases
- **WHEN** a phase needs to send a Slack notification (product ready, pivot request, scope expansion)
- **THEN** it SHALL use an incoming webhook URL (`curl -X POST`) with Block Kit JSON payload
- **AND** this works from any phase without a persistent process

#### Scenario: Receiving feedback asynchronously
- **WHEN** the human replies to a notification in Slack
- **THEN** the Socket Mode listener SHALL write the feedback to `projects/<name>/feedback.json`
- **AND** the launcher SHALL detect the feedback file on its next loop and transition the project out of `waiting-for-human` state

#### Scenario: Slack bot runs alongside launcher
- **WHEN** the Rouge system starts
- **THEN** the Slack bot process SHALL start alongside the launcher (separate process or background job)
- **AND** it SHALL maintain a WebSocket connection to Slack via Socket Mode (outbound only, no public URL needed)

### Requirement: Notifier sends structured Slack messages for key events
The Notifier SHALL send Slack messages to a configured channel or DM for defined event types. Messages SHALL be structured with Slack Block Kit for readability, not plain text dumps.

#### Scenario: Product ready notification
- **WHEN** the Runner reaches `complete` state (all feature areas pass, vision check passes)
- **THEN** the Notifier SHALL send a Slack message:
  ```
  🟢 {Product Name} — Ready for Review

  Deployment: {URL}
  Build time: {hours}h {minutes}m across {N} cycles
  Feature areas: {N} complete

  Quality Summary:
  • Spec completeness: {N}%
  • Functional heuristics: {passed}/{total}
  • Non-functional heuristics: {passed}/{total}
  • User journeys: {completed}/{total}
  • Reference comparison: {verdict summary}

  Confidence: {score}%

  Reply with feedback when you've reviewed it.
  ```

#### Scenario: Pivot decision notification
- **WHEN** the Runner's confidence drops below 70% OR the vision check flags fundamental misalignment
- **THEN** the Notifier SHALL send a Slack message:
  ```
  🟡 {Product Name} — Needs Your Input

  Status: Confidence at {N}% after {N} cycles

  What's happening:
  • {Plain-English summary of what's going wrong}

  What Socrates tried:
  • {List of approaches attempted and their outcomes}

  Options:
  A) {Recommended option with rationale}
  B) {Alternative option}
  C) Continue as-is for {N} more cycles
  D) Pause and discuss

  Reply with A/B/C/D or your own direction.
  ```

#### Scenario: Scope expansion notification
- **WHEN** the Runner autonomously expands scope (confidence >80%)
- **THEN** the Notifier SHALL include in the next morning briefing (not immediate):
  ```
  📝 Scope expansion: Added {capability} because {reason}.
  This was not in the original vision. Confidence was {N}% so Socrates proceeded autonomously.
  Reply "revert {capability}" if this was wrong.
  ```

### Requirement: Notifier produces morning briefings
The Notifier SHALL compile a structured morning briefing summarizing all autonomous work since the last human interaction. Briefings are sent at a configured time (default: 8:00 AM local) or when the human sends a Slack message after a period of inactivity.

#### Scenario: Morning briefing structure
- **WHEN** morning briefing time arrives and autonomous work has occurred
- **THEN** the Notifier SHALL send:
  ```
  ☀️ Morning Briefing — {Date}

  Active project: {Product Name}
  Cycles completed overnight: {N}

  Progress:
  • {Feature Area 1}: {status} — {brief summary}
  • {Feature Area 2}: {status} — {brief summary}

  Highlights:
  • {Most significant achievement or decision}
  • {Second most significant}

  Issues resolved autonomously:
  • {Issue}: {how it was resolved}

  Items needing your input:
  • {Item 1}: {context + options}

  Confidence trend: {↑ improving / → stable / ↓ declining} ({score}%)

  Screenshots: [attached — key screens showing current state]
  ```

#### Scenario: Morning briefing with screenshots
- **WHEN** the product is a web product and has a deployment URL
- **THEN** the briefing SHALL include screenshots of:
  1. The primary dashboard/home screen
  2. Each feature area's main screen that was worked on overnight
  3. Any screen where a significant design decision was made
  — maximum 5 screenshots, annotated with brief captions

#### Scenario: No overnight work
- **WHEN** morning briefing time arrives but no autonomous work has occurred (Runner was paused, waiting, or idle)
- **THEN** the Notifier SHALL send a brief status: "No overnight activity. {Product Name} is {state}: {reason}."

#### Scenario: Morning briefing triggered by cron
- **WHEN** a cron job fires at the configured briefing time (default 8:00 AM)
- **THEN** it SHALL write a `trigger-briefing.json` file to the Rouge state directory
- **AND** the launcher SHALL detect this file, transition to a briefing phase for each active project, compile the briefing, and send via Slack webhook

### Requirement: Notifier ingests human feedback and routes it
The Notifier SHALL accept human feedback via Slack messages, parse it into structured items, classify each item, and route it to the appropriate handler (Runner for change specs, Library for taste updates).

#### Scenario: Feedback parsing
- **WHEN** the human sends a Slack message in response to a notification
- **THEN** the Notifier SHALL:
  1. Parse the message for distinct feedback items (a single message may contain multiple items)
  2. For each item, classify as:
     - `product-change`: something specific to change in this product → route to Runner as change spec input
     - `global-learning`: a general principle or preference → route to Library as global standard/update
     - `domain-learning`: a domain-specific observation → route to Library as domain taste entry
     - `personal-preference`: a personal taste expression → route to Library as fingerprint update
     - `direction`: a high-level strategic input (pivot, expand, contract) → route to Runner as state transition trigger
  3. Confirm classification: "Socrates parsed {N} items from your feedback: {summary}. Processing now."

#### Scenario: Feedback parsing example
- **WHEN** the human sends: "The navigation is on the wrong side, move it to the left. Also I always want navs on the left in SaaS products. And the dashboard is too empty — add more data density."
- **THEN** the Notifier SHALL parse into 3 items:
  1. `product-change`: "Move navigation to the left side" → change spec for current product
  2. `domain-learning`: "Navigation should be on the left in SaaS products" → Library web domain heuristic
  3. `product-change`: "Add more data density to dashboard" → change spec for current product
  AND detect a potential `personal-preference`: "prefers left-side navigation" → Library fingerprint check (does this pattern already exist? If so, strengthen it.)

#### Scenario: Ambiguous feedback
- **WHEN** a feedback item's classification is ambiguous
- **THEN** the Notifier SHALL ask via Slack: "Socrates isn't sure about: '{item}'. Is this: (A) Just for this product, (B) For all {domain} products, (C) For everything you build?"

#### Scenario: Voice transcription handling
- **WHEN** feedback arrives as a voice transcription (potentially rough, with filler words, incomplete sentences)
- **THEN** the Notifier SHALL:
  1. Clean up the transcription into clear feedback items
  2. Present the interpreted items back to the human: "Socrates heard {N} items: {list}. Correct?"
  3. Wait for confirmation before routing

### Requirement: Notifier batches non-critical communications
The Notifier SHALL aggregate non-critical updates into morning briefings rather than sending individual messages. Only critical events trigger immediate messages.

#### Scenario: Critical events (send immediately)
- **WHEN** any of these occur:
  - Confidence drops below 70%
  - Complete build failure (Factory cannot compile/deploy)
  - Pivot-level vision misalignment detected
  - Budget threshold reached (token cost)
- **THEN** the Notifier SHALL send a Slack message immediately

#### Scenario: Non-critical events (batch into briefing)
- **WHEN** any of these occur:
  - Autonomous scope expansion
  - Feature area completed
  - Minor issue resolved autonomously
  - Library updated from self-evaluation
  - Deepen/broaden cycle completed
- **THEN** the Notifier SHALL queue the event for the next morning briefing

#### Scenario: Human initiates contact
- **WHEN** the human sends a Slack message outside of briefing time
- **THEN** the Notifier SHALL respond with a condensed status update (not a full briefing): current state, current feature area, confidence, and answer to any questions in the message

> **Note:** Saturday demo compilation deferred from V1. Can be added as a periodic state triggered by cron.

### Requirement: Notifier handles Slack commands as the control plane
The Notifier SHALL support three modes of Slack interaction: command handling (control plane), interactive seeding (project creation via chat), and feedback during autonomous loops (already specified above).

#### Scenario: Command parsing
- **WHEN** a Slack message matches a known command pattern ("rouge start X", "rouge pause X", "rouge resume X", "rouge status")
- **THEN** the Slack bot SHALL parse the command and execute it by modifying the appropriate project's `state.json`
- **AND** respond with confirmation in Slack

#### Scenario: Unknown command
- **WHEN** a Slack message doesn't match a command pattern and no project is in `waiting-for-human` state
- **THEN** the Slack bot SHALL respond: "Unknown command. Available: rouge start <name>, rouge pause <name>, rouge resume <name>, rouge status, rouge new <name>"

### Requirement: Notifier supports interactive seeding via Slack
The Notifier SHALL support creating new projects entirely through Slack conversation. The human chats with The Rouge in Slack to go through the seeding swarm (brainstorming, competition review, product taste, spec, design). This enables project creation from a phone without needing a terminal.

#### Scenario: New project initiation
- **WHEN** a Slack message "rouge new {project-name}" is received
- **THEN** the Slack bot SHALL:
  1. Create the project directory with initial scaffolding
  2. Start an interactive seeding session by spawning a Claude Code session with the seeding skill
  3. Relay messages between Slack and the Claude Code session
  4. The seeding swarm runs through Slack: questions appear as Slack messages, the human replies in Slack

#### Scenario: Seeding conversation timeout
- **WHEN** a seeding conversation has been inactive for more than 2 hours
- **THEN** the Slack bot SHALL save the current seeding state to `projects/{name}/seeding-state.json`
- **AND** message: "Seeding for {name} paused due to inactivity. Reply 'rouge seed {name}' to resume."

#### Scenario: Seeding conversation resume
- **WHEN** a Slack message "rouge seed {project-name}" is received for a project with saved seeding state
- **THEN** the Slack bot SHALL resume the seeding conversation, restoring context from `seeding-state.json`

#### Scenario: Seeding completion via Slack
- **WHEN** the seeding swarm reaches convergence and the human approves the seed via Slack
- **THEN** the Slack bot SHALL write all seed artifacts (vision, product standard, seed spec) to the project directory
- **AND** write `state.json` with `current_state: "ready"` (NOT "building")
- **AND** message: "{name} seeded and ready. Send 'rouge start {name}' when you want to begin the autonomous loop."
