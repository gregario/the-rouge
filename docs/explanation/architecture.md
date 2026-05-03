# Architecture

> ⚠️ **Open source, experimental, runs with `--dangerously-skip-permissions`.** Rouge can wipe your filesystem, force-push over your git history, and run up thousands of dollars in API charges in a single session. The mitigations described in this doc reduce risk but **don't guarantee** safety — bugs in the cap path and other safety mechanisms have shipped before. Read the [README's safety section](../../README.md#safety) first.

A short tour of how Rouge is put together. For the user-facing story (what Rouge does, how it judges, what it costs), read [how-rouge-works.md](how-rouge-works.md). This doc covers the parts a contributor or maintainer needs.

## One-line architecture

Rouge is a Karpathy Loop of `claude -p` invocations with state on disk, fronted by a Next.js dashboard, gated by deterministic-JS safety mechanisms. There is no long-running orchestrator process. The filesystem is the memory. Git is the audit trail.

## The four boundaries

Rouge enforces four architectural boundaries (GC.1 through GC.4). Each has a dedicated design doc; this is the summary.

**GC.1 — Judge vs Pipeline.** Rouge's self-improvement pipeline can edit *generation/operational* prompts (build, fix, document, ship) but never the *measurement instruments* (rubrics, schemas, gold-sets, reviewer agents, library global heuristics). Enforced via `rouge.config.json` allowlist/blocklist + a pre-write hook + tests in `test/launcher/self-improve-safety.test.js`. The point is to prevent the boiling-frog drift where the thing being measured edits its own measurement.

→ `docs/design/self-improve-boundary.md`

**GC.2 — MCP vs CLI.** When AI needs to interact with an external system, **read** through MCPs (Vercel, Supabase, GitHub, Context7) and **mutate** through CLIs invoked via Bash. CLIs leave a Bash-tool audit trail; MCPs do not. Every MCP manifest declares `read_only_recommended: true` (or false with a per-case justification). Prompt-content tests fail if any prompt pairs an MCP mention with a mutating verb.

→ `docs/design/mcp-vs-cli-boundary.md`

**GC.3 — Determination vs Judgment.** Routing, state-machine transitions, capability checks, cost gating, spin detection, audit decisions are all deterministic JS in `src/launcher/`. AI is invoked only when explicit deterministic routing says "now run phase X" — never to make routing decisions itself. AI is dispatched from four sites and only four: `rouge-loop.js` (the loop), `harness/sdk-adapter.js` (SDK calls for non-tool phases), `self-improve.js` (the self-improvement runner), and `dashboard/src/bridge/claude-runner.ts` (dashboard-side seeding). All four emit facade events around the spawn so the audit boundary is observable from one channel.

→ `docs/design/determination-vs-judgment.md`

**GC.4 — Entry vs Core.** Dashboard, CLI, Slack, and the loop are entries. The launcher facade (`src/launcher/facade.js`) is the core. State writes, AI dispatch, and event emission go through the facade. Entries do not write state directly. The facade holds the per-project lock, validates against the v3 schema, and emits a structured event to `.rouge/events.jsonl` after every commit. CI grep tests assert no direct state writes outside the facade allowlist.

→ `docs/design/entry-vs-core.md`

## Layers

```
┌──────────────────────────────────────────────────────────────────────┐
│  Entries (everything human-facing or external)                       │
│                                                                      │
│   ┌──────────────┐    ┌──────────┐    ┌─────────────┐               │
│   │  Dashboard   │    │   CLI    │    │  Slack      │               │
│   │  (Next.js)   │    │ rouge … │    │  (notify-   │               │
│   │  PRIMARY     │    │          │    │  only)      │               │
│   └──────┬───────┘    └────┬─────┘    └──────┬──────┘               │
│          │                  │                 │                       │
└──────────┼──────────────────┼─────────────────┼───────────────────────┘
           │                  │                 │
           ▼                  ▼                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Core (the launcher facade — single junction)                        │
│                                                                      │
│   src/launcher/facade.js                                             │
│     • writeState({ projectDir, mutator, source })                    │
│     • runPhase({ projectDir, phase, mode, source })                  │
│     • emit / readEvents / subscribeEvents                            │
│                                                                      │
│   src/launcher/facade/                                               │
│     • lock.js          per-transaction file lock                     │
│     • events.js        .rouge/events.jsonl emit + tail               │
│     • dispatch/        subprocess (claude -p) + sdk + mcp-config     │
│                                                                      │
└──────────────┬─────────────────────────────────┬─────────────────────┘
               │                                 │
               ▼                                 ▼
┌──────────────────────────────┐   ┌──────────────────────────────────┐
│ Project state (per-project)  │   │ AI dispatch                      │
│                              │   │                                  │
│ <projectDir>/.rouge/         │   │ • subprocess: claude -p          │
│   state.json                 │   │   (--mcp-config built per-phase  │
│   events.jsonl               │   │    from catalogue wire_into)     │
│   checkpoints.jsonl          │   │                                  │
│   tools.jsonl                │   │ • sdk: harness adapter for       │
│ task_ledger.json             │   │   non-tool phases                │
│ cycle_context.json           │   │                                  │
│ phase_events.jsonl           │   │                                  │
└──────────────────────────────┘   └──────────────────────────────────┘
```

## State model

Three on-disk records per project, each with a clear role:

- **`state.json`** — the state-machine record. Current phase, current milestone, current story, escalations, costs, infrastructure manifest, foundation completion. Validated against `schemas/state.json` on every facade write.
- **`task_ledger.json`** — the task tracking record. Milestones, stories, dependencies, story status. Mutated only by `generating-change-spec` (the loop's spec-generation phase). All other phases read it but don't write.
- **`checkpoints.jsonl`** — the immutable cycle history. Append-only. Every state transition writes a checkpoint. The launcher's spin detector reads this to spot zero-delta loops; the dashboard reads it for project history.

Plus per-cycle ephemera:
- `cycle_context.json` — the I/O bus between phases within one cycle. Phase prompts write here; the next phase reads.
- `phase_events.jsonl` — claude's stream-json output, parsed into compact events per tool-use, for the dashboard's live build feed.
- `events.jsonl` (in `.rouge/`) — the facade's audit channel. Every state mutation, AI dispatch start/end, and lock event lands here. Dashboard + Slack subscribe to it.
- `interventions.jsonl` — every intent action (deploy, db-migrate, push, tag) routed through the launcher's intent callbacks.

## State machine

The loop's state machine is in `src/launcher/rouge-loop.js`'s `STATE_TO_PROMPT`. Top-level states (`foundation`, `foundation-eval`, `story-building`, `milestone-check`, `milestone-fix`, `analyzing`, `generating-change-spec`, `vision-check`, `shipping`, `final-review`, `escalation`, `complete`) and the transitions between them are deterministic JS. Each transition asserts invariants (e.g. milestone-lock prevents regression to a promoted milestone). The full transition map is `docs/design/state-machine-v3-transitions.md`.

## Decomposition

Rouge derives a complexity profile from the spec at seed time. The **Sizer** sub-phase (between TASTE and SPEC) classifies projects XS / S / M / L / XL based on signals from BRAINSTORM. The tier drives an adaptive depth dial: XS skips most disciplines and goes straight to a single milestone; XL activates everything including foundation cycles, multi-milestone dependency ordering, and longer SPEC + design passes. Per-tier budget defaults sit between per-project caps and the global config default.

→ `docs/design/adaptive-depth-dial.md`

## Catalogue

`library/integrations/` is the canonical service + pattern catalogue. Three tiers:

- `tier-1/` — stacks (language + framework + runtime; under-populated today, room to grow)
- `tier-2/` — services with full lifecycle. Two shapes coexist: flat `<slug>.yaml` for managed services (38 entries as of 0.4.0) and directory-based `<slug>/manifest.json` for deploy targets (github-pages, vercel, cloudflare-pages, docker-compose). MCP server configs (`library/integrations/mcp-configs/<slug>.json`) fold into the parent tier-2 entry's `mcp:` block at load time.
- `tier-3/` — code patterns within services (Stripe checkout, Supabase RLS, Sentry React boundary, etc.)

`src/launcher/catalogue.js`'s `loadCatalogue()` returns the unified view. `INTEGRATION_KEYS` (in `secrets.js`) is a derived view of `requires.env_vars` plus a small per-service override map. `mcp-health-check.js` reads the MCP blocks. New tier-2 entries auto-surface to `rouge setup` without code edits.

→ `docs/design/integration-catalogue.md`

## Dashboard

Next.js 16 standalone runtime served on port 3001 (override with `ROUGE_DASHBOARD_PORT`). Reads live project state from `$ROUGE_PROJECTS_DIR` via the `dashboard/src/bridge/` filesystem readers. API routes at `/api/*` are HTTP-shaped wrappers around the launcher facade. The dashboard imports a typed contract surface (`dashboard/src/types/facade.d.ts`) generated from the launcher's JSDoc — wrong field names fail at compile time, not at runtime. `gen:facade-types` runs in CI to catch drift.

The dashboard subscribes to `.rouge/events.jsonl` via `facade.subscribeEvents()` rather than polling. State changes propagate as events.

## Tests + boundary CI gate

The launcher test suite uses `node:test`. The dashboard uses Vitest. Per-prompt behavioural-contract tests assert that prompt-engineered safety properties (ISOLATION RULES, capability avoidance, "that is fraud", three-pass verification, etc.) survive prompt edits. The boundary CI gate (`npm run test:boundaries`) greps the codebase for direct AI dispatch or direct state writes outside the facade allowlist; flip to enforcement via `ROUGE_BOUNDARY_ENFORCE=true`.

## Where to look next

| You want to | Read |
|---|---|
| Understand the user-facing story | [how-rouge-works.md](how-rouge-works.md) |
| See every CLI command | [docs/reference/cli.md](../reference/cli.md) |
| Understand the catalogue model | [docs/design/integration-catalogue.md](../design/integration-catalogue.md) |
| Understand each boundary | `docs/design/{self-improve,mcp-vs-cli,determination-vs-judgment,entry-vs-core}-boundary.md` |
| See the state-machine map | [docs/design/state-machine-v3-transitions.md](../design/state-machine-v3-transitions.md) |
| Add a vendor / deploy target | [docs/contributing/adding-a-vendor.md](../contributing/adding-a-vendor.md) |
| Understand the reconciliation that produced this shape | [docs/design/grand-unified-reconciliation.md](../design/grand-unified-reconciliation.md) |
