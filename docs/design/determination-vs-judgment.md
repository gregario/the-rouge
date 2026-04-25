# GC.3 — Determination vs Judgment Boundary

**Status:** designed, retroactive enforcement landing in Phase 4 of the grand unified reconciliation.
**Date:** 2026-04-25.
**Related code:** `src/launcher/facade.js` (Phase 3), `src/launcher/facade/dispatch/{subprocess,sdk}.js` (Phase 3), the four current AI dispatch sites (see below).

## The boundary

Rouge has two kinds of decisions:

- **Routing / orchestration / accounting decisions** are deterministic JS in `src/launcher/`. Examples: state machine transitions, capability assessments, cost gating, spin detection, audit-trail recommendations, milestone-lock checks, escalation routing, model-tier selection. These run in launcher code with full unit-test coverage. **No AI calls in the hot path.**

- **Content decisions** are AI work — what code to write, what design to propose, what evaluation rubric to apply, what story to build next. AI is invoked *only* when explicit deterministic routing says "now run phase X." AI is never invoked to make a routing decision itself.

Determination = JS decides *what to do next*. Judgment = AI decides *how to do it*.

## Why this matters

If routing decisions are made by AI calls, three failure modes appear:

1. **Spin and runaway cost.** "Should we keep iterating?" answered by AI biases toward "yes" because there's always a plausible next iteration. Deterministic spin detection in `safety.js` catches identical-edit loops in <1 second.

2. **Untestable invariants.** A state-machine transition decided by an AI prompt cannot be unit-tested for invariant preservation (e.g. "milestone-lock prevents production deploys"). A JS transition can.

3. **Audit illegibility.** When the trail says "the AI thought we should ship," the human reviewer cannot reconstruct *why*. When the trail says "deterministic routing.js:147 routed to ship-promote because milestone-lock passed and cost-gate allowed," the reviewer can.

The principle is older than Rouge: in any judgment system that interacts with consequential actions, the routing layer must be observable, testable, and reproducible. That means deterministic code, not AI.

## The four AI dispatch sites (current)

As of 2026-04-25, AI is spawned from four places:

1. `src/launcher/rouge-loop.js:2307` — the loop spawn site (`claude -p` subprocess).
2. `src/launcher/harness/sdk-adapter.js:207` — the SDK adapter (`messages.create` call).
3. `src/launcher/self-improve.js:210` — self-improvement runs claude -p too.
4. `dashboard/src/bridge/claude-runner.ts:170` — the dashboard's seed-daemon subprocess.

These are the *only* permitted dispatch sites. After Phase 5 of the reconciliation, they all flow through `facade.runPhase({ mode })` so the dispatch becomes a single observable junction.

## Enforcement

### Test (Phase 4 deliverable)

`test/launcher/gc3-determination-boundary.test.js`:

1. Greps the entire `src/launcher/` tree for `claude -p`, `spawn(.claude.)`, `messages.create`, `client.messages\.`. Asserts every match is inside `src/launcher/facade/dispatch/*` or one of the four legacy dispatch sites listed above.
2. Greps `dashboard/src/` for the same patterns. Asserts every match is the legacy `claude-runner.ts` site (until Phase 5 migrates it).
3. Asserts every facade dispatch call site logs a structured entry (`{ source, phase, mode, project }`) before invoking the strategy. The audit-trail wiring is non-optional.

### Architectural rule

State-machine transitions, capability checks, cost decisions, audit-trail decisions are tested with **deterministic input → deterministic output** unit tests. No mocked AI clients. No "the AI says so" branches.

If a routing decision genuinely needs AI judgment (e.g. classifying a vague user message), the pattern is:

1. Deterministic JS detects the ambiguous case.
2. Deterministic JS dispatches a *judgment phase* via `facade.runPhase` — the AI returns a structured classification.
3. Deterministic JS reads the classification and routes accordingly.

The AI is asked one bounded question; the routing decision based on the answer is still made in JS.

## What this rules out

- "Let the AI decide whether to retry" → no. JS counts retries against a cap.
- "Have the AI choose the next phase" → no. JS state machine transitions to the next phase based on observable state.
- "Have the AI assess its own capability" → no, but with nuance: the *capability-check* judgment phase asks the AI to surface what it can/can't do for a given task; the routing decision based on the response is JS.
- "Let the AI decide whether to escalate" → no. JS spin detector + cost gate + milestone lock decide.

## What this permits

- AI generates the build artifacts (code, content, designs) — judgment.
- AI generates structured outputs that JS then routes on — bounded judgment.
- AI authors evaluation findings (the *what*) that the rubric (deterministic) gates on (the *threshold*).

## Out of scope

- **The harness adapter's structured output mechanism.** That's a tool-specific implementation detail, not a boundary question. The boundary is "where can AI be dispatched from"; the harness is one such dispatcher.
- **Future agent-mode loops.** When Rouge eventually gains agent-loop work (longer-running AI sessions with tool use), the agent loop is a *single dispatch* from JS — the routing decision *to enter the loop* is still deterministic. The agent's internal tool decisions are content, not routing.
