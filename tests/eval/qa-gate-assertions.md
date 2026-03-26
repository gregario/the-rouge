# QA Gate — Eval Assertions

**Prompt:** `src/prompts/loop/02b-qa-gate.md`
**Model:** sonnet

## Mock Input

`cycle_context.json` containing:
- `active_spec` with 5 acceptance criteria
- `deployment_url` pointing to a live staging URL
- `diff_scope` with `frontend: true`, `backend: true`
- `implemented` list from building phase

## Assertions

### AC 6.1 (QA): Spec criteria extraction
- [ ] All acceptance criteria extracted into a testable checklist
- [ ] Each criterion has: ID, text, verification method (browser/api/code/manual)

### AC 6.2 (QA): Browser-based criteria testing
- [ ] Uses $B commands to test criteria against deployment_url
- [ ] Each criterion has pass/fail/partial result with evidence

### AC 6.3 (QA): Criteria failure classification
- [ ] Failures classified as: not-implemented, broken, or partial
- [ ] Classification appears in criteria_results

### AC 6.4 (QA): Functional correctness
- [ ] `evaluation_report.qa.functional_correctness` contains:
  - `pages_checked` > 0
  - `console_errors` (integer)
  - `dead_elements` (integer)
  - `broken_links` (integer)

### AC 6.5 (QA): Lighthouse baseline
- [ ] `evaluation_report.qa.performance_baseline.lighthouse_scores` contains scores for key pages
- [ ] Each score has: performance, accessibility, best_practices, seo
- [ ] Lighthouse results are informational (do NOT affect verdict)

### AC 6.6 (QA): Code quality baseline
- [ ] `evaluation_report.qa.code_quality_baseline` contains:
  - `cyclomatic_complexity_max` and `_avg`
  - `duplication_pct`
  - `files_over_300_lines`
  - `circular_deps`
  - `test_coverage_branch_pct`
  - `dead_code_items`

### AC 6.7 (QA): Architecture integrity
- [ ] Circular dependencies checked (zero tolerance)
- [ ] Cross-layer violations checked

### AC 6.8 (QA): API contract stability
- [ ] If API routes exist, schema extracted and diffed against previous cycle

### AC 6.9 (QA): Code quality degradation detection
- [ ] `evaluation_report.qa.code_quality_warning` is boolean
- [ ] Warning triggered if: complexity_max > 30, duplication > 5%, circular deps > 0, coverage < 60%

### AC 6.10 (QA): Spec completeness
- [ ] Total criteria, passing, failing, not-implemented counts
- [ ] Percentage calculated

### AC 6.11 (QA): Report structure
- [ ] `evaluation_report.qa` contains: verdict, criteria_results, functional_correctness, performance_baseline, code_quality_baseline, health_score

### AC 6.12 (QA): Pass condition
- [ ] PASS requires: zero not-implemented, zero broken, zero console errors, zero dead elements, all forms submit
- [ ] Partial criteria = warnings, not failures
- [ ] Code quality warnings = warnings, not failures

### AC 6.13 (QA): AI code audit
- [ ] `evaluation_report.qa.ai_code_audit` with score 0-100 and dimensions
- [ ] `evaluation_report.qa.security_review` with verdict and categories
- [ ] `evaluation_report.qa.a11y_review` with verdict and issues

### Protocol assertions
- [ ] Reads cycle_context.json
- [ ] Writes evaluation_report.qa to cycle_context.json
- [ ] Updates review_readiness_dashboard
- [ ] Does NOT invoke slash commands
- [ ] Does NOT modify state.json
- [ ] Git commits changes
