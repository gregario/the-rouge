# Changelog

All notable changes to Rouge ship here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[SemVer](https://semver.org/).

## [Unreleased]

### Added
- **Seeding daemon** (`dashboard/src/bridge/seed-daemon.ts`) owns the
  seeding subprocess chain. Moves the long-running `claude -p` call
  out of the HTTP request handler's lifecycle, so tab switches,
  dashboard restarts, and HMR no longer interrupt in-flight seeding
  work. Spawned via `tsx`, PID-tracked in `<projectDir>/.seed-pid`,
  heartbeat in `<projectDir>/.rouge/seed-heartbeat.json`. Queued
  messages live in `<projectDir>/seed-queue.jsonl`.
- **Background heartbeat ticker** in the daemon (5s cadence via
  `setInterval`) keeps the liveness file fresh during long
  `runClaude` blocks so the UI doesn't false-alarm as "stalled".
- **Daemon self-heal.** If `handleSeedMessage` returns bare prose
  (no markers, no gate, not complete), the daemon fires a
  discipline-specific recovery turn. Bounded to 3 per hour per
  project; hitting the cap writes a visible `system_note`.
- **Dashboard polls state** (`use-seeding.ts`) at 2s cadence instead
  of relying on SSE events for seeding. Events-driven live updates
  had too many silent-failure surfaces across the watcher/SSE/client
  filter path. Polling is simpler and strictly more reliable.
- **Daemon-liveness chip** above the chat input — "Rouge is thinking"
  stays visible for the whole daemon turn, and flips to a yellow
  stall warning if the heartbeat age exceeds the per-discipline
  threshold.
- **Per-discipline stall threshold** via `stallThresholdMsForDiscipline`
  in `dashboard/src/lib/discipline-timing.ts`. Long disciplines
  (spec, design) get wider windows automatically.
- **Per-discipline recovery prompts** in
  `dashboard/src/bridge/recovery-prompts.ts`. Recovery turns get
  discipline-specific `[SYSTEM]` guidance narrowing what markers are
  expected at this stage, instead of a generic "continue".
- **Seed-daemon-crash escalation.** State-repair pushes a first-class
  `Escalation` with classification `seed-daemon-crash` when it
  detects an orphan `.seed-pid` with a non-empty queue. Deduped
  across repair passes, auto-resolves when the daemon recovers.
- **Send-disabled-while-processing.** Chat-panel send button is
  disabled while `daemonLiveness === 'processing'`. Prevents the
  user from accidentally queuing a follow-up that would be treated
  as the gate answer when Rouge finishes the current turn.
- **`rouge seed <name> "<message>"`** rewritten to route through
  the same daemon + queue the dashboard uses. Pretty-prints the
  chat tail to stdout; Ctrl-C detaches without killing the daemon.

### Changed
- **Seeding is daemon-only.** The inline (HTTP-handler-owned)
  seeding path was deleted alongside the `ROUGE_USE_SEED_DAEMON`
  feature flag. Every seeding message now flows HTTP handler →
  queue → daemon → `handleSeedMessage`. The HTTP entry point was
  renamed from `handleSeedMessageRouted` to `postSeedMessage`.
- **`handleSeedMessage` no longer accepts options.** Always skips
  its own human-append because the HTTP handler / CLI pre-persists
  the entry before queuing.
- **Queue entry shape simplified.** `QueueEntry` is now
  `{id, text, enqueuedAt}`.
- **State-repair** now surfaces orphan daemons with pending work
  as visible chat system notes + first-class escalations
  (previously only a chat note).
- **`ProjectWatcher`** watches `<projectDir>/.rouge/` (parent dir)
  rather than `.rouge/state.json` directly, so atomic renames on
  state writes don't break the watch handle on macOS.
- **`markDisciplinePrompted`** now writes `currentDiscipline` into
  `state.json.seedingProgress` when a discipline transitions to
  in-progress.

### Removed
- `SeedingRelay` and its test — unreferenced in production.
- `handleSeedMessageRouted` (replaced by `postSeedMessage`).
- `ROUGE_USE_SEED_DAEMON` env var.
- `TurnOptions.humanMessageAlreadyPersisted` and
  `QueueEntry.humanAlreadyPersisted` (implicit post-cleanup).

### Fixed
- **Chat blanks during long turns.** The HTTP handler now
  pre-persists the human chat entry synchronously before returning
  202, closing the window where the client's refetch saw an empty
  chat while the daemon was still mid-turn.
- **False-stall warnings on long disciplines** (spec, design). The
  per-discipline threshold widens the stall window to reflect
  typical turn duration.
- **Colourcontrast / stack-rank-style silent stalls.** Rouge
  returning bare prose with no markers used to leave the session
  idling indefinitely. The daemon's self-heal path visibly fires a
  recovery turn.

## [0.3.1] — 2026-04-13

### Added
- `SECURITY.md` disclosure policy, GitHub Security Advisories as the reporting channel.
- Shared `src/launcher/logger.js` with size-based rotation (10 MB → rotate to
  `rouge.log.1`) and a single `resolveLogDir()` that prefers `ROUGE_LOG_DIR`,
  falls back to the repo's `logs/` on source checkouts, and `~/.rouge/logs/`
  on global installs.
- `.github/ISSUE_TEMPLATE/` and `.github/PULL_REQUEST_TEMPLATE.md`.

### Changed
- **Dashboard is now prebuilt and unified.** The published npm tarball ships
  a self-contained Next.js standalone runtime at `dashboard/dist/`. Launch is
  ~2s cold (vs 30–60s via `next dev`) and the dev toolchain is no longer
  required on user machines.
- **One process, one port.** The bridge HTTP server has been replaced by
  Next 16 route handlers under `/api/*`. Frontend fetches are now
  origin-relative. `rouge dashboard` auto-opens the browser; pass
  `--no-open` to skip.
- **Consistent log routing.** Every launcher module now writes through the
  shared logger. Fixes a bug where some writers resolved their own log
  directory and could write outside the install prefix.

### Fixed
- **npm tarball no longer leaks dashboard source, author paths, or mock
  data with personal GitHub handles.** A prior `files` + `.gitignore`
  interaction shipped 473 KB of `package-lock.json`, all of `dashboard/src/`,
  the full dev config set, and several absolute build-time paths. The
  tarball now ships only the standalone runtime, scrubbed of build-host
  paths.
- **`dashboard/src/data/projects.ts`** — mock GitHub URLs genericised from
  `github.com/gregario/*` to `github.com/rouge-demo/*`.
- **Smoke-test doc** (`dashboard/docs/plans/2026-04-05-seeding-flow-smoke-test.md`)
  — hardcoded absolute paths replaced with `$ROUGE_PROJECTS_DIR`.

### Security
- Rewrote `src/launcher/secrets.js` end-to-end: all OS-keychain backends
  now spawn without a shell and pass secrets via stdin — no secret value
  ever appears in argv. Windows gets a real `CredRead` implementation via
  inline C# P/Invoke (previously returned the literal string `<stored>`).
  `rouge secrets validate` reads its curl config from stdin.
- `rouge-safety-check.sh` now hooks `Edit`, `MultiEdit`, and `NotebookEdit`
  alongside `Write`, closing a bypass of the `.env` / safety-critical-file
  protections. Adds explicit `vercel deploy` gating mirroring the
  `wrangler deploy` rule. Audit log (`~/.rouge/audit-log.jsonl`) is
  chmod-600 on creation.
- `rouge doctor` now flags missing `jq` as a blocker (the PreToolUse hook
  needs it; without it, every tool call fails the hook and Claude Code
  rejects it).
- Launcher enforces `control_plane_lock` from `rouge.config.json` — the
  `rouge dashboard` and `rouge slack` commands refuse to start when the
  non-selected plane is locked.

## [0.3.0] — 2026-04-04

Initial public preview. Single-branch product-build strategy, V3 dual-ledger
state (`task_ledger.json` + append-only `checkpoints.jsonl`), intent-based
infrastructure callbacks, dashboard as primary control plane.
