# V2 Process Map — End-to-End Pipeline

> Every process step, artifact, input, output, and transformation from first spec input through final delivered product. Use this as the source of truth for reviewing the pipeline and generating Excalidraw diagrams.
>
> Generated: 2026-04-03. Supersedes the V1 flow diagram at `docs/plans/2026-03-17-rouge-flow-diagram.md`.

---

## Pipeline Summary

```
SEEDING (interactive)
  Human idea → Swarm (7 disciplines) → vision.json + seed_spec + state.json
  
FOUNDATION (autonomous, enforced)
  foundation_spec → TDD build → foundation-eval → PASS/FAIL
  
STORY LOOP (autonomous, fast, per-story)
  story_context.json → TDD build → story_result → next story or batch complete
  
MILESTONE EVALUATION (autonomous, batched)
  deploy staging → test integrity → code review → product walk → evaluation (3 lenses) → QA verdict
  
ANALYZING (autonomous, decision point)
  evaluation_report → root cause analysis → recommendation (promote/deepen/broaden/insert-foundation/notify-human/rollback)
  improvement_items routed: this-milestone → deepen, global → persist, future → drop
  
CHANGE SPEC GENERATION (autonomous, if deepen/broaden)
  change_spec_briefs → OpenSpec CLI → fix stories added to milestone
  
VISION CHECK (autonomous, after all milestones)
  vision + all completed work + global_improvements → alignment assessment → ship or escalate
  
SHIPPING (autonomous)
  pre-checks → version bump → changelog → PR → merge → deploy production
  
FINAL REVIEW (autonomous, last gate)
  customer walkthrough → global improvements check → ship/refine/major-rework
  
COMPLETION
  learn-from-project → prompt improvement proposals → GitHub issues
```

---

## Phase 1: SEEDING (state: `seeding`)

**Prompt:** `src/prompts/seeding/00-swarm-orchestrator.md`  
**Model:** opus  
**Nature:** Interactive (human present)

### Sub-Disciplines (non-linear swarm)

| # | Discipline | North Star | Key Output |
|---|-----------|------------|------------|
| 1 | Brainstorming | 10x vision | Expanded vision, user outcomes |
| 2 | Competition | Differentiation | Gap analysis, differentiation angle |
| 3 | Taste | Worth building? | Expand/hold/reduce verdict |
| 4 | Spec | Comprehensive coverage | Feature areas, journeys, acceptance criteria |
| 5 | Design | Can spec → good UX? | UX validation, 3-click violations |
| 6 | Legal-Privacy | Compliance | T&Cs, privacy policy, cookie policy |
| 7 | Marketing | Launch readiness | Landing page copy |

**Mandatory sequence:** BRAINSTORMING → TASTE → SPEC → DESIGN. LEGAL before final approval. COMPETITION and MARKETING after BRAINSTORMING.

### Inputs

- Human's initial idea (Slack message)

### Outputs

| Artifact | Path | Description |
|----------|------|-------------|
| Vision document | `vision.json` | Structured YAML: persona, problem, emotional north star, feature areas, journeys, acceptance criteria |
| Product standard | `product_standard.json` | Global + domain + project quality overrides |
| Seed spec | `seed_spec/` | Milestones with nested stories (V2), acceptance criteria, PO checks |
| State file | `state.json` | V2 schema with milestones[], stories[], `current_state: "ready"` |
| Legal docs | `legal/` | T&Cs, privacy, cookies (if generated) |
| Marketing | `marketing/` | Landing page copy |

### Decision Points

- All 7 disciplines run ≥1 time + no new loop-backs → convergence
- TASTE kills idea → writes to `docs/drafts/ideas-graveyard.md`, exits
- Human approves → artifacts written, state set to `ready`
- Human rejects → loop back to relevant discipline

---

## Phase 2: FOUNDATION BUILDING (state: `foundation`)

**Prompt:** `src/prompts/loop/00-foundation-building.md`  
**Model:** opus  
**Context Tier:** T3 (full)

### Inputs

| Source | Field | Description |
|--------|-------|-------------|
| cycle_context.json | `foundation_spec` | Scope, acceptance criteria, integration manifest |
| cycle_context.json | `decomposition_strategy` | Feature areas, integration blockers |
| cycle_context.json | `vision` | Full product vision |
| cycle_context.json | `product_standard` | Quality bar |
| cycle_context.json | `library_heuristics` | All heuristics |

### Outputs

| Source | Field | Description |
|--------|-------|-------------|
| cycle_context.json | `deployment_url` | Staging URL or null |
| cycle_context.json | `implemented[]` | Per task: category, criteria, files, tests, serves_feature_areas |
| cycle_context.json | `skipped[]` | Per task: reason, blocker_type, unblocked_by, blocks_feature_areas |
| cycle_context.json | `divergences[]` | spec_says, actually_did, rationale, reversible |
| cycle_context.json | `factory_decisions[]` | decision, alternatives, rationale, confidence |
| cycle_context.json | `factory_questions[]` | question, severity, resolved_as |
| cycle_context.json | `foundation_completion` | schema_ready, auth_ready, integrations_ready, deploy_ready, fixtures_ready, blocking_gaps[] |

### Artifacts

| Type | Pattern | Description |
|------|---------|-------------|
| Git branch | `rouge/foundation` | Foundation work branch |
| Commits | `feat(schema):`, `feat(auth):`, etc. | Bisectable per subsystem |
| Integration drafts | `library/integrations/drafts/` | New integration patterns |
| Migrations | `supabase/migrations/` | Database schema |
| Seed data | Project-specific | Realistic domain data |

### External Tools

`git`, `npm run build`, `npx wrangler deploy`, `supabase db push`, `supabase functions deploy`, web search (integration research), test runner

---

## Phase 3: FOUNDATION EVALUATION (state: `foundation-eval`)

**Prompt:** `src/prompts/loop/00-foundation-evaluating.md`  
**Model:** opus  
**Context Tier:** T3

### Six Evaluation Dimensions

| Dimension | FAIL Condition |
|-----------|---------------|
| Schema completeness | Any feature area would need ALTER TABLE |
| Integration scaffolds | Missing, broken, or hardcoded credentials |
| Auth flows | Any auth step missing or broken |
| Shared components | App shell errors (skip if backend-only) |
| Deployment pipeline | Staging URL 500/timeout (skip if no deploy in scope) |
| Test fixtures | Missing or placeholder data |

### Critical Check: Silent Degradation

Fails if: mock services pretending to be real, JSON blobs instead of typed columns, TODO comments in wrappers, test stubs that always return true.

### Outputs

| Source | Field | Description |
|--------|-------|-------------|
| cycle_context.json | `foundation_eval_report.verdict` | PASS or FAIL |
| cycle_context.json | `foundation_eval_report.dimensions` | Per-dimension: status, findings[] |
| cycle_context.json | `foundation_eval_report.silent_degradation_check` | status, evidence[] |

### Decision Points (launcher)

- FAIL → retry (`next = 'foundation'`)
- PASS → mark foundation complete, run `contribute-pattern.js`, run `provision-infrastructure.js`, find first milestone/story → `next = 'story-building'`
- Provisioning fails → `next = 'escalation'`

---

## Phase 4: STORY BUILDING (state: `story-building`)

**Prompt:** `src/prompts/loop/01-building.md`  
**Model:** opus  
**Context Tier:** T2 (pre-filtered by launcher)

### Context Assembly (launcher pre-step)

Launcher writes `story_context.json` containing:
- `story.spec`, `story.id`, `story.name`, `story.depends_on`, `story.fix_memory`, `story.attempt_number`
- `foundation` brief (architecture, schemas, integrations, deploy config)
- `related_stories` (same milestone, done, with files_changed)
- `milestone_learnings` (circuit breaker corrective instructions)
- `vision_summary` (T2 one-liner)
- `product_standard`, `library_heuristics`, `relevant_decisions/questions/divergences`

### Outputs

| Source | Field | Description |
|--------|-------|-------------|
| cycle_context.json | `story_result.outcome` | pass, fail, or blocked |
| cycle_context.json | `story_result.files_changed[]` | Files modified |
| cycle_context.json | `story_result.env_limitations[]` | Environment constraints |
| cycle_context.json | `story_result.escalation` | tier + summary (if blocked) |
| cycle_context.json | `implemented[]`, `skipped[]`, `divergences[]` | Per-task details |
| cycle_context.json | `factory_decisions[]`, `factory_questions[]` | Reasoning trail |

### Artifacts

| Type | Pattern |
|------|---------|
| Git branch | `rouge/story-{milestone}-{story_id}` |
| Commits | Bisectable, type/scope format |
| Tests | Unit, integration, component |

### Key Transformations

- Complexity profile detection → decomposition strategy
- Task extraction → classify as BUILD/EXTEND/REUSE/REFACTOR-THEN-BUILD
- TDD red/green/refactor per task
- Subagent-driven development for 3+ tasks

### Decision Points (launcher)

- `outcome === 'pass'` → story done, `consecutive_failures = 0`
- `outcome === 'blocked'` → story blocked, records fix_memory + escalation
- `outcome === 'fail'` → story pending (retry), records fix_memory
- `consecutive_failures >= 3` → circuit breaker → `next = 'analyzing'`
- `isBatchComplete(milestone)`:
  - All blocked, zero done → `next = 'escalation'`
  - Has done stories → deploy staging → `next = 'milestone-check'`
- Otherwise → next eligible story → `next = 'story-building'`

---

## Phase 5: MILESTONE EVALUATION (state: `milestone-check`)

**Prompt:** `src/prompts/loop/02-evaluation-orchestrator.md`  
**Model:** opus  
**Context Tier:** T3

### Context Assembly (launcher pre-step)

Launcher writes `milestone_context.json` with milestone summary, deployment_url, diff_scope, accumulated factory_decisions/questions/divergences, vision, product_standard, library_heuristics, reference_products.

### Sub-Phase Pipeline (strict sequence)

```
Step 1: Diff scope detection (src/rouge-diff-scope.sh)
Step 1.5: Classify cycle type → evaluation_tier (full | gate)
Step 2: Reset review readiness dashboard
Step 3: Execute sub-phases:

  Sub-Phase 0: TEST INTEGRITY (02a) ─── always runs
      Reads: active_spec, test files
      Writes: test_integrity_report (spec_coverage_pct, verdict)
      FAIL → milestone-fix
      
  Sub-Phase 1a: CODE REVIEW (02c) ─── always runs
      Runs: ESLint, jscpd, madge, knip, npm audit
      AI audit: 7 dimensions (architecture, consistency, robustness, production risks, security, dead/hallucinated, tech debt)
      Writes: code_review_report (code_quality_baseline, ai_code_audit, security_review)
      
  Sub-Phase 1b: PRODUCT WALK (02d) ─── runs on full tier
      Navigates every screen, captures screenshots, Lighthouse, console errors, a11y tree
      Interactive elements, forms, journeys, responsive (320/768/1440px)
      Writes: product_walk (screens[], journeys[], responsive, forms)
      Screenshots: screenshots/cycle-{N}/walk/
      
  Sub-Phase 1c: RE-WALK (02f) ─── only if re_walk_requests[] not empty
      Targeted follow-up observations
      Writes: product_walk.re_walk_results[]
      
  Sub-Phase 2: EVALUATION (02e) ─── runs on full tier
      Three lenses applied in sequence:
      
      QA LENS: criteria verification (pass/fail/partial/env_limited), functional correctness
      DESIGN LENS: 8 categories (0-10), a11y assessment, AI slop detection (0-100)
      PO LENS: journey quality, screen quality, Nielsen's 10, confidence (raw + adjusted), improvement_items[]
      
      Health score: starts at 100, severity deductions + WTF-likelihood
      
      Writes: evaluation_report
        .qa.verdict (PASS/FAIL)
        .qa.criteria_pass_rate
        .design.design_review (overall_score, category_scores, ai_slop_score)
        .design.a11y_review
        .po.verdict (PRODUCTION_READY/NEEDS_IMPROVEMENT/NOT_READY)
        .po.confidence (raw)
        .po.confidence_adjusted (env_limited excluded)
        .po.env_limited_impact
        .po.recommended_action
        .po.improvement_items[] (scope: this-milestone/global/future-milestone)
        .health_score
        .fix_tasks[] (on FAIL)

Step 4: Final dashboard check (review-readiness.sh status/check)
```

### Decision Points (launcher)

- `evaluation_report.qa.verdict === 'FAIL'` → `next = 'milestone-fix'`
- `evaluation_report.qa.verdict === 'PASS'` → `next = 'analyzing'`

---

## Phase 6: QA FIXING (state: `milestone-fix`)

**Prompt:** `src/prompts/loop/03-qa-fixing.md`  
**Model:** opus  
**Context Tier:** T1 (focused)

### Inputs

Launcher writes `fix_story_context.json` with: regressions from fix_tasks, root_cause_analysis, retry_history, do_not_repeat, affected_files, active_spec, deployment_url.

### Outputs

| Source | Field | Description |
|--------|-------|-------------|
| cycle_context.json | `qa_fix_results.criteria_fixed[]` | Per fix: root_cause, hypothesis, fix_description, commit_sha |
| cycle_context.json | `qa_fix_results.criteria_escalated[]` | Per escalation: attempts_total, reason |
| cycle_context.json | `qa_fix_results.escalation_needed` | Boolean |
| cycle_context.json | `retry_counts.{criterion_id}` | Attempt history |

### Artifacts

- Atomic commits per fix: `fix(rouge/milestone-{m}): {criterion-id}`
- Regression tests per fix
- Staging redeployment

### Decision Points (launcher)

- Always → `next = 'milestone-check'` (re-evaluate)

---

## Phase 7: ANALYZING (state: `analyzing`)

**Prompt:** `src/prompts/loop/04-analyzing.md`  
**Model:** opus

### Inputs

| Source | Field |
|--------|-------|
| evaluation_report | .po.verdict, .po.confidence, .po.confidence_adjusted, .po.improvement_items[] |
| evaluation_report | .qa.verdict, .qa.criteria_pass_rate, .qa.code_quality_baseline |
| evaluation_report | .design.design_review, .design.a11y_review |
| evaluation_report | .health_score |
| cycle_context.json | factory_decisions, factory_questions, previous_cycles, vision, product_standard |
| state.json | confidence_history |
| cycle_context.json | retry_counts, qa_fix_results |
| cycle_context.json | _circuit_breaker, story_failures (if circuit breaker) |

### Outputs

| Source | Field | Description |
|--------|-------|-------------|
| cycle_context.json | `analysis_recommendation.action` | promote, deepen:{area}, broaden, insert-foundation, notify-human, rollback |
| cycle_context.json | `analysis_result.confidence_trend` | current, previous, delta, direction, flags |
| cycle_context.json | `analysis_result.root_cause_analysis[]` | Per gap: root_cause (spec_ambiguity/design_choice/missing_context/implementation_bug) |
| cycle_context.json | `analysis_result.decomposition_health` | foundation_gaps, integration_gaps, schema_debt, silent_degradation |
| cycle_context.json | `analysis_result.change_spec_briefs[]` | Per gap: priority, affected_screens, approach_hint, do_not_repeat |
| cycle_context.json | `analysis_result.improvement_routing` | this_milestone_count, global_persisted_count, convergence_guardrail_triggered |
| global_improvements.json | Appended entries | Global-scoped improvement items persisted |

### Key Transformations

- Quality gaps → root cause classification (using factory_decisions cross-reference)
- Improvement items → routed by scope (this-milestone → briefs, global → persist, future → drop)
- Convergence guardrail: 2+ consecutive deepen:improvements with same items + no confidence change → override to promote

### Decision Points (launcher)

| Action | Next State |
|--------|-----------|
| `insert-foundation` | `foundation` |
| `mid_loop_correction` (circuit breaker) | `story-building` (corrective context injected) |
| `promote` / `continue` + next milestone exists | `story-building` (new milestone) |
| `promote` / `continue` + all milestones done | `vision-check` |
| `deepen:*` / `broaden` | `generating-change-spec` |
| `notify-human` / `rollback` | `escalation` |

---

## Phase 8: CHANGE SPEC GENERATION (state: `generating-change-spec`)

**Prompt:** `src/prompts/loop/05-change-spec-generation.md`  
**Model:** opus

### Inputs

- `analysis_result.change_spec_briefs[]`, `root_cause_analysis[]`
- `vision`, `product_standard`, `active_spec`, `library_heuristics`
- `evaluation_report.po`, `evaluation_report.qa`
- `factory_decisions`, `previous_cycles`, `reference_products`

### Outputs

| Source | Field | Description |
|--------|-------|-------------|
| Change spec files | `openspec/changes/` | Full OpenSpec change specs with acceptance criteria |
| cycle_context.json | `change_specs_pending[]` | spec_path, gap_ids, priority, requires_design_mode, criteria_count |

### Decision Points (launcher)

- Reads `change_specs_pending[]`, adds fix stories to milestone
- Fix stories exist → `next = 'story-building'`
- No fix stories → `next = 'milestone-check'`

---

## Phase 9: VISION CHECK (state: `vision-check`)

**Prompt:** `src/prompts/loop/06-vision-check.md`  
**Model:** opus

### Inputs

- `vision`, `implemented`, `previous_cycles`, `factory_decisions`, `evaluator_observations`
- `evaluation_report.po.confidence`, `evaluation_report.po.quality_gaps`
- `state.json.confidence_history`
- `journey.json`
- `global_improvements.json`

### Outputs

| Source | Field | Description |
|--------|-------|-------------|
| cycle_context.json | `vision_check_results.vision_alignment` | core_promise_delivery, persona_fit, identity_consistency, trajectory |
| cycle_context.json | `vision_check_additions` | Auto-added scope (confidence > 0.8) |
| cycle_context.json | `vision_check_flagged` | Flagged for morning briefing (0.7-0.8) |
| cycle_context.json | `pivot_proposal` | If fundamental premise issues detected |
| state.json | `confidence_history[]` | Appended with current check |

### Decision Points (launcher)

- `trajectory === 'diverging'` OR `pivot_proposal` → `next = 'escalation'`
- Otherwise → `next = 'shipping'`

---

## Phase 10: SHIPPING (state: `shipping`)

**Prompt:** `src/prompts/loop/07-ship-promote.md`  
**Model:** opus

### Pre-checks

ALL must pass: test_integrity, qa_gate, ai_code_audit, security_review, po_review. Any failure → `ship_blocked: true`, exit.

### Outputs

| Source | Field | Description |
|--------|-------|-------------|
| package.json | `version` | Bumped (semver) |
| CHANGELOG.md | New entry | User-facing changelog |
| cycle_context.json | `ship_result` | success, version, pr_number, pr_url, deploy_timestamp |

### Artifacts

- PR via `gh pr create` with structured body
- PR merged via `gh pr merge`
- Production deployment
- Version bump commit

### External Tools

`gh pr create`, `gh pr merge`, `npx wrangler deploy` (production), `npm publish` (if npm), `curl` (health check)

### Decision Points (launcher)

- Always → `next = 'final-review'`

---

## Phase 11: FINAL REVIEW (state: `final-review`)

**Prompt:** `src/prompts/loop/10-final-review.md`  
**Model:** opus

### Inputs

- `vision`, `deployment_url`, `evaluation_report`, `previous_cycles`
- `feedback.json` (Product Owner's voice, if exists)
- `global_improvements.json` (cross-cutting issues, if exists)

### Outputs

| Source | Field | Description |
|--------|-------|-------------|
| cycle_context.json | `final_review_report.production_ready` | Boolean |
| cycle_context.json | `final_review_report.recommendation` | ship, refine, major-rework |
| cycle_context.json | `final_review_report.polish_gaps[]` | Things that work but feel unfinished |
| cycle_context.json | `final_review_report.rough_edges[]` | Things that cause friction |
| cycle_context.json | `final_review_report.delight_moments[]` | Things that feel good |
| cycle_context.json | `final_review_report.global_improvements_observed[]` | {id, still_present, customer_impact} |
| cycle_context.json | `final_review_report.global_improvements_resolved[]` | IDs of fixed globals |

### Artifacts

- Screenshots: `screenshots/cycle-{N}/final-review/` (clean, no annotations)

### Decision Points (launcher)

- `production_ready || human_approved` → `next = 'complete'`
- `recommendation === 'major-rework'` → `next = 'escalation'`
- `recommendation === 'refine'`:
  - `final_review_attempts >= 3` → `next = 'escalation'` (tier 3, taste-judgment)
  - Otherwise → `next = 'generating-change-spec'`

---

## Phase 12: COMPLETION (state: `complete`)

**No prompt** — launcher handles directly.

### Actions

1. Runs `learn-from-project.js` (cross-product learning extraction)
2. Reads `prompt_improvement_proposals[]` → creates GitHub issues with label `self-improvement`
3. Slack notification: `complete`

---

## Terminal States

| State | Behavior |
|-------|----------|
| `ready` | Skipped by launcher. Human triggers loop explicitly. |
| `escalation` | Checks for `feedback.json`. Resolved → resume. Absent → wait. |
| `complete` | Terminal. Learning extraction, prompt improvement proposals. |

---

## Key Files Per Project

| File | Written By | Read By | Lifecycle |
|------|-----------|---------|-----------|
| `state.json` | Launcher | All phases | Persistent, updated per transition |
| `cycle_context.json` | All phases | All phases | Accumulates across cycle |
| `story_context.json` | Launcher (assembly) | story-building | Per-story, overwritten |
| `milestone_context.json` | Launcher (assembly) | milestone-check | Per-milestone, overwritten |
| `fix_story_context.json` | Launcher (assembly) | qa-fixing | Per-fix-cycle, overwritten |
| `vision.json` | Seeding | Foundation, building, analyzing, vision-check | Persistent |
| `product_standard.json` | Seeding | Building, evaluation, analyzing | Persistent |
| `journey.json` | Cycle retrospective | Vision-check, analyzing | Append-only |
| `global_improvements.json` | Analyzing | Vision-check, final-review | Append-only, project root |
| `feedback.json` | Human | Launcher (escalation), final-review | Ephemeral, deleted on resolution |
| `seed_spec/` | Seeding | Building, evaluation | Persistent |

---

## Slack Notification Types

| Type | Trigger | Content |
|------|---------|---------|
| `transition` | Every state change | Project, from→to, emoji, confidence sparkline |
| `complete` | Phase completion | Project, phase, duration, files delta |
| `qa` | QA verdict | Verdict, health score, criteria pass/total |
| `escalation` | Enter escalation | Project, phase, reason, context |
| `briefing` | Daily 8am | All projects: status, overnight cycles, items needing input |
| `screenshots` | Screenshot capture | Count, loop, screens list |

---

## Launcher Infrastructure

### Watchdog (progress-based, 3 conditions ALL must be true to kill)

| Condition | Default | Env Var |
|-----------|---------|---------|
| No progress events | 15 min | `ROUGE_PROGRESS_STALE` |
| No log growth | 10 min | `ROUGE_LOG_STALE` |
| Total elapsed | 60 min | `ROUGE_HARD_CEILING` |

### Rate Limit Handling

- Detects in stdout (new content only, not stale) and stderr
- Parses reset time, sleeps until reset + 1 min buffer
- Sets global rate limit across all projects
- Rate limited retries do NOT count toward 3-retry limit
- Only checked on non-zero exit code (exit 0 = success regardless)

### State Snapshots

- Before each phase: `.snapshots/{timestamp}-{phase}/` with state.json + cycle_context.json
- Keeps last 20
- Used for corruption recovery

### Deploy Pipeline (deploy-to-staging.js)

```
npm run build → npx @opennextjs/cloudflare build → npx wrangler deploy --env staging
→ health check (curl) → PASS or rollback to previous version
→ Supabase: dry-run → destructive check → push (or block if destructive)
→ Update cycle_context.json: staging_url, deploy_history[], migration_history[]
```
