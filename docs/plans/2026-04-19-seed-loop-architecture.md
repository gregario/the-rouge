# Seeding Loop Architecture — Design & Phased Rollout

> **Status:** design approved 2026-04-19, ready to execute in phases.
> **Driver:** the seeding flow has been the source of repeated silent-failure bugs (colourcontrast stall, stackrank pending-status, testimonial-style watcher misses). After ~8 hours of tactical patches shipped across PRs #187–#192, the pattern became clear: we are repeatedly working around an architectural flaw rather than fixing it.

## Problem statement

Today, the seeding flow behaves unreliably in ways that look identical to healthy activity from the user's seat:

- A claude subprocess turn ends with bare prose ("Returning next turn…") and nothing re-fires the chain. Project silently stalls. Observed: colourcontrast (1h 40m silent after FA1 written).
- `seedingProgress.disciplines[].status` stays `pending` even mid-run because nothing writes `'in-progress'`. UI appears frozen. Observed: stackrank.
- Tab-switching and dashboard restarts leave in-flight runs in indeterminate state because the subprocess is tied to an HTTP request lifecycle.
- Manual "continue" unsticks sessions sometimes, not always — an undignified recovery mechanism the user should not have to rely on.

The symptoms are varied. The root cause is singular.

## Root cause

**Subprocess orchestration lives inside an HTTP request handler.** Specifically, `runSeedingTurn` in `dashboard/src/bridge/seed-handler.ts:220-642`:

- Spawns a `claude -p` child process inline
- Awaits up to 10 minutes for it
- Mutates on-disk state across 3 files via 11 helpers during the await
- Recursively invokes itself up to 10 times via `runContinuationTurn`

HTTP request handlers are the wrong owner for 100-minute subprocess chains. They have:

- **No lifecycle.** Next.js can reload the module (HMR). The in-flight child is orphaned.
- **No restart semantics.** There is no PID file to reclaim an orphaned subprocess on restart.
- **No observability.** State mutations are fanned out across helpers; there is no single audit log of "the daemon did X at time T."
- **No idempotency.** A retried or reconnected request may start a second chain against the same project.
- **No visibility when silent.** A no-marker, no-gate, no-error bare-prose turn returns 200 OK and the chain simply stops — no error surface, no recovery.

## The contrast: build loop works fine

The build phase (`rouge build`) uses a completely different shape and has not had the same class of bug:

- `src/launcher/rouge-loop.js` is a detached process, spawned once per project via the CLI
- Tracked via `.build-pid` file in the project dir
- Writes `state.json`, `checkpoints.jsonl`, `cycle_context.json`
- Dashboard reads those files; does not own the subprocess
- Survives dashboard restarts, HMR, browser tab closes — anything short of a launcher crash (which the dashboard can detect via stale PID)

**The seeding flow should look architecturally identical.** That is the fix.

## Architecture decision

### Today (two processes, broken mix)

```
┌────────────────────────┐    ┌────────────────────────┐
│ Next.js Dashboard      │    │ rouge-loop.js          │
│                        │    │ (launcher, detached)   │
│  UI components         │    │                        │
│  Bridge readers   ✓    │    │  Build orchestration ✓ │
│  Seeding orchestr ✗    │    │  .build-pid tracking ✓ │
│  (inline runClaude)    │    │                        │
└────────────────────────┘    └────────────────────────┘
          │                              │
          └──→ state.json, seed-spec/*, chat logs, checkpoints
```

### Proposed (three processes, symmetrical orchestration)

```
┌────────────────────────┐    ┌────────────────────────┐    ┌────────────────────────┐
│ Next.js Dashboard      │    │ rouge-loop.js          │    │ seed-loop.js (NEW)     │
│                        │    │ (launcher, detached)   │    │ (seed daemon, detach.) │
│  UI components         │    │                        │    │                        │
│  Bridge readers  ✓     │    │  Build orchestration ✓ │    │  Seeding orchestr ✓    │
│  Seeding reader ✓      │    │  .build-pid tracking ✓ │    │  .seed-pid tracking ✓  │
│  (NO inline runClaude) │    │                        │    │  queue-driven          │
└────────────────────────┘    └────────────────────────┘    └────────────────────────┘
          │                              │                              │
          └──→ state.json, seed-spec/*, chat logs, checkpoints, seed-queue.jsonl
```

**Principle:** Long-running subprocess orchestration never lives in a Next.js route handler. The dashboard does reads, writes user input to disk, and renders. Anything that takes >1s belongs in a detached daemon that writes state files the dashboard reads.

### What we are explicitly NOT doing

These were considered and rejected. Future sessions should not re-propose them without reading this section:

- **NOT un-merging the bridge.** PR #107 (commit `5ed670a`, 2026-04-13) folded the standalone bridge HTTP server into the Next.js dashboard. That merge was correct — the bridge code was just readers, and readers belong in the dashboard. We are not undoing it.
- **NOT building a 30-second reconciler.** The user's recollection of "the old bridge had a 30s reconciler that made it reliable" is factually wrong (git archaeology confirms no such loop ever existed — only an SSE keepalive). A reconciler polling disk and conditionally re-firing turns is a band-aid over broken orchestration and has its own silent-failure modes. We do not build one.
- **NOT patching the existing HTTP-handler orchestration in place.** Repeated tactical fixes is the failure mode we are escaping. The architecture changes; the ad-hoc fixes inside the HTTP handler go with it.
- **NOT relying on "user types continue".** Unreliable, undignified. Self-healing happens in the daemon, automatically.

## Phased rollout

Six phases. Each is a separate PR. Each is independently shippable and valuable. We can pause between any two phases and still be better than today. No phase is a prerequisite for rolling back its predecessor.

---

### Phase 0 — Stop the bleeding (writer fix)

**Scope:** One-line fix: when `markDisciplinePrompted` runs, also write `'in-progress'` to the matching discipline entry in `state.json.seedingProgress.disciplines[]`.

**Files:**
- `/Users/gregario/Projects/ClaudeCode/The-Rouge/dashboard/src/bridge/seeding-state.ts` (~10 LOC added)
- test coverage in `dashboard/src/bridge/__tests__/seeding-state.test.ts`

**Why here:** The stackrank symptom ("competition stays `pending` forever") is a pure writer-gap, not an architecture problem. It blocks the user from trusting any UI status even after Phase 1 ships. Cheap to fix, safe, independent.

**Acceptance criteria:**
- When a discipline is first prompted, its `state.json.seedingProgress.disciplines[]` entry flips to `in-progress`.
- Existing `'complete'` transition on `markDisciplineComplete` unchanged.
- Dashboard stepper renders current discipline as in-progress directly from on-disk state (no longer relies on `currentDiscipline` fallback synthesis).
- No regression in existing seeding-state tests.

**Rollback:** revert the PR. One-line deletion.

---

### Phase 1 — Extract subprocess orchestration into a detached daemon

**Status:** shipped behind `ROUGE_USE_SEED_DAEMON` feature flag.

**Scope:** The architectural move. The seeding subprocess chain moves out of the HTTP request handler's lifecycle and into a detached daemon. HTTP handler becomes a queue writer.

**As-built files:** The original plan proposed `src/launcher/seed-loop.js` (plain JS sibling to `rouge-loop.js`). The implementation instead chose TypeScript at `dashboard/src/bridge/seed-daemon.ts` so the daemon can re-use the existing `handleSeedMessage` function without porting ~600 lines of prompt-assembly / marker-parsing / state-mutation logic. Zero duplication; the daemon IS just a process lifecycle wrapper around the existing TS code. Spawned via `tsx` (already a dashboard dep).

- NEW `/Users/gregario/Projects/ClaudeCode/The-Rouge/dashboard/src/bridge/seed-daemon.ts` — daemon entry point (tsx-invoked)
- NEW `/Users/gregario/Projects/ClaudeCode/The-Rouge/dashboard/src/bridge/seed-daemon-spawn.ts` — `ensureSeedDaemon` helper for the HTTP handler
- NEW `/Users/gregario/Projects/ClaudeCode/The-Rouge/dashboard/src/bridge/seed-daemon-pid.ts` — PID file helpers (parallels `build-runner`'s `.build-pid` pattern)
- NEW `/Users/gregario/Projects/ClaudeCode/The-Rouge/dashboard/src/bridge/seed-queue.ts` — atomic append + two-phase drain for `seed-queue.jsonl`
- MODIFIED `/Users/gregario/Projects/ClaudeCode/The-Rouge/dashboard/src/bridge/seed-handler.ts` — added `handleSeedMessageRouted` that switches on flag; inline path preserved
- MODIFIED `/Users/gregario/Projects/ClaudeCode/The-Rouge/dashboard/src/app/api/projects/[name]/seed/message/route.ts` — uses `handleSeedMessageRouted`
- Queue file contract: `<projectDir>/seed-queue.jsonl` — append-only JSONL, one `{id, text, enqueuedAt}` per line
- PID file: `<projectDir>/.seed-pid` — JSON with `{pid, startedAt, sessionId}`; sessionId rotates on re-claim so race losers detect and exit
- Heartbeat file: `<projectDir>/.rouge/seed-heartbeat.json` — JSON with `{lastTickAt, lastTurnId, status, sessionId, pid}` written every tick (enables Phase 5 observability)
- Daemon logs: `<projectDir>/seed-daemon.log` (append mode, detached from dashboard)

**Feature flag:** `ROUGE_USE_SEED_DAEMON=1` enables the daemon path. Default off for safety. Phase 4 will flip the default and delete the inline path after live validation.

**Daemon behaviour:**
1. Launched with `node seed-loop.js <projectDir>`, detached, stdout/stderr to `seed-loop.log`
2. Writes its PID to `.seed-pid` on startup (UUID-suffixed atomic rename — same pattern as `writeStateJson`)
3. Reads `seed-queue.jsonl` for pending messages
4. For each message: builds prompt (same logic as `seed-handler.ts:333-374`), spawns `claude -p`, parses markers, writes chat + state
5. Loops until queue drained; if queue has nothing and no autonomous continuation is needed, exits cleanly and removes `.seed-pid`
6. Writes `.rouge/seed-heartbeat.json` with `{ lastTickAt, lastTurnId, status }` on every tick — observability for Phase 5

**HTTP handler behaviour (new shape):**
1. Receives `POST /api/projects/[name]/seed/message`
2. Appends message to `seed-queue.jsonl` (atomic)
3. Reads `.seed-pid`; if absent or stale (PID not alive), spawns `seed-loop.js` detached
4. Returns 202 Accepted immediately — no awaiting
5. Client polls state files (Phase 2) to see the result

**Why here:** This is the load-bearing PR. Everything downstream — polling, self-heal, observability, CLI cleanup — becomes trivially possible only because seeding no longer owns a 10-minute HTTP request.

**Acceptance criteria:**
- Sending a seeding message returns HTTP 202 within ~100ms.
- Subprocess runs in the daemon; dashboard can be restarted, browser tab closed, HMR can reload — the daemon survives and the subprocess runs to completion.
- On daemon crash, stale `.seed-pid` is detected on next message; new daemon spawned.
- State files (`seeding-state.json`, `seeding-chat.jsonl`, `seed_spec/*`) populate identically to today.
- No subprocess runs inside any Next.js route handler anywhere in the codebase.

**Rollback:** revert the PR; HTTP handler reverts to inline `runClaude`. Queue file and daemon become orphaned no-ops.

**Risks:**
- Daemon orphan on crash: mitigated by stale-PID detection on next message.
- Queue-file race between two handlers writing the same queue: mitigated by atomic append via `O_APPEND` semantics on POSIX (standard `appendFileSync` is sufficient; macOS + Linux guarantee atomic small writes below PIPE_BUF).
- Dashboard restart during a queue write: in-flight append either fully landed or didn't; daemon picks up what's there on its next tick. No torn writes.

---

### Phase 2 — Dashboard polls state, stops orchestrating

**Scope:** Seeding UI becomes a 2-second poller of on-disk state, identical in spirit to how the Build view reads build state.

**Files:**
- `/Users/gregario/Projects/ClaudeCode/The-Rouge/dashboard/src/lib/use-seeding.ts` — add polling interval
- `/Users/gregario/Projects/ClaudeCode/The-Rouge/dashboard/src/app/projects/[name]/page.tsx` — remove event-driven refetches for seeding path; rely on poll
- The SSE watcher fix shipped in PR #192 still applies but is no longer load-bearing for seeding

**Why here:** With the daemon owning state, the dashboard just needs to render what's on disk. Events become a hint, not a dependency. Tab-switches become trivially safe — no in-flight HTTP requests to lose, just a poll that resumes when the tab is foregrounded.

**Acceptance criteria:**
- Seeding UI updates within 2 seconds of on-disk state changing, regardless of whether an SSE event fired.
- Switching tabs and returning: UI shows current state within 2s of return with no user action.
- Closing and reopening the browser: UI shows current state with no user action.
- Multiple seeding projects running simultaneously each update independently.

**Rollback:** revert; UI returns to event-driven (which will be broken again, but Phase 0–1 wins are preserved).

---

### Phase 3 — Daemon self-heal (replaces reconciler idea)

**Scope:** Inside `seed-loop.js`, after each `runClaude` call returns, inspect the response. If markers indicate stall shape (no `[GATE:]`, no `[DISCIPLINE_COMPLETE:]`, no autonomous markers — bare prose return), daemon immediately fires a recovery turn.

**Files:**
- `/Users/gregario/Projects/ClaudeCode/The-Rouge/src/launcher/seed-loop.js` — add recovery logic in the post-turn path
- Recovery turn is a system-prompt note: `"Previous turn returned without markers. Continue the discipline work; emit [DECISION:], [WROTE:], [HEARTBEAT:], [GATE:], or [DISCIPLINE_COMPLETE:] as appropriate."`
- Bound on recovery attempts per discipline per hour (3? configurable) to prevent infinite loops
- Recovery events written to chat as system notes so users see "Detected no-marker return; firing recovery turn" — full audit trail

**Why here:** With the daemon owning the turn loop, this becomes a simple `if` statement after each turn. No timer, no race with user input, no reconciler polling, no separate process. The self-heal IS the loop.

**Acceptance criteria:**
- A turn that returns bare prose triggers an automatic recovery turn within seconds.
- Recovery turns are visible in the chat log as system notes.
- A hard cap (default 3/hour) prevents infinite recovery loops; cap exceeded raises an escalation.
- User-typed messages interleave cleanly with daemon-fired recovery turns (daemon reads queue after each turn).

**Rollback:** revert; daemon still runs but no auto-recovery — same as end of Phase 2.

---

### Phase 4 — Dead code + CLI alignment

**Scope:** Remove artifacts from previous architectures that now confuse the picture.

**Files to delete / rewrite:**
- `/Users/gregario/Projects/ClaudeCode/The-Rouge/dashboard/src/bridge/seeding-relay.ts` — unreferenced in production (only its own test file uses it). Delete.
- `/Users/gregario/Projects/ClaudeCode/The-Rouge/src/launcher/rouge-cli.js` — `cmdSeed` (the `rouge seed <slug>` CLI command) currently spawns claude in an interactive TTY, bypassing the daemon entirely. Options:
  - **Delete** if the dashboard is the only seeding surface (confirm with user)
  - **Rewrite** to enqueue into the daemon's queue (single source of truth for seeding)

**Open question (blocking this phase):** does the user still invoke `rouge seed <slug>` from the CLI? Likely no given how long it has been dashboard-only. Confirm before deleting.

**Acceptance criteria:**
- Only one entry point to seeding exists (the dashboard) OR both entry points use the same daemon + queue path.
- No code paths spawn `claude -p` for seeding outside `src/launcher/seed-loop.js`.
- Deleted files' tests removed.

**Rollback:** revert. No functional change vs end of Phase 3.

---

### Phase 5 — Observability for silent failures

**Scope:** Every failure mode has a visible UI surface. No silent wrongness.

**Files:**
- Dashboard footer / status bar component — renders seed daemon liveness per active seeding project: "Seed daemon alive · last tick 12s ago" or "Daemon crashed · last heartbeat 4m ago · restart?"
- `/Users/gregario/Projects/ClaudeCode/The-Rouge/dashboard/src/bridge/scanner.ts` — surface daemon-down as an escalation shape (`seeding-daemon-crash`) in the same place build escalations appear
- `/Users/gregario/Projects/ClaudeCode/The-Rouge/dashboard/src/bridge/state-repair.ts` — add 4th repair shape: `seeding-daemon-orphan` — PID file references a dead process, clean it up
- Heartbeat file: `<projectDir>/.rouge/seed-heartbeat.json` written by daemon every tick; read by dashboard for status chip

**Why here:** After the daemon is in place and self-healing, the remaining concern is "what if the daemon itself dies silently?" The principle: every state allowed to become silently wrong is a future incident.

**Acceptance criteria:**
- A daemon crash is visible in the UI within 30s without user refresh.
- A stale `.seed-pid` (PID set but process dead) is surfaced, not hidden.
- A "Restart seeding daemon" action exists in the UI and works.
- The existing build-daemon status has equivalent treatment (symmetry; may already be there — audit and align).

**Rollback:** revert. System still works; just less visible when it breaks.

---

## Summary of phases

| Phase | Scope | LOC (est) | Depends on | Ships by |
|-------|-------|-----------|------------|----------|
| 0 | Writer fix: `in-progress` status | ~15 | — | tonight if desired |
| 1 | Extract `runClaude` into daemon | ~600 | 0 (independent, but 0 should ship first for visibility win) | ~3–5 days |
| 2 | Dashboard polls state | ~80 | 1 | 1 day after 1 |
| 3 | Daemon self-heal | ~100 | 1 | 1 day after 2 |
| 4 | Dead code + CLI | ~50 (mostly deletions) | 1 | 0.5 day after 3 |
| 5 | Observability | ~150 | 1 | 1–2 days after 4 |

Total estimated real work: ~2 weeks of focused time. Can stop at any phase boundary.

## Open questions carried forward

These have not been answered and will need to be addressed at the relevant phase boundary:

1. **CLI fate** (blocks Phase 4): does `rouge seed <slug>` still get invoked from the CLI? If unused, delete. If used, rewrite to enqueue.
2. **Recovery cap default** (Phase 3): 3 auto-recoveries per discipline per hour is a guess. Tunable via config? Per-discipline? Monitor early and adjust.
3. **Daemon log destination** (Phase 1): `seed-loop.log` in project dir is the obvious default. Rotate? Leave as append-only?
4. **Multiple seeds simultaneously** (Phase 1): one user running 3 projects at once → 3 seed daemons. Any resource considerations? Probably fine — seeding is a thin shell around claude spawns, not CPU-heavy.
5. **Build + seed coexistence** (Phase 1): a project should never be in both seeding and building simultaneously, but the rouge-loop + seed-loop are separate PIDs that could theoretically collide on state.json writes. Both already use atomic-rename writes; a state-lock check across both daemons would be defensive. Verify in testing.
6. **Migration of in-flight sessions** (Phase 1 rollout): at the moment of shipping Phase 1, there may be projects mid-seeding with state held in the dashboard's inline path. Plan: ship Phase 1 during a natural lull; no auto-migration needed — any in-flight session will simply stall and the user can re-send their last message to kick the daemon path.

## Success criteria (overall)

When all six phases have shipped:

- A user opens a seeding project in the dashboard, switches to another tab for 30 minutes, and returns to find the UI showing accurate current state within 2 seconds. No action required.
- A claude turn that returns without markers triggers an automatic recovery, visible in the chat log, without user intervention. The "type continue to unstick" pattern is obsolete.
- A dashboard restart (dev HMR or prod deploy) does not interrupt any in-flight seeding run. The daemon continues; the dashboard picks up state on next render.
- A daemon crash is visible in the UI within 30 seconds with a clear restart action. No silent wrongness.
- `seedingProgress.disciplines[].status` always reflects reality: pending before prompt, in-progress during, complete after. The user never sees "pending" for a discipline that's actively running.
- The seeding flow architecturally mirrors the build flow: detached daemon + state files + dashboard reader. No surprises.

## Reference — why this design, not alternatives

Full audit with file:line evidence was produced by a Plan-agent investigation run 2026-04-19. Key findings summarized here; raw audit available on request from future sessions (search for "Plan agent" in the session log).

Key facts from the audit that informed the design:

- The old standalone bridge (deleted in commit `5ed670a` on 2026-04-13) contained **no reconciler** — only an SSE keepalive at 30s. The user's recollection of a reconciler is incorrect. Reliability in that era came from the architectural seam (separate process, reader-only responsibility), not from a polling loop.
- `runSeedingTurn` in `seed-handler.ts:220-642` is a synchronous HTTP handler awaiting up to 10 minutes — the root cause of all fragility. Fixing the symptoms without fixing this is the 8-hour pattern we are escaping.
- The build loop's architecture (`rouge-loop.js` detached, `.build-pid` tracked, dashboard reads state) has not exhibited the same class of bugs. Making seeding symmetric is the fix.

---

## How to use this document

- **Starting a new Claude Code session:** read this document first before making any changes to seeding. If the proposed change does not advance a phase listed here, stop and reconsider.
- **Shipping a phase:** open a PR with `plan: seed-loop phase N` in the title. Reference this doc's phase definition. Update the phase's "Status" inline as it completes.
- **Discovering a new failure mode during execution:** add it to "Open questions carried forward" with the phase that should address it. Do not ship a tactical fix outside the phase structure.
- **If the design proves wrong:** update this doc with the correction and rationale. The doc is the source of truth; drift in PRs is a bug.
