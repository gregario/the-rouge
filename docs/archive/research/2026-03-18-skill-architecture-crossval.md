# Skill Audit ↔ Architecture Cross-Validation

**Date:** 2026-03-18
**Purpose:** Ensure skill rewrites align with Rouge specs and architecture before writing any prompts

## Method

For each Rouge state machine phase, map:
1. What the spec says should happen
2. Which audited skills feed into it
3. Conflicts or gaps between the audit and the spec
4. What the Rouge-native prompt must include that NO external skill covers

---

## Phase: SEEDING (interactive via Slack)

### Spec says:
- 5 disciplines (brainstorming, competition, taste, spec, design) in non-linear swarm
- Loop-back triggers (design challenges spec, taste challenges scope, etc.)
- Convergence detection
- Produces: vision doc (YAML), product standard, seed spec with acceptance criteria, PO checks
- Human approval before state → `ready`

### Audit skills feeding in:
- brainstorming (S1, rewrite) — depth mode
- competition-review (F9, extend) — market landscape
- product-taste (F13, rewrite) — multi-invocation gate
- openspec-propose (F7, rewrite) — spec generation with depth
- plan-ceo-review (G1, extend) — premise challenge, scope modes
- plan-design-review (G3, extend) — design scoring, AI slop
- marketing-copy (F3, extend) — landing page copy
- legal-scaffold (0a.17, create) — T&Cs, privacy policy
- privacy-review (0a.18, create) — data flow mapping
- writing-plans (S13, extend) — implementation plan

### Conflicts / Gaps:

**CONFLICT 1: Seeding is interactive but most audit classifications assumed autonomous.**
The seeder runs via Slack relay — it IS interactive (human in the loop). But the audit classified skills as "autonomous mode" uniformly. Fix: seeding-phase skills should keep interactive capability but route through Slack (not AskUserQuestion). The Slack relay replaces AskUserQuestion, not cycle_context.json.

**CONFLICT 2: plan-ceo-review assumes it controls scope decisions.**
GStack's CEO review has a 10-section interactive flow and writes plans to `~/.gstack/projects/`. Rouge's seeder has its own swarm orchestrator controlling scope. Fix: extract the *concepts* (premise challenge, dream state mapping, temporal interrogation) into the seeder's brainstorming prompt. Don't invoke CEO review as a separate phase.

**CONFLICT 3: plan-design-review assumes it's reviewing an existing plan.**
During seeding, there's no plan yet — we're creating one. Fix: use the 0-10 rating methodology and AI slop checklist as evaluation criteria within the design discipline of the swarm, not as a standalone review pass.

**GAP 1: Swarm orchestrator doesn't exist in any ecosystem.**
The non-linear multi-discipline management with loop-back detection and convergence detection is entirely Rouge-native. No skill to absorb — this is create-from-scratch (task 0a.8).

**GAP 2: Legal scaffold and privacy review are new skills.**
No existing skill covers GC input review or GDPR data flow mapping. Create from scratch per tasks 0a.17, 0a.18.

**GAP 3: PO check generation from Library templates.**
The seeder must instantiate Library check templates with product-specific parameters. This is spec-defined (seeder spec) but no skill covers template instantiation. It's part of the seeder's internal logic, not a separate skill.

### Verdict: Seeding prompts must be AUTHORED, not composed from external skills.
The swarm orchestrator controls flow. Individual disciplines absorb concepts but never delegate to external skill prompts that assume top-level control.

---

## Phase: BUILDING (autonomous, `claude -p`)

### Spec says:
- Reads cycle_context.json (vision, active spec, previous evaluations, quality gaps)
- Factory invocation with full shared context
- Implements using TDD, subagent-driven development
- Deploys to STAGING only, never production
- Git: creates `rouge/loop-{N}-{feature-area}` branch
- Supabase: checks slot availability, pause/unpause as needed
- Model: Sonnet for implementation, Opus for architecture decisions

### Audit skills feeding in:
- subagent-driven-development (S7, extend) — primary execution engine
- test-driven-development (S9, keep-as-is) — TDD discipline
- executing-plans (S3, extend) — task-by-task execution
- dispatching-parallel-agents (S2, keep-as-is) — parallel work
- systematic-debugging (S8, keep-as-is) — when things break
- using-git-worktrees (S10, extend) — isolated workspace
- verification-before-completion (S12, keep-as-is) — evidence before claims

### Conflicts / Gaps:

**CONFLICT 4: SDD assumes it controls the full build lifecycle.**
Superpowers SDD has its own plan loading, task extraction, and finishing-a-development-branch flow. Rouge's runner controls the lifecycle — SDD is just the execution method within the building phase. Fix: the building prompt includes SDD's implementer/reviewer patterns INLINE but the runner controls when building starts/stops and what happens after.

**CONFLICT 5: finishing-a-development-branch assumes 4 options.**
Rouge always does the same thing after building: commit, push to the loop branch. No menu. Fix: building prompt has deterministic git behavior, not the 4-option finishing skill.

**GAP 4: Supabase slot management.**
No skill knows about Supabase's 2-slot free tier limit, pause/unpause via Management API, or slot rotation. The building prompt must check slot availability before deploying and handle the pause/unpause flow. This is spec-defined (runner spec, tasks 0b.11, 0c.10) but not covered by any audited skill.

**GAP 5: Staging-only deployment.**
No skill enforces "deploy to staging, never production." GStack's ship deploys and creates PRs for production. The building prompt must deploy to staging URL only, with the staging URL read from cycle_context.json. Production promotion is a separate phase (after QA + PO Review pass).

**GAP 6: Model selection per phase.**
The architecture specifies Sonnet for implementation, Opus for architecture. The launcher handles this via `--model` flag, not the skill prompt. But the building prompt should be aware it's running on Sonnet and not attempt Opus-level architectural reasoning.

### Verdict: Building prompt absorbs SDD/TDD/debugging methodology inline.
Must add: cycle_context.json reading, staging-only deployment, Supabase slot awareness, deterministic git (branch naming per spec), no lifecycle control (runner decides next phase).

---

## Phase: QA-GATE (autonomous, `claude -p`)

### Spec says:
- THREE sub-phases: Test Integrity Gate (Phase 0) → QA Gate (Phase 1) → results to runner
- Test Integrity: test-to-spec traceability, coverage gaps, orphaned/stale test detection, 100% coverage required
- QA Gate: spec criteria extraction, browser-based testing, functional correctness, Lighthouse baseline, code quality baseline (cyclomatic complexity, duplication, dead code, architecture integrity)
- Output: structured QA report with verdict (PASS/FAIL), criteria results, baselines
- On FAIL: → qa-fixing state (bug fix brief to Factory)
- On PASS: → po-reviewing state

### Audit skills feeding in:
- qa (GStack G7, extend) — browser QA, health scoring, fix loop
- ai-code-audit (P1, adopt) — AI-specific code quality
- security-review (P2, adopt) — OWASP checklist
- verification-before-completion (S12, keep) — evidence discipline
- browse (G6, keep) — headless browser commands

### Conflicts / Gaps:

**CONFLICT 6: GStack QA assumes it controls the full find-fix-verify cycle.**
The spec separates QA-GATE (find) from QA-FIXING (fix). GStack's QA does both in one flow. Fix: QA-GATE prompt does find + report only (like qa-only). QA-FIXING is a separate phase invoked by the runner if QA fails.

**CONFLICT 7: GStack QA health scoring doesn't match spec's QA report schema.**
The spec requires: verdict (PASS/FAIL), spec criteria results, functional correctness results, performance baseline, code quality baseline, spec completeness %. GStack's health scoring uses 8 weighted categories with severity deductions. Fix: use the health scoring METHODOLOGY but output in the spec's report schema. Add the code quality fields (complexity, duplication, architecture integrity) that GStack doesn't collect.

**GAP 7: Test Integrity Gate (Phase 0) doesn't exist in any skill.**
No audited skill does test-to-spec traceability, coverage gap detection, orphaned test removal, or stale test regeneration. This is entirely spec-defined (evaluator spec, tasks 6.1-6.12). The QA prompt must implement Phase 0 before Phase 1.

**GAP 8: Code quality baseline collection.**
The spec requires: cyclomatic complexity, code duplication, file sizes, dead code detection, test coverage, architecture integrity (circular deps, cross-layer violations). No audited skill collects all of these. GStack QA collects Lighthouse only. Fix: QA-GATE prompt must invoke linting/analysis tools (ESLint, jscpd, madge, c8, knip — all confirmed in tooling report).

**GAP 9: AI code audit timing.**
The audit classified ai-code-audit (P1) as "every-loop" but didn't specify WHERE in the loop. The spec's evaluator has Test Integrity → QA → PO Review. AI code audit fits in QA-GATE (Phase 1) alongside functional QA, or as a sub-phase between QA and PO Review. Decision needed: run AI code audit as part of QA-GATE Phase 1, producing findings that count toward the QA verdict.

**GAP 10: Security review timing.**
Same question as GAP 9. Security review (P2) should run as part of QA-GATE Phase 1. Security findings with severity CRITICAL should fail the QA gate.

### Verdict: QA-GATE prompt is Rouge-native, NOT a wrapped GStack skill.
Must implement: Phase 0 (test integrity, entirely new), Phase 1 (browser QA absorbing GStack methodology + AI code audit + security review + code quality collection). Output in spec's report schema. Does NOT fix bugs — that's QA-FIXING phase.

---

## Phase: QA-FIXING (autonomous, `claude -p`)

### Spec says:
- Receives bug fix brief from runner (QA failures)
- Factory re-implements fixes
- Re-deploys to staging
- Runner re-triggers QA-GATE
- Retry limit: 3 attempts on same criteria before escalating to human

### Audit skills feeding in:
- systematic-debugging (S8, keep) — hypothesis-driven debugging
- test-driven-development (S9, keep) — write failing test first
- subagent-driven-development (S7, extend) — parallel fix implementation

### Conflicts / Gaps:

**CONFLICT 8: None significant.** QA-FIXING is essentially a building phase with a narrow scope (fix specific bugs). The same SDD/TDD/debugging methodologies apply.

**GAP 11: Retry counting.**
No skill tracks "3 attempts on same criteria." The QA-FIXING prompt must read previous QA reports from cycle_context.json, detect recurring failures, and escalate after 3 attempts by transitioning to waiting-for-human.

### Verdict: QA-FIXING prompt reuses building methodology with narrow scope + retry awareness.

---

## Phase: PO-REVIEWING (autonomous, `claude -p`)

### Spec says:
- THREE sub-phases: Journey Quality → Screen Quality → Interaction Quality
- Plus: Library heuristic evaluation, pairwise reference comparison
- Output: quality gaps (not bugs), categorized as design_change/interaction_improvement/content_change/flow_restructure/performance_improvement
- Verdict: PRODUCTION_READY / NEEDS_IMPROVEMENT / NOT_READY
- Confidence score: weighted composite (journey 30%, screen 20%, heuristic 20%, spec completeness 15%, reference comparison 15%)

### Audit skills feeding in:
- plan-design-review (G3, extend) — 0-10 rating methodology, design dimensions
- design-review (G14, extend) — 80-item design checklist, AI slop detection
- a11y-review (0a.16, create) — WCAG accessibility
- browse (G6, keep) — headless browser for screenshots and interaction
- health-scoring partial (keep) — weighted scoring methodology

### Conflicts / Gaps:

**CONFLICT 9: GStack design-review assumes it fixes issues.**
The spec says PO Review produces quality GAPS, not fixes. Fixes happen in the next build cycle via quality improvement specs. Fix: PO Review prompt uses the checklist/methodology but outputs gaps, not fixes.

**CONFLICT 10: GStack design scoring doesn't match spec's confidence schema.**
The spec has a specific weighted formula (journey 30%, screen 20%, etc.). GStack uses letter grades (A-F). Fix: use GStack's evaluation dimensions as inputs but compute confidence per the spec's formula.

**GAP 12: Journey quality evaluation doesn't exist in any skill.**
Walking through as a first-time user, assessing clarity/feedback/efficiency/delight per step — this is entirely spec-defined (evaluator spec, tasks 7.1-7.4). No audited skill does journey-level quality assessment.

**GAP 13: Library heuristic evaluation.**
Applying all active heuristics (global + domain + personal), executing measurements, comparing thresholds — this is spec-defined (evaluator spec, tasks 10.1-10.6). No audited skill integrates with the Library.

**GAP 14: Pairwise reference comparison.**
Capturing reference product screenshots, LLM vision pairwise judgment — spec-defined (evaluator spec, tasks 10.3-10.5). No audited skill does this.

### Verdict: PO Review is almost entirely Rouge-native.
Absorbs: design checklist items, AI slop detection, 0-10 rating methodology, health scoring math. But the journey/screen/interaction quality assessment, Library integration, and reference comparison are all spec-defined and new.

---

## Phase: ANALYZING (autonomous, `claude -p`)

### Spec says:
- Reads PO Review report + root cause analysis
- Executes recommended action logic (continue/deepen/broaden/notify-human)
- Generates quality improvement specs (NEW specs, not patches)
- Specs go through full pipeline: design mode → implementation → QA → PO Review

### Audit skills feeding in:
- No direct skill maps here. This is Runner logic.

### Conflicts / Gaps:

**GAP 15: Quality improvement spec generation.**
Translating PO Review gaps into new specs with design_mode_required=true, root cause classification, affected screens/journeys — entirely spec-defined (runner spec, tasks 12.8-12.9).

### Verdict: Analyzing is purely Runner-native logic.

---

## Phase: VISION-CHECKING (autonomous, `claude -p`)

### Spec says:
- Re-read vision document, review all completed work
- LLM judgment on alignment
- Autonomous scope expansion (confidence >80%), flag (70-80%), escalate (<70%)
- Pivot detection for fundamental premise issues
- Confidence trend tracking (3-cycle decline, 5-cycle plateau)

### Audit skills feeding in:
- No direct skill maps. This is Vision Check (task 0a.10, create from scratch).

### Verdict: Vision Check is entirely Rouge-native.

---

## Phase: SHIP / PROMOTION (runner-controlled)

### Spec says:
- Staging-to-production promotion when: QA PASS + PO Review PRODUCTION_READY (or NEEDS_IMPROVEMENT with confidence ≥0.8)
- Merge PR
- Production deployment
- Rollback: close PR without merging, revert staging, preserve learnings

### Audit skills feeding in:
- ship (GStack G5, rewrite) — version bump, changelog, PR creation
- document-release (G11, extend) — post-ship doc sync
- retro (G10, extend) — cycle retrospective

### Conflicts / Gaps:

**CONFLICT 11: GStack ship doesn't know about staging/production promotion.**
GStack ship assumes: merge base, test, review, version, push, create PR. Rouge's ship is: merge PR (already exists from building phase), promote staging to production, verify deployment. Fundamentally different flow.

**CONFLICT 12: GStack ship's version bump logic may conflict with spec.**
The spec doesn't define version bump rules — it cares about promotion and rollback. GStack's 4-digit version scheme (MAJOR.MINOR.MICRO.PATCH) may not match the project's versioning. Fix: version bump is project-specific, configured in cycle_context.json.

**GAP 16: Production promotion mechanism.**
How staging becomes production depends on the platform (Cloudflare: update production alias, or deploy to production route). No skill covers platform-specific promotion. This is deployment infrastructure (task 0b).

**GAP 17: Rollback mechanism.**
Close PR, revert staging, preserve learnings in cycle_context — no skill covers this. Runner-native logic.

### Verdict: Ship/promotion is Runner-native.
Absorbs: changelog generation pattern, bisectable commit splitting, documentation sync methodology. But the promotion/rollback flow is entirely spec-defined.

---

## Phase: FINAL-GATE (pre-first-production-deploy)

### Spec says: (from task 0a.26)
- All tests pass + coverage threshold
- Security audit clean
- Privacy review complete
- Legal docs generated
- Error monitoring configured (Sentry)
- Analytics configured (Counterscale)
- Lighthouse baseline met
- SEO basics
- Domain + SSL
- Marketing page live
- a11y baseline met

### Audit skills feeding in:
- final-validation-gate (0a.26, create) — the checklist itself
- security-review (P2, adopt) — security gate
- privacy-review (0a.18, create) — privacy gate
- a11y-review (0a.16, create) — accessibility gate

### Conflicts / Gaps:

**GAP 18: Infrastructure provisioning.**
Sentry, Counterscale, domain/SSL configuration — these are deployment infrastructure tasks (0b), not skill prompts. The final gate CHECKS that they're configured, doesn't configure them.

### Verdict: Final gate is a Rouge-native checklist that VERIFIES infrastructure, doesn't create it.

---

## Cross-Cutting Conflicts

**CONFLICT 13: Prompt override risk (user's key concern).**
If any Rouge phase prompt includes a line like "Use the /qa skill" or invokes GStack/superpowers as slash commands, those skills' internal prompts will take over orchestration. Every skill assumes it's the top-level controller.

**MITIGATION:** Rouge phase prompts must:
1. NEVER invoke slash commands (/qa, /ship, /review, etc.)
2. NEVER reference external skill names
3. Include methodology and checklists INLINE in the prompt
4. Use browse binary ($B commands) directly — that's a CLI tool, not an orchestrating skill
5. Use openspec CLI commands directly — that's a CLI tool
6. Use sentry-cli, wrangler, etc. directly — CLI tools
7. Control flow exclusively via state.json transitions read by the launcher

**CONFLICT 14: cycle_context.json schema must be comprehensive.**
Every phase reads cycle_context.json for ALL its context. If the schema misses something a phase needs, that phase will hallucinate or fail. The spec defines the schema (runner spec, task 12.1) but the skill audit adds new fields:
- `review_readiness_dashboard` (from GStack)
- `diff_scope` (from GStack)
- `ai_code_audit_score` (from PR #564)
- `security_review_findings` (from PR #560)
- `design_review_score` (from GStack)
- `a11y_findings` (new)
- `legal_status` (new)
- `privacy_status` (new)

---

## Summary: What Changes from the Audit

| Audit Recommendation | Spec Alignment | Action |
|---|---|---|
| "Use GStack QA" | **PARTIAL** — methodology yes, flow control no | Absorb methodology, author Rouge-native QA prompt |
| "Use GStack ship" | **CONFLICT** — GStack ship ≠ Rouge promotion | Absorb changelog/version patterns, author Rouge-native promotion prompt |
| "Merge 3 review systems" | **PARTIAL** — checklists yes, but must output to spec's report schema | Absorb checklists inline, author Rouge-native review prompt |
| "Use SDD for building" | **PARTIAL** — SDD methodology yes, lifecycle control no | Absorb implementer/reviewer patterns, runner controls lifecycle |
| "extend = strip AskUserQuestion" | **INSUFFICIENT** — also need cycle_context.json awareness, spec-compliant output schemas, staging/production/slot awareness | "Extend" actually means "author new prompt absorbing concepts" |
| "autonomous-mode partial" | **GOOD** — but must also define cycle_context.json field schemas | Add schema definitions to the partial |
| "keep-as-is" (TDD, debugging, verification) | **CORRECT** — these are pure methodologies included inline in build prompts | Verified: no conflicts |

## Revised Approach for Skill Writing

Based on this cross-validation, the correct approach is:

1. **Author Rouge-native prompts for each state machine phase** (not "extend existing skills")
2. **Each prompt absorbs relevant concepts INLINE** from the audit (checklists, methodologies, scoring rubrics)
3. **No prompt invokes external skills by name** — prevents prompt override
4. **All prompts read from and write to cycle_context.json** — the spec-defined communication bus
5. **The launcher controls phase sequencing** via state.json — no skill decides "what's next"
6. **CLI tools (browse, openspec, sentry-cli, wrangler) are called directly** — they don't have orchestrating prompts
7. **The autonomous-mode partial defines** the cycle_context.json schema, decision-logging format, escalation rules, and retry counting

This means task 0a is not "extend 22 skills" — it's "author ~12 Rouge-native phase prompts, each absorbing concepts from the 22 extended skills." The 22 skills are RESEARCH INPUTS, not things we modify.
