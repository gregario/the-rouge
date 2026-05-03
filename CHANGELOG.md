# Changelog

All notable changes to Rouge ship here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[SemVer](https://semver.org/).

## [Unreleased]

## [0.4.0] — 2026-05-03

The architecture release. The "horse built by committee" got reorganised: facade
owns AI dispatch + state writes, integration catalogue is the single source of
truth, boundary CI gate enforces it, evaluation gained closed-vocabulary
confidence + structured evidence + a calibration gate, and the prompts went
through a full Opus 4.7 modernisation. 247 commits since 0.3.1.

### Added

#### Grand unified reconciliation — Phases 0–7

- **Four boundary docs** (`docs/design/`): self-improve-boundary (GC.1, judge vs
  pipeline), mcp-vs-cli-boundary (GC.2, read via MCP / mutate via CLI),
  determination-vs-judgment (GC.3, deterministic JS routes / AI decides
  content), entry-vs-core (GC.4 wide, facade owns state writes + AI dispatch +
  events).
- **`src/launcher/catalogue.js`** — `loadCatalogue()` returns the unified view
  across `library/integrations/tier-2/*.yaml`, the directory-shaped
  `<slug>/manifest.json` deploy targets, and `library/integrations/mcp-configs/*.json`,
  with each MCP folded into its parent tier-2 entry. Six new tier-2 yamls for
  MCP-only services (cloudflare-workers, github, playwright, exa, firecrawl,
  context7).
- **`src/launcher/yaml-parser.js`** — extracted hand-rolled flat-yaml parser
  shared across `catalogue.js`, the tier-2 schema test, and the tier-3 schema
  test.
- **`src/launcher/facade.js`** + `facade/lock.js` + `facade/events.js` +
  `facade/dispatch/{subprocess,sdk,mcp-config}.js` — single entry point for
  state mutation, AI dispatch, event emission. Per-transaction lock with
  slow-mutator guard (FORK E). Append-only `.rouge/events.jsonl` event log.
  `mcp-config` builder generates per-spawn `--mcp-config` args from the
  catalogue's `wire_into_phases` field.
- **Typed contract surface** (`dashboard/src/types/facade.d.ts` +
  `bridge/facade.ts`) gives the dashboard compile-time drift detection against
  the launcher's facade. `scripts/gen-facade-types.mjs` snapshots the
  JSDoc-derived shape; `npm run check:facade-types` is wired into the docs CI
  job to fail on drift.
- **GC.2 prompt-content tests** (`test/prompts/gc2-mcp-vs-cli-boundary.test.js`)
  scan every prompt for `\bMCP\b` near mutating verbs and fail on any
  pairing. Foundation, building, and ship-promote prompts gained the
  external-system policy paragraph.
- **Architecture invariant CI gate** (`test/launcher/gc-boundaries.test.js` +
  `npm run test:boundaries[:enforce]`). Greps for direct AI dispatch and
  direct state writes outside the facade, with FORK D warn-then-enforce
  behaviour gated on `ROUGE_BOUNDARY_ENFORCE=true`.

#### Evaluation, calibration, and quality

- **P1.14** — Rouge-native product-quality rubric replaces the borrowed shape.
  Six dimensions, named anchors, FAIL criterion per dimension, applies
  consistently to the milestone-check + final-review judges.
- **P1.15** — closed-vocabulary confidence tags (high / medium / low /
  insufficient-evidence) on every finding.
- **P1.16** — quote-before-score discipline in 02c code-review and 02e
  evaluation; reviewers must cite the specific lines they're judging.
- **P1.16b** — structured evidence references (`evidence_ref` with
  `path/start_line/end_line/quote`) replace fuzzy quote matching. Quote-match
  validator enforces the contract.
- **P1.18 / P1.18b** — gold-set + Cohen's Kappa calibration infrastructure
  (`rouge eval-calibrate`, `rouge eval-seed-gold`). Synthetic gold-set lets
  the calibrator run without owner labelling labour.
- **P1.20** — `unknown` verdict escape hatch in 02e so judges can defer rather
  than guess on missing-evidence cases.
- **P1.21** — capability-check gate. Six-signal screen runs at the
  pre-analyzer step; surfaces "Claude can't do this in this codebase" before
  the loop spends another fix cycle. Wired through the launcher with
  `capability_check.{enabled,*}` config.

#### Sizing — adaptive depth dial (P1.5R)

- **SIZING sub-phase** between TASTE and SPEC, classifies XS / S / M / L / XL
  from BRAINSTORM signals, writes `seed_spec/sizing.json`.
- **Tier-aware orchestrator** — seeding skips disciplines that don't apply at
  the project's tier; SPEC + design depth scale with size.
- **Tier-based budget defaults** — `state.budget_cap_usd` falls back to a
  per-tier default if the user hasn't set a per-project cap.
- `rouge size-project` CLI runs the classifier standalone.

#### Prompts — Opus 4.7 modernisation (P1.19)

- All 26 loop + seeding prompts modernised for Opus 4.7: shouty caps softened
  (CRITICAL/MUST/Do NOT) where they were emphasis-only, preserved on
  incident-tied safety blocks (ISOLATION RULES, "that is fraud", capability
  avoidance, praise-session three-pass verification, Pivot is a human
  decision). Per-prompt behavioural-contract tests assert the
  preserved-by-design content stayed.

#### Catalogue — P4.1 waves 1–7

- Tier-2 grew from 4 entries to 38: stripe, supabase, sentry, counterscale,
  neon, clerk, workos, turso, convex, upstash, inngest, resend, sendgrid,
  aws-s3, cloudflare-r2, cloudflare-pages, cloudflare-workers, cloudinary, mux,
  posthog, plausible, pusher, liveblocks, twilio, slack, openai, anthropic,
  replicate, stripe-connect, vercel, vercel-blob, vercel-edge-config, github,
  playwright, exa, firecrawl, context7, authjs.
- Tier-3 patterns grew from 5 to 24, all cross-referenced against vendor docs
  (2026-04 sweep).

#### Self-heal + triage subsystem

- Four-wave subsystem (#201): self-heal zones, triage classifier, structured
  retro proposals, post-retrospective hook integration. Stuck phases trigger
  triage → self-heal automatically before falling through to the escalation
  path.

#### Seeding daemon architecture

- Detached `seed-daemon` replaces inline `claude -p` orchestration in seeding
  (#194–#198). Daemon-crash escalation, per-discipline stall threshold,
  per-discipline recovery prompts. `rouge seed` CLI rewritten to route through
  the daemon. Send-while-busy guard.

#### Dashboard

- **Build-view trust sweep** (#185–#188): single source of truth, validators,
  dead fields removed, escalation status carried through the mapper.
- **Story-scoped live feed** inside active story cards.
- **Escalation hand-off**: dashboard primes a Claude Code session for the
  human; resume captures commits and writes them as `human_resolution` context.
- **`POST /api/feasibility`** wraps `src/launcher/feasibility.js`'s `assess()`
  for HTTP callers. The React UI for feasibility is dogfood-driven follow-up.
- **Phase 5b shared lock**: `dashboard/src/bridge/state-lock.ts` delegates to
  `src/launcher/facade/lock.js`. Single lock implementation for launcher +
  dashboard.

#### Profile-aware preamble + curated MCP fleet

- **Product-shape profiles** (`profiles/*.json`) declare which rules / agents /
  MCPs / skills apply per profile. The preamble injector reads the active
  profile and scopes the context Claude sees.
- **MCP fleet** under `library/integrations/mcp-configs/` (moved from
  `./mcp-configs/`). Each manifest has `read_only_recommended` (required),
  `wire_into_phases`, `env_required`. Fleet-smoke checker added.

#### Other features

- **`rouge contribute`** — community contribution flow for new integration
  patterns; opens a draft PR.
- **`rouge improve`** — self-improvement loop driver (gated by
  `rouge.config.json` `self_improvement.allowlist`/`blocklist`).
- **`rouge harness probe`** — debug tool for the SDK harness adapter (P5.9
  PoC: cache_control + structured output via `messages.create`).

### Changed

- **Slack is now notification-only by default** (Fork B). The `writeState`
  helper in `src/slack/bot.js` skips writes and logs a deprecation warning;
  set `ROUGE_SLACK_ALLOW_WRITES=1` to opt back in for the migration window.
  Operators can audit attempted writes via `slack-write-attempted` events in
  `.rouge/events.jsonl`. Full handler-body deletion is a follow-up once
  dogfood confirms nobody depends on the opt-out.
- **Spawn orchestration lifted into the facade**. The 250-line spawn block in
  `rouge-loop.js` (heartbeat, stream-json parsing, rate-limit detection,
  three-signal watchdog) moved to
  `src/launcher/facade/dispatch/subprocess.js`'s `runPhaseSubprocess()`. The
  loop's `runPhase()` is now a normal async function reading top-to-bottom.
- **`INTEGRATION_KEYS` is now derived from the catalogue** + a small
  per-service override map (`INTEGRATION_KEYS_OVERRIDES` in `secrets.js`).
  New catalogue entries auto-surface to `rouge setup` without code edits.
- **`mcp-health-check.js` reads from the catalogue** instead of walking
  `./mcp-configs/` directly. Legacy `opts.root` fallback preserved for unit
  tests that stage tempdir manifests.
- **`mcp-configs/` moved to `library/integrations/mcp-configs/`** — the
  integration catalogue now lives under one root. `validate-mcp-configs.js`,
  `profile-loader.js`, and `doctor.js` updated; `read_only_recommended`
  required field added to every manifest.
- **All loop state writes go through `facade.writeState`** via the
  `commitState` helper in `rouge-loop.js`. 45 callsites migrated. Lock
  acquired per-transaction, never per-orchestration.
- **All four AI dispatch sites** (`rouge-loop.js`, `harness/sdk-adapter.js`,
  `self-improve.js`, `dashboard/src/bridge/claude-runner.ts`) emit
  `phase.start` / `phase.end` facade events around the spawn. The audit
  boundary is observable from a single channel.
- **Coverage gate enabled** (P5.1). `npm run coverage` blocks below per-file
  baselines defined in `.c8rc.json`.
- **Default seeding flow is daemon-only.** The pre-seed-loop inline `claude
  -p` path is gone; `rouge seed` enqueues to `seed-queue.jsonl` and tails the
  daemon-managed chat.

### Deprecated

- **Slack as a write surface.** See above; opt back in via
  `ROUGE_SLACK_ALLOW_WRITES=1`.
- **Direct state-file writes outside the facade.** GC.4 grep tests warn on
  any `writeFileSync(...state.json)` outside the allowlist; flip to
  enforcement via `ROUGE_BOUNDARY_ENFORCE=true` after a release of warn
  signal.
- **V2 design docs** (`state-machine-v2-transitions.md`, `state-schema-v2.md`,
  `v2-process-map.md`) gained deprecation banners pointing at V3 successors.
  Content preserved for historical reference.

### Fixed

- **Foundation isolation incident (#103)** — Layers 1–3 plus Layer 4 Phase 1
  prevent the mtgordle-class incident. Six prompt-level isolation rules name
  the original incident as the lesson; provider commands route through
  `INFRA_ACTION_HANDLERS` (`deploy-staging`, `deploy-production`,
  `db-migrate`, `git-push`, `git-tag`); spawn passes `cwd: projectDir` and
  scoped `--add-dir`; `--disallowedTools` denies provider CLIs at the spawn
  boundary. Layer 4 Phase 2/3 (drop `--dangerously-skip-permissions`,
  `--allowedTools` whitelist, rate limiting) tracked in #210.
- **Docker-compose + non-Cloudflare deploy targets wired end-to-end** (#190).
- **State-watcher events flow across atomic renames on macOS** (#192). Prior
  bug caused dashboard updates to stop after the launcher's first atomic
  rename of `state.json`.
- **CI was chronically red on main.** Three independent issues:
  - `tests/secrets.test.js` died on `secret-tool` not being installed on
    GitHub Actions ubuntu runners — now skips cleanly on Linux without
    libsecret.
  - `tests/schema-assignments.test.js` required `acorn` but it was never in
    `package.json` — added as a devDep.
  - `test/launcher/allowed-tools-behavior.test.js` ran the empirical
    `claude -p` checks in CI without claude installed — now auto-skips when
    `claude --version` probes fail.
- **State drift during phase runs**: `facade.writeState` validates against
  the v3 schema before commit; bad writes halt rather than compound across
  cycles.

### Security

- `--disallowedTools` now denies provider CLIs (vercel/supabase/wrangler/
  flyctl/aws/gcloud/heroku), `git push`, `rm -rf *`, `curl`, `wget` at every
  spawn site. Empirical baseline confirmed `--disallowedTools` is enforced
  even with `--dangerously-skip-permissions` set.
- The `read_only_recommended` field on every MCP manifest documents that
  MCPs are for inspection paths, not mutation paths (per GC.2).
- Self-improve pipeline can edit only generation/operational prompts;
  judge/instrument files (rubrics, schemas, gold-sets, heuristics,
  `library/global/`) are blocklisted in `rouge.config.json` and pre-write-hook
  enforced. The boundary tests assert the allowlist patterns reach real
  files and that no path is in both lists.

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
