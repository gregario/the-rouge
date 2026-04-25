# CLI vs Dashboard Surfaces

**Status:** living document. Updated 2026-04-25 as Phase 10 of the grand unified reconciliation closeout.

This doc records the deliberate split between commands that have a dashboard equivalent and commands that stay CLI-only. Per Fork A (hybrid), Rouge keeps both surfaces; per Phase 10's deferred-by-default rule, dashboard equivalents are added only when the GUI affordance is obviously valuable, not as a checklist sweep.

## Both surfaces

Commands that have a UX in both the dashboard AND the CLI. The dashboard is the canonical onboarding; the CLI is the automation surface.

| Command | Dashboard route | Why it has both |
|---|---|---|
| `rouge init <name>` | `New Project` button + `POST /api/projects` | Project creation is core flow; both surfaces matter for new users vs. scripted setup. |
| `rouge seed <name> "<msg>"` | Seeding chat panel | Interactive seeding is the primary use case; CLI exists for re-seed automation. |
| `rouge build [name]` | `Start Build` button + `POST /api/projects/[name]/start-build` | Triggering the loop is the most-used action in both. |
| `rouge status` | Project list + per-project detail | Primary "what's happening" surface for the GUI. |
| `rouge cost` | Per-project cost card | Always visible in the dashboard; CLI useful for quick check or scripts. |
| `rouge dashboard start/stop` | Self-referential — controls the dashboard daemon | CLI by definition (you can't start the dashboard from itself). |
| `rouge resume-escalation <slug>` | `Resolve Escalation` panel | Both: dashboard owns the common case; CLI hand-off mode primes a Claude Code session. |
| `rouge setup <integration>` | `Integrations` settings panel | Setup wizard fits both surfaces. |
| `rouge slack start/test` | `Slack` settings panel | Slack notifications are operator-facing — surface in both. |

**New in this PR:** `rouge feasibility "<description>"` now has a dashboard API counterpart at `POST /api/feasibility`. The React UI for it is dogfood-driven follow-up; the API is the foundation so when the UI lands it's a small addition, not a backend redesign.

## CLI-only by design

Commands where a dashboard equivalent would be theatre — niche developer tools, CI/release tooling, or one-shot internal commands. Documenting the rationale here so future cleanups know not to add a UI just because the inventory said so.

| Command | Why CLI-only |
|---|---|
| `rouge contribute <path>` | Niche developer command: opens a draft PR for a community-contributed integration pattern. Used by ~one human per quarter. UI overhead exceeds value. |
| `rouge improve [--max-iterations N]` | Internal Rouge management — runs the self-improvement loop against open issues. Operator-only; dashboard surface would be confusing for end users. |
| `rouge eval-calibrate` | CI/release tooling — gates the gold-set calibration on quadratic-weighted Kappa. Run from CI workflow, not by humans. |
| `rouge eval-seed-gold` | CI/release tooling — regenerates the synthetic gold set. Same audience as eval-calibrate. |
| `rouge size-project` | SIZING sub-phase driver — invoked programmatically by the seeding orchestrator, not by humans. |
| `rouge harness probe` | Test/debug tool for the SDK harness adapter. Used by Rouge developers, not end users. |
| `rouge secrets list` | Trivially supplanted by the dashboard `Integrations` panel which shows the same data. CLI kept for terminal users. |
| `rouge secrets check <project>` | One-shot diagnostic — operator runs it, reads output, moves on. UI affordance unnecessary. |
| `rouge secrets validate <integration>` | CI/CD hook — validates the keychain entries match the catalogue. Not an interactive flow. |
| `rouge secrets expiry [list/set]` | Operator housekeeping — surfaces secrets with expiry windows. Could be added to the dashboard if dogfood signal asks; not obviously valuable today. |
| `rouge doctor` | Operator diagnostic — full system health check including catalogue + MCP + auth. Run on demand from terminal. |
| `rouge feasibility` | CLI persists; the new `POST /api/feasibility` route is the dashboard counterpart for when the UI is built. |

## Adding a dashboard equivalent later

When dogfood signal proves a CLI-only command actually wants a dashboard surface:

1. Add the API route under `dashboard/src/app/api/<command>/route.ts`.
2. Use `assertLoopback()` for guard, `sanitizedErrorResponse()` for errors.
3. Wrap the existing `src/launcher/<module>.js` export rather than reimplementing logic.
4. Add a unit test under `dashboard/src/app/api/__tests__/`.
5. Move the entry from `CLI-only by design` to `Both surfaces` in this doc with the new route + rationale.
6. Commit the React component for the actual UI in a separate PR — the API is reusable; the UI is taste-driven.

The point of keeping both surfaces is automation parity — anything you can do in the dashboard, you can script. Anything you can script, you can also point a human at if it makes sense. The split above is the working answer to "which side should this live on?" not a permanent fence.
