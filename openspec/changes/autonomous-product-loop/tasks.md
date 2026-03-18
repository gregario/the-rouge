## 0a. Prerequisite — Factory Skill Audit & Rewrites

Skill timing categories for Rouge:
- **Seed-once**: Run during project seeding, not repeated each loop (legal, privacy, test bootstrap, monitoring/analytics setup)
- **Every-loop**: Run in each Karpathy Loop iteration (QA, security, code audit, design review, ship)
- **Final-gate**: Run once before first production deploy (full validation checklist)

Cross-cutting meta-layer patterns (apply to ALL skills):
- **Boil the Lake**: Always recommend complete implementation. Never scope down for AI convenience. Dual time estimates (human-team vs CC) on every recommendation.
- **Latent space activation**: Anchor evaluator/review prompts in reasoning frameworks of named thinkers (Bezos one-way doors, Munger inversion, Grove paranoid scanning, Rams subtraction, Norman time-horizon design, etc.). Instruction: "internalize these, don't enumerate them."
- **Completeness scoring**: Every decision point shows 1-10 completeness score.
- **Autonomous mode**: All skills must work as `claude -p` prompts — no AskUserQuestion, no interactive questions, all decisions logged to cycle_context.json.

### Audit & Classification (expanded scope)

- [ ] 0a.1 Audit ALL skills across four ecosystems against Rouge requirements — 13 factory skills, 14 superpowers skills (v5.0.5), 11 GStack skills (v0.6.4), 4 OpenSpec skills, plus 2 superpowers PR skills (#564 AI code audit, #560 security review). For each: classify as keep-as-is | extend | rewrite for autonomous mode | create from scratch | adopt-and-adapt (new to our stack). Total: ~44 skills.

### Rewrites (existing skills → autonomous mode)

- [ ] 0a.2a Rewrite OpenSpec for seed mode (interactive) — override schema.yaml `instruction` fields when invoked during seeding. Replace "concise 1-2 pages" with production-depth demands. Add: edge cases per journey, data model sketches, error recovery paths, interaction patterns, security considerations, acceptance criteria testable by the evaluator. Seed specs are the bar everything evaluates against — shallow seed = shallow product. Runs interactively (human in Slack seeding conversation). Apply latent space activation for product thinking.
- [ ] 0a.2b Rewrite OpenSpec for loop mode (autonomous) — same depth overrides as seed mode but autonomous. Reads from cycle_context.json, writes change specs without human prompts. Used when runner generates quality improvement specs mid-loop. (autonomous `claude -p`)
- [ ] 0a.3 Rewrite brainstorming skill — add "depth mode" that doesn't YAGNI. Current skill actively fights depth; Rouge needs it to explore fully. Incorporate GStack's SELECTIVE EXPANSION mode for cherry-picking scope expansions. (autonomous `claude -p`)
- [ ] 0a.4 Rewrite design mode prompts — produce structured artifacts parseable by the Evaluator (YAML/JSON vision docs, component mappings, PO-checkable outputs). Integrate GStack's `/plan-design-review` scoring (0-10 per dimension), 80-item design checklist, and AI slop detection. Integrate `/design-consultation` competitive browsing for seed phase. Apply latent space activation (Rams, Norman, Zhuo, Gebbia, Ive). (autonomous `claude -p`)
- [ ] 0a.5 Adapt product taste for re-invocation within seeding swarm — currently one-shot gate, needs to be a discipline callable multiple times. Apply latent space activation (Chesky 10-star, Graham do things that don't scale). (autonomous `claude -p`)
- [ ] 0a.6 Extend QA skill — add: code quality baseline collection, architecture integrity checks, test integrity gate, auto regression test generation (from GStack 0.6.0), test bootstrap from scratch (detect runtime, install framework, write initial tests — from GStack 0.6.0), diff-scope categorization (frontend/backend/prompts/tests/docs/config — from GStack 0.6.3), plan-to-QA artifact flow (from GStack 0.4.0). (autonomous `claude -p`)
- [ ] 0a.6b Extend ship skill — add: coverage audit mapping diff to tests with ASCII diagram (from GStack 0.6.0), fix-first heuristic for auto-fixing obvious issues (from GStack 0.4.5), design review lite 20-item CSS checklist on frontend PRs (from GStack 0.6.3), review readiness dashboard tracking gate status per branch (from GStack 0.5.1), enum handler detection (from GStack 0.4.1). (autonomous `claude -p`)
- [ ] 0a.6c Extend review skill — add: fix-first heuristic, design review lite, enum handler detection, single whole-plan review (token savings, from superpowers v5.0.4), raised bar for blocking issues with calibration (from superpowers v5.0.4), reduced max review iterations 5→3 (from superpowers v5.0.4). (autonomous `claude -p`)

### New skills (create from scratch)

- [ ] 0a.7 Create PO Review skill from scratch — mechanical execution of instantiated check templates, journey/screen/interaction quality assessment, quality gap generation. Apply latent space activation for product evaluation. Integrate GStack's design scoring dimensions.
- [ ] 0a.8 Create Seeding Swarm orchestration skill from scratch — non-linear multi-discipline management, loop-back detection, convergence detection. Integrate GStack's `/design-consultation` for competitive design intelligence during seed phase.
- [ ] 0a.9 Create Runner loop skill from scratch — 13-state machine, shared context management, Factory invocation, evaluation orchestration, delta tracking, rollback. Integrate review readiness dashboard (from GStack 0.5.1) for gate tracking. Integrate diff-scope (from GStack 0.6.3) for routing changes to correct review gates.
- [ ] 0a.10 Create Vision Check skill from scratch — periodic re-evaluation against vision document, scope expansion/contraction decisions
- [ ] 0a.11 Create Evaluation Orchestrator skill from scratch — three-phase sequential execution (Test Integrity → QA → PO Review), routing failures correctly (bugs vs quality specs). Integrate AI code audit (from superpowers PR #564, 7-dimension audit) and security review (from superpowers PR #560, OWASP 5-category checklist) as evaluation sub-phases.

### New skills (adopt and adapt from external sources)

- [ ] 0a.13 Create `/ai-code-audit` skill — adapt superpowers PR #564 (auditing-ai-generated-code). 7-dimension audit targeting AI-specific failure patterns: dead validation, hallucinated deps, client-exposed keys, localStorage-as-persistence. 0-100 scoring with hard rules. Timing: every-loop.
- [ ] 0a.14 Create `/security-review` skill — adapt superpowers PR #560. OWASP-style 5-category checklist: input validation, auth, data exposure, deps, config. 5-step hard gate (DIFF→CHECK→FLAG→FIX→VERIFY). Timing: every-loop.
- [ ] 0a.15 Create `/design-review` skill — adapt GStack's post-build visual QA with atomic CSS fixes and before/after screenshots. Merge with GStack's design review lite for lightweight mode. Timing: every-loop.
- [ ] 0a.16 Create `/a11y-review` skill — WCAG accessibility audit. Covers: color contrast (WCAG AA), keyboard navigation, screen reader compatibility, ARIA attributes, focus management, alt text, semantic HTML. Integrate with QA flow. Timing: every-loop.
- [ ] 0a.17 Create `/legal-scaffold` skill — seed-once skill. Two parts: (a) GC input review on concept (trademark conflicts, IP risk, OSS license compliance, regulated domain detection, data handling obligations), (b) generate boilerplate T&Cs, privacy policy, cookie policy tailored to the product's data handling. Timing: seed-once.
- [ ] 0a.18 Create `/privacy-review` skill — GDPR/CCPA review. Data flow mapping, cookie audit, consent mechanism check, data deletion capability, third-party data sharing inventory. Timing: seed-once (with every-loop checks for new data flows).
- [ ] 0a.19 Create `/marketing-landing-page` template — extend web-product template with marketing landing page scaffold (hero, features, pricing, CTA, social proof). Timing: seed-once.

### Infrastructure adoption (meta-layer + templates)

- [ ] 0a.20 Integrate "Boil the Lake" + dual time estimates into meta-layer — update CLAUDE.md, preamble partial, ask-format partial. Every recommendation shows human-team vs CC time. Every option shows completeness score 1-10.
- [ ] 0a.21 Integrate latent space activation across all review/evaluation skills — create a `partials/latent-space-activation.md` partial with domain-specific thinker sets (product: Bezos/Chesky/Graham/Altman; engineering: Larson/McKinley/Brooks/Beck/Majors; design: Rams/Norman/Zhuo/Gebbia/Ive; security: OWASP/Schneier; legal: Lessig). Include in relevant skill templates.
- [ ] 0a.22 Integrate review readiness dashboard pattern — create shared state tracker that logs which gates (QA, security, AI audit, design review, a11y, PO review) have passed per branch. Runner reads this to determine next phase.
- [ ] 0a.23 Integrate diff-scope pattern — create `rouge-diff-scope` utility that categorizes branch changes. Runner uses this to determine which review gates to invoke (frontend changes → design review + a11y; backend → security review; all → AI code audit).
- [ ] 0a.24 Add error monitoring template (Sentry free tier, @sentry/cloudflare SDK) — scaffold into web-product template. Fully CLI-automatable via sentry-cli. $0/month for <5K errors.
- [ ] 0a.25 Add analytics template (Counterscale on CF Workers + CF Web Analytics) — scaffold into web-product template. Single `wrangler deploy`. $0/month.
- [ ] 0a.26 Create final validation gate skill — pre-production checklist: all tests pass, coverage threshold met, security audit clean, privacy review complete, legal docs generated, error monitoring configured, analytics configured, Lighthouse baseline met, SEO basics (meta/sitemap/robots.txt), domain+SSL configured, production env vars set, marketing page live, README current, a11y baseline met.

### Verification

- [ ] 0a.12 Verify all rewritten/new/adopted skills work individually before composing them into the loop

### Backlog (not task 0a — fundamentally different loops needing separate design)

- [ ] BACKLOG: MCP testing loop — wrap `/mcp-qa` into Rouge-compatible gate for MCP server products
- [ ] BACKLOG: Godot testing loop — wrap GUT into Rouge-compatible gate for Godot game products

## 0b. Prerequisite — Deployment Infrastructure Battle-Testing

- [ ] 0b.1 Test new project deployment end-to-end — from empty repo to deployed staging + production for a web product. Document every manual step that should be automated
- [ ] 0b.2 Automate Supabase project creation — if using Supabase, the Runner must be able to provision a new project, run migrations, and get a connection string without manual dashboard work
- [ ] 0b.3 Automate Cloudflare Pages setup — if using Cloudflare, the Runner must be able to create a new Pages project, configure build settings, and get staging + production URLs without manual dashboard work
- [ ] 0b.4 Automate local Docker deployment as fallback — if cloud provisioning fails or isn't configured, the Runner must be able to deploy to a local Docker environment for evaluation
- [ ] 0b.5 Test staging → production promotion flow — verify the Runner can promote a staging deployment to production (DNS swap, CDN cache clear, or equivalent) without manual intervention
- [ ] 0b.6 Test rollback flow — verify staging can be reverted to previous state without affecting production
- [ ] 0b.7 Test Lighthouse against deployed staging — verify Lighthouse CI can run against the staging URL and return parseable results
- [ ] 0b.8 Test browser QA against deployed staging — verify the QA skill can navigate a staging URL, interact with elements, and collect results
- [ ] 0b.9 Document and fix every failure found during battle-testing — each manual step that should be automated becomes a task
- [ ] 0b.10 Verify Cloudflare Workers with Static Assets deployment flow — Pages is deprecated (April 2025). Test `wrangler deploy` with `[assets]` config as the forward-looking deployment path
- [ ] 0b.11 Verify Supabase pause/unpause via Management API — test `POST /v1/projects/{ref}/pause` and restore flow, confirm data preservation
- [ ] 0b.12 Verify Stripe CLI test mode flow — create product, create checkout session, complete with test card, verify webhook receipt

## 0c. Prerequisite — Launcher & Communication Infrastructure

- [ ] 0c.1 Implement `rouge-loop.sh` — bash launcher script (~50 lines). Read state.json for each project dir, skip waiting/complete, spawn `claude -p` with phase-specific prompt, handle errors and rate limits, loop forever
- [ ] 0c.2 Implement model selection in launcher — map each state to opus or sonnet model, pass `--model` flag to `claude -p`
- [ ] 0c.3 Implement multi-project directory scanning — launcher discovers projects by scanning for `state.json` in `projects/*/`
- [ ] 0c.4 Implement error handling — log failures, retry up to 3 times, transition to waiting-for-human on persistent failure, notify via Slack webhook
- [ ] 0c.5 Implement rate limit detection — detect Claude Code rate limit responses, back off exponentially, resume when limit resets
- [ ] 0c.6 Create Slack App — set up app at api.slack.com, enable Socket Mode, create App-Level Token (`connections:write`), add Bot Token Scopes (`chat:write`, `channels:history`, `app_mentions:read`, `channels:read`), install to workspace
- [ ] 0c.7 Implement Slack bot listener (~50 lines Bolt.js) — Socket Mode WebSocket, listen for app_mention events, parse feedback, write to `projects/<name>/feedback.json`
- [ ] 0c.8 Implement Slack webhook sending — store webhook URL in env var, helper function to send Block Kit JSON via curl
- [ ] 0c.9 Implement feedback queue detection in launcher — check for `feedback.json` in each project dir, if found and project is waiting-for-human, transition state and pass feedback to next phase
- [ ] 0c.10 Implement Supabase slot management — track active projects, check count before provisioning, pause least-recently-active when at limit, log swaps
- [ ] 0c.11 Implement morning briefing cron — cron job that writes `trigger-briefing.json`, launcher detects and runs briefing phase
- [ ] 0c.12 Test launcher end-to-end — start launcher, verify it picks up a seeded project, runs phases, transitions states, handles errors
- [ ] 0c.13 Implement Slack command parser — detect "rouge start/pause/resume/status/new/seed" patterns from incoming Slack messages, route to appropriate handler
- [ ] 0c.14 Implement "rouge start" command — verify project exists and is in `ready` state, check Supabase slot availability if needed, transition state.json to `building`, confirm via Slack
- [ ] 0c.15 Implement "rouge pause" command — transition any active project to `waiting-for-human`, store `paused_from_state` in state.json, confirm via Slack
- [ ] 0c.16 Implement "rouge resume" command — transition paused project back to `paused_from_state`, confirm via Slack
- [ ] 0c.17 Implement "rouge status" command — read all project state.json files, format summary (active/ready/paused/complete), send as Block Kit message
- [ ] 0c.18 Implement "rouge new" command — create project directory with scaffolding, start interactive seeding session via Slack relay
- [ ] 0c.19 Implement Slack-to-Claude seeding relay — spawn Claude Code seeding session, relay messages bidirectionally between Slack and Claude Code, handle conversation flow
- [ ] 0c.20 Implement seeding conversation timeout — save seeding state to seeding-state.json after 2 hours of inactivity, notify user, support resume via "rouge seed {name}"
- [ ] 0c.21 Implement seeding completion handler — on seed approval via Slack, write artifacts to project directory, set state.json to `ready` (not `building`), notify user with start instructions
- [ ] 0c.22 Test Slack control plane end-to-end — rouge new → seeding conversation → rouge start → verify launcher picks up → rouge pause → rouge resume → rouge status

## 1. Project Foundation & State Management

- [ ] 1.1 Define and implement `state.json` schema — current_state, cycle_number, feature_areas (with status), current_feature_area, last_evaluation, change_specs_pending, vision_check_results, confidence_history, timestamp
- [ ] 1.2 Implement state persistence module — write state after every state transition, atomic writes to prevent corruption
- [ ] 1.3 Implement crash recovery logic — read state.json on startup, determine resume action per state (building: check for deploy artifacts; evaluating: restart; analyzing: re-run from last report; waiting-for-human: check Slack)
- [ ] 1.4 Define vision document schema (YAML/JSON) — name, one_liner, persona, problem, emotional_north_star, reference_products (with dimensions and URLs), feature_areas (with user_journeys and acceptance_criteria), product_standard (overrides, additions, reference_screenshots)
- [ ] 1.5 Implement vision document parser — extract acceptance criteria as testable assertions, user journeys as simulatable flows, reference product dimensions, product standard overrides
- [ ] 1.6 Define product standard schema — inherits (global + domain), overrides (heuristic ID + modified threshold + justification), additions (project-specific heuristics in Library entry format), definition_of_done (plain English + heuristic count references)

## 2. The Library — Storage & Data Model

- [ ] 2.1 Design and implement Library storage format — file-based, one file per heuristic entry, directory structure: `library/global/`, `library/domain/{web,game,artifact}/`, `library/personal/`, `library/history/`
- [ ] 2.2 Implement heuristic entry schema — id, name, rule, measurement (with type: dom-analysis | screenshot-llm | lighthouse-metric | interaction-test | journey-test | api-test), threshold, type (functional | non-functional), tier (global | domain | personal), domain, source, version, status, deprecated_reason
- [ ] 2.3 Implement Library read API — query by tier, domain, status; return all active heuristics for a given evaluation context (global + relevant domain + personal fingerprint)
- [ ] 2.4 Implement Library write API — add new entry, update entry (increment version, preserve history), deprecate entry (set status, record reason), prune deprecated entries older than N months
- [ ] 2.5 Implement version history — every update creates a history entry with old value, new value, reason, date; stored in `library/history/`
- [ ] 2.6 Implement conflict detection — when adding/updating entries, check for conflicting active entries; flag conflicts for human resolution in next briefing

## 3. The Library — Day-One Seed

- [ ] 3.1 Seed product standards (functional): hierarchy-primary (DOM analysis, primary score ≥1.5x secondary), hierarchy-levels (3 visual weight tiers), three-click-rule (journey simulation ≤3 clicks), five-state-coverage (5 states per interactive screen), progressive-disclosure (≤7 primary actions visible), user-journey-completeness (100% journeys complete), error-recovery (100% error states have recovery path)
- [ ] 3.2 Seed design standards (functional): visual-consistency (≤2 font families, ≤5 sizes, ≤8 colors), interactive-feedback (100% elements respond to hover/click), animation-state-transitions (≥80% transitions animated), mobile-responsive (usable at 375px+, ≥44px tap targets), empty-state-guidance (100% empty states have CTA)
- [ ] 3.3 Seed engineering standards (non-functional): page-load-time (LCP <2000ms), time-to-interactive (TTI <3000ms), lighthouse-performance (score ≥80), lighthouse-accessibility (score ≥90), no-console-errors (0 errors), api-response-time (p95 <500ms reads, <1000ms writes)
- [ ] 3.4 Seed web domain heuristics: nav-persistent (nav visible on every route), above-fold-value (primary element ≥50% visible at 1440×900), form-validation-inline (100% inline), breadcrumb-depth (breadcrumbs at ≥3 levels deep)
- [ ] 3.5 Verify all seeded heuristics have valid measurement methods and thresholds by running them against a known-good reference product (Stripe dashboard or similar)

## 4. The Library — PO Check Templates

- [ ] 4.1 Implement check template schema — id, dimension, applies_to, given (parameterized), when (parameterized), then (with measurement), measurement_method, default_threshold, parameters list
- [ ] 4.2 Seed feedback dimension templates: visual-response (200ms screenshot-diff), loading-indicator (500ms threshold, intercept network), success-confirmation (1s contextual check), error-specificity (LLM judgment on message specificity)
- [ ] 4.3 Seed clarity dimension templates: next-action (≤2 competing elements via visual prominence analysis), label-quality (≥90% descriptive labels via LLM judgment), affordance (100% interactive elements have visual cues)
- [ ] 4.4 Seed efficiency dimension templates: step-necessity (LLM judgment on step eliminability), no-redundant-confirm (no confirmation dialogs for non-destructive actions)
- [ ] 4.5 Seed transitions dimension templates: screen-change (3-frame capture, intermediate state detected), state-change (same 3-frame method for in-page state changes)
- [ ] 4.6 Seed delight dimension templates: contextual-copy (LLM judgment on message contextuality), microinteraction (5-frame capture detecting animation beyond basic toggle)
- [ ] 4.7 Implement template instantiation engine — given a template and product-specific parameters, produce a concrete given/when/then check with filled-in values
- [ ] 4.8 Test each seeded template against a known product — verify measurement methods work and thresholds are sensible

## 5. The Library — Personal Taste Fingerprint

- [ ] 5.1 Implement fingerprint entry schema — id, preference (plain English), evidence (list of {date, source_quote}), strength (0.0-1.0), last_expressed (date), contradictions (list), applies_to (all | web | game | artifact)
- [ ] 4.2 Implement pattern detection — after 3+ feedback instances on the same dimension, auto-create fingerprint entry with strength ≥0.7 and flag in next briefing
- [ ] 4.3 Implement strength calculation — 0.3 for single mention, 0.5 for 2 mentions, 0.7 for 3+, 1.0 for 5+ with no contradictions; contradictions reduce strength by 0.2 each
- [ ] 4.4 Implement decay — preferences not reinforced in 6+ months decay 0.1/month to floor of 0.2
- [ ] 4.5 Implement fingerprint query — return all entries with strength ≥0.5, formatted as design constraints with strength and evidence count

## 5. The Library — Feedback Classification

- [ ] 5.1 Implement feedback classifier — LLM-based analysis of feedback text to determine: product-change, global-learning, domain-learning, personal-preference, or direction
- [ ] 5.2 Implement classification logic — analyze each feedback item for scope (this product vs all products vs domain), dimension (functional vs non-functional), and specificity (general principle vs personal preference)
- [ ] 5.3 Implement ambiguity detection — when classification confidence is below threshold, generate Slack confirmation question with options
- [ ] 5.4 Implement feedback-to-heuristic conversion — translate classified feedback into Library entry format (derive id, rule, measurement, threshold from the feedback text)
- [ ] 5.5 Test classifier against 20+ example feedback statements covering all classification types, verify ≥85% accuracy

## 6. Test Integrity Gate (Phase 0)

- [ ] 6.1 Implement test-to-spec traceability — every test must have a `criterion_id` or `po_check_id` annotation mapping it to the current spec
- [ ] 6.2 Implement spec parser for integrity check — extract all acceptance criteria IDs from active spec, extract all PO check IDs from PO check set
- [ ] 6.3 Implement test suite scanner — scan test files for criterion/check ID annotations, build mapping of test → spec criterion
- [ ] 6.4 Implement coverage gap detection — identify spec criteria and PO checks with no matching test
- [ ] 6.5 Implement orphaned test detection — identify tests mapping to criteria no longer in the active spec
- [ ] 6.6 Implement stale test detection — for each covered criterion, compare criterion text hash against the hash stored when the test was last generated. Changed hash = stale test
- [ ] 6.7 Implement test generation for coverage gaps — given a spec criterion (text + verification method), generate a test with proper criterion_id annotation
- [ ] 6.8 Implement test regeneration for stale tests — regenerate from updated criterion text (not patch existing), replace old test, update hash
- [ ] 6.9 Implement orphaned test removal — exclude from QA run, mark for removal in next commit
- [ ] 6.10 Implement integrity report — spec_coverage %, po_check_coverage %, orphaned count, stale regenerated count, newly generated count
- [ ] 6.11 Implement coverage threshold — block QA if spec coverage < 100%. Generate missing tests first, then proceed
- [ ] 6.12 Test integrity gate against a test suite with intentional gaps, stale tests, and orphans — verify all three are detected and handled

## 7. QA Gate — Spec Verification (Phase 1)

- [ ] 6.1 Implement spec criteria extractor — parse acceptance_criteria from the active spec (seed spec or change spec for this cycle) into a testable checklist. Each item: ID, criterion text, target screen/URL, verification method
- [ ] 6.2 Implement browser-based criteria testing — for each criterion, determine approach (DOM query, interaction simulation, screenshot + LLM vision), execute, record binary pass/fail with evidence
- [ ] 6.3 Implement criteria failure classification — not-implemented (no evidence feature was built), broken (exists but fails), partial (partially works — passes QA with warning)
- [ ] 6.4 Implement functional correctness checks — page load (all routes, HTTP 200, no blank), console errors (zero tolerance), interactive elements (all respond), forms (valid submit + invalid validation), navigation (all links work, no loops)
- [ ] 6.5 Implement Lighthouse baseline collection — run on 3-10 key pages, extract scores. Informational only — does NOT affect QA verdict, passed through to PO Review
- [ ] 6.6 Implement code quality baseline collection — run static analysis: cyclomatic complexity (max and avg per function), code duplication (blocks ≥6 lines, >2 instances), file sizes (count >300 lines), new warnings (diff against previous cycle), dead code detection, test coverage (branch %)
- [ ] 6.7 Implement architecture integrity check — generate module dependency graph, check circular dependencies (zero tolerance), check cross-layer violations (zero tolerance), diff against design mode architecture, generate and store architecture visualization
- [ ] 6.8 Implement API contract stability check — extract API schema from code, diff against previous cycle, flag unspecified changes
- [ ] 6.9 Implement critical code quality degradation detection — flag warning if: complexity max >30, duplication >5%, new warnings >10, circular deps introduced, coverage <60%
- [ ] 6.10 Implement spec-completeness calculator — total criteria, implemented-and-passing, implemented-but-failing, not-implemented, percentage, per-feature-area breakdown
- [ ] 6.11 Implement QA gate report — structured report with verdict (PASS/FAIL), criteria results, functional correctness results, performance baseline, code quality baseline (with warning flag), spec completeness
- [ ] 6.12 Implement QA pass condition — PASS when: zero not-implemented, zero broken, zero console errors, zero dead elements on core pages, all forms submit. Partial criteria and code quality warnings = warnings, not failures
- [ ] 6.13 Test QA gate against a known product with injected bugs AND injected code quality issues — verify bugs fail QA, code quality issues produce warnings

## 7. PO Review — Journey Quality Assessment (Phase 2)

- [ ] 7.1 Implement journey quality evaluator — for each journey that passed QA, walk through as a first-time user (LLM-driven, not scripted), assessing quality not correctness
- [ ] 7.2 Implement per-step quality dimensions — at each step assess: clarity (clear/ambiguous/confusing), feedback (satisfying/adequate/missing), efficiency (optimal/acceptable/wasteful), delight (delightful/neutral/frustrating). Overall: strong/weak/failing
- [ ] 7.3 Implement journey-level verdicts — production-ready (no step below adequate), acceptable-with-improvements (no step failing), not-production-ready (any step failing)
- [ ] 7.4 Implement quality gap generation from journey assessment — for each weak/failing step: which journey, which step, which dimensions failed, what "good" looks like (Library heuristic + reference), improvement category

## 8. PO Review — Screen Quality Assessment (Phase 2)

- [ ] 8.1 Implement screen quality evaluator — for each visited screen, capture screenshot and assess: information hierarchy, layout structure, visual consistency, density appropriateness, empty/edge states, mobile readiness (375px)
- [ ] 8.2 Implement per-dimension verdicts — production-ready/needs-work/failing per dimension. Overall: production-ready (no failing, ≤1 needs-work), acceptable (no failing), not-production-ready (any failing)
- [ ] 8.3 Implement quality gap generation from screen assessment — for each needs-work/failing dimension: observation, reference to Library heuristic or reference product screenshot, improvement category

## 9. PO Review — Interaction Quality Assessment (Phase 2)

- [ ] 9.1 Implement interaction quality evaluator — for each interactive element encountered during journey/screen evaluation, assess: hover state, click feedback, loading states, success states, transition animations
- [ ] 9.2 Implement interaction ratings — polished (all dimensions good), functional (works but lacks polish), raw (minimal/no feedback). Raw interactions generate quality gaps
- [ ] 9.3 Test interaction evaluator against a product with intentionally varied interaction quality — verify it distinguishes polished from raw

## 10. PO Review — Library Heuristics & Reference Comparison (Phase 2)

- [ ] 10.1 Implement Library heuristic evaluation in PO Review context — apply all active heuristics (global + domain + personal), execute measurements, compare thresholds. Failures are quality gaps, NOT bugs
- [ ] 10.2 Implement measurement method dispatchers — dom-analysis, screenshot-llm, lighthouse-metric (from QA baseline), interaction-test, journey-test, api-test
- [ ] 10.3 Implement reference product screenshot capture — navigate to reference URLs, capture specified dimensions, cache in Library (<30 days freshness)
- [ ] 10.4 Implement pairwise comparison — per dimension: capture both products, LLM vision pairwise judgment, verdict: matches-reference/approaching-reference/significantly-below-reference
- [ ] 10.5 Implement comparison report — per-dimension verdict, side-by-side screenshots, specific observations. Significantly-below dimensions generate quality gaps with reference as evidence
- [ ] 10.6 Test heuristic engine + pairwise comparison against known products — verify measurement accuracy and comparison reliability

## 11. PO Review — Quality Report & Confidence (Phase 2)

- [ ] 11.1 Implement PO Review report aggregation — combine journey quality, screen quality, interaction quality, heuristic results, reference comparison into structured report with quality gap list
- [ ] 11.2 Implement quality gap categorization — each gap categorized: design_change, interaction_improvement, content_change, flow_restructure, performance_improvement. Prioritized: critical > high > medium > low
- [ ] 11.3 Implement PO Review verdict — PRODUCTION_READY (zero critical/high gaps, ≥85% heuristic pass, zero significantly-below reference), NEEDS_IMPROVEMENT (zero critical, has high/medium), NOT_READY (has critical or <70% heuristic pass or 2+ significantly-below)
- [ ] 11.4 Implement confidence score — weighted: journey quality 30%, screen quality 20%, heuristic functional pass rate 20%, spec completeness (from QA) 15%, reference comparison 15%. Non-functional reported separately
- [ ] 11.5 Implement recommended action logic — continue (≥0.9 + PRODUCTION_READY), deepen (0.7-0.9 + gaps concentrated), broaden (0.7-0.9 + missing capabilities), notify-human (<0.7 or NOT_READY with critical)
- [ ] 11.6 Test report, verdict, confidence, and action logic against mock PO Review data

## 11. The Seeder — Interactive Swarm

- [ ] 11.1 Implement swarm orchestrator — manage state across disciplines (brainstorming, competition, taste, spec, design), track which disciplines have run, detect loop-back triggers
- [ ] 11.2 Implement loop-back trigger detection — design challenges spec (>3 click journeys), taste challenges scope (too broad/narrow), spec surfaces competition gap
- [ ] 11.3 Implement convergence detection — all disciplines run at least once, no new loop-back triggers in last pass → declare convergence
- [ ] 11.4 Implement vision document generator — produce structured vision document from swarm outputs matching the defined schema
- [ ] 11.5 Implement product standard generator — inherit global + domain from Library, add project overrides and additions, generate definition of done
- [ ] 11.6 Implement seed spec generator — produce feature areas with user journeys (step-by-step), acceptance criteria, data model sketch, interaction patterns, edge cases, explicit scope boundaries
- [ ] 11.7 Implement PO check generation — for each journey step, instantiate Library check templates with product-specific parameters (element names, screen URLs, expected primary elements, density levels). Store as `po_checks` in seed spec
- [ ] 11.8 Implement screen check generation — for each screen, define primary element, expected density, and instantiate screen-level templates
- [ ] 11.9 Implement interaction check generation — for each key interaction, determine type (form, destructive, data-loading, navigation) and instantiate appropriate templates
- [ ] 11.10 Implement seed approval flow — present summary (feature area count, QA criteria count, PO check count, journey count, screen count, interaction count, heuristic count, definition of done, estimated cycles), handle approval/revision

## 12. The Runner — Shared Context & Core Loop Engine

- [ ] 12.1 Implement `cycle_context.json` schema — vision, product_standard, active_spec, library_heuristics (full definitions), reference_products, previous_evaluations (full reports), factory_decisions, factory_questions, evaluator_observations, runner_analysis. Context accumulates across cycles (appended, not replaced). Update: `cycle_context.json` is now the PRIMARY communication mechanism between phases. Each `claude -p` session reads the full file, does its work, and writes back. No in-memory state. The schema must be comprehensive enough that each phase has all context it needs without asking questions.
- [ ] 12.2 Implement state machine — states: seeding, building, qa-gate, qa-fixing, po-reviewing, analyzing, generating-change-spec, vision-checking, waiting-for-human, complete — with defined transitions
- [ ] 12.3 Implement Factory invocation with full shared context — pass complete `cycle_context.json` (not a summarised brief). Factory reads full context and writes decisions/questions/divergences back into it
- [ ] 12.3 Implement QA gate trigger — after Factory completes build, invoke QA phase with deployment URL and active spec. On FAIL: transition to qa-fixing, send bug fix brief to Factory. On PASS: transition to po-reviewing
- [ ] 12.4 Implement QA fix loop — QA fails → bug fix brief to Factory → Factory re-deploys → QA re-runs. Retry limit: 3 attempts on same criteria before escalating to human
- [ ] 12.5 Implement PO Review trigger — after QA passes, invoke PO Review with full shared context (including QA report with performance + code quality baselines, partial warnings, Factory decisions)
- [ ] 12.6 Implement Evaluator root cause analysis — when failures found, read factory_decisions and factory_questions to classify root cause: spec ambiguity, design choice, or missing context. Include root cause in evaluation report
- [ ] 12.7 Implement refinement loop — when root cause is spec ambiguity, instead of completing full evaluation and starting new cycle, send ambiguity back to relevant discipline (spec/design/vision) for clarification, update shared context, and resume current cycle
- [ ] 12.8 Implement analysis engine — read PO Review report with root cause analysis, execute recommended action logic, generate quality improvement spec or transition state. Read full shared context including Factory decisions to address actual root cause not just symptoms
- [ ] 12.9 Implement quality improvement spec generation — translate PO Review quality gaps into NEW specs (not bug fixes). Each spec: requires_design_mode=true, gaps with evidence and what_good_looks_like, root cause classification, affected screens/journeys, Library context
- [ ] 12.8 Implement spec prioritization — critical quality gaps > flow restructure > design change > interaction improvement > content change > performance > personal fingerprint
- [ ] 12.9 Implement quality improvement pipeline — new specs go through Factory full pipeline: design mode → implementation → QA gate → PO Review. Not a code patch.
- [ ] 12.10 Implement code quality degradation response — when QA flags code_quality_warning, Runner SHALL assess: continue with feature work (if degradation is minor) or trigger a refactoring cycle before continuing (if degradation threatens future velocity). Refactoring cycle: Factory receives a refactoring brief (reduce complexity, eliminate duplication, fix architecture violations) with no new features — purely structural improvement
- [ ] 12.11 Implement retry limit — after 5 PO Review cycles on same feature area without reaching PRODUCTION_READY, escalate to human with summary of attempts and recurring gaps

## 13. The Runner — Git, PRs & Loop Tracking

- [ ] 13.1 Implement branch-per-loop — create `rouge/loop-{N}-{feature-area}` branch from production branch at start of each cycle
- [ ] 13.2 Implement PR-per-loop — create PR with structured description: what was built, evaluation results, delta, quality gaps, Factory decisions, vision alignment
- [ ] 13.3 Implement PR merge on promotion — when loop is promoted to production, merge the PR
- [ ] 13.4 Implement PR close on rollback — when loop is rolled back, close PR without merging, add rollback explanation comment
- [ ] 13.5 Implement evaluation delta calculation — compare current PO Review against previous: confidence_delta, journey_delta, screen_delta, heuristic_delta, overall_delta (improving/stable/regressing)
- [ ] 13.6 Implement regression detection — if overall_delta is regressing for 2 consecutive loops, flag for rollback consideration
- [ ] 13.7 Implement plateau detection from delta — stable (±2%) for 3+ loops triggers plateau flag

## 14. The Runner — Staging, Production & Rollback

- [ ] 14.1 Implement dual environment management — track staging_url and production_url per project in cycle_context.json
- [ ] 14.2 Implement Factory-to-staging deployment — Factory always deploys to staging, never to production directly
- [ ] 14.3 Implement staging-to-production promotion — on evaluation pass (QA + PO Review PRODUCTION_READY or NEEDS_IMPROVEMENT with confidence ≥0.8), merge PR and promote staging to production
- [ ] 14.4 Implement rollback — close PR without merging, revert staging to previous production state, production unaffected
- [ ] 14.5 Implement rollback learning preservation — failed loop's evaluation, Factory decisions, and root cause analysis preserved in shared context. Only code reverted, knowledge kept
- [ ] 14.6 Implement rollback-informed next loop — next loop's shared context includes: what was tried, why it failed, "try a different approach"

## 15. The Runner — Journey Log & Meta-Narrative

- [ ] 15.1 Implement `journey.json` schema — per-loop entries: number, feature_area, branch, pr_number, timestamps, what_attempted, change_spec_type, qa_verdict, po_verdict, confidence, confidence_delta, overall_delta, quality_gaps_found/resolved, outcome (promoted/rolled_back), key_decisions, learnings, rollback_reason
- [ ] 15.2 Implement journey log append — after each loop completes (promoted, rolled back, or ongoing), append entry to journey.json
- [ ] 15.3 Implement journey log for rollbacks — outcome=rolled_back with rollback_reason and learnings populated
- [ ] 15.4 Implement journey timeline renderer — generate a Mermaid timeline from journey.json showing loops, outcomes, and confidence trend
- [ ] 15.5 Implement journey feature evolution view — from journey.json, show what was added/changed per loop, what went bad
- [ ] 15.6 Implement journey log inclusion in morning briefings — mini-timeline of last N loops with outcomes and confidence trend
- [ ] 15.7 DEFERRED V1 — Journey log inclusion in Saturday demo (full product journey visualization per product)

## 16. The Runner — Vision Checking & Confidence

- [ ] 16.1 Implement vision check — re-read vision document, review all completed work, LLM judgment on alignment, produce vision check report (alignment, gaps, scope recommendations, confidence)
- [ ] 16.2 Implement autonomous scope expansion — when vision check reveals needed capability not in original vision, add to feature queue if confidence >80%, flag in briefing if 70-80%, escalate if <70%
- [ ] 16.3 Implement pivot detection — when vision check reveals fundamental premise issues, compile evidence and notify human with structured pivot proposal
- [ ] 16.4 Implement confidence trend tracking — record confidence after each cycle, detect 3-cycle declining trends and 5-cycle plateaus, flag in briefing
- [ ] 16.5 Implement feature area ordering — dependency analysis, foundation first, cross-cutting last, present order to human during seeding for approval

## 17. The Runner — Meta-Loop

- [ ] 17.1 Implement cross-product pattern detection — after 3+ products, aggregate evaluation reports, identify heuristics that fail across multiple products
- [ ] 17.2 Implement factory-level vs product-level classification — determine whether recurring failures are addressable at the Factory level (stacks, skills, templates) or product level
- [ ] 17.3 Implement Factory improvement spec generation — create change specs targeting AI-Factory for recurring factory-level issues
- [ ] 17.4 Implement meta-analysis trigger — run after every 5 completed products

## 18. The Notifier — Slack Bot + Socket Mode (replaces original Slack integration design)

- [ ] 18.1 Implement Slack bot with Bolt.js and Socket Mode — ~50 lines, WebSocket connection, no public URL needed
- [ ] 18.2 Implement product-ready notification — structured message with production URL, build time, quality summary, confidence score
- [ ] 18.3 Implement pivot notification — structured message with status, what's happening, what was tried, lettered options (A/B/C/D)
- [ ] 18.4 Implement scope expansion notification — queued for morning briefing, includes capability added, reason, confidence, revert option
- [ ] 18.5 Implement morning briefing — progress per feature area, highlights, issues resolved, items needing input, confidence trend, journey timeline, screenshots (up to 5, annotated)
- [ ] 18.6 Implement briefing screenshot capture — screenshot primary screen + each feature area's main screen + significant design decision screens, annotate with captions
- [ ] 18.7 DEFERRED V1 — Saturday demo compilation (all products worked on, per-product status/URL/key achievement/screenshots, Library growth stats, meta-loop findings, journey visualizations)

## 19. The Notifier — Feedback Ingestion

- [ ] 19.1 Implement Slack message listener — receive human messages in response to notifications
- [ ] 19.2 Implement feedback parser — split message into distinct feedback items, handle multi-item messages
- [ ] 19.3 Implement feedback classifier — for each item, classify as product-change, global-learning, domain-learning, personal-preference, or direction using LLM analysis
- [ ] 19.4 Implement ambiguity handler — when classification confidence is low, send Slack confirmation with options
- [ ] 19.5 Implement voice transcription cleanup — detect rough transcription, clean up, present interpreted items for confirmation before routing
- [ ] 19.6 Implement feedback routing — route classified items to Runner (change specs, direction) or Library (standards, domain taste, fingerprint)
- [ ] 19.7 Implement batching logic — queue non-critical events for morning briefing, send critical events immediately (confidence <70%, build failure, pivot, budget threshold)

## 20. Integration & End-to-End Testing

- [ ] 20.1 E2E: Seed a landing page → Factory builds to staging → Test Integrity Gate → QA gate passes → PO Review runs → promote to production → verify three-phase evaluation produces integrity report, QA report, and PO Review report
- [ ] 20.2 E2E: Inject a bug (broken form submission) → verify QA gate catches it → verify bug fix brief → verify QA re-runs → verify PO Review only runs after QA passes
- [ ] 20.3 E2E: Inject a quality issue (flat hierarchy) → verify QA passes → verify PO Review catches it → verify quality gap generates NEW spec → verify new spec goes through design mode
- [ ] 20.4 E2E: Inject stale tests (spec changed, tests didn't) → verify Test Integrity Gate detects staleness → verify tests regenerated → verify QA runs with fresh tests
- [ ] 20.5 E2E: Seed a multi-feature web product → verify feature-area cycling → verify per-area evaluation → verify cross-area vision check
- [ ] 20.6 E2E: Simulate 3 cycles of feedback with recurring theme → verify Library fingerprint entry → verify future PO Reviews apply it
- [ ] 20.7 E2E: Simulate a loop that makes the product worse → verify regression detection → verify rollback (PR closed, staging reverted, learnings preserved) → verify next loop incorporates rollback learnings
- [ ] 20.8 E2E: Verify staging/production dual environment — Factory deploys to staging, promotion only on pass, human reviews production URL, rollback doesn't affect production
- [ ] 20.9 E2E: Verify journey.json accumulates across loops — check timeline rendering, feature evolution view, and rollback entries
- [ ] 20.10 E2E: Verify PR-per-loop — branch created, structured description, merged on promotion, closed on rollback
- [ ] 20.11 E2E: Crash mid-cycle at each state → restart → verify resume from checkpoint → verify no lost state
- [ ] 20.12 E2E: Simulate PO Review confidence dropping below 70% → verify pivot notification → verify Runner pauses → verify human response resumes
- [ ] 20.13 E2E: Run 5 products → verify meta-loop triggers → verify cross-product pattern detection → Factory improvement spec
- [ ] 20.14 E2E: Full happy path — seed → build → staging → test integrity → QA pass → PO Review PRODUCTION_READY → promote to production → Slack notification → human feedback → Library updated → journey log complete
