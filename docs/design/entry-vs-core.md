# GC.4 — Entry vs Core Boundary (Wide)

**Status:** designed, enforcement landing in Phase 5 + Phase 7 of the grand unified reconciliation.
**Date:** 2026-04-25.
**Related code:** `src/launcher/facade.js` (Phase 3), `src/launcher/facade/dispatch/*` (Phase 3), `src/launcher/facade/events.js` (Phase 3), `src/launcher/facade/lock.js` (Phase 3).

## The boundary

Rouge has two kinds of components:

- **Entry adapters** translate human/HTTP/event input into facade calls. The dashboard, the CLI, and Slack are entries. They convert "user clicks Pause" or "user runs `rouge build`" or "Slack message arrives" into structured calls against the facade. Entries do not own state; they request mutations.

- **Core** is `src/launcher/facade.js` and its strategy implementations under `src/launcher/facade/*`. The core is the *only* component that:
  1. Writes state files (state.json, task_ledger.json, checkpoints.jsonl, cycle_context.json, seeding-state.json).
  2. Spawns AI workers (via `runPhase({ mode })` strategies).
  3. Emits events to `.rouge/events.jsonl`.
  4. Holds the per-project file lock.

Entries call the facade. Downstream subscribers (dashboard UI, Slack notifications, tests) consume facade events. Nothing else writes state, spawns AI, or emits events.

## Why this matters (and why "wide" matters)

A narrow GC.4 — "entries don't write state" — fixes the data-race class but leaves a parallel problem: today the dashboard's `claude-runner.ts:170` spawns its own AI subprocess. That subprocess writes state. So even if entries technically don't write state directly, they spawn things that do, and the same coordination failures resurface in a new place.

The wide GC.4 closes this by treating *all three* responsibilities (state writes, AI dispatch, event emission) as core-only. Entries become genuinely passive — they translate intent and read events. The facade is the single junction. Drift cannot creep in through a side channel because there is no side channel.

This is what makes the reconciliation a 10/10 architecture rather than a 9/10: the boundary is wide enough that the entire class of "two components disagree about state" is architecturally impossible, not merely currently fixed.

## Lock discipline (the hard part)

A phase run is 5–30 minutes. State locks cannot be held for that long without freezing every entry. The dashboard team explicitly punted on cross-process locking with the launcher for this reason (`dashboard/src/bridge/state-lock.ts:24-29`).

The facade resolves it with **per-transaction, not per-orchestration** locking:

1. `facade.writeState({ mutator })` is the atomic unit. The mutator is a synchronous in-memory transform — no I/O, no AI calls, no async work. Lock held for milliseconds.

2. `facade.runPhase({ mode })` (the long-running orchestration) is decomposed into many short `writeState` transactions — one for phase-start, one per progress checkpoint, one for phase-end. Between transactions the lock is released. The dashboard mutates freely between transactions; phase progress doesn't freeze the UI.

3. Lock timeout is 5s with explicit error if exceeded. Surfaces deadlock fast instead of stalling.

4. Reads are lock-free. Atomic byte-level writes already protect readers.

This discipline is enforced in dev/test (Fork E: runtime guard): `writeState` wraps the mutator with a 100ms timer and throws if exceeded. In production it logs a warning rather than throwing, because a real edge case at 3 AM oncall is worse than an occasional slow mutator.

## Typed contract surface

`src/launcher/facade.js` is JSDoc-typed. `bun run gen:facade-types` emits `dashboard/src/types/facade.d.ts` for TypeScript consumers (the dashboard bridge). Wrong field name = compile error in the dashboard, not a runtime field-shape drift discovered six weeks later.

This is what would have prevented `INTEGRATION_KEYS` from drifting from the catalogue: the dashboard consuming a typed facade surface would have failed at build time when the catalogue gained an entry the dashboard didn't know about.

## Event bus

Every facade write publishes a structured event to `.rouge/events.jsonl`. Dashboard subscribes via `facade.subscribeEvents()` instead of polling state files. Slack (notification-only after Fork B) subscribes the same way.

Critical property: **direct file writes don't generate events.** So any drift surfaces as a missing UI update during dogfood — caught in days, not months. This is the operational complement to the test-level boundary enforcement.

## Enforcement

Three layers:

### Phase 4 + 5 grep tests

`test/launcher/gc4-entry-vs-core.test.js`:

1. Greps `dashboard/src/`, `src/slack/`, `src/launcher/rouge-cli.js` for direct `fs.writeFile` / `writeFileSync` against any of the protected state files. Asserts zero hits in each entry.
2. Greps the same paths for `spawn(.claude.)` / `spawn('claude'`. Asserts zero hits.
3. Greps for direct event emissions. Asserts zero hits.
4. Greps `src/launcher/facade/` for the inverse — these *are* the only permitted call sites.

### Phase 7 architecture invariant CI gate

A separate CI job runs the GC.1–GC.4 tests with their own exit code. Failure blocks merge regardless of whether the regular test suite passes. This is the difference between "tests we run" and "architectural invariants we never break" — they get separate weight.

### Facade contract round-trip test (Phase 7)

A test invokes the same operation through the dashboard, the CLI, and (post-Slack-deletion) the legacy Slack handler. Asserts identical state mutations and identical event sequences. If any entry diverges, the test catches it before the divergence matters.

## Repair path when an entry needs new behavior

When the dashboard wants to expose a new operation:

1. Add the operation to `facade.js` with JSDoc types.
2. Run `bun run gen:facade-types` to regenerate the TypeScript shim.
3. Implement the operation handler in the facade.
4. The dashboard component calls the new facade method (typed) — compile-time error if anything's wrong.
5. Tests for the operation live with the facade, not the entry.

The entry never invents its own state-write or AI-spawn code, even temporarily.

## Out of scope

- **Multi-user / distributed state.** The lock-and-event design assumes a single host. Multi-user is a v2 product question.
- **Cross-host event subscription.** `.rouge/events.jsonl` is a local append-only log. If the dashboard runs on a different host than the launcher, a different transport (HTTP SSE, websockets) replaces the file tail; the facade contract stays the same.
- **The dispatch strategies' internal architecture.** `subprocess.js` and `sdk.js` are implementation details below the facade — they can change shape without violating GC.4 as long as they expose the same `runPhase` contract.
