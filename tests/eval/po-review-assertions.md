# PO Review — Eval Assertions

**Prompt:** `src/prompts/loop/02c-po-review.md`
**Model:** opus

## Mock Input

`cycle_context.json` containing:
- `active_spec` with journeys, screens, interactions
- `deployment_url` (staging)
- `qa_report` with PASS verdict, Lighthouse scores, code quality baseline
- `library_heuristics` (global + domain/web)
- `reference_products` with URLs and dimensions
- `product_standard` with overrides

## Journey Quality Assertions (7.1-7.4)

### AC 7.1: Journey quality evaluation
- [ ] Each journey walked through as first-time user (LLM-driven)
- [ ] Assessment is quality-focused, NOT correctness (QA already passed)

### AC 7.2: Per-step quality dimensions
- [ ] Each step assessed on: clarity, feedback, efficiency, delight
- [ ] Each dimension rated: clear/ambiguous/confusing (clarity), satisfying/adequate/missing (feedback), optimal/acceptable/wasteful (efficiency), delightful/neutral/frustrating (delight)
- [ ] Overall per-step rating: strong/weak/failing

### AC 7.3: Journey-level verdicts
- [ ] production-ready: no step below adequate
- [ ] acceptable-with-improvements: no step failing
- [ ] not-production-ready: any step failing

### AC 7.4: Quality gap generation from journeys
- [ ] Each weak/failing step produces a quality gap entry
- [ ] Gap contains: journey, step, failed dimensions, what "good" looks like, improvement category

## Screen Quality Assertions (8.1-8.3)

### AC 8.1: Screen quality evaluation
- [ ] Each screen assessed on: hierarchy, layout, consistency, density, empty/edge states, mobile (375px)
- [ ] Screenshots captured as evidence

### AC 8.2: Per-dimension verdicts
- [ ] Each dimension: production-ready / needs-work / failing
- [ ] Overall: production-ready (no failing, <=1 needs-work), acceptable (no failing), not-production-ready (any failing)

### AC 8.3: Quality gap generation from screens
- [ ] Each needs-work/failing dimension produces a gap
- [ ] Gap references Library heuristic or reference screenshot

## Interaction Quality Assertions (9.1-9.2)

### AC 9.1: Interaction quality evaluation
- [ ] Interactive elements assessed: hover, click feedback, loading, success, transitions

### AC 9.2: Interaction ratings
- [ ] Each interaction rated: polished / functional / raw
- [ ] Raw interactions generate quality gaps

## Heuristic Evaluation Assertions (10.1-10.5)

### AC 10.1: Library heuristic evaluation
- [ ] All active heuristics (global + domain + personal) applied
- [ ] Each measured against threshold
- [ ] Failures are quality gaps, NOT bugs

### AC 10.2: Measurement dispatch
- [ ] dom-analysis measurements executed
- [ ] lighthouse-metric pulled from qa_report baseline
- [ ] interaction-test measurements executed via $B commands

### AC 10.3-10.4: Reference comparison
- [ ] Reference product screenshots captured (if URLs provided)
- [ ] Pairwise comparison per dimension
- [ ] Verdict: matches / approaching / significantly-below

### AC 10.5: Comparison report
- [ ] Per-dimension verdict with observations
- [ ] Significantly-below dimensions generate quality gaps

## Report Aggregation Assertions (11.1-11.6)

### AC 11.1: Report structure
- [ ] `po_review_report` contains: journey_quality, screen_quality, interaction_quality, heuristic_results, reference_comparison, quality_gaps

### AC 11.2: Quality gap categorization
- [ ] Each gap categorized: design_change / interaction_improvement / content_change / flow_restructure / performance_improvement
- [ ] Prioritized: critical > high > medium > low

### AC 11.3: Verdict logic
- [ ] PRODUCTION_READY: zero critical/high gaps, >=85% heuristic pass, zero significantly-below
- [ ] NEEDS_IMPROVEMENT: zero critical, has high/medium
- [ ] NOT_READY: has critical OR <70% heuristic pass OR 2+ significantly-below

### AC 11.4: Confidence score
- [ ] Weighted formula: journey 30%, screen 20%, heuristic 20%, spec 15%, reference 15%
- [ ] Confidence 0.0-1.0

### AC 11.5: Recommended action
- [ ] continue: >=0.9 + PRODUCTION_READY
- [ ] deepen: 0.7-0.9 + gaps concentrated in one area
- [ ] broaden: 0.7-0.9 + missing capabilities
- [ ] notify-human: <0.7 OR NOT_READY with critical

### Protocol assertions
- [ ] Writes po_review_report to cycle_context.json
- [ ] Updates review_readiness_dashboard
- [ ] Does NOT invoke slash commands
- [ ] Does NOT modify state.json
