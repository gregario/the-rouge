## ADDED Requirements

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

### Requirement: Notifier supports Saturday demo compilation
The Notifier SHALL compile a weekly demo package that summarizes all products worked on during the week, for a portfolio-level review session.

#### Scenario: Saturday demo structure
- **WHEN** Saturday demo time arrives (configurable, default: Saturday 10:00 AM)
- **THEN** the Notifier SHALL compile:
  ```
  📊 Weekly Demo — Week of {date}

  Products worked on: {N}

  Per product:
  • {Product Name}
    - Status: {complete / in-progress at {N}%}
    - Deployment: {URL}
    - Cycles this week: {N}
    - Key achievement: {one sentence}
    - Top open issue: {one sentence}
    - Screenshots: [key screens]

  Library growth:
  • New global heuristics: {N}
  • New domain heuristics: {N}
  • Taste fingerprint updates: {N}
  • Total active heuristics: {N}

  Factory meta-loop:
  • Recurring issues detected: {list or "none"}
  • Factory improvement specs generated: {N}

  Patterns Socrates noticed:
  • {Cross-product observation}
  ```

#### Scenario: No work this week
- **WHEN** Saturday demo time arrives but no products were worked on
- **THEN** the Notifier SHALL skip the demo and send nothing
