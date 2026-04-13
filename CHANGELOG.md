# Changelog

All notable changes to Rouge ship here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[SemVer](https://semver.org/).

## [Unreleased]

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
