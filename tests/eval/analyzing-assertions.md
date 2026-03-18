# Analyzing Phase — Eval Assertions

**Prompt:** `src/prompts/loop/04-analyzing.md`
**Model:** opus

## Mock Input

`cycle_context.json` containing:
- `po_review_report` with verdict, quality_gaps, recommended_action
- `factory_decisions` from building phase
- `factory_questions` from building phase
- `confidence_history` array
- `previous_cycles` for trend detection

## Assertions

### AC 12.6: Root cause analysis
- [ ] Reads factory_decisions and factory_questions
- [ ] Classifies root cause: spec ambiguity, design choice, or missing context
- [ ] Root cause included in analysis output

### AC 12.7: Refinement loop
- [ ] When root cause is spec ambiguity, can trigger discipline re-run instead of new cycle

### AC 12.8: Analysis engine
- [ ] Reads PO Review recommended_action
- [ ] Executes action logic (continue/deepen/broaden/rollback/notify)
- [ ] Generates quality improvement spec OR triggers state transition

### AC 12.9: Quality improvement specs
- [ ] Translates quality gaps into NEW specs (not bug fixes)
- [ ] Each spec has: requires_design_mode=true, gap evidence, what_good_looks_like
- [ ] Root cause classification included

### AC 12.8b: Spec prioritization
- [ ] Ordered: critical > flow restructure > design change > interaction > content > performance

### AC 12.9b: Quality improvement pipeline
- [ ] New specs go through full pipeline (design -> implement -> QA -> PO Review)

### AC 12.10: Code quality degradation response
- [ ] When code_quality_warning flagged, assesses severity
- [ ] Minor: continue. Major: trigger refactoring cycle before features

### AC 12.11: Retry limit
- [ ] After 5 PO Review cycles on same feature area -> escalate to human

### Protocol assertions
- [ ] Writes analysis results to cycle_context.json
- [ ] Does NOT invoke slash commands
- [ ] Does NOT modify state.json directly
