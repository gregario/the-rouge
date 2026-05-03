# Full codebase audit — findings + remediation plan

**Date**: 2026-04-18
**Branch**: `fix/seeding-gated-autonomy` (PR #164 in flight; stack further PRs on top or branch off main)
**Origin**: five-agent parallel audit across launcher, loop prompts, dashboard backend, dashboard frontend, and supporting infrastructure. ~120 findings total.

## Why this plan exists

Session-durable record of the audit and the remediation plan. If the current conversation ends before PR-G ships, a fresh session can pick up from the status table below. Status updates to this file happen at commit time of each PR.

## Status

| PR | Scope | Status | Commit |
|---|---|---|---|
| PR-D | Critical | ✅ shipped | 3c368bf |
| PR-E | High | ✅ shipped (E7/E14 deferred) | 130ee34 |
| PR-F | Medium | ✅ PR #165 | 831d22e + c4348c7 + 68ee32b |
| PR-G | Low | ✅ PR #166 | d19d397 + eb0d897 + 74eab37 |

---

## All findings (grouped by severity)

### 🔴 CRITICAL (PR-D target)

**D1. Evaluation orchestrator routes to non-existent prompts.**
`src/prompts/loop/02-evaluation-orchestrator.md` dispatches `02b-qa-gate.md` and `02c-po-review.md` as sub-phases. Neither exists in `src/prompts/loop/` — both live in `docs/archive/deprecated-prompts/`. Current prompts are `02a-test-integrity.md`, `02c-code-review.md`, `02d-product-walk.md`, `02e-evaluation.md`. Orchestrator wasn't updated after the phase refactor. Will runtime-fail on first evaluation.
*Fix*: rewrite the orchestrator dispatch table to match the current prompt files; align `evaluation_report` shape reads in `04-analyzing.md`.

**D2. Retrospective phase violates write contract.**
`09-cycle-retrospective.md` writes to both `cycle_context.json` AND `journey.json`. CLAUDE.md explicitly forbids non-spec phases writing outside cycle_context.
*Fix*: move journey.json write to the launcher (post-phase hook) or document this as a permitted exception.

**D3. Feedback route path traversal.**
`POST /api/projects/[name]/feedback` writes arbitrary JSON body to `projectDir/feedback.json` with no size limit and no path validation on `name`. Symlink or `..` in name → arbitrary file write.
*Fix*: validate slug against regex; cap body size (e.g. 100 KB); resolve projectDir and verify it's within projectsRoot.

**D4. Ship phase doesn't check escalation flags.**
`07-ship-promote.md` checks review-readiness gates but not whether `04-analyzing` flagged `escalation_needed: true`. Can ship a product flagged for human judgment.
*Fix*: add explicit `if cycle_context.analysis_recommendation === 'notify-human'` short-circuit to the ship prompt and to `07-ship-promote` launcher dispatch.

**D5. Budget cap is post-hoc and underestimated.**
`cost-tracker.js` estimates cost from `log_size * 2` bytes (`rouge-loop.js:1830`), not actual token counts. Cap checked BEFORE phase (`rouge-loop.js:1445`) but enforced AFTER. Phase-cost overruns possible even when cap should've blocked.
*Fix*: read actual token usage from Claude API response JSON; if unavailable, require a minimum safety margin before starting a new phase.

### 🟠 HIGH (PR-E target)

**E1. State.json lost-update races.**
Read-modify-write without locking in: `PATCH /api/projects/[name]`, `POST /pause`, `POST /resolve-escalation`, `build-runner.ts`, `seed-handler.ts`, `state-repair.ts`. `writeStateJson` prevents torn writes but not lost updates.
*Fix*: introduce a per-project file lock via `proper-lockfile` or a PID-based lockfile; all state mutations acquire-modify-release.

**E2. Loopback guard trusts `x-forwarded-for`.**
`lib/localhost-guard.ts:22` takes the first forwarded-for header as client IP. Misconfigured proxy or LAN exposure → forge header → bypass `/api/system/*` protections.
*Fix*: require exact match on `127.0.0.1` / `::1` / `localhost`; ignore forwarded-for unless a `ROUGE_TRUST_PROXY=1` env var is set.

**E3. Pause/start/stop/seed routes have no auth or validation.**
Only `system/*` routes use `assertLoopback()`. Pause, start, stop, seed message, seed kickoff, feedback, project create, project delete all accept arbitrary requests.
*Fix*: apply `assertLoopback()` to every mutation route. Input-validate slugs against `/^[a-z0-9][a-z0-9-]*$/`.

**E4. Escalation `human_response` schema not validated.**
Launcher reads `e.human_response` and dispatches on `type`. Malformed response (missing `type`, unexpected value, array) silently leaves state stuck.
*Fix*: validate `human_response` against a strict schema (type in enum, submitted_at is ISO date) at read time; log + escalate on malformed.

**E5. Spin detection bypassed when `stories_executed` missing.**
`safety.js` reads `state.stories_executed || []`. Corrupted or old state → empty array → spin check never fires → unbounded stall.
*Fix*: if `stories_executed` is missing entirely (not just empty), initialize it and log a warning; add a wall-clock age check that forces escalation at >24 h.

**E6. Silent JSON parse failures everywhere.**
Every reader (state, cycle_context, task_ledger, seeding-state, checkpoints, activity, interventions) catches parse errors and returns `[]` / `null` / empty object with no logging. Real corruption masquerades as "new project".
*Fix*: shared `safeReadJson(path, { logLevel: 'warn' })` helper; use everywhere; emit a `file-corrupt` bridge event when detected.

**E7. No schema validation.**
11 schemas in `schemas/*.json` exist as documentation only. `ajv` not imported anywhere.
*Fix*: introduce ajv for state.json, cycle_context.json, task_ledger.json, checkpoint entries. Validate on write (warn, don't block) and on read (fallback to defaults).

**E8. SSE client + watcher leaks.**
Concurrent `GET /api/events` can create duplicate watchers; dead clients that throw on every send are never cleaned from `state.clients`. `watcher-singleton.ts:29-48`.
*Fix*: guard `ensureWatcher()` with an init mutex; remove clients from the map when `send()` throws; add a per-client `lastActiveAt` and prune idle clients after N minutes.

**E9. buildRunning + project state can diverge on frontend.**
`app/projects/[name]/page.tsx:74-92` polls `buildRunning` separately from the main project fetch. Race window shows Stop against a dead project or vice versa.
*Fix*: merge buildRunning into the main `GET /api/projects/[name]` response; drop the separate poll.

**E10. Error responses leak implementation details.**
`system/*` routes + DELETE / PATCH routes return `err.message` in 500 responses. Leaks OS paths, module names, keychain frameworks.
*Fix*: wrap handlers in a helper that logs the full error server-side and returns a sanitized message client-side.

**E11. State-repair races with seed-handler writes.**
`state-repair.ts` finalize path reads + writes state.json without locks. A seeding message mid-repair can race.
*Fix*: fold under E1's file-lock change.

**E12. Config files never validated.**
`rouge.config.json`, `rouge-vision.json` parsed with bare `JSON.parse`. Budget cap, thresholds, tier mappings silently misparsed if malformed.
*Fix*: part of E7.

**E13. rouge-loop silent early-crash paths.**
`readJson` returns null on parse failure; multiple callers access properties without null guards. `processInfraAction` silently discards unknown action types. `rouge-loop.js` various.
*Fix*: add null guards at every `readJson` callsite; write unhandled actions to `unhandled-actions.jsonl` for manual review.

**E14. Evaluation pipeline data-shape contract ambiguity.**
After D1 fix, explicitly document that `02e-evaluation` produces `evaluation_report.{qa, design, po}` and `04-analyzing` reads that nested shape. Update the schema.
*Fix*: folded with D1.

### 🟡 MEDIUM (PR-F target)

**F1. Task ledger write permission ambiguity.**
CLAUDE.md: only `generating-change-spec` writes `task_ledger.json`. But `03-qa-fixing` needs to log fix tasks. Contract unstated.
*Fix*: either formalise that qa-fixing can append (and update CLAUDE.md), or move fix-task generation into the change-spec phase.

**F2. Missing `.env.example`.**
17 env vars referenced in code, only 5 documented in the slack subdir. No root-level example.
*Fix*: write `/.env.example` listing all vars with comments.

**F3. Model selection: foundation on Sonnet.**
Design choice worth revisiting — foundation is high-stakes, Opus may be worth the cost.
*Fix*: bump foundation to Opus in `model-selection.js`; add a config override.

**F4. process.pid collision in tmp files.**
`writeStateJson` uses `.${pid}.${Date.now()}.tmp`. Test envs or clustered dashboards could collide if clock doesn't tick.
*Fix*: use `crypto.randomUUID()` suffix instead.

**F5. readLatestCheckpoint crashes on trailing newline.**
`checkpoint.js:28` splits on `\n`, picks `lines[lines.length-1]`. Empty tail → JSON.parse('') throws.
*Fix*: filter empty lines before picking the last one.

**F6. Readers undistinguishable empty vs missing.**
`readChatLog`, `readStoryEnrichment`, etc. return `[]`/`{}` for both "file missing" and "file empty". Harder to diagnose.
*Fix*: return distinct sentinels or structured `{present: boolean, data}` where it matters.

**F7. activity-reader cycle_context parse failure silent.**
`activity-reader.ts:221-223`. Malformed file → deploys array silently becomes `[]`.
*Fix*: log parse errors via shared logger.

**F8. Empty-state UX gaps.**
SpecsTable "No specs yet" doesn't link to New spec button; project page loading state is text-only; archived count stale until reload.
*Fix*: add explicit CTAs + skeleton loaders.

**F9. buildRunning → project-detail divergence fallout.**
After E9, also remove the stop-button-vs-zombie-state edge case documented in `action-bar.tsx`.

**F10. Integration catalogue manifest not automated.**
CONTRIBUTING.md promises auto-promotion of drafts. No launcher code does this.
*Fix*: add `src/launcher/catalogue-promote.js`; run on build completion.

**F11. Logger /tmp fallback is world-readable.**
`logger.js:40` defaults to `/tmp` if HOME unset. Logs with project names / API key excerpts could leak.
*Fix*: refuse to start if no writable log dir found; surface as startup error.

**F12. Stale closure on `verboseActivity`.**
`app/projects/[name]/page.tsx:178`. Pending refetch uses old value.
*Fix*: ref-based toggle or fix the useEffect deps.

**F13. Keyboard-a11y gaps on icon buttons.**
Multiple buttons without `aria-label`; some `role=link` + `onKeyDown` constructs break screen reader semantics.
*Fix*: sweep components/ for aria-label coverage; prefer `<Link>` or `<button>` over div-with-role.

**F14. Scanner-level silent skip.**
`scanner.ts:54-57` skips projects with malformed state.json without logging the project name.
*Fix*: log `[scanner] skipping <slug>: <error>` on parse failure.

**F15. Escalation multi-response not supported.**
EscalationResponse only shows `escalations[0]`. Multiple simultaneous pending escalations collapse to one.
*Fix*: render a stacked list; or surface a "N other escalations pending" notice.

**F16. Build log polling over SSE.**
1.5s polling still incurs latency + FS load. SSE tail or WebSocket would be better.
*Fix*: add an SSE endpoint at `/api/projects/[name]/build-log/stream`; fall back to polling if EventSource unavailable.

**F17. self-improve-safety.js is dormant.**
Module exists but no phase invokes it. Self-improvement loop isn't wired.
*Fix*: integrate post-`10-final-review.md` to capture learnings and draft improvement issues.

### 🟢 LOW (PR-G target)

**G1. Phase prompts untested.**
18 prompts (loop + seeding), only 1 contract-validation test covers them collectively.
*Fix*: add fixture-based tests that run each prompt's expected output shape through the validator.

**G2. Dashboard frontend missing affordances (vision gaps).**
- Self-improvement loop status widget
- Linked projects / dependency graph viewer
- Library / catalogue browser
- Milestone tagging / custom workflows
- Aggregate spending dashboard / cost forecasting
- Spec diff viewer (revise mode)
- Liveness chip on project cards (not just inside seeding)
- Discipline gating indicators in spec-tab-content
*Fix*: scope each as its own component, wire to existing backend data.

**G3. Test coverage on critical launcher paths.**
provision-infrastructure.js, deploy-blocking.js, context-assembly.js lack focused tests.
*Fix*: add integration tests with mocked Claude + fake project dir.

**G4. Documentation drift.**
Several docs/how-to files reference pre-V3 command names or file paths.
*Fix*: sweep for `rouge spec` / `rouge seed` / `state.json` references; verify against current CLI.

**G5. package.json test script is inconsistent.**
Mixes CommonJS test files + `node:test` runner. No single harness.
*Fix*: migrate all tests to `node:test` or vitest.

**G6. tests/cli.test.js mocks execFileSync.**
Never exercises the real CLI. Weak coverage.
*Fix*: spawn actual rouge-cli in a temp dir test.

**G7. Library catalogue health.**
Tier-1 empty, Tier-2 missing manifests. CONTRIBUTING.md spec not enforced.
*Fix*: validate manifest structure on promotion; add schema.

**G8. docs/how-to/slack-setup.md says Slack is no-longer-recommended but main docs still promote it.**
*Fix*: either retire Slack bot or update the warning tone.

**G9. preamble-injector.js doesn't escape `{{...}}`.**
`learningsContent` interpolated directly. Template placeholders in learnings.md would appear in the preamble.
*Fix*: escape `{{` → `\{\{` before injection.

**G10. feasibility gate not integration-tested.**
`feasibility.js` exists but no test confirms the CLI command works end-to-end.
*Fix*: add `rouge feasibility "test thing"` test.

**G11. activity-reader verbose mode confusing.**
Toggle says "Show all" but verbose mode shows checkpoint events, not full detail. Misleading label.
*Fix*: rename toggle or refactor verbose to include per-event detail expansion.

**G12. deploy-blocking.js returns null URL silently.**
`deployWithRetry` returns `{url: null, blocked: false}` on failure. Downstream uses URL without null-check.
*Fix*: treat null URL as blocked; propagate error.

**G13. Windows secrets backend silent failures.**
`secrets.js` inline C# has no error logging on API call failures.
*Fix*: capture stderr; surface specific errors.

**G14. Multiple `ProjectDetail` → `Escalation` type copies across lib/ and bridge/.**
*Fix*: single source of truth in bridge/types.ts, re-export from lib/types.ts.

**G15. Markdown prompt link rot.**
Some prompts reference docs that have moved.
*Fix*: scan all prompt files for broken internal links.

---

## PR execution plan

### PR-D (Critical) — ship-blockers
Branch: `fix/audit-critical` off current main (or stack on PR #164)
Files touched: `src/prompts/loop/02-evaluation-orchestrator.md`, `src/prompts/loop/04-analyzing.md`, `src/prompts/loop/07-ship-promote.md`, `src/prompts/loop/09-cycle-retrospective.md`, `src/launcher/rouge-loop.js`, `src/launcher/cost-tracker.js`, `dashboard/src/app/api/projects/[name]/feedback/route.ts`
Acceptance: D1-D5 all fixed, existing tests green, new tests for feedback-route path-traversal + budget cap precondition + ship-phase escalation check.

### PR-E (High) — security + consistency hardening
Branch: `fix/audit-high` stacked on PR-D
Files touched: many — introduces file-locking helper + shared safeReadJson + ajv schema validation + localhost-guard tightening + all mutation routes guarded.
Acceptance: E1-E14. File-lock round-trip tests; loopback-guard bypass tests; SSE watcher leak reproduction test.

### PR-F (Medium) — quality / robustness
Branch: `fix/audit-medium` stacked on PR-E
Files touched: `.env.example` (new), `rouge-loop.js` null guards, `logger.js`, frontend empty-state polish, `model-selection.js`.
Acceptance: F1-F17.

### PR-G (Low) — long-tail + missing affordances
Branch: `fix/audit-low` stacked on PR-F. May be split further if G2 (dashboard affordances) gets large.
Files touched: test fixtures, docs sweep, preamble-injector escape, type dedupe, dashboard widgets.
Acceptance: G1-G15.

## Execution order

1. PR-D first (ship-blockers).
2. PR-E after (prevents regressions under load).
3. PR-F after (quality baseline).
4. PR-G last (long tail, may split).

Each PR: implement → tests → commit → push → update status table in this file.

## Progress log

_(append one line per commit)_

- 2026-04-18: Plan created.
- 2026-04-18: PR-D shipped (3c368bf) — D1-D5 critical fixes.
- 2026-04-18: PR-E shipped — E1 (state.json file-lock), E2 (localhost-guard x-forwarded-for), E3 (loopback + slug on mutation routes), E4 (human_response schema validation), E5 (spin detection hardening + wall-clock escalation), E6/E12/E13 (shared safeReadJson), E8 (SSE watcher init mutex + client leak sweep), E9 (buildRunning folded into project GET), E10 (sanitized error responses). E7/E14 (ajv schema validation) deferred to follow-up — requires ajv dep and schema reconciliation larger than E-series scope.
