# Grand Unified Reconciliation — Plan

**Status:** Draft 2 (2026-04-25). Post plan-eng-review. Targets the **10/10 complete** architecture: facade owns AI dispatch + state writes, harness folded in as a strategy, event bus core, typed contract surface, CI-gate invariant tests. Pending owner direction on lock discipline (A2) and the four original forks.

## What we're solving

Rouge accreted three control planes (dashboard, CLI, Slack), three
integration registries (tier-2 catalogue, INTEGRATION_KEYS, MCP
manifests), four secret sources, and seven state files — each layer
bolted on without consolidating the previous one. The accumulated
drift just surfaced concretely:

- The MCP-vs-CLI question (no policy on which to use)
- The catalogue-vs-secrets gap (`setup neon` failed despite the entry existing)
- The UAT script defaulting to CLI verbs when the dashboard is supposed to be canonical
- The dashboard/CLI race condition on `state.json` (control_plane_lock
  only guards dashboard+Slack)

This isn't a bug class — it's an architectural debt class. Three
related fixes in a week says the next surfacing is days away. The
right move is one structured reconciliation, not three more patches.

The Explore-agent survey (`/private/tmp/.../tasks/...output`) found
the codebase is surprisingly clean (no `// TODO: remove`-style dead
code), the GC.1 self-improve boundary is well-enforced (allowlist +
blocklist in `rouge.config.json` + `config-protection.js` pre-write
hook), and the dashboard is *declared* canonical but the CLI remains
fully functional with no removal timeline. The fix is consolidation,
not rewrite.

## The unified architecture

Three orthogonal axes, each with one canonical resolution:

```
                       ┌─────────────────────────────────────────┐
                       │            HUMAN ENTRY                   │
                       │                                          │
                       │  Dashboard (canonical, GUI)              │
                       │      │                                   │
                       │      ▼                                   │
                       │  ┌────────────────────────────────────┐  │
                       │  │  Launcher Facade (the "root")     │  │
                       │  │  Single API for all entries       │  │
                       │  └────────────────────────────────────┘  │
                       │      ▲              ▲                    │
                       │      │              │                    │
                       │  CLI (power-user)   Slack (seeding only) │
                       └─────────────────────────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
       ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
       │ DETERMINATION│ │  EXECUTION   │ │  JUDGMENT    │
       │              │ │              │ │              │
       │ launcher/*   │ │ CLI tools    │ │ claude -p    │
       │ (state, route│ │ (vercel,     │ │ (build/judge)│
       │ capability,  │ │  wrangler,   │ │              │
       │ audit,       │ │  gh, supabase│ │ harness SDK  │
       │ catalogue,   │ │  ↓ via Bash) │ │ (judge/retro)│
       │ schemas)     │ │              │ │              │
       │              │ │ MCPs         │ │ MCPs         │
       │ Same input → │ │ (read-only,  │ │ (read assist │
       │ same output  │ │  introspect) │ │  to AI)      │
       └──────────────┘ └──────────────┘ └──────────────┘
                │               │               │
                └───────┬───────┴───────────────┘
                        ▼
              ┌────────────────────┐
              │  CANONICAL STATE   │
              │                    │
              │  V3 schema:        │
              │   task_ledger.json │
              │   checkpoints.jsonl│
              │   journey.jsonl    │
              │   cycle_context.json│
              │                    │
              │  All writes via    │
              │  state-writer      │
              │  facade (locked)   │
              └────────────────────┘
```

### The four boundary policies (GC.1 — GC.4)

Each gets its own design doc. GC.1 exists; the other three need
writing.

**GC.1 — Judge vs Pipeline (existing).** Self-improve pipeline can
edit generation/operational prompts only; never the measurement
instrument (judges, rubrics, schemas, gold-sets). Enforced in
`rouge.config.json` `self_improvement.{allowlist,blocklist}` plus
`rouge-safety-check.sh` pre-write hook. Tests in
`test/launcher/self-improve-safety.test.js`.

**GC.2 — MCP vs CLI (new).** MCPs do read/inspect/observe operations;
CLIs do state-mutating operations (deploy, migrate, push, secret
set). The phase prompts that touch external systems (foundation,
building, ship-promote) explicitly direct the AI: read-via-MCP if the
MCP is wired in, write-via-CLI always. MCPs are advisory; CLIs are
authoritative. Enforced by: (a) prompt-content tests that grep for
"use the X MCP" near deploy/migrate/delete verbs and fail; (b)
`mcp-configs/*.json` manifests gain a `read_only_recommended: true`
field that the wire-into-phases validator rejects on a phase that
includes write verbs.

**GC.3 — Determination vs Judgment (new, mostly retroactive).**
Launcher modules decide routing; AI decides content. State machine
transitions, capability assessments, cost gating, spin detection,
audit recommendation are all deterministic JS — no AI calls in the
hot path. AI is invoked only when explicit routing says "now run
phase X" — never to make routing decisions itself. Today AI is
spawned from FOUR sites: `rouge-loop.js:2307` (loop), `harness/sdk-adapter.js:207`
(SDK), `self-improve.js:210` (self-improve), `dashboard/src/bridge/claude-runner.ts:170`
(dashboard seed-daemon). After Phase 2 they all dispatch through
the facade's `runPhase({ phase, mode })` strategy. Enforced by: a
test asserting `claude -p` / `messages.create` literals appear ONLY
inside `src/launcher/facade/dispatch/*` (the strategy implementations)
— zero hits anywhere else.

**GC.4 — Entry vs Core (new, WIDE).** Dashboard, CLI, and Slack are
entry adapters. They translate human/HTTP/event input into facade
calls. They MUST NOT (a) write state files directly, (b) spawn AI
workers directly, or (c) emit phase events directly. The launcher
facade (`src/launcher/facade.js`) is the only thing that writes
state, holds the mutex, dispatches AI work, and emits events. The
facade is the single junction; everything else is either an entry
(producer of facade calls) or a downstream subscriber (consumer of
facade events). Enforced by: a test that greps `dashboard/`,
`src/slack/`, `rouge-cli.js` for direct `fs.writeFile.*state\.json`,
direct `spawn(.claude.)`, and direct event emissions, asserting zero
hits in each category.

### Typed contract surface

The facade exposes a typed surface so all entries get the same
contract. `src/launcher/facade.js` is JSDoc-typed; `bun run gen:facade-types`
emits `dashboard/src/types/facade.d.ts` consumed by every TypeScript
caller. Wrong field name = compile error in the dashboard, not a
runtime field-shape drift six weeks later. This is what would have
prevented `INTEGRATION_KEYS` from drifting from the catalogue.

### Event bus (core, not optional)

Every facade write publishes a structured event to a per-project
local event channel (file-tail-style, on a `.rouge/events.jsonl`
append-only log). Dashboard tails events instead of polling. Slack
tails events instead of polling. Tests assert events for every
mutation. Critical property: **direct file writes don't generate
events**, so any drift surfaces as a missing UI update during
dogfood — caught in days, not months.

This is what was Phase 9 (optional) in Draft 1; promoted to core
in Draft 2 because it is the architectural mechanism that *prevents*
the drift class. Without it, the boundary tests catch only known
patterns; with it, every drift surfaces operationally.

### State writes + AI dispatch: one path

Today, state writes happen at ~95 callsites and AI is spawned from
4 sites, with no shared coordination. The facade pattern moves
all of it behind a single typed API:

```js
// src/launcher/facade.js
//
// All operations take a `source: 'dashboard' | 'cli' | 'slack' | 'loop' | 'self-improve'`
// for audit trail. All hold per-project locks ONLY for the duration
// of a single read-modify-write transaction (see Lock discipline below).
// All emit a structured event to `.rouge/events.jsonl` after commit.

// ---- Project lifecycle ----
async function createProject({ name, source }) { ... }
async function triggerSeeding({ projectName, message, source }) { ... }
async function startBuildLoop({ projectName, source }) { ... }
async function pauseProject({ projectName, reason, source }) { ... }
async function resolveEscalation({ projectName, resolution, source }) { ... }

// ---- Atomic state mutations (low-level) ----
async function writeState({ projectName, mutator, source }) { ... }
//   Acquires lock → reads → applies mutator(state) → validates → writes → emits event → releases.
//   Mutator MUST be fast (synchronous in-memory transform). No I/O inside.

// ---- AI dispatch (the wide GC.4) ----
async function runPhase({ projectName, phase, mode, source }) { ... }
//   mode: 'subprocess' (claude -p) | 'sdk' (harness adapter)
//   Internally selects strategy from src/launcher/facade/dispatch/{subprocess,sdk}.js
//   Emits phase-start, phase-progress, phase-end events.
//   Long-running. Does NOT hold a state lock for the duration.

// ---- Event subscription ----
function subscribeEvents({ projectName, fromOffset }) { ... }
//   Returns async iterator over .rouge/events.jsonl tail.
//   Dashboard + Slack consume this instead of polling.
```

Tests assert no module outside `src/launcher/facade/` writes state,
spawns AI, or emits events. Migration is mechanical for state
(replace `writeJson(stateFile, …)` with `facade.writeState({ mutator })`)
and structural for AI dispatch (the seed-daemon's spawn site,
self-improve's spawn site, and the loop's spawn site all become
`facade.runPhase` calls with different modes).

### Lock discipline (decision needed — see FORK E)

**The hard constraint:** phase runs are 5–30 minutes. State locks
cannot be held for that long without freezing every other entry.
The dashboard team explicitly punted on cross-process locking for
this reason (`dashboard/src/bridge/state-lock.ts:24-29`).

**The discipline that resolves it:**

- `writeState({ mutator })` is the atomic unit: acquire → read →
  patch → write → release. Mutator is synchronous in-memory; no I/O.
  Lock held for milliseconds.
- `runPhase` is decomposed into many short `writeState` transactions.
  Phase boundaries (start, progress checkpoint, end) each take and
  release the lock independently. Between transactions the lock is
  released; dashboard can mutate.
- Lock timeout is small (5s default) with explicit error if exceeded.
  Surfaces deadlock fast instead of stalling.
- Reads are lock-free (atomic byte-level write on the dashboard side
  already protects readers).

This discipline is non-negotiable for the facade to work. FORK E
below is just whether we enforce it via runtime guard (mutator
times itself, throws if it took >100ms) or static review only.

### The integration registry: one source of truth

`library/integrations/tier-2/` is the canonical catalogue. Today it
holds 32 entries in two shapes:

- 28 flat yamls (`<slug>.yaml`) for services like stripe, supabase, sentry
- 4 directory-based entries (`<slug>/manifest.json`) for deploy targets:
  github-pages, vercel, cloudflare-pages, docker-compose

Both shapes get an optional `mcp:` block. The other two registries
(INTEGRATION_KEYS, mcp-configs/) become **derived views**:

- **`INTEGRATION_KEYS` (in `secrets.js`) becomes a generated view.**
  Source moves to a derived getter that reads tier-2 entries, picks
  `requires.env_vars`, applies a (small) override map for cases
  where the catalogue env list and the user-prompted secret list
  differ (e.g. CLOUDINARY_URL is composed; the user pastes the
  components). The hand-extension landed in `b197fbb` becomes the
  override map.

- **`./mcp-configs/*.json`** (at repo root, 8 files) folds into the
  matching tier-2 entry's `mcp:` block. Mapping:
  - `mcp-configs/vercel.json` → `tier-2/vercel/manifest.json` (directory shape)
  - `mcp-configs/supabase.json` → `tier-2/supabase.yaml`
  - `mcp-configs/cloudflare-workers.json` → new `tier-2/cloudflare-workers.yaml` (doesn't exist yet)
  - `mcp-configs/github.json` → new `tier-2/github.yaml`
  - `mcp-configs/playwright.json` → new `tier-2/playwright.yaml`
  - `mcp-configs/exa.json`, `firecrawl.json`, `context7.json` → new tier-2 entries (research/seeding services)

  `wire_into_phases` already exists in all 8 manifests, so the field
  is data-portable as-is.

A single function `loadCatalogue()` reads both yaml + manifest.json
shapes, folds in the matching MCP block, returns the unified view.
Code reading from any of the three old sources points at the new
function. Schema test validates the merged shape (existing tier-2
+ tier-3 schema tests extend, no new test infra needed).

## Migration sequence (12 phases, 10/10 target)

Each phase is one to two PRs, has its own test/safety guarantee,
and ends in a state where the system is strictly better than the
previous phase (no half-complete intermediate states). Numbering
preserved from Draft 1 where possible; new phases marked with `*`.

**Phase 0 — Policy docs.**
Write the four boundary docs:
- `docs/design/self-improve-boundary.md` (the missing GC.1 doc)
- `docs/design/mcp-vs-cli-boundary.md` (GC.2)
- `docs/design/determination-vs-judgment.md` (GC.3, retroactive — names the 4 dispatch sites)
- `docs/design/entry-vs-core.md` (GC.4, wide; facade rationale + lock discipline)
Each ~2 pages. No code change. Establishes vocabulary the next
phases enforce. **0.5d.**

**Phase 1 — Catalogue as source of truth.**
- New: `src/launcher/catalogue.js` exposes `loadCatalogue()` reading
  both tier-2 shapes (flat yaml + directory/manifest.json) and
  folding `./mcp-configs/*.json` into matching entries.
- New tier-2 entries created where mcp-configs has no parent
  (cloudflare-workers, github, playwright, exa, firecrawl, context7
  — 6 new yamls).
- Refactor: `secrets.js` reads INTEGRATION_KEYS from catalogue +
  override map. `mcp-health-check.js` reads from catalogue.
- Move: `./mcp-configs/` → `library/integrations/mcp-configs/`
  (keeps catalogue contained under one root). Symlink left at root
  for one release.
- Test: catalogue schema test asserts every tier-2 with `requires.
  env_vars` is reachable via `loadCatalogue()`. Test asserts every
  MCP-block has `read_only_recommended` set explicitly.
- Safety: derived views read from catalogue + override map; both
  shapes work; legacy callsites continue functioning.
- **2d.**

**Phase 2 — GC.2 prompt-content tests** (formerly Phase 4; moved
early because it has zero deps and locks in MCP-vs-CLI policy in
the prompts before the facade work begins).
- Add prompt-content tests that grep for "MCP" in any prompt that
  also contains "deploy" / "migrate" / "delete" / "force-push" verbs
  near it, fail if AI is told to mutate via an MCP.
- Update foundation, building, ship-promote prompts to add the GC.2
  policy paragraph.
- **1d.**

**Phase 3* — Facade shell + typed contract surface.**
- New: `src/launcher/facade.js` with the operations + types from
  the State-writes section. JSDoc-typed.
- New: `src/launcher/facade/dispatch/` directory with `subprocess.js`
  + `sdk.js` strategy implementations. (`subprocess.js` calls into
  `rouge-loop.js`'s spawn helper; `sdk.js` calls into the harness
  adapter.)
- New: `bun run gen:facade-types` emits `dashboard/src/types/facade.d.ts`
  for TS consumers.
- New: `src/launcher/facade/events.js` exposes `emit()` +
  `subscribeEvents()` against `.rouge/events.jsonl`.
- New: `src/launcher/facade/lock.js` (single shared lock helper used
  by both launcher + dashboard; replaces `dashboard/src/bridge/state-lock.ts`).
- Tests: round-trip facade contract test (dashboard, CLI, Slack call
  the same op, all see identical state mutation + event emission);
  lock-discipline test (mutator that takes >100ms throws in dev).
- Safety: facade exists but no callers wired up yet — additive.
- **3d.**

**Phase 4* — Loop-internal facade migration (was Phase 2a).**
- Refactor every `writeJson(stateFile, …)` in `rouge-loop.js` (55
  callsites) to `facade.writeState({ mutator })`. Decomposes into
  ~30 named mutators (many sites use identical patterns).
- Refactor `claude -p` spawn at `rouge-loop.js:2307` to call
  `facade.runPhase({ mode: 'subprocess' })`.
- Test: GC.4 grep test asserts no direct state writes inside
  rouge-loop.js. Test asserts loop emits events for every phase
  transition.
- Safety: behavior-equivalent. State shape unchanged. Lock acquired
  per transaction, released between them — phase runs do not hold
  the lock.
- **3d.**

**Phase 5* — Entry-side facade migration (was Phase 2b).**
- Refactor state writes:
  - `src/launcher/rouge-cli.js` (5 callsites) → facade
  - `dashboard/src/bridge/*.ts` (24 callsites across 9 files) → facade via `dashboard/src/types/facade.d.ts`
- **Slack becomes notification-only** (Fork B decision):
  - Delete the 5 write-path callsites in `src/slack/bot.js`
    (seeding-message handler, state-mutation responses).
  - Convert remaining ~6 Slack callsites to event-subscriber pattern
    via `facade.subscribeEvents()`.
  - Remove Slack as a `source:` value from facade write operations.
  - Document: seeding now requires the dashboard or CLI; Slack
    emits status only.
- Refactor AI dispatch:
  - `dashboard/src/bridge/claude-runner.ts:170` → `facade.runPhase({ source: 'dashboard' })`
  - `src/launcher/self-improve.js:210` → `facade.runPhase({ source: 'self-improve' })`
- Refactor event consumption:
  - Dashboard's `dashboard/src/bridge/watcher.ts` (file-tail) → `facade.subscribeEvents()`
  - Slack's polling loop → `facade.subscribeEvents()`
- Test: GC.4 grep tests assert zero direct state writes, zero direct
  `spawn(.claude.)`, zero direct event emissions outside facade.
  Slack-specific test asserts no `writeJson(stateFile, …)` in `bot.js`.
- Safety: each entry migrates separately; changes are mechanical;
  watch for edge cases in seed-daemon error paths. Slack write
  removal is a deletion, not a migration — simpler and safer.
- **3.5d** (was 4d; reduced because Slack write paths are deleted
  rather than migrated).

**Phase 6 — MCP spawn-time wiring.**
- `facade/dispatch/subprocess.js` reads catalogue's MCP blocks,
  computes per-phase MCP set from `wire_into_phases`, generates the
  `--mcp-config <subset>` argument.
- Same plumbing for `facade/dispatch/sdk.js` when the SDK adapter
  gains MCP support.
- Test: spawn-arg builder test (e.g. `loop.ship-promote` spawns with
  vercel + cloudflare-workers MCPs).
- **0.5d** (was 1d in Draft 1; reduced because `wire_into_phases`
  already exists in all 8 manifests).

**Phase 7* — Architecture invariant CI gate.**
- New CI job runs the GC.1–GC.4 enforcement tests with a separate
  exit code; failure blocks merge.
- New "facade contract round-trip" test runs against dashboard +
  CLI + Slack, asserts identical mutations + events.
- **0.5d.**

**Phase 8 — Control plane decision (FORK A).**
Same as Draft 1's Phase 5. CLI surface direction.

**Phase 9 — Test migration.**
Update tests that use `rouge init` / `rouge seed` / `rouge build`
based on Phase 8 decision. **1d.**

**Phase 10 — Dashboard parity for power-user CLI.**
Same as Draft 1's Phase 7. **2–5d** depending on # commands.

**Phase 11 — Vestigial cleanup pass.**
Same as Draft 1's Phase 8 + drop the `mcp-configs/` symlink left
in Phase 1. **0.5d.**

## Owner-direction forks

Five explicit decisions where the user picks. Default in italics.

**FORK A — CLI surface (Phase 8).** ✅ **DECIDED: hybrid.**
- (A) Fully deprecate `init` / `seed` / `build`.
- (B) Keep CLI as a first-class power-user surface.
- ✅ **(C) HYBRID**: CLI commands continue but route through the
  facade. Same code path as dashboard. Warnings stay (GUI is the
  canonical onboarding), no removal timeline.
Decision: option C (2026-04-25). Lets the core ship without forcing
a CLI-vs-dashboard ideological commitment. Revisit after dogfood
reveals what users actually need.

**FORK B — Slack control plane fate.** ✅ **DECIDED: notification-only sidecar.**
- (A) Slack stays a first-class third control plane.
- ✅ **(B) NOTIFICATION-ONLY**: Slack subscribes to `facade.subscribeEvents()`,
  emits status / alerts / escalation pings. Phase 5 removes the
  seeding-via-Slack write path entirely (rather than migrating it).
  Slack's `bot.js` stops doing `writeJson(stateFile, …)` — those
  callsites are deleted, not facade-routed. Single command-intake
  surface (dashboard) cuts the coordination class entirely.
- (C) Defer.
Decision: option B (2026-04-25). Removes the "Slack says X, dashboard
says Y" UX confusion class. Cost: seeding-via-Slack flow is removed.
Phase 5 entry-side migration scope drops by ~5 of the 11 Slack write
sites (the remaining ~6 are notification-emission paths that become
event-subscribe paths).

**FORK C — Catalogue field migration boldness.** ✅ **DECIDED: partial.**
- (A) Move MCP manifests fully into tier-2 yamls.
- ✅ **(B) PARTIAL**: catalogue is the read-API. Disk layout stays —
  tier-2 yamls + manifest.json + mcp-configs all on disk;
  `loadCatalogue()` is the reconciler. `mcp-configs/` moves to
  `library/integrations/mcp-configs/` in Phase 1 with a one-release
  symlink at the old path.
- (C) Status quo.
Decision: option B (2026-04-25). Less disruptive, gets the policy
benefit. Disk-layout collapse to single-file-per-service can happen
in Phase 11 if dogfood signal asks for it.

**FORK D — How aggressively to enforce GC.4 (entry-vs-core).** ✅ **DECIDED: warn-then-enforce.**
- (A) Hard wall.
- ✅ **(B) WARN-LATER-ENFORCE**: facade lands, all entries migrate,
  but the no-direct-writes test starts as a warning. Flip to
  enforcement once everyone's migrated. ~1 release of warn period.
- (C) Soft policy.
Decision: option B (2026-04-25). Hard walls work but jarring;
warn-period catches late migrations without breaking working code
on the day the test flips.

**FORK E — Lock discipline enforcement (Phase 3).** ✅ **DECIDED: runtime guard.**
- ✅ **(A) RUNTIME GUARD**: facade.writeState wraps the mutator with a
  100ms timer in dev/test; throws if exceeded. Production logs a
  warning instead of throwing. Catches the "I/O inside the mutator"
  class at the moment it's introduced.
- (B) Static review only.
- (C) Strict everywhere.
Decision: option A (2026-04-25). Catches the bug class without
breaking prod on edge cases.

## Out of scope (explicitly)

These are tempting to bundle but stay separate concerns:

- **Migrating tool-using phases (build, fix, deploy) to the SDK
  adapter.** The harness PoC (P5.9) carved this out. Build needs the
  Claude Code agentic loop; the SDK adapter is for non-tool phases.
  After this plan ships, both invocation paths are unified behind
  `facade.runPhase({ mode })` — but *which* phases use which mode
  remains a separate evaluation.
- **MCP-into-spawn for the harness adapter.** Phase 6 covers
  `claude -p` (subprocess) spawn only. SDK-mode MCP support is a
  separate sub-PoC per `docs/design/harness-poc.md` once the SDK
  adds MCP wiring.
- **Replacing `claude -p` entirely with the Agent SDK.** Bigger
  question, separate PoC. The facade architecture makes the eventual
  swap a config flag rather than a refactor.
- **Distributed dashboard / multi-user.** Single-user assumption
  baked into state files; multi-user is a v2 product question.

## Test/safety summary

Each phase commits with a passing full test suite. The phases that
add new boundary tests:

| Phase | New test |
|---|---|
| 0 | (none — docs) |
| 1 | catalogue read coverage; MCP `read_only_recommended` required; dual-shape (yaml + manifest.json) reader |
| 2 | GC.2 prompt-content test (no MCP-mutate verbs) |
| 3 | facade contract round-trip test; lock-discipline test (>100ms mutator throws); event-emission test |
| 4 | GC.4 grep test on rouge-loop.js (zero direct state writes); loop emits events |
| 5 | GC.4 grep tests on entries (zero direct state writes, zero direct claude spawns, zero direct event emissions) |
| 6 | spawn-arg builder per-phase MCP set |
| 7 | architecture invariant CI gate (separate exit code; blocks merge) |
| 8 | (depends on Fork A) |
| 9 | parameterized test sweep |
| 10 | dashboard-parity inventory test |
| 11 | (cleanup; tests removed alongside code) |

The pre-existing flaky `allowed-tools-behavior.test.js` continues to
flake; not addressed here.

## Cost estimate

Rough effort budget per phase (one developer, focused work):

| Phase | Effort | Risk |
|---|---|---|
| 0 — Policy docs | 0.5d | low |
| 1 — Catalogue source of truth | 2d | low |
| 2 — GC.2 prompt tests | 1d | low |
| 3 — Facade shell + typed contract + events + lock | 3d | medium |
| 4 — Loop-internal facade migration | 3d | medium (one big file, mechanical) |
| 5 — Entry-side facade migration | 3.5d | high (95 callsites, 4 entries, AI dispatch unification, Slack write deletion) |
| 6 — MCP spawn wiring | 0.5d | low |
| 7 — Architecture invariant CI gate | 0.5d | low |
| 8 — CLI surface decision | 0.5d (decision) + 1d (impl per fork) | medium |
| 9 — Test migration | 1d | low |
| 10 — Dashboard parity | 2–5d | medium |
| 11 — Vestigial cleanup | 0.5d | low |

Total: **~18.5–21.5 days** for the full 10/10 architecture. The
high-leverage core (Phases 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7) is
**~14 days** — that's where the recurrent reconciliation-bug
class is cut and the typed contract + event bus + invariant tests
make recurrence architecturally hard.

## Recommended sequencing

The 10/10 target requires landing Phases 0–7 as a unit (the core).
Skipping any one of them leaves a hole that re-introduces drift:

- Skip Phase 3 (typed contract / events / lock) → Phases 4–5 land
  without coordination, same problem in a new place.
- Skip Phase 7 (CI gate) → boundaries land but drift returns within
  a release as new callsites bypass the facade.
- Skip Phase 1 (catalogue) → INTEGRATION_KEYS / mcp-configs drift
  continues even with facade in place.

Sequence is strictly ordered: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7. Phase
2 can be landed in parallel with Phase 1 (no shared files). Phase
4 cannot start until Phase 3 ships (needs the facade shell). Phase
5 cannot start until Phase 4 ships (needs the loop-side migration
path established).

Phases 8–11 are post-core dogfood-driven choices. Don't block the
core on them.

## What this plan doesn't do

- **It doesn't break things.** Every phase preserves current behavior
  while consolidating the layers behind it.
- **It doesn't pick the architecture for you.** The four forks above
  are real decisions; the defaults are the lowest-blast-radius options
  but not necessarily the highest-value ones.
- **It doesn't address performance.** State files are small,
  filesystem polling is cheap; this is a correctness/clarity plan,
  not a perf plan.
- **It doesn't replace the dogfood UAT.** That tests whether Rouge
  builds good products; this tests whether Rouge has a coherent
  internal architecture. Both still needed.

## Open questions for owner

1. Fork A — CLI surface direction (default C/hybrid)
2. Fork B — Slack fate (default C/defer; **note:** with wide GC.4,
   Slack must migrate to facade in Phase 5 regardless of B; the
   fork only decides whether Slack stays a *write* path or becomes
   notification-only)
3. Fork C — catalogue file layout (default B/partial — folding MCP
   configs into tier-2 entries via `loadCatalogue()` is now Phase 1;
   the disk-layout collapse to single-file-per-service can happen
   in Phase 11 or be deferred)
4. Fork D — enforcement aggressiveness (default B/warn-then-enforce)
5. Fork E — lock discipline enforcement (default A/runtime guard)
6. Should the dogfood UAT rerun against the new architecture
   (post-Phase 5) or continue against today's CLI-driven setup?
7. Is there appetite for landing the core (Phases 0–7, ~14.5 days)
   as one focused sprint, or paced over multiple sessions?

---

## GSTACK REVIEW REPORT (plan-eng-review, 2026-04-25)

Pressure-tested by reading the actual code the plan describes. Six material discrepancies between plan and reality. Four are scope/risk issues that change effort. Two are architecture issues that would make the plan land broken if executed as-is.

### Architecture issues (must address before implementing)

**A1. The dashboard also spawns Claude. GC.4's "entry adapter" framing is wrong.**

Plan claim (line 117): "Dashboard, CLI, and Slack are entry adapters. They translate human/HTTP/event input into facade calls."

Plan claim (line 113): GC.3 enforcement test asserts "claude -p / messages.create returns zero results outside of `rouge-loop.js` and `harness/sdk-adapter.js`."

Reality: `claude` is spawned from FOUR sites, not two:
- `src/launcher/rouge-loop.js:2307` (the loop spawn site)
- `src/launcher/harness/sdk-adapter.js:207` (the new SDK adapter)
- `src/launcher/self-improve.js:210` (self-improvement runs claude -p too)
- `dashboard/src/bridge/claude-runner.ts:170` ← **dashboard runs its own claude subprocess**

The dashboard isn't just translating input. It's executing AI work directly (likely for seeding flows — confirm via reading `claude-runner.ts`). This means:

- The plan's GC.3 grep test would fail today against live code.
- GC.4 needs to either (a) acknowledge dashboard-as-executor, with the facade boundary being only state-writes (not AI invocation), or (b) move dashboard's AI spawning into the facade too — a bigger refactor.
- The "facade lock + entries don't write state" abstraction is incomplete: dashboard's claude-runner spawns subprocesses that *write directly* during execution. Unless the facade is asynchronous and event-driven, putting it in front of long-running AI subprocesses creates the same problem as Phase 2 (below).

**Recommendation:** narrow the boundaries.
- GC.3 stays as "deterministic routing in launcher; AI invoked only when explicitly dispatched" — but acknowledge ≥4 dispatch sites: loop, harness, self-improve, dashboard. The test asserts each call has a structured logger entry naming the dispatcher, not zero call sites.
- GC.4 narrows to "state writes go through facade" only — not "AI dispatch goes through facade." Splits the entry-adapter concept cleanly.

**A2. Long-phase-run lock problem is unaddressed and is exactly why the dashboard punted on cross-process locking.**

Plan claim (line 137): facade "holds a per-project file lock via proper-lockfile."

Reality (`dashboard/src/bridge/state-lock.ts:24-29`):
> "Scope: dashboard-only for this PR. The launcher (`rouge-loop.js`) also reads/writes state.json; cross-process coordination with the launcher is a follow-up and would need careful thought about long phase runs holding the lock."

A phase run is 5–30 minutes. You cannot hold a state lock for a phase run. The dashboard team explicitly punted on this. The facade plan needs to specify *who holds the lock when*:

- Wrong answer: facade.startBuildLoop() acquires the lock for the duration of the loop. Locks out dashboard mutations for half an hour.
- Right answer: lock is acquired only for individual read-modify-write blocks. Loop releases between phases; phases internally do `acquireLock → readJson → mutate → writeJson → release` inside `writeJson`. Dashboard reads are lock-free (atomic byte-write on the dashboard side already protects readers).

The plan implies the right answer ("All hold a per-project file lock") but doesn't draw the line between *transactional* state mutations and *long-running orchestration*. Without that explicit policy, Phase 2 will land a facade that subtly serializes the loop with the dashboard.

**Recommendation:** add a "Lock discipline" subsection under Phase 2:
- Lock is per-write-transaction, not per-operation
- `writeState({ mutator })` is the atomic unit; the mutator is fast (read → patch → write), not the long-running thing it triggers
- Long-running orchestration (a phase run) is decomposed into many short transactions
- Lock timeout is small (≤5s) with explicit error if exceeded — surfaces deadlock fast instead of stalling

### Scope issues (effort estimates need updating)

**S1. Phase 2 callsite count is ~3× the implied estimate.**

Plan estimate: 2–3 days, medium risk.

Actual state-write surface:
- `src/launcher/rouge-loop.js`: 55 `writeJson(stateFile, …)` calls (the loop is 90% of the writes)
- `src/slack/bot.js`: 11 direct writes (state + seeding-state + lock)
- `src/launcher/rouge-cli.js`: 5 direct writes
- `dashboard/src/bridge/seeding-finalize.ts`: 5
- `dashboard/src/bridge/state-path.ts`: 4 (this is the dashboard's *own* state writer)
- `dashboard/src/bridge/seeding-state.ts`: 3
- `dashboard/src/bridge/build-runner.ts`: 2
- `dashboard/src/bridge/lock.ts`: 2
- `dashboard/src/bridge/jsonl-rotation.ts`: 2
- `dashboard/src/bridge/seed-daemon.ts`: 2
- `dashboard/src/bridge/seed-daemon-pid.ts`: 2
- `dashboard/src/bridge/seed-queue.ts`: 2

≈95 callsites. Even with mechanical replace-with-facade, each loop-side write needs a named mutator function (so the audit trail records *what* changed). That's 30–40 mutators (many writes are identical patterns). Realistic effort: 5–7 days, **high risk** (touches every entry path, including the loop's internal state machine).

**Recommendation:** split Phase 2 into 2a (loop-internal: just rouge-loop.js) and 2b (entries: cli, slack, dashboard). 2a is 3 days low-risk because it's one file. 2b is 3 days medium-risk because it's distributed.

**S2. mcp-configs/ path is at repo root, not under `library/`.**

Plan claim (multiple places, e.g. line 154): "`mcp-configs/*.json` becomes part of the catalogue."

Reality: `./mcp-configs/` lives at repo root (8 files: cloudflare-workers, context7, exa, firecrawl, github, playwright, supabase, vercel). The `library/integrations/mcp-configs/` directory doesn't exist.

Cosmetic on its own, but Phase 1 needs to know whether to:
- (a) Move mcp-configs/ under library/integrations/ (extra rename PR; updates `mcp-configs/README.md` references; touches preamble-injector if it points at the old path)
- (b) Leave at root, just have `loadCatalogue()` reach across both directories

**Recommendation:** option (a) is cleaner long-term but adds 0.5d to Phase 1. Worth doing because the path inconsistency will keep biting otherwise.

**S3. `wire_into_phases` already exists in all 8 manifests.**

Plan describes Phase 3 as if implementing the field. Code already has it (`mcp-configs/vercel.json:11`, `mcp-configs/supabase.json:10`, etc., 8/8 manifests).

Phase 3's actual work is just (a) the per-spawn `--mcp-config <subset>` argument generator in `rouge-loop.js`, (b) the spawn-arg builder test, (c) the `read_only_recommended: true` field. That's **closer to 0.5d than 1d**.

**S4. Some tier-2 entries are directories, not flat yamls.**

`library/integrations/tier-2/` contains 4 directory-based entries (github-pages, vercel, cloudflare-pages, docker-compose) that follow the older `<slug>/manifest.json` shape, alongside 28 flat yamls. The plan's "fold mcp-configs/X.json into tier-2/X.yaml" doesn't address that `mcp-configs/vercel.json` would fold into `tier-2/vercel/manifest.json`, not into a (non-existent) `tier-2/vercel.yaml`.

**Recommendation:** Phase 1's catalogue reader needs to handle both shapes (it probably does already — verify in `feasibility.js`). Adding `mcp:` block support requires adding it to *both* shapes in Phase 1's reader.

### Boundaries that hold up

- GC.1 (judge-vs-pipeline): verified — `rouge.config.json` allowlist/blocklist + `config-protection.js` pre-write hook + `test/launcher/self-improve-safety.test.js` are real and enforced.
- The state-already-at-`.rouge/` move (issue #135) is real — `state-path.js` resolves to `.rouge/state.json` with a fallback to legacy root. Plan's Phase 8 cleanup of legacy state path is therefore *almost* free; gated only on the in-the-wild project audit.

### Revised sequencing

Given A1 and A2, the plan should be revised before execution. Suggested edit order:

1. **Update plan with the A1/A2 fixes first** (this review). 1 hour.
2. **Phase 0 docs** (still cheap, still unblocking).
3. **Phase 4 first, not after Phase 2.** Phase 4 (GC.2 prompt-content tests + paragraph in foundation/building/ship-promote prompts) has no dependency on Phase 1 or 2. Land it immediately — it's 1d, locks in the read-vs-mutate policy in the prompts, and removes ambiguity for the next dogfood run.
4. **Phase 1** (catalogue source of truth) — but with corrected paths + dual-shape reader.
5. **Phase 2a** (loop-internal facade) — 3 days, low risk, one file.
6. **Phase 3** (now ~0.5d, since `wire_into_phases` exists).
7. **Phase 2b** (entry-side facade migration) — only if A1 (dashboard-also-executes) and A2 (lock discipline) are resolved first.

### Revised effort total

- Phases 0 + 4 + 1 + 2a + 3: ~7 days (was 6, but with 4 in the early slot)
- Phase 2b: 3–4 days
- Phases 5–9: depends on forks

High-leverage core: 7 days. Full plan: 14–18 days.

### Review readiness dashboard

| Area | Status | Note |
|---|---|---|
| Architecture coherence | **Needs revision** | A1, A2 are blockers |
| Scope estimate | **Off by ~30%** | Phase 2 underestimated |
| Test/safety story | OK | Each phase has a guard |
| Backwards compat | OK | No phase breaks running projects |
| Owner forks | **Well-framed** | A–D are real decisions |
| Concrete file paths | **Minor errors** | mcp-configs path; tier-2 shape mix |

**Verdict:** plan is structurally sound but needs revision passes on (a) the dashboard-also-executes reality, (b) the lock discipline, and (c) the Phase 2 effort split. After those edits, Phases 0+4+1+2a+3 is a credible 7-day high-leverage core.
