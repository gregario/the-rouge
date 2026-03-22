## 0a. Prerequisite — Rouge Phase Prompt Authoring

### Context

Rouge runs as a Karpathy Loop. Each phase is a short-lived `claude -p` invocation. The LAUNCHER (rouge-loop.sh) controls phase sequencing via state.json. Each phase prompt is a self-contained document that:
- Reads all context from cycle_context.json
- Does its work (build, evaluate, analyze, etc.)
- Writes results back to cycle_context.json
- NEVER invokes external slash commands (/qa, /ship, /review, etc.) — prevents prompt override
- NEVER decides what phase comes next — the launcher reads state.json for that
- CAN call CLI tools directly ($B browse commands, openspec CLI, sentry-cli, wrangler, etc.)

Skill timing categories:
- **Seed-once**: Run during project seeding (interactive via Slack relay)
- **Every-loop**: Run in each Karpathy Loop iteration (autonomous via `claude -p`)
- **Final-gate**: Run once before first production deploy (autonomous)

Cross-cutting patterns baked into ALL phase prompts:
- **Boil the Lake**: Always recommend complete implementation. Dual time estimates (human-team vs CC).
- **Latent space activation**: Anchor reasoning in named thinker frameworks. "Internalize, don't enumerate."
- **Autonomous decision-logging**: All decisions logged to cycle_context.json with reasoning and confidence.
- **Escalation rules**: 3+ failures on same issue → abort phase, transition to waiting-for-human.

### Research (COMPLETE)

- [x] 0a.1 Full skill audit across 4 ecosystems (44 skills) — see `docs/research/2026-03-18-skill-audit-0a1.md`
- [x] 0a.1b Cross-validation of audit against architecture and specs — see `docs/research/2026-03-18-skill-architecture-crossval.md`

Key finding: External skills are REFERENCE MATERIAL, not things we modify or invoke. Rouge gets its own phase prompts that absorb concepts inline.

### Shared infrastructure (author first — other prompts depend on these)

- [x] 0a.2 Author `autonomous-mode` partial — defines cycle_context.json schema (all fields), decision-logging format, escalation rules, retry counting, BLOCKED state transition. Every phase prompt includes this.
- [x] 0a.3 Author `latent-space-activation` partial — domain-specific thinker sets (product: Bezos/Chesky/Graham/Altman; engineering: Larson/McKinley/Brooks/Beck/Majors; design: Rams/Norman/Zhuo/Gebbia/Ive; security: OWASP/Schneier). Included in relevant phase prompts.
- [x] 0a.4 Author `rouge-diff-scope` utility — categorizes branch changes (frontend/backend/prompts/tests/docs/config). Runner uses this to select which evaluation sub-phases to invoke.
- [x] 0a.5 Author `review-readiness-dashboard` state tracker — JSON log of which gates have passed per branch/loop. Runner reads this to determine next phase and final-gate reads it for the checklist.

### Seeding phase prompts (interactive via Slack relay)

- [x] 0a.6 Author SEEDING SWARM ORCHESTRATOR prompt — manages 5 disciplines (brainstorming, competition, taste, spec, design) in non-linear swarm. Loop-back detection, convergence detection, human approval flow. Routes interactive questions through Slack relay (not AskUserQuestion). Absorbs: premise challenge and dream state mapping from GStack CEO review, SELECTIVE EXPANSION mode.
- [x] 0a.7 Author SEEDING: BRAINSTORMING discipline prompt — depth-first exploration without YAGNI. Absorbs: brainstorming skill's design decomposition + spec review loop, but removes depth-fighting constraints. Applies latent space activation (product thinkers).
- [x] 0a.8 Author SEEDING: COMPETITION discipline prompt — market landscape + competitive design intelligence. Absorbs: competition-review search strategy + gap analysis, GStack design-consultation's live-site browsing pattern. Uses $B browse for screenshots.
- [x] 0a.9 Author SEEDING: TASTE discipline prompt — multi-invocation product challenge. Absorbs: product-taste premise challenge framework, mode selection (expansion/hold/reduction), graveyard off-ramp. Callable multiple times as other disciplines challenge it. Applies latent space activation (Chesky 10-star, Graham DTDS).
- [x] 0a.10 Author SEEDING: SPEC discipline prompt — production-depth spec generation. Overrides OpenSpec's "concise 1-2 pages" instruction with: edge cases per journey, data model sketches, error recovery paths, interaction patterns, security considerations, acceptance criteria testable by evaluator. Calls `openspec` CLI directly for artifact management.
- [x] 0a.11 Author SEEDING: DESIGN discipline prompt — structured artifacts parseable by evaluator. Absorbs: GStack plan-design-review 0-10 scoring, 80-item design checklist, AI slop detection. Produces YAML/JSON vision docs, component mappings, PO-checkable outputs. Applies latent space activation (Rams, Norman, Zhuo, Gebbia, Ive).
- [x] 0a.12 Author SEEDING: LEGAL/PRIVACY discipline prompt — seed-once. GC input review (trademark, IP, OSS license, regulated domains, data obligations). Generates T&Cs, privacy policy, cookie policy. Absorbs: nothing external (new capability).
- [x] 0a.13 Author SEEDING: MARKETING discipline prompt — seed-once. Landing page copy + scaffold. Absorbs: marketing-copy skill's platform conventions and writing rules.

### Building phase prompt (autonomous)

- [x] 0a.14 Author BUILDING phase prompt — reads cycle_context.json (vision, active spec, quality gaps from previous evaluations). Implements using TDD + subagent-driven development methodology INLINE (not by invoking superpowers skills). Deploys to STAGING only. Creates `rouge/loop-{N}-{feature-area}` branch. Checks Supabase slot availability. Absorbs: SDD implementer/reviewer patterns, TDD red-green-refactor, systematic debugging methodology, verification-before-completion discipline. Deterministic git behavior (no finishing-a-development-branch menu).

### Evaluation phase prompts (autonomous)

- [x] 0a.15 Author EVALUATION ORCHESTRATOR prompt — three sub-phases in sequence: Test Integrity (Phase 0) → QA Gate (Phase 1) → PO Review (Phase 2). Routes failures correctly: test/QA failures → qa-fixing state (bugs), PO Review failures → analyzing state (quality gaps as new specs). Reads diff-scope to select which sub-checks to run.
- [x] 0a.16 Author TEST INTEGRITY (Phase 0) prompt — test-to-spec traceability, coverage gap detection, orphaned/stale test detection, test regeneration. 100% spec coverage required before QA proceeds. Entirely spec-defined (evaluator spec tasks 6.1-6.12), no external skill to absorb.
- [x] 0a.17 Author QA GATE (Phase 1) prompt — spec criteria extraction, browser-based testing (uses $B commands directly), functional correctness checks, Lighthouse baseline, code quality baseline (ESLint, jscpd, madge, c8, knip). Absorbs: GStack QA health scoring methodology, 8-category system, diff-aware scoping, WTF-likelihood self-regulation heuristic. Also includes inline: AI code audit (7-dimension, from PR #564), security review (OWASP 5-category, from PR #560), a11y review (WCAG). Outputs structured QA report per evaluator spec schema (NOT GStack's schema).
- [x] 0a.18 Author PO REVIEW (Phase 2) prompt — journey quality (walk-through as first-time user, per-step clarity/feedback/efficiency/delight), screen quality (hierarchy, layout, consistency, density, empty states, mobile), interaction quality (hover, click, loading, success, transitions). Library heuristic evaluation. Pairwise reference comparison. Absorbs: GStack design-review 80-item checklist, AI slop detection, 0-10 rating methodology. Outputs quality gaps (NOT fixes) categorized per evaluator spec. Confidence score per spec formula (journey 30%, screen 20%, heuristic 20%, spec 15%, reference 15%).

### QA-Fixing phase prompt (autonomous)

- [x] 0a.19 Author QA-FIXING phase prompt — receives bug fix brief from runner (QA failures in cycle_context.json). Narrow-scope building: fix specific bugs using TDD + debugging methodology inline. Re-deploys to staging. Tracks retry count — 3 attempts on same criteria → escalate to waiting-for-human. Absorbs: systematic-debugging hypothesis-driven approach, auto regression test generation from GStack QA.

### Analysis & spec generation phase prompts (autonomous)

- [x] 0a.20 Author ANALYZING phase prompt — reads PO Review report + root cause analysis from cycle_context.json. Executes recommended action logic (continue/deepen/broaden/notify-human). Generates quality improvement specs as NEW change specs (not patches) — these go through full pipeline. Classifies root cause: spec ambiguity vs design choice vs missing context. Runner-native logic, no external skill to absorb.
- [x] 0a.21 Author CHANGE-SPEC GENERATION prompt — translates PO Review quality gaps into OpenSpec-compatible change specs. Calls `openspec` CLI directly. Specs include requires_design_mode=true, gap evidence, what_good_looks_like from Library, root cause classification. Absorbs: OpenSpec depth overrides from seeding spec discipline (0a.10).

### Vision & ship phase prompts (autonomous)

- [x] 0a.22 Author VISION CHECK prompt — re-reads vision document, reviews all completed work, LLM judgment on alignment. Autonomous scope expansion (>80% confidence), flag (70-80%), escalate (<70%). Pivot detection. Confidence trend tracking. Entirely spec-defined (runner spec tasks 16.1-16.5), no external skill to absorb.
- [x] 0a.23 Author SHIP/PROMOTE prompt — staging-to-production promotion when QA PASS + PO Review PRODUCTION_READY (or NEEDS_IMPROVEMENT with confidence ≥0.8). Merge PR, production deployment. Rollback: close PR, revert staging, preserve learnings. Absorbs: changelog generation pattern and bisectable commit splitting from GStack ship. Version bump logic configurable per project in cycle_context.json.
- [x] 0a.24 Author DOCUMENT-RELEASE prompt — post-ship documentation sync. Absorbs: GStack document-release per-file audit heuristics, CHANGELOG voice polish, cross-doc consistency check. Auto-applies factual updates, logs subjective changes to cycle_context.json.
- [x] 0a.25 Author CYCLE RETROSPECTIVE prompt — post-loop analysis. Absorbs: GStack retro commit-type breakdown, session detection, hotspot analysis, test health metrics. Outputs JSON metrics to cycle_context.json for journey.json and trend tracking. Strips team awareness (Rouge is solo).

### Final gate prompt (autonomous, pre-first-production-deploy)

- [x] 0a.26 Author FINAL VALIDATION GATE prompt — pre-production checklist. Reads review-readiness-dashboard to verify all gates passed. Checks: all tests pass + coverage threshold, security audit clean, privacy review complete, legal docs generated, error monitoring configured (Sentry), analytics configured (Counterscale), Lighthouse baseline met, SEO basics (meta/sitemap/robots.txt), domain+SSL configured, production env vars set, marketing page live, README current, a11y baseline met.

### Templates (infrastructure scaffolding for new projects)

- [x] 0a.27 Add error monitoring to web-product template — Sentry free tier, @sentry/cloudflare SDK, sentry-cli for project creation + DSN retrieval. $0/month.
- [x] 0a.28 Add analytics to web-product template — Counterscale on CF Workers + CF Web Analytics. Single `wrangler deploy`. $0/month.
- [x] 0a.29 Add marketing landing page scaffold to web-product template — hero, features, pricing, CTA, social proof sections.

### Verification

- [ ] 0a.30 Verify each phase prompt works individually via `claude -p` with mock cycle_context.json — test that it reads context, does its work, writes results back, and does NOT invoke external slash commands or decide the next phase.

### Backlog (not task 0a — fundamentally different loops needing separate design)

- [ ] BACKLOG: MCP testing loop — wrap `/mcp-qa` into Rouge-compatible evaluation phase for MCP server products
- [ ] BACKLOG: Godot testing loop — wrap GUT into Rouge-compatible evaluation phase for Godot game products

## 0b. Prerequisite — Deployment Infrastructure Battle-Testing

- [x] 0b.1 Test new project deployment end-to-end — Workers + Static Assets path works. See `docs/research/2026-03-18-0b-cloudflare-findings.md`
- [x] 0b.2 Automate Supabase project creation — CLI fully non-interactive. Pause/restore via Management API. See `docs/research/2026-03-18-0b-supabase-findings.md`
- [x] 0b.3 Automate Cloudflare setup — Workers auto-create on first deploy. No dashboard needed. See cloudflare findings
- [ ] 0b.4 Automate local Docker deployment as fallback — deferred (not needed for V1, all cloud tools work)
- [x] 0b.5 Test staging → production promotion flow — `wrangler deploy --env staging` then `wrangler deploy`. Same build, cached assets
- [x] 0b.6 Test rollback flow — `wrangler versions deploy <id>@100%` instant rollback, production unaffected
- [x] 0b.7 Test Lighthouse against deployed staging — headless Chrome, JSON output, 96/100/100/100 baseline. See `docs/research/2026-03-18-0b-lighthouse-findings.md`
- [x] 0b.8 Test browser QA against deployed staging — GStack browse works, 370ms total. See `docs/research/2026-03-18-0b-browse-findings.md`
- [x] 0b.9 Document and fix every failure found during battle-testing — master report at `docs/research/2026-03-18-0b-battle-test-report.md`, stack docs + phase prompts updated
- [x] 0b.10 Verify Cloudflare Workers with Static Assets deployment flow — confirmed working, Pages returns 404. See cloudflare findings
- [x] 0b.11 Verify Supabase pause/unpause via Management API — pause→INACTIVE (30-60s), restore→ACTIVE_HEALTHY (60-120s), data preserved. See supabase findings
- [x] 0b.12 Verify Stripe CLI test mode flow — product creation, price creation, event triggers all work. Sandbox only. Key expires 2026-06-16. See `docs/research/2026-03-18-0b-stripe-findings.md`

## 0c. Prerequisite — Launcher & Communication Infrastructure

- [x] 0c.1 Implement `rouge-loop.sh` — bash launcher script (~50 lines). Read state.json for each project dir, skip waiting/complete, spawn `claude -p` with phase-specific prompt, handle errors and rate limits, loop forever
- [x] 0c.2 Implement model selection in launcher — map each state to opus or sonnet model, pass `--model` flag to `claude -p`
- [x] 0c.3 Implement multi-project directory scanning — launcher discovers projects by scanning for `state.json` in `projects/*/`
- [x] 0c.4 Implement error handling — log failures, retry up to 3 times, transition to waiting-for-human on persistent failure, notify via Slack webhook
- [x] 0c.5 Implement rate limit detection — detect Claude Code rate limit responses, back off exponentially, resume when limit resets
- [x] 0c.6 Create Slack App — set up app at api.slack.com, enable Socket Mode, create App-Level Token (`connections:write`), add Bot Token Scopes (`chat:write`, `channels:history`, `app_mentions:read`, `channels:read`), install to workspace
- [x] 0c.7 Implement Slack bot listener (~50 lines Bolt.js) — Socket Mode WebSocket, listen for app_mention events, parse feedback, write to `projects/<name>/feedback.json`
- [x] 0c.8 Implement Slack webhook sending — store webhook URL in env var, helper function to send Block Kit JSON via curl
- [x] 0c.9 Implement feedback queue detection in launcher — check for `feedback.json` in each project dir, if found and project is waiting-for-human, transition state and pass feedback to next phase
- [x] 0c.10 Implement Supabase slot management — track active projects, check count before provisioning, pause least-recently-active when at limit, log swaps
- [x] 0c.11 Implement morning briefing cron — cron job that writes `trigger-briefing.json`, launcher detects and runs briefing phase
- [x] 0c.12 Test launcher end-to-end — start launcher, verify it picks up a seeded project, runs phases, transitions states, handles errors
- [x] 0c.13 Implement Slack command parser — detect "rouge start/pause/resume/status/new/seed" patterns from incoming Slack messages, route to appropriate handler
- [x] 0c.14 Implement "rouge start" command — verify project exists and is in `ready` state, check Supabase slot availability if needed, transition state.json to `building`, confirm via Slack
- [x] 0c.15 Implement "rouge pause" command — transition any active project to `waiting-for-human`, store `paused_from_state` in state.json, confirm via Slack
- [x] 0c.16 Implement "rouge resume" command — transition paused project back to `paused_from_state`, confirm via Slack
- [x] 0c.17 Implement "rouge status" command — read all project state.json files, format summary (active/ready/paused/complete), send as Block Kit message
- [x] 0c.18 Implement "rouge new" command — create project directory with scaffolding, start interactive seeding session via Slack relay
- [x] 0c.19 Implement Slack-to-Claude seeding relay — spawn Claude Code seeding session, relay messages bidirectionally between Slack and Claude Code, handle conversation flow
- [x] 0c.20 Implement seeding conversation timeout — save seeding state to seeding-state.json after 2 hours of inactivity, notify user, support resume via "rouge seed {name}"
- [x] 0c.21 Implement seeding completion handler — on seed approval via Slack, write artifacts to project directory, set state.json to `ready` (not `building`), notify user with start instructions
- [x] 0c.22 Test Slack control plane end-to-end — rouge new → seeding conversation → rouge start → verify launcher picks up → rouge pause → rouge resume → rouge status

## 1. Project Foundation & State Management

- [x] 1.1 Define and implement `state.json` schema — current_state, cycle_number, feature_areas (with status), current_feature_area, last_evaluation, change_specs_pending, vision_check_results, confidence_history, timestamp
- [x] 1.2 Implement state persistence module — write state after every state transition, atomic writes to prevent corruption
- [x] 1.3 Implement crash recovery logic — read state.json on startup, determine resume action per state (building: check for deploy artifacts; evaluating: restart; analyzing: re-run from last report; waiting-for-human: check Slack)
- [x] 1.4 Define vision document schema (YAML/JSON) — name, one_liner, persona, problem, emotional_north_star, reference_products (with dimensions and URLs), feature_areas (with user_journeys and acceptance_criteria), product_standard (overrides, additions, reference_screenshots)
- [x] 1.5 Implement vision document parser — extract acceptance criteria as testable assertions, user journeys as simulatable flows, reference product dimensions, product standard overrides
- [x] 1.6 Define product standard schema — inherits (global + domain), overrides (heuristic ID + modified threshold + justification), additions (project-specific heuristics in Library entry format), definition_of_done (plain English + heuristic count references)

## 2. The Library — Storage & Data Model

- [x] 2.1 Design and implement Library storage format — file-based, one file per heuristic entry, directory structure: `library/global/`, `library/domain/{web,game,artifact}/`, `library/personal/`, `library/history/`
- [x] 2.2 Implement heuristic entry schema — id, name, rule, measurement (with type: dom-analysis | screenshot-llm | lighthouse-metric | interaction-test | journey-test | api-test), threshold, type (functional | non-functional), tier (global | domain | personal), domain, source, version, status, deprecated_reason
- [x] 2.3 Implement Library read API — query by tier, domain, status; return all active heuristics for a given evaluation context (global + relevant domain + personal fingerprint)
- [x] 2.4 Implement Library write API — add new entry, update entry (increment version, preserve history), deprecate entry (set status, record reason), prune deprecated entries older than N months
- [x] 2.5 Implement version history — every update creates a history entry with old value, new value, reason, date; stored in `library/history/`
- [x] 2.6 Implement conflict detection — when adding/updating entries, check for conflicting active entries; flag conflicts for human resolution in next briefing

## 3. The Library — Day-One Seed

- [x] 3.1 Seed product standards (functional): hierarchy-primary (DOM analysis, primary score ≥1.5x secondary), hierarchy-levels (3 visual weight tiers), three-click-rule (journey simulation ≤3 clicks), five-state-coverage (5 states per interactive screen), progressive-disclosure (≤7 primary actions visible), user-journey-completeness (100% journeys complete), error-recovery (100% error states have recovery path)
- [x] 3.2 Seed design standards (functional): visual-consistency (≤2 font families, ≤5 sizes, ≤8 colors), interactive-feedback (100% elements respond to hover/click), animation-state-transitions (≥80% transitions animated), mobile-responsive (usable at 375px+, ≥44px tap targets), empty-state-guidance (100% empty states have CTA)
- [x] 3.3 Seed engineering standards (non-functional): page-load-time (LCP <2000ms), time-to-interactive (TTI <3000ms), lighthouse-performance (score ≥80), lighthouse-accessibility (score ≥90), no-console-errors (0 errors), api-response-time (p95 <500ms reads, <1000ms writes)
- [x] 3.4 Seed web domain heuristics: nav-persistent (nav visible on every route), above-fold-value (primary element ≥50% visible at 1440×900), form-validation-inline (100% inline), breadcrumb-depth (breadcrumbs at ≥3 levels deep)
- [x] 3.5 Verify all seeded heuristics have valid measurement methods and thresholds by running them against a known-good reference product (Stripe dashboard or similar)

## 4. The Library — PO Check Templates

- [x] 4.1 Implement check template schema — id, dimension, applies_to, given (parameterized), when (parameterized), then (with measurement), measurement_method, default_threshold, parameters list
- [x] 4.2 Seed feedback dimension templates: visual-response (200ms screenshot-diff), loading-indicator (500ms threshold, intercept network), success-confirmation (1s contextual check), error-specificity (LLM judgment on message specificity)
- [x] 4.3 Seed clarity dimension templates: next-action (≤2 competing elements via visual prominence analysis), label-quality (≥90% descriptive labels via LLM judgment), affordance (100% interactive elements have visual cues)
- [x] 4.4 Seed efficiency dimension templates: step-necessity (LLM judgment on step eliminability), no-redundant-confirm (no confirmation dialogs for non-destructive actions)
- [x] 4.5 Seed transitions dimension templates: screen-change (3-frame capture, intermediate state detected), state-change (same 3-frame method for in-page state changes)
- [x] 4.6 Seed delight dimension templates: contextual-copy (LLM judgment on message contextuality), microinteraction (5-frame capture detecting animation beyond basic toggle)
- [x] 4.7 Implement template instantiation engine — given a template and product-specific parameters, produce a concrete given/when/then check with filled-in values
- [x] 4.8 Test each seeded template against a known product — verify measurement methods work and thresholds are sensible

## 5. The Library — Personal Taste Fingerprint

- [x] 5.1 Implement fingerprint entry schema — id, preference (plain English), evidence (list of {date, source_quote}), strength (0.0-1.0), last_expressed (date), contradictions (list), applies_to (all | web | game | artifact)
- [x] 4.2 Implement pattern detection — after 3+ feedback instances on the same dimension, auto-create fingerprint entry with strength ≥0.7 and flag in next briefing
- [x] 4.3 Implement strength calculation — 0.3 for single mention, 0.5 for 2 mentions, 0.7 for 3+, 1.0 for 5+ with no contradictions; contradictions reduce strength by 0.2 each
- [x] 4.4 Implement decay — preferences not reinforced in 6+ months decay 0.1/month to floor of 0.2
- [x] 4.5 Implement fingerprint query — return all entries with strength ≥0.5, formatted as design constraints with strength and evidence count

## 5. The Library — Feedback Classification

- [x] 5.1 Implement feedback classifier — LLM-based analysis of feedback text to determine: product-change, global-learning, domain-learning, personal-preference, or direction
- [x] 5.2 Implement classification logic — analyze each feedback item for scope (this product vs all products vs domain), dimension (functional vs non-functional), and specificity (general principle vs personal preference)
- [x] 5.3 Implement ambiguity detection — when classification confidence is below threshold, generate Slack confirmation question with options
- [x] 5.4 Implement feedback-to-heuristic conversion — translate classified feedback into Library entry format (derive id, rule, measurement, threshold from the feedback text)
- [x] 5.5 Test classifier against 20+ example feedback statements covering all classification types, verify ≥85% accuracy

## 6. Test Integrity Gate (Phase 0)

- [x] 6.1 Implement test-to-spec traceability — every test must have a `criterion_id` or `po_check_id` annotation mapping it to the current spec
- [x] 6.2 Implement spec parser for integrity check — extract all acceptance criteria IDs from active spec, extract all PO check IDs from PO check set
- [x] 6.3 Implement test suite scanner — scan test files for criterion/check ID annotations, build mapping of test → spec criterion
- [x] 6.4 Implement coverage gap detection — identify spec criteria and PO checks with no matching test
- [x] 6.5 Implement orphaned test detection — identify tests mapping to criteria no longer in the active spec
- [x] 6.6 Implement stale test detection — for each covered criterion, compare criterion text hash against the hash stored when the test was last generated. Changed hash = stale test
- [x] 6.7 Implement test generation for coverage gaps — given a spec criterion (text + verification method), generate a test with proper criterion_id annotation
- [x] 6.8 Implement test regeneration for stale tests — regenerate from updated criterion text (not patch existing), replace old test, update hash
- [x] 6.9 Implement orphaned test removal — exclude from QA run, mark for removal in next commit
- [x] 6.10 Implement integrity report — spec_coverage %, po_check_coverage %, orphaned count, stale regenerated count, newly generated count
- [x] 6.11 Implement coverage threshold — block QA if spec coverage < 100%. Generate missing tests first, then proceed
- [x] 6.12 Test integrity gate against a test suite with intentional gaps, stale tests, and orphans — verify all three are detected and handled

## 7. QA Gate — Spec Verification (Phase 1)

- [x] 6.1 Implement spec criteria extractor — parse acceptance_criteria from the active spec (seed spec or change spec for this cycle) into a testable checklist. Each item: ID, criterion text, target screen/URL, verification method
- [x] 6.2 Implement browser-based criteria testing — for each criterion, determine approach (DOM query, interaction simulation, screenshot + LLM vision), execute, record binary pass/fail with evidence
- [x] 6.3 Implement criteria failure classification — not-implemented (no evidence feature was built), broken (exists but fails), partial (partially works — passes QA with warning)
- [x] 6.4 Implement functional correctness checks — page load (all routes, HTTP 200, no blank), console errors (zero tolerance), interactive elements (all respond), forms (valid submit + invalid validation), navigation (all links work, no loops)
- [x] 6.5 Implement Lighthouse baseline collection — run on 3-10 key pages, extract scores. Informational only — does NOT affect QA verdict, passed through to PO Review
- [x] 6.6 Implement code quality baseline collection — run static analysis: cyclomatic complexity (max and avg per function), code duplication (blocks ≥6 lines, >2 instances), file sizes (count >300 lines), new warnings (diff against previous cycle), dead code detection, test coverage (branch %)
- [x] 6.7 Implement architecture integrity check — generate module dependency graph, check circular dependencies (zero tolerance), check cross-layer violations (zero tolerance), diff against design mode architecture, generate and store architecture visualization
- [x] 6.8 Implement API contract stability check — extract API schema from code, diff against previous cycle, flag unspecified changes
- [x] 6.9 Implement critical code quality degradation detection — flag warning if: complexity max >30, duplication >5%, new warnings >10, circular deps introduced, coverage <60%
- [x] 6.10 Implement spec-completeness calculator — total criteria, implemented-and-passing, implemented-but-failing, not-implemented, percentage, per-feature-area breakdown
- [x] 6.11 Implement QA gate report — structured report with verdict (PASS/FAIL), criteria results, functional correctness results, performance baseline, code quality baseline (with warning flag), spec completeness
- [x] 6.12 Implement QA pass condition — PASS when: zero not-implemented, zero broken, zero console errors, zero dead elements on core pages, all forms submit. Partial criteria and code quality warnings = warnings, not failures
- [x] 6.13 Test QA gate against a known product with injected bugs AND injected code quality issues — verify bugs fail QA, code quality issues produce warnings

## 7. PO Review — Journey Quality Assessment (Phase 2)

- [x] 7.1 Implement journey quality evaluator — for each journey that passed QA, walk through as a first-time user (LLM-driven, not scripted), assessing quality not correctness
- [x] 7.2 Implement per-step quality dimensions — at each step assess: clarity (clear/ambiguous/confusing), feedback (satisfying/adequate/missing), efficiency (optimal/acceptable/wasteful), delight (delightful/neutral/frustrating). Overall: strong/weak/failing
- [x] 7.3 Implement journey-level verdicts — production-ready (no step below adequate), acceptable-with-improvements (no step failing), not-production-ready (any step failing)
- [x] 7.4 Implement quality gap generation from journey assessment — for each weak/failing step: which journey, which step, which dimensions failed, what "good" looks like (Library heuristic + reference), improvement category

## 8. PO Review — Screen Quality Assessment (Phase 2)

- [x] 8.1 Implement screen quality evaluator — for each visited screen, capture screenshot and assess: information hierarchy, layout structure, visual consistency, density appropriateness, empty/edge states, mobile readiness (375px)
- [x] 8.2 Implement per-dimension verdicts — production-ready/needs-work/failing per dimension. Overall: production-ready (no failing, ≤1 needs-work), acceptable (no failing), not-production-ready (any failing)
- [x] 8.3 Implement quality gap generation from screen assessment — for each needs-work/failing dimension: observation, reference to Library heuristic or reference product screenshot, improvement category

## 9. PO Review — Interaction Quality Assessment (Phase 2)

- [x] 9.1 Implement interaction quality evaluator — for each interactive element encountered during journey/screen evaluation, assess: hover state, click feedback, loading states, success states, transition animations
- [x] 9.2 Implement interaction ratings — polished (all dimensions good), functional (works but lacks polish), raw (minimal/no feedback). Raw interactions generate quality gaps
- [x] 9.3 Test interaction evaluator against a product with intentionally varied interaction quality — verify it distinguishes polished from raw

## 10. PO Review — Library Heuristics & Reference Comparison (Phase 2)

- [x] 10.1 Implement Library heuristic evaluation in PO Review context — apply all active heuristics (global + domain + personal), execute measurements, compare thresholds. Failures are quality gaps, NOT bugs
- [x] 10.2 Implement measurement method dispatchers — dom-analysis, screenshot-llm, lighthouse-metric (from QA baseline), interaction-test, journey-test, api-test
- [x] 10.3 Implement reference product screenshot capture — navigate to reference URLs, capture specified dimensions, cache in Library (<30 days freshness)
- [x] 10.4 Implement pairwise comparison — per dimension: capture both products, LLM vision pairwise judgment, verdict: matches-reference/approaching-reference/significantly-below-reference
- [x] 10.5 Implement comparison report — per-dimension verdict, side-by-side screenshots, specific observations. Significantly-below dimensions generate quality gaps with reference as evidence
- [x] 10.6 Test heuristic engine + pairwise comparison against known products — verify measurement accuracy and comparison reliability

## 11. PO Review — Quality Report & Confidence (Phase 2)

- [x] 11.1 Implement PO Review report aggregation — combine journey quality, screen quality, interaction quality, heuristic results, reference comparison into structured report with quality gap list
- [x] 11.2 Implement quality gap categorization — each gap categorized: design_change, interaction_improvement, content_change, flow_restructure, performance_improvement. Prioritized: critical > high > medium > low
- [x] 11.3 Implement PO Review verdict — PRODUCTION_READY (zero critical/high gaps, ≥85% heuristic pass, zero significantly-below reference), NEEDS_IMPROVEMENT (zero critical, has high/medium), NOT_READY (has critical or <70% heuristic pass or 2+ significantly-below)
- [x] 11.4 Implement confidence score — weighted: journey quality 30%, screen quality 20%, heuristic functional pass rate 20%, spec completeness (from QA) 15%, reference comparison 15%. Non-functional reported separately
- [x] 11.5 Implement recommended action logic — continue (≥0.9 + PRODUCTION_READY), deepen (0.7-0.9 + gaps concentrated), broaden (0.7-0.9 + missing capabilities), notify-human (<0.7 or NOT_READY with critical)
- [x] 11.6 Test report, verdict, confidence, and action logic against mock PO Review data

## 11. The Seeder — Interactive Swarm

- [x] 11.1 Implement swarm orchestrator — manage state across disciplines (brainstorming, competition, taste, spec, design), track which disciplines have run, detect loop-back triggers
- [x] 11.2 Implement loop-back trigger detection — design challenges spec (>3 click journeys), taste challenges scope (too broad/narrow), spec surfaces competition gap
- [x] 11.3 Implement convergence detection — all disciplines run at least once, no new loop-back triggers in last pass → declare convergence
- [x] 11.4 Implement vision document generator — produce structured vision document from swarm outputs matching the defined schema
- [x] 11.5 Implement product standard generator — inherit global + domain from Library, add project overrides and additions, generate definition of done
- [x] 11.6 Implement seed spec generator — produce feature areas with user journeys (step-by-step), acceptance criteria, data model sketch, interaction patterns, edge cases, explicit scope boundaries
- [x] 11.7 Implement PO check generation — for each journey step, instantiate Library check templates with product-specific parameters (element names, screen URLs, expected primary elements, density levels). Store as `po_checks` in seed spec
- [x] 11.8 Implement screen check generation — for each screen, define primary element, expected density, and instantiate screen-level templates
- [x] 11.9 Implement interaction check generation — for each key interaction, determine type (form, destructive, data-loading, navigation) and instantiate appropriate templates
- [x] 11.10 Implement seed approval flow — present summary (feature area count, QA criteria count, PO check count, journey count, screen count, interaction count, heuristic count, definition of done, estimated cycles), handle approval/revision

## 12. The Runner — Shared Context & Core Loop Engine

- [x] 12.1 Implement `cycle_context.json` schema — vision, product_standard, active_spec, library_heuristics (full definitions), reference_products, previous_evaluations (full reports), factory_decisions, factory_questions, evaluator_observations, runner_analysis. Context accumulates across cycles (appended, not replaced). Update: `cycle_context.json` is now the PRIMARY communication mechanism between phases. Each `claude -p` session reads the full file, does its work, and writes back. No in-memory state. The schema must be comprehensive enough that each phase has all context it needs without asking questions.
- [x] 12.2 Implement state machine — states: seeding, building, qa-gate, qa-fixing, po-reviewing, analyzing, generating-change-spec, vision-checking, waiting-for-human, complete — with defined transitions
- [x] 12.3 Implement Factory invocation with full shared context — pass complete `cycle_context.json` (not a summarised brief). Factory reads full context and writes decisions/questions/divergences back into it
- [x] 12.3 Implement QA gate trigger — after Factory completes build, invoke QA phase with deployment URL and active spec. On FAIL: transition to qa-fixing, send bug fix brief to Factory. On PASS: transition to po-reviewing
- [x] 12.4 Implement QA fix loop — QA fails → bug fix brief to Factory → Factory re-deploys → QA re-runs. Retry limit: 3 attempts on same criteria before escalating to human
- [x] 12.5 Implement PO Review trigger — after QA passes, invoke PO Review with full shared context (including QA report with performance + code quality baselines, partial warnings, Factory decisions)
- [x] 12.6 Implement Evaluator root cause analysis — when failures found, read factory_decisions and factory_questions to classify root cause: spec ambiguity, design choice, or missing context. Include root cause in evaluation report
- [x] 12.7 Implement refinement loop — when root cause is spec ambiguity, instead of completing full evaluation and starting new cycle, send ambiguity back to relevant discipline (spec/design/vision) for clarification, update shared context, and resume current cycle
- [x] 12.8 Implement analysis engine — read PO Review report with root cause analysis, execute recommended action logic, generate quality improvement spec or transition state. Read full shared context including Factory decisions to address actual root cause not just symptoms
- [x] 12.9 Implement quality improvement spec generation — translate PO Review quality gaps into NEW specs (not bug fixes). Each spec: requires_design_mode=true, gaps with evidence and what_good_looks_like, root cause classification, affected screens/journeys, Library context
- [x] 12.8 Implement spec prioritization — critical quality gaps > flow restructure > design change > interaction improvement > content change > performance > personal fingerprint
- [x] 12.9 Implement quality improvement pipeline — new specs go through Factory full pipeline: design mode → implementation → QA gate → PO Review. Not a code patch.
- [x] 12.10 Implement code quality degradation response — when QA flags code_quality_warning, Runner SHALL assess: continue with feature work (if degradation is minor) or trigger a refactoring cycle before continuing (if degradation threatens future velocity). Refactoring cycle: Factory receives a refactoring brief (reduce complexity, eliminate duplication, fix architecture violations) with no new features — purely structural improvement
- [x] 12.11 Implement retry limit — after 5 PO Review cycles on same feature area without reaching PRODUCTION_READY, escalate to human with summary of attempts and recurring gaps

## 13. The Runner — Git, PRs & Loop Tracking

- [x] 13.1 Implement branch-per-loop — create `rouge/loop-{N}-{feature-area}` branch from production branch at start of each cycle
- [x] 13.2 Implement PR-per-loop — create PR with structured description: what was built, evaluation results, delta, quality gaps, Factory decisions, vision alignment
- [x] 13.3 Implement PR merge on promotion — when loop is promoted to production, merge the PR
- [x] 13.4 Implement PR close on rollback — when loop is rolled back, close PR without merging, add rollback explanation comment
- [x] 13.5 Implement evaluation delta calculation — compare current PO Review against previous: confidence_delta, journey_delta, screen_delta, heuristic_delta, overall_delta (improving/stable/regressing)
- [x] 13.6 Implement regression detection — if overall_delta is regressing for 2 consecutive loops, flag for rollback consideration
- [x] 13.7 Implement plateau detection from delta — stable (±2%) for 3+ loops triggers plateau flag

## 14. The Runner — Staging, Production & Rollback

- [x] 14.1 Implement dual environment management — track staging_url and production_url per project in cycle_context.json
- [x] 14.2 Implement Factory-to-staging deployment — Factory always deploys to staging, never to production directly
- [x] 14.3 Implement staging-to-production promotion — on evaluation pass (QA + PO Review PRODUCTION_READY or NEEDS_IMPROVEMENT with confidence ≥0.8), merge PR and promote staging to production
- [x] 14.4 Implement rollback — close PR without merging, revert staging to previous production state, production unaffected
- [x] 14.5 Implement rollback learning preservation — failed loop's evaluation, Factory decisions, and root cause analysis preserved in shared context. Only code reverted, knowledge kept
- [x] 14.6 Implement rollback-informed next loop — next loop's shared context includes: what was tried, why it failed, "try a different approach"

## 15. The Runner — Journey Log & Meta-Narrative

- [x] 15.1 Implement `journey.json` schema — per-loop entries: number, feature_area, branch, pr_number, timestamps, what_attempted, change_spec_type, qa_verdict, po_verdict, confidence, confidence_delta, overall_delta, quality_gaps_found/resolved, outcome (promoted/rolled_back), key_decisions, learnings, rollback_reason
- [x] 15.2 Implement journey log append — after each loop completes (promoted, rolled back, or ongoing), append entry to journey.json
- [x] 15.3 Implement journey log for rollbacks — outcome=rolled_back with rollback_reason and learnings populated
- [x] 15.4 Implement journey timeline renderer — generate a Mermaid timeline from journey.json showing loops, outcomes, and confidence trend
- [x] 15.5 Implement journey feature evolution view — from journey.json, show what was added/changed per loop, what went bad
- [x] 15.6 Implement journey log inclusion in morning briefings — mini-timeline of last N loops with outcomes and confidence trend
- [x] 15.7 DEFERRED V1 — Journey log inclusion in Saturday demo (full product journey visualization per product)

## 16. The Runner — Vision Checking & Confidence

- [x] 16.1 Implement vision check — re-read vision document, review all completed work, LLM judgment on alignment, produce vision check report (alignment, gaps, scope recommendations, confidence)
- [x] 16.2 Implement autonomous scope expansion — when vision check reveals needed capability not in original vision, add to feature queue if confidence >80%, flag in briefing if 70-80%, escalate if <70%
- [x] 16.3 Implement pivot detection — when vision check reveals fundamental premise issues, compile evidence and notify human with structured pivot proposal
- [x] 16.4 Implement confidence trend tracking — record confidence after each cycle, detect 3-cycle declining trends and 5-cycle plateaus, flag in briefing
- [x] 16.5 Implement feature area ordering — dependency analysis, foundation first, cross-cutting last, present order to human during seeding for approval

## 17. The Runner — Meta-Loop

- [x] 17.1 Implement cross-product pattern detection — after 3+ products, aggregate evaluation reports, identify heuristics that fail across multiple products
- [x] 17.2 Implement factory-level vs product-level classification — determine whether recurring failures are addressable at the Factory level (stacks, skills, templates) or product level
- [x] 17.3 Implement Factory improvement spec generation — create change specs targeting AI-Factory for recurring factory-level issues
- [x] 17.4 Implement meta-analysis trigger — run after every 5 completed products

## 18. The Notifier — Slack Bot + Socket Mode (replaces original Slack integration design)

- [x] 18.1 Implement Slack bot with Bolt.js and Socket Mode — ~50 lines, WebSocket connection, no public URL needed
- [x] 18.2 Implement product-ready notification — structured message with production URL, build time, quality summary, confidence score
- [x] 18.3 Implement pivot notification — structured message with status, what's happening, what was tried, lettered options (A/B/C/D)
- [x] 18.4 Implement scope expansion notification — queued for morning briefing, includes capability added, reason, confidence, revert option
- [x] 18.5 Implement morning briefing — progress per feature area, highlights, issues resolved, items needing input, confidence trend, journey timeline, screenshots (up to 5, annotated)
- [x] 18.6 Implement briefing screenshot capture — screenshot primary screen + each feature area's main screen + significant design decision screens, annotate with captions
- [x] 18.7 DEFERRED V1 — Saturday demo compilation (all products worked on, per-product status/URL/key achievement/screenshots, Library growth stats, meta-loop findings, journey visualizations)

## 19. The Notifier — Feedback Ingestion

- [x] 19.1 Implement Slack message listener — receive human messages in response to notifications
- [x] 19.2 Implement feedback parser — split message into distinct feedback items, handle multi-item messages
- [x] 19.3 Implement feedback classifier — for each item, classify as product-change, global-learning, domain-learning, personal-preference, or direction using LLM analysis
- [x] 19.4 Implement ambiguity handler — when classification confidence is low, send Slack confirmation with options
- [x] 19.5 Implement voice transcription cleanup — detect rough transcription, clean up, present interpreted items for confirmation before routing
- [x] 19.6 Implement feedback routing — route classified items to Runner (change specs, direction) or Library (standards, domain taste, fingerprint)
- [x] 19.7 Implement batching logic — queue non-critical events for morning briefing, send critical events immediately (confidence <70%, build failure, pivot, budget threshold)

## 20. Integration & End-to-End Testing

- [x] 20.1 E2E: Seed a landing page → Factory builds to staging → Test Integrity Gate → QA gate passes → PO Review runs → promote to production → verify three-phase evaluation produces integrity report, QA report, and PO Review report
- [x] 20.2 E2E: Inject a bug (broken form submission) → verify QA gate catches it → verify bug fix brief → verify QA re-runs → verify PO Review only runs after QA passes
- [x] 20.3 E2E: Inject a quality issue (flat hierarchy) → verify QA passes → verify PO Review catches it → verify quality gap generates NEW spec → verify new spec goes through design mode
- [x] 20.4 E2E: Inject stale tests (spec changed, tests didn't) → verify Test Integrity Gate detects staleness → verify tests regenerated → verify QA runs with fresh tests
- [x] 20.5 E2E: Seed a multi-feature web product → verify feature-area cycling → verify per-area evaluation → verify cross-area vision check
- [x] 20.6 E2E: Simulate 3 cycles of feedback with recurring theme → verify Library fingerprint entry → verify future PO Reviews apply it
- [x] 20.7 E2E: Simulate a loop that makes the product worse → verify regression detection → verify rollback (PR closed, staging reverted, learnings preserved) → verify next loop incorporates rollback learnings
- [x] 20.8 E2E: Verify staging/production dual environment — Factory deploys to staging, promotion only on pass, human reviews production URL, rollback doesn't affect production
- [x] 20.9 E2E: Verify journey.json accumulates across loops — check timeline rendering, feature evolution view, and rollback entries
- [x] 20.10 E2E: Verify PR-per-loop — branch created, structured description, merged on promotion, closed on rollback
- [x] 20.11 E2E: Crash mid-cycle at each state → restart → verify resume from checkpoint → verify no lost state
- [x] 20.12 E2E: Simulate PO Review confidence dropping below 70% → verify pivot notification → verify Runner pauses → verify human response resumes
- [x] 20.13 E2E: Run 5 products → verify meta-loop triggers → verify cross-product pattern detection → Factory improvement spec
- [x] 20.14 E2E: Full happy path — seed → build → staging → test integrity → QA pass → PO Review PRODUCTION_READY → promote to production → Slack notification → human feedback → Library updated → journey log complete

## Future Work — Slack UX Polish

- [x] FW.1 Thread-based bot replies — use `thread_ts` so seeding conversations and notifications don't flood the channel
- [x] FW.2 Per-loop status notifications — "Loop N: building → QA passed → PO review in progress" at each phase transition
- [x] FW.3 Phase transition notifications — notify channel when a phase starts/completes with brief summary
- [x] FW.4 Confidence trend in notifications — include confidence score and delta in loop completion messages
- [x] FW.5 Screenshot attachments in notifications — capture primary screen + feature screens, attach to Slack messages via file upload
- [x] FW.6 Seeding swarm progress — "Discipline 3/7 complete (brainstorming → competition → taste)" during seeding loops

## Future Work — Slack UX (Boil the Lake)

### Foundation
- [x] FW.10 Create Slack App manifest YAML — one-click app setup for new users. All slash commands, event subscriptions, scopes, and permissions declared.
- [x] FW.11 Implement slash commands — /rouge new, /rouge status, /rouge start, /rouge pause, /rouge resume, /rouge seed, /rouge feedback. Requires Interactivity & Shortcuts enabled.
- [x] FW.12 Threaded seeding conversations — /rouge new starts a thread, all seeding back-and-forth lives in the thread, channel gets a summary on completion
- [x] FW.13 Modal for project creation — /rouge new opens a form: project name, one-line description, domain (web/game/artifact), template. Not free-text.

### Dashboard & Visibility
- [x] FW.14 App Home tab as live dashboard — click Rouge in sidebar → see all projects with state, confidence trend, last activity, action buttons
- [x] FW.15 Ephemeral status messages — /rouge status shows results only to the requesting user, no channel spam

### Rich Interactions
- [x] FW.16 Interactive Block Kit notifications — structured cards with progress indicators, confidence trends, screenshots, action buttons (Start, Pause, Approve, Reject)
- [x] FW.17 Block Kit morning briefing — multi-section card with per-project blocks, confidence charts, screenshot thumbnails
- [x] FW.18 Block Kit PO Review scorecard — journey/screen/interaction quality breakdown with pass/fail indicators
- [x] FW.19 Inline action buttons — "Start" button on ready notifications, "Investigate" button on rollback alerts, "Approve/Reject" on seeding completion
- [x] FW.20 Dropdown menus for feedback classification — when sending feedback, select type (product-change, global-learning, etc.) from a menu instead of relying on LLM classification

### Polish
- [x] FW.21 DM support — seed from DMs with the bot for private brainstorming, channel notifications for team visibility
- [x] FW.22 Phase completion notifications with before/after screenshots embedded
- [x] FW.23 Rollback alerts with evidence summary and action buttons
- [x] FW.24 Confidence trend sparkline in notifications (Unicode block characters)

### Self-Configuration
- [x] FW.25 Bot self-setup on first run — detect no channels exist, create #rouge-feed (newsroom), #rouge-seeding (conversations), #rouge-alerts (critical only), set topics, pin welcome messages
- [x] FW.26 Add channels:manage scope to manifest for channel creation
- [x] FW.27 First-run welcome flow — bot explains itself in each channel with pinned usage guide
- [x] FW.28 Document 5-step new user setup — create workspace, import manifest, install app, copy 3 tokens, start bot (everything else auto-configures)

## Future Work — Rouge Maintain (Closed Source)

Rouge Maintain: autonomous maintenance of deployed production systems.

- [ ] FM.1 SBOM generation and CVE scanning — weekly automated dependency audit
- [ ] FM.2 Automated security patching — CVE detected → branch → patch → test → PR
- [ ] FM.3 Bug triage from error monitoring — Sentry errors → classify → fix or escalate
- [ ] FM.4 Database migration planning — schema changes with rollback plans, dry-run on staging
- [ ] FM.5 Dependency updates — automated minor/patch updates with test verification
- [ ] FM.6 Uptime monitoring — health checks, auto-restart, incident notification
- [ ] FM.7 Production safeguards — never auto-merge to production without human approval for destructive changes (table drops, data migrations)
- [ ] FM.8 Weekly maintenance report — what was patched, what needs attention, security posture

## Future Work — Rate Limit Handling Rethink

- [x] FW.29 Distinguish rate limits from real failures — rate limits should NEVER count toward the 3-retry limit. They're temporary, not errors.
- [x] FW.30 Rate limit detection without log content — check Claude CLI exit code or stderr directly, not just log file grep (log may be empty if redirect fails)
- [x] FW.31 Rate limit backoff should pause ALL projects — if one project hits rate limit, others will too. Pause the entire loop, not just the current project.
- [x] FW.32 Rate limit reset detection — parse "resets Xpm" from Claude output, sleep until reset time instead of arbitrary backoff
- [x] FW.33 Document rate limit interaction between Rouge Spec (interactive) and Rouge Build (autonomous) — if a human is seeding via Slack and the build loop is running, they compete for the same rate limit budget

## Future Work — Launcher Improvements

- [x] FW.35 Replace timeout-based phase monitoring with heartbeat/progress detection — periodically check if Claude is still producing output (file changes, log growth, tool calls) rather than using a fixed timeout. If no progress for N minutes, then timeout. This is more resilient than fixed timeouts and provides observability data for the dashboard.
- [x] FW.36 Phase progress streaming — emit periodic progress events (files changed, tests run, etc.) that the Slack newsroom and web dashboard can consume in real-time
- [x] FW.37 Handle phase prompts writing state.json — normalize `*-complete` suffixed states back to the expected state, or add pre/post guards that save and restore state.json around phase invocations
- [x] FW.38 README disclaimer — "experimental, not for production use, token-intensive" warning

## Future Work — Visual Evolution Record

- [x] FW.39 QA gate screenshot capture — each QA gate run captures 3-5 representative screenshots of key screens. Store in `projects/<name>/screenshots/loop-<N>/` with descriptive filenames.
- [x] FW.40 Screenshot persistence across loops — screenshots persist as visual history. Each loop gets its own dated folder.
- [x] FW.41 Visual evolution GIF/timelapse generator — compile matching screenshots across loops into animated GIF or side-by-side comparison. ImageMagick `convert` for GIF generation.
- [x] FW.42 GStack browse screenshot integration — use `$B screenshot <path>` during QA gate for each key screen. Full-page capture, not viewport-only.

## Discussion — Cost-Aware Testing

NEEDS DISCUSSION: Some products built by Rouge will be AI-powered themselves (e.g., LLM API calls in the product). Testing these products during QA gate means the QA phase incurs real API costs from the product under test — not just Claude token costs from the Rouge loop itself.

Questions:
- How do we cap per-QA-run costs for products that call external APIs?
- Should the QA gate use mock/stub APIs by default and only hit real APIs in a final validation phase?
- How do we track and report "product testing cost" separately from "Rouge operating cost"?
- Should there be a cost budget per loop that triggers waiting-for-human if exceeded?
- How does this interact with Stripe test mode (we only use sandbox, but test API calls still exist)?

## Future Work — PO Review Fixes (Critical)

- [x] FW.43 Split PO review into sub-phases — journey quality, screen quality, interaction quality, heuristic eval as separate lighter invocations instead of one mega-session. Each sub-phase writes partial results, next sub-phase reads them.
- [x] FW.44 Quick PO review mode — review 1 journey + 1 screen only. For testing and fast iteration cycles.
- [x] FW.45 Fix execFileSync output capture — switch to async execFile with streaming output to log file. Partial output must be saved even if the process dies. Current: all-or-nothing means hours of work lost on timeout.
- [x] FW.46 Guard against synthetic data propagation — when po_review_report.synthetic is true, downstream phases must NOT generate change specs or make product modifications based on synthetic data. Analyzing phase should check this flag.
