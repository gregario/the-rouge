# Onboarding Refactor — Session Log & Handover

**Plan:** [2026-04-15-onboarding-refactor.md](./2026-04-15-onboarding-refactor.md)
**Purpose:** Multi-session tracker. Each session appends a handover entry at the end so the next session (human or Claude) can pick up without re-reading the whole conversation.

---

## How to use this file

**Every session MUST:**
1. Read the most recent handover entry at the bottom before starting work.
2. Check "Current phase" and "Next action" in the status block.
3. At the end of the session (or when ending a phase), append a new handover entry using the template below.
4. Update the status block at the top.

**Keep it append-only.** Don't edit past entries — they're the audit trail. If something was wrong, note the correction in the next entry.

---

## Status (update each session)

- **Current phase:** ALL PHASES COMPLETE. Refactor done. Ready for npm release.
- **Last updated:** 2026-04-15
- **Last session:** Phases 4 → 7 merged end-to-end in one session. Slack wizard, budget panel, Diátaxis docs + CI, inline help.
- **Next action:** Cut v0.4.0 (or v1.0.0) to npm. `npm version minor && npm publish`.
- **Blockers:** none
- **Branch:** main is clean. All 11 PRs (#108, #110, #111, #112, #113, #114, #115, #116, #117, #118) merged.
- **Release:** Current npm latest = v0.3.1. Next bump ships the entire refactor.

---

## Decision log (append-only)

Lock important decisions here so future sessions don't relitigate.

- **2026-04-15** — North Star: clone → seeded project in under 5 min, no terminal after `rouge setup`.
- **2026-04-15** — Rouge stays local-first forever. No Docker. Hosted version = The Works.
- **2026-04-15** — CLI demoted except `setup`/`doctor`/`status`/`stop`/`start`/`uninstall`. Others get `--experimental` warnings.
- **2026-04-15** — Slack demoted to notifications + remote commands. Full control plane marked experimental.
- **2026-04-15** — Daemon on by default, sticky, no idle shutdown. Explicit dashboard shutdown button.
- **2026-04-15** — Phase 1 is banner-only, not rewrite — Phases 3–6 replace those docs anyway.
- **2026-04-15** — Menubar/tray icon deferred (future enhancement).

---

## Handover template

Copy this block and fill in at the end of each session:

```
### [YYYY-MM-DD] Session — <phase name or short title>

**Phase:** N
**Session goal:** <what this session set out to do>
**Outcome:** <what actually happened — shipped / partial / blocked>

**Files touched:**
- path/to/file — what changed

**Commits / PRs:**
- <sha or PR link> — <title>

**Decisions made this session:**
- <any new decisions; also add to Decision log above>

**Surprises / learnings:**
- <anything unexpected — feeds back into the plan or The Works>

**Next action:**
<literal next step for the next session — be specific, assume the next session is cold>

**Open questions / blockers:**
- <things that need answering before progress>
```

---

## Session entries

### 2026-04-15 Session — Phase 0 alignment

**Phase:** 0
**Session goal:** Lock North Star, scope decisions, and draft full plan.
**Outcome:** Shipped — plan doc + this session log created. No code changes yet.

**Files touched:**
- `docs/plans/2026-04-15-onboarding-refactor.md` — new, full plan
- `docs/plans/2026-04-15-onboarding-refactor-session-log.md` — new, this file

**Commits / PRs:** none yet — plan not yet committed.

**Decisions made this session:** see Decision log above (all entries dated 2026-04-15).

**Surprises / learnings:**
- Current `docs/` has contradiction on click 1 from README — every linked doc recommends the old `rouge seed` CLI path. Banner fix is genuinely urgent even if rewrite comes later.
- Secrets backend (commit 2f5ad64) is the reason Docker is wrong: keychain integration doesn't survive containerization. Worth capturing as a Works design constraint too.
- Local-first for AI *dev* tools is the dominant pattern (Claude Code, Aider, Cursor, Continue, Ollama). Cloud is for non-dev agents. Clean split between Rouge and The Works.

**Next action:**
Start Phase 1. Create branch `feature/onboarding-refactor-phase-1`. Add a deprecation/refactor banner to the top of each of these files:
- `docs/quickstart.md`
- `docs/your-first-product.md`
- `docs/setup.md`
- `docs/architecture.md`
- `docs/slack-setup.md` (experimental banner)

Banner text (draft, tune per file):
> ⚠️ **Onboarding is being refactored.** The current canonical path is: run `rouge setup`, open the dashboard, click **New Project**. CLI and Slack steps below still work but are no longer the recommended path. See [docs/plans/2026-04-15-onboarding-refactor.md](./plans/2026-04-15-onboarding-refactor.md).

Commit, open PR, merge. Update status block and add handover entry below.

**Open questions / blockers:** none.

### 2026-04-15 Session — Phase 2 CLI deprecation markers

**Phase:** 2
**Session goal:** Warn on demoted CLI verbs; reorganize `rouge --help` into SETUP / ADVANCED / EXPERIMENTAL.
**Outcome:** Shipped. PR #110 merged to main. Tests 285/285 pass.

**Files touched:**
- `src/launcher/rouge-cli.js` — `warnExperimental()` helper, wired into `cmdInit` / `cmdSeed` / `cmdBuild` / `cmdSlackStart`; help text regrouped; `rouge setup` next-steps rewritten to point at dashboard; header comment block trimmed

**Commits / PRs:**
- PR #110 — "cli: mark experimental verbs + reorganize --help (Phase 2)" — squashed to main

**Decisions made this session:**
- Warning is soft (stderr, one paragraph) and suppressible via `ROUGE_SUPPRESS_EXPERIMENTAL_WARNING=1` so automation scripts don't get noisy
- Help is grouped, not hidden — EXPERIMENTAL commands still visible in `rouge` output, just labeled. Full hiding will come later (Phase 6 docs / reference/cli.md)
- Phase 2.5 verbs (status/stop/start/uninstall) left as a TODO comment in help text, not yet implemented

**Surprises / learnings:**
- `rouge dashboard start|stop|status|restart` already exists and provides most of the lifecycle story. Phase 2.5 is mostly about **promoting those to top-level verbs** + adding daemon install + dashboard shutdown button, not building lifecycle from scratch. Scope is smaller than it read in the plan.

**Next action:**
Phase 2.5. New branch `feature/onboarding-refactor-phase-2.5`. Scope:
1. Add top-level verbs `rouge status`, `rouge stop`, `rouge start` that delegate to the existing `rouge dashboard status|stop|start` logic, plus show loop/Claude/Slack-bot state (multi-signal status view).
2. Add `rouge uninstall` — removes `~/.rouge` (with confirm), keychain entries for each integration, any launch agent, and (if globally installed) optionally removes the npm global.
3. Daemon install as part of `rouge setup`: asks "Keep Rouge running in the background at login? [Y/n]" — default Yes. macOS launch agent, Linux systemd --user unit, Windows Scheduled Task. Per-platform files in new `src/launcher/daemon.js`.
4. Dashboard shutdown button: top-right menu, confirm dialog (with build-in-progress warning), API endpoint `POST /api/system/shutdown` that responds 200 then exits on next tick.
5. Port discipline: fail loud if the configured dashboard port is taken, don't silently drift.

Deliberately **not** in Phase 2.5: idle auto-shutdown (explicitly rejected — decision 2026-04-15), menubar icon (deferred), first-run wizard (that's Phase 3).

**Open questions / blockers:** none, but flag: daemon install touches platform-specific code across macOS/Linux/Windows. Worth doing one platform end-to-end first (macOS launch agent) and stubbing the others, rather than trying to land all three in one PR. Consider splitting Phase 2.5 into 2.5a (macOS + top-level verbs + shutdown button) and 2.5b (Linux/Windows daemon parity).

### 2026-04-15 Session — Phase 2.5a lifecycle + daemon (macOS) + shutdown button

**Phase:** 2.5a
**Session goal:** Promote lifecycle verbs to top-level, install/remove macOS daemon from `rouge setup`/`uninstall`, add dashboard shutdown button.
**Outcome:** Shipped. PR #111 merged to main after five iterative fixes driven by manual testing.

**Files touched:**
- `src/launcher/daemon.js` (new) — macOS launch agent install/uninstall via launchctl
- `src/launcher/rouge-cli.js` — top-level `status`/`start`/`stop`/`uninstall`; module-scope PID/port/URL primitives; daemon prompt in `setup`; `--yes`/`--no-daemon` flags; port discipline via lsof; daemon-aware foreground redirect; clearer foreground banner; subcommand-vs-flag parsing
- `dashboard/src/app/api/system/shutdown/route.ts` (new) — POST endpoint exits on next tick
- `dashboard/src/components/shutdown-button.tsx` (new) — Power icon in top-right with confirm dialog
- `dashboard/src/components/nav.tsx` — wired in ShutdownButton
- `dashboard/src/lib/bridge-client.ts` — SSR fetch fix (absolute URL server-side)

**Commits / PRs:**
- PR #111 — "lifecycle: top-level status/stop/start/uninstall + macOS daemon + shutdown button (Phase 2.5a)" — squashed to main

**Decisions made this session:**
- `--yes` / `--no-daemon` flags on `rouge setup` for scripted use and for Claude Code's bash tool (which can't feed stdin to an interactive prompt)
- Launch agent plist invokes `process.execPath + rouge-cli.js` directly (absolute paths) rather than the `#!/usr/bin/env node` shebang — launch agents run with stripped PATH that doesn't find Homebrew node
- Port discipline: probe via `lsof -iTCP:<port> -sTCP:LISTEN` to catch both IPv4 and IPv6 listeners, since another service could hold one address family while Rouge happily takes the other (confusing because macOS prefers ::1 in DNS resolution)
- Daemon-aware foreground: `rouge dashboard` with a running daemon opens browser + exits instead of spawning a redundant instance
- Keychain deletion messaging: explicitly call out `rouge-*` prefix so users with personal Stripe/Supabase/etc entries don't worry

**Surprises / learnings:**
- **Pre-existing SSR bug in dashboard** (from PR #107): `fetch('/api/projects')` in Server Components failed with "Failed to parse URL" because Node's fetch requires absolute URLs. Works in `next dev` somehow; breaks in prebuilt standalone. Fixed in bridge-client.ts by synthesizing `http://localhost:${PORT}` server-side.
- The IPv4/IPv6 dual-listener pattern (The Works on :3001 v6, Rouge on :3001 v4) is surprisingly easy to hit and produces the most confusing possible symptom: "my browser shows the wrong app." Port discipline is non-negotiable for a tool that auto-opens a browser.
- The foreground `rouge dashboard` banner needed to explicitly say "closing this terminal stops only THIS instance, the daemon is unaffected" — users reasonably fear Ctrl+C kills everything.
- `rouge uninstall` was NOT manually tested (destructive). Approved on code review only. If it misbehaves, first user hit will be the report.

**Follow-ups not done:**
- **Phase 2.5b** (Linux systemd --user unit, Windows Scheduled Task) — deferred until a real user needs it. `daemon.statusSummary()` already returns `supported: false` on those platforms so the setup flow degrades gracefully.
- **Menubar/tray icon** — deferred (would need Electron or native shim).
- **Build-in-progress warning on shutdown** — current dialog just says "any build will pause and resume." If dashboard shutdown mid-build ever corrupts state, revisit.
- **npm publish** — NOT publishing until all phases complete. Next bump after Phase 7.

**Next action:**
Phase 3. New branch `feature/onboarding-refactor-phase-3`. This is the big UX lift:

Scope: dashboard first-run setup wizard. When the dashboard loads and detects no completed setup (e.g. no `~/.rouge/setup-complete` marker, or no projects + no secrets stored):

1. Show a `/setup` route (or modal) with a multi-step wizard:
   - Step 1: Prereq check (calls a new `/api/system/doctor` endpoint that runs rouge-cli doctor logic)
   - Step 2: Integration secrets (optional panels for Stripe/Supabase/Sentry/Vercel; calls `/api/system/secrets` to write via the keychain backend)
   - Step 3: Slack setup (deferred to Phase 4, just link to docs/slack-setup.md for now, marked experimental)
   - Step 4: Daemon install confirmation (shows current state, offer install if not already)
   - Step 5: "Create your first project" → existing New Project dialog
2. Wizard must be **skippable** for returning users; "Setup" should also exist as a persistent nav item for re-entry.
3. Persistence: write `~/.rouge/setup-complete` (or similar) when user finishes; wizard only auto-shows until that exists.

Before coding, consider:
- **Scope discipline:** Phase 3 is NOT "rewrite onboarding docs." It's the wizard. Resist adding secrets validation (Phase 5), Slack setup (Phase 4), or docs work (Phase 6) to this PR.
- **API surface:** new endpoints under `/api/system/*` — doctor, secrets list/add/delete, daemon install/uninstall. Match the CLI's capabilities but expose them via HTTP.
- **Security:** these endpoints run on localhost only. Still, don't expose them without a check on the dashboard being single-user-local (check remote addr, refuse non-loopback).

Recommended sub-split (if this gets too big for one PR):
- **3a:** `/setup` route with wizard shell + doctor step (read-only, no keychain writes yet)
- **3b:** secrets step + daemon step (writes via new API)
- **3c:** "setup-complete" marker + auto-show logic + persistent nav item

Open for discussion before starting. Worth briefly confirming scope split with Greg in the next session before diving in.

**Open questions / blockers:** 
- Should Phase 3 sub-split (3a/3b/3c) or land as one PR? Depends on appetite. 3a alone is ~2-3 hours; full Phase 3 is probably 1-2 weeks.
- Should `/setup` be a dedicated route, a modal on `/`, or a slide-out Sheet? Route is cleanest for deep-linking; modal is quickest to ship.

### 2026-04-15 Session — Commercial license tiering (aside)

**Phase:** (out-of-band)
**Session goal:** Close the hosted-resale loophole in the flat $100/mo commercial tier.
**Outcome:** Shipped. PR #109 merged to main.

**Files touched:**
- `COMMERCIAL.md` (new) — three-tier structure, definitions, FAQ
- `README.md` — License section updated to reference tiered structure

**Decisions made this session:**
- Free (PolyForm NC) / Internal Commercial ($100/mo, ≤5 devs, ≤$1M ARR, no hosting/resale) / Enterprise (contact, custom)
- Base LICENSE text unchanged — tiering lives in COMMERCIAL.md
- MongoDB/Sentry/Elastic pattern compressed; "primary functional component" test from Elastic License 2.0

**Follow-up (not in this plan, flagged for Greg):**
- Legal review before real enforcement — especially caps, "primary component" test, and how Tier 2/3 terms are papered (GitHub Sponsors alone doesn't execute a license agreement)

### 2026-04-15 Session — Phase 1 banners

**Phase:** 1
**Session goal:** Add refactor-in-progress banners to 5 stale docs so new users aren't misled while Phases 3–6 rewrite them.
**Outcome:** Shipped. Branch + commit + PR created.

**Files touched:**
- `docs/quickstart.md` — dashboard-first banner
- `docs/your-first-product.md` — dashboard-first banner
- `docs/setup.md` — dashboard-first banner
- `docs/architecture.md` — note that Slack-seeding sections are stale
- `docs/slack-setup.md` — experimental banner; Slack no longer primary

**Commits / PRs:**
- Branch `feature/onboarding-refactor-phase-1`, commit + PR — see `gh pr list`

**Decisions made this session:**
- Discovered `docs/plans/` is gitignored — plan + session log live on disk only. Intentional across all prior plans. Team members share plans out-of-band.

**Surprises / learnings:** none material.

**Next action:**
Phase 2. New branch `feature/onboarding-refactor-phase-2`. In `src/launcher/rouge-cli.js`:
1. Add `--experimental` warning banner printed at the top of these verbs: `seed`, `init`, `build`, `slack start`. Text: "⚠️ This command is still supported but no longer the recommended path. The dashboard is now the primary control surface."
2. Reorganize `rouge --help` into two sections: **Setup** (`setup`, `doctor`, `status`, `stop`, `start`, `uninstall`) and **Advanced** (everything else). Note: `status`/`stop`/`start`/`uninstall` don't exist yet — they arrive in Phase 2.5. For Phase 2, only reorganize what exists; leave a TODO marker for the new verbs.
3. No behavior change beyond the warnings.

**Open questions / blockers:** none.
