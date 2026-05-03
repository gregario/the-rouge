# Onboarding Refactor Plan

**Status:** approved, not started
**Owner:** Greg
**Created:** 2026-04-15
**Session log:** [2026-04-15-onboarding-refactor-session-log.md](./2026-04-15-onboarding-refactor-session-log.md)

---

## North Star

**From `git clone` to seeded project in under 5 minutes, without opening a terminal again after `rouge setup`.**

Corollary: the dashboard teaches itself. A user who never reads the docs should still succeed. Docs exist for power users, debugging, and explanation — not the happy path.

## Strategic context

Rouge is the **local-first, open-source feeder** for The Works (cloud-hosted, more autonomous). Ideas validated in Rouge flow upstream. Keep Rouge unambiguously in a different quadrant: local-first forever, no Docker, no hosted mode.

## Scope decisions (locked)

1. **CLI → internal plumbing + escape hatch.** `rouge setup` and `rouge doctor` stay first-class. Everything else (`rouge seed`, `rouge init`, `rouge build`, `rouge slack start`) demoted: still works, documented only in `reference/cli.md`, tagged advanced. No tutorial tells a new user to run them.
2. **Slack → experimental, notifications-first.** Slack stops being a control plane. Jobs: deploy/milestone/cost notifications + small remote commands (`/approve`, `/status`, `/pause`). Full Slack control plane marked experimental.
3. **Dashboard → the product.** Everything on the Golden Path lives here. First-run wizard, project creation, seeding chat, secrets, budget, Slack wiring, ship/pause, shutdown.

## Lifecycle model (locked)

- **Daemon on by default, sticky.** `rouge setup` installs a launch agent (macOS) / systemd user unit (Linux) / Scheduled Task (Windows). Asks during setup with default Yes; opt-out toggle in dashboard.
- **No idle auto-shutdown.** Less-technical users find magic disappearance confusing.
- **Explicit shutdown from dashboard.** Top-right menu → "Shut down Rouge." Confirms, responds 200, exits on next tick. If a build is running: "A build is in progress. Shut down anyway? It'll resume on restart."
- **CLI escape hatches stay:** `rouge status`, `rouge stop`, `rouge start`, `rouge uninstall`.
- **Port discipline:** single well-known port, fail loud on conflict.
- **Clean uninstall promise:** `rouge uninstall` removes `~/.rouge`, keychain entries, launch agent, npm global. No orphans.
- **Menubar/tray icon:** deferred (future enhancement, not Phase 2.5).

## Phases

### Phase 0 — Alignment ✅
This document. Lock scope + North Star. No code.

### Phase 1 — Doc banner (ship immediately)
Drop a "we're refactoring onboarding, use the dashboard's New Project button and ignore CLI steps below" banner on the four stale files. **Not** a rewrite — Phases 3–6 will replace these anyway.

- `docs/quickstart.md`
- `docs/your-first-product.md`
- `docs/setup.md`
- `docs/architecture.md`
- `docs/slack-setup.md` gets an "experimental" banner

**Effort:** 30 min. **Risk:** zero. **Ship:** same day as Phase 0.

### Phase 2 — Deprecation markers in code
Add `--experimental` warnings on CLI verbs being demoted. Update `--help` text. Behavior identical; signals the new world.

- `rouge seed`, `rouge init`, `rouge build`, `rouge slack start` → print deprecation notice pointing to dashboard
- `rouge --help` reorganized: "Setup" (setup, doctor, status, stop, start, uninstall) + "Advanced" (everything else)

**Effort:** ~2 hours. **Risk:** low. **Files:** `src/launcher/rouge-cli.js`.

### Phase 2.5 — Lifecycle hygiene
Foundation for the wizard. Has to exist before Phase 3 because the wizard displays real status.

- `rouge status` — shows daemon state, port, PID, uptime, current project, active loop, last activity
- `rouge stop` / `rouge start` — manual control
- Daemon install on `rouge setup` (asks, default Yes); removal on `rouge uninstall`
- Dashboard shutdown button + build-in-progress confirm dialog
- Port discipline: single known port, fail loud on conflict
- `rouge uninstall` end-to-end clean (files, keychain, launch agent, global npm)

**Effort:** ~1 week. **Risk:** medium (platform-specific daemon code). **Files:** new `src/launcher/daemon.js`, `src/launcher/lifecycle.js`; dashboard shutdown API + UI.

### Phase 3 — Dashboard first-run wizard
The biggest UX lift. When dashboard loads with no projects and no completed setup:

- Run `doctor` via API, show prereq checklist with install one-liners
- Guide through `rouge setup`-equivalent flows in UI (keychain writes via API)
- End with "Create your first project" → existing New Project dialog
- Skippable for returning users; "Setup" tab always accessible

**Effort:** ~1–2 weeks. **Risk:** medium. **Files:** new `dashboard/src/app/setup/` route, new API endpoints for doctor/secrets/daemon operations.

### Phase 4 — Slack setup wizard in dashboard
Replace `docs/slack-setup.md` as the primary path.

- Embed manifest YAML with copy button
- Deep-link to Slack app creator
- Paste + validate tokens (actually call `auth.test`)
- Test webhook with real ping before saving
- Frames Slack as notifications + remote commands, not control plane

**Effort:** ~1 week. **Risk:** low.

### Phase 5 — Integrations + budget panels
- Stripe / Supabase / Sentry / Vercel token entry with live validation
- Decoupled from `vision.json` ordering trap
- Budget slider + live spend vs cap (replaces JSON editing)

**Effort:** ~1 week. **Risk:** low.

### Phase 6 — Docs restructure (Diátaxis)
- Split `docs/` into `tutorials/`, `how-to/`, `reference/`, `explanation/`
- Generate `reference/cli.md` from CLI help text
- Add link-check + command-check to CI
- Rewrites the files Phase 1 merely banner-ed

**Effort:** ~1 week. **Risk:** low (mostly moves).

### Phase 7 — Self-documenting dashboard
Inline help at every friction point with links to `how-to/` for depth. Continuous, not a single PR.

## Success criteria

- [ ] Fresh cloner goes `git clone` → seeded project in under 5 min with no doc reading
- [ ] `rouge status` instantly tells you what's running and where
- [ ] `rouge uninstall` leaves zero orphans (no files, no keychain entries, no launch agent)
- [ ] Dashboard shutdown button works mid-build without data loss
- [ ] All user-facing docs point at dashboard-first; no doc recommends `rouge seed`
- [ ] CI link-check + command-check prevent future doc rot
- [ ] Slack setup takes under 3 min from dashboard wizard

## Open questions (resolved)

1. Scope decisions — **locked as above.**
2. CLI escape hatch visibility — **buried in `reference/cli.md`, still in `--help` under "Advanced."**
3. Phase 1 timing — **ship banner, not rewrite, same day as this doc.**
4. Local-first vs hosted — **local-first forever. No Docker. Hosted = The Works.**
5. Daemon default — **on by default, asks during setup (default Yes), opt-out in dashboard.**
6. Idle shutdown — **none. Explicit shutdown only.**

## Feeding The Works

Primitives built here that feed upstream:
- Process lifecycle (status / stop / start / uninstall patterns)
- Secrets backend abstraction (keychain → vault equivalent)
- Setup wizard UX patterns
- Doctor/prereq-check framework
- Dashboard shutdown semantics (graceful exit with in-flight work)
- Slack-as-notifications pattern (not Slack-as-control-plane)

Log insights in the session log as they surface.
