# Vision Check Phase — Eval Assertions

**Prompt:** `src/prompts/loop/06-vision-check.md`
**Model:** opus

## Mock Input

`cycle_context.json` containing:
- `vision` document
- All `previous_cycles` with completed work
- `confidence_history`
- `feature_areas` with completion status

## Assertions

### AC 16.1: Vision alignment check
- [ ] Re-reads full vision document
- [ ] Reviews all completed work
- [ ] LLM judgment on alignment
- [ ] Produces vision check report: alignment, gaps, scope recommendations, confidence

### AC 16.2: Autonomous scope expansion
- [ ] Confidence >80%: adds capability to feature queue
- [ ] 70-80%: flags in briefing
- [ ] <70%: escalates to human

### AC 16.3: Pivot detection
- [ ] Detects fundamental premise issues
- [ ] Compiles evidence
- [ ] Sends structured pivot proposal notification

### AC 16.4: Confidence trend tracking
- [ ] Records confidence after each cycle
- [ ] 3-cycle declining trend detected
- [ ] 5-cycle plateau detected

### AC 16.5: Feature area ordering
- [ ] Dependency analysis applied
- [ ] Foundation first, cross-cutting last

### Protocol assertions
- [ ] Writes vision_check_results to cycle_context.json
- [ ] Does NOT invoke slash commands
- [ ] Does NOT modify state.json
