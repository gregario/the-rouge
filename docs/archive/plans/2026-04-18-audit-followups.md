# Audit follow-ups — post-2026-04-18

**Status**: 14 items deferred during the PR-D / PR-E / PR-F / PR-G audit stream (merged in #164 / #165 / #166). Consolidated into 9 named pieces of work for one-at-a-time execution.

**Working agreement**: one PR per item. Living doc — update the status column at commit time.

## Recommended sequence

1. **Docs sweep** — quick, high-value, gives us clean ground to stand on.
2. **Type consolidation (ProjectDetail / Escalation)** — small, independent, reduces drift risk before any bigger dashboard work.
3. **E7/E14 ajv + G7 catalogue schema** — foundational. Unlocks schema-backed validation across state + manifests. Done as one PR because catalogue is the easier of the two to pilot the ajv wiring on.
4. **Test coverage bundle (G3 + G6 + G10)** — all mechanical, all launcher-side. Good clean-up work.
5. **Dashboard plumbing — liveness chip + discipline gating indicators** — bundled because both need scanner → bridge-types → mapper plumbing.
6. **Dashboard — self-improvement status widget** — makes F17 visible.
7. **Dashboard — spec diff viewer (revise mode)** — standalone.
8. **Dashboard — linked projects + milestone tagging** — larger, can split further if needed.
9. **Dogfood — fresh seeding run (G22)** — verification that all of the above works in anger. Human-in-the-loop; I can't do this solo.

## Status table

| # | Item | Size | Deps | Status | PR |
|---|---|---|---|---|---|
| 1 | Docs sweep | S | — | ✅ merged | #167 |
| 2 | Type consolidation | S | — | ✅ merged | #168 |
| 3 | ajv schema validation (E7/E14; G7 deferred) | L | — | ✅ merged | #169 |
| 4 | Test coverage bundle (G3 partial, G6, G10) | M | — | ✅ merged | #170 |
| 5 | Dashboard plumbing (liveness + discipline gate) | M | — | ✅ merged | #171 |
| 6 | Self-improvement status widget | M | — | ✅ merged | #172 |
| 7+8 | Spec-diff + milestone-tags endpoints | M | — | ✅ merged | #173 |
| 8b | Linked projects graph | L | registry.json data | deferred | — |
| 8c | Dashboard UI for spec-diff + milestone-tags | M | — | deferred | — |
| 9 | Dogfood G22 | — | — | **user-driven — needs you** | — |

---

## Detailed scope per item

### 1. Docs sweep

**Why**: the audit work touched behavior across many layers. README, architecture.md, setup.md, troubleshooting.md almost certainly describe an earlier version. Also: `.env.example` just added; needs referencing. Self-improve wiring (F17) and Opus-default model policy (F3) are new and undocumented.

**Scope**:
- Grep README + docs for stale command names, V2 state names, outdated architecture diagrams.
- Update `docs/how-to/setup.md` to match current `rouge init` / dashboard-first path.
- Surface the existing `/platform`, `/catalogue` pages in the dashboard tour.
- Document the model-tier policy (Opus default, milestone-check sonnet) somewhere findable.
- Document `.env.example`.
- Confirm `CONTRIBUTING.md` matches reality (catalogue auto-promote behaviour).

**Acceptance**: a fresh engineer following README → setup → dashboard can actually build something without hitting a stale reference.

**Out of scope**: architectural rewrites. The V2 architecture.md stays as a snapshot.

---

### 2. Type consolidation (ProjectDetail / Escalation)

**Why**: `lib/types.ts Escalation` and `bridge/types.ts RougeEscalation` describe the same concept at different layers (UI vs backend). Drift has already started — G14 caught it in scanner. One canonical backend shape, mapper to UI shape, strict boundary.

**Scope**:
- Audit every declaration of `Escalation`, `ProjectDetail`, `RougeEscalation`, `RawEscalation` across `dashboard/src/`.
- Canonicalise the backend shape in `bridge/types.ts`.
- Add a mapper that produces the UI shape from the backend shape.
- Delete duplicates.

**Acceptance**: exactly one `interface RougeEscalation` in the codebase and one `interface Escalation` (the UI layer), and the boundary between them is an explicit mapper.

**Out of scope**: reshaping either type; just deduplication.

---

### 3. ajv schema validation (E7/E14 + G7)

**Why**: The biggest deferred item from the audit. `schemas/*.json` exists as documentation; no code validates against it. A corrupted state.json or a catalogue entry with a missing required field will silently reach callers that crash downstream.

**Scope**:
- Install ajv in launcher + dashboard.
- Reconcile existing schemas (state-v3, cycle-context-v3, task-ledger-v3, checkpoint-v3, vendor-manifest) against live file shapes — add `additionalProperties: true` where appropriate.
- Wire validation in `writeJson` paths as warn-only (don't block the write; log the violation).
- Wire validation in `readJson` paths as fallback (bad shape → return defaults + warn).
- G7: validate `library/integrations/*/manifest.yaml` against a new `vendor-manifest.json` schema at contribute-pattern time.

**Acceptance**: a deliberately malformed state.json produces a clear warn log naming the violating field; the app continues running.

**Size**: large. This is the heaviest item on the list. Likely needs its own planning pass before execution.

---

### 4. Test coverage bundle (G3 + G6 + G10)

**Why**: three mechanical holes in launcher coverage. Pure additions; low risk.

**Scope**:
- G3 — tests for `provision-infrastructure.js`, `deploy-blocking.js` (beyond existing happy-path), `context-assembly.js`.
- G6 — real CLI integration test: spawn `node src/launcher/rouge-cli.js` in a temp project dir, verify exit codes + stdout shape for `init`, `status`, `doctor`.
- G10 — `rouge feasibility "test thing"` end-to-end integration test.

**Acceptance**: suite grows by ~30 tests; no new bugs uncovered (or uncovered bugs get filed + fixed).

---

### 5. Dashboard plumbing — liveness chip + discipline gating indicators

**Why**: both need the same backend→frontend pipeline work. Plumb once, surface twice.

**Scope**:
- Add `awaitingGate`, `pendingGateDiscipline`, `lastHeartbeatAt` to `BridgeProjectSummary` (scanner output).
- Surface on `ProjectDetail` via mapper.
- Liveness chip: small indicator on `ProjectCard` when `awaitingGate` is true.
- Discipline gate indicators: in `SpecTabContent`, show per-discipline "awaiting you" state inline with the discipline list.

**Acceptance**: during seeding with a pending gate, project card shows an "awaiting you" chip; discipline list highlights which discipline is blocked.

---

### 6. Self-improvement status widget

**Why**: F17 wired self-improve-safety and gh-issue creation, but nothing surfaces it in the UI. Users shipping a product get improvement issues drafted silently.

**Scope**:
- New `/api/system/self-improve` endpoint that reads recent gh issues tagged `self-improvement` (cache briefly).
- Card on `/platform` page showing pending-proposals count + most recent 5.
- Link to full issue list on Github.

**Acceptance**: after a product completes, the dashboard visibly shows "N improvement proposals drafted".

---

### 7. Spec diff viewer (revise mode)

**Why**: when the user revises the seed spec after seeding completes, there's no visual feedback on what actually changed.

**Scope**:
- Backend: `/api/projects/[name]/spec-diff?since=<commit>` returning a structured diff of `seed_spec/*` against the pre-revise commit.
- Frontend: collapsible diff view in the Spec tab when revise mode is active.

**Acceptance**: after editing a spec in revise mode, the diff viewer shows added/removed criteria cleanly.

---

### 8. Dashboard — linked projects + milestone tagging

**Why**: two pieces of the dashboard the audit flagged. Both bigger than the other widgets; worth their own PR.

**Scope**:
- Linked projects graph: read `~/.rouge/registry.json` + each project's declared dependencies, render a small graph showing which projects link to which.
- Milestone tagging: surface the git milestone tags (`milestone/<slug>/<feature>`) on the project detail page. Filter stories by tag.

**Acceptance**: user can see "this product depends on X and Y" from the dashboard, and can filter the milestone timeline by tag.

**Size**: might split into two PRs if milestone tagging grows.

---

### 9. Dogfood G22

**Why**: final verification. The audit touched a lot of state-machine edges. A real fresh seeding run validates the work in anger.

**Scope**:
- User-driven. I can't do this alone — needs you to actually seed a small product through from brainstorming to foundation-eval.
- If anything feels broken, file follow-ups.

**Acceptance**: one complete seeding session, no escalations that aren't about the user's creative input.

---

## Progress log

_(one line per commit as items ship)_

- 2026-04-18: Plan created post-PR-G merge (#166).
- 2026-04-18: Item 1 docs sweep opened as #167 (70ec725) — README Opus default, VISION feature areas, setup/quickstart/first-product dashboard-first, troubleshooting Slack FAQ inverted.
- 2026-04-18: #167 merged.
- 2026-04-18: Item 2 type consolidation #168 (4c55c3b) — canonical RougeEscalation, dedupe in bridge-mapper. Merged.
- 2026-04-18: Item 3 ajv #169 (ab43f64) — schema-validator.js, V3 state schema rewrite, wired in writeJson for state/cycle_context/task_ledger. G7 catalogue + cycle-context/task-ledger schema audit deferred. Merged.
- 2026-04-18: Item 4 test coverage #170 (ee18f4c) — context-assembly.test.js (4) + cli-integration.test.js (6). G3 provision-infrastructure still deferred (heavy subprocess mocking). Merged.
- 2026-04-18: Item 5 dashboard plumbing #171 (bde3fc8) — awaitingGate / pendingGateDiscipline / lastHeartbeatAt plumbed through scanner → bridge-types → mapper → project-card + discipline-stepper. Merged.
- 2026-04-18: Item 6 self-improve widget #172 (e7bd924) — /api/system/self-improve endpoint, SelfImproveStatus card on /platform. Merged.
- 2026-04-18: Items 7+8 backend #173 (c5e985d) — spec-diff + milestone-tags endpoints. UI components + linked-projects graph deferred. Merged.
