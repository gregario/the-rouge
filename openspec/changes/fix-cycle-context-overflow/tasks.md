## 1. Story Compaction

- [ ] 1.1 Add `compactOlderStories(projectDir)` function to context-assembly.js — compacts story entries older than the 2 most recent in cycle_context.json
- [ ] 1.2 Wire compaction call into rouge-loop.js after story completion (after line ~1332, inside the `outcome === 'pass'` block)
- [ ] 1.3 Add compaction tests: idempotency, skip-when-fewer-than-3, correct fields compacted, protected fields preserved

## 2. Analysis Context Assembly

- [ ] 2.1 Add `assembleAnalysisContext(projectDir, state)` function to context-assembly.js — produces analysis_context.json with evaluation_report, factory_decisions, confidence_history, vision, etc.
- [ ] 2.2 Wire `assembleAnalysisContext` into rouge-loop.js phase dispatch block (else if currentState === 'analyzing')
- [ ] 2.3 Update analyzing prompt (src/prompts/loop/04-analyzing.md) — change "From `cycle_context.json`" to "From `analysis_context.json`"
- [ ] 2.4 Add tests: correct shape, evaluation_report preserved in full, missing optional fields handled gracefully

## 3. Vision-Check Context Assembly

- [ ] 3.1 Add `assembleVisionCheckContext(projectDir, state)` function to context-assembly.js — produces vision_check_context.json with vision, implemented, divergences, factory_decisions, etc.
- [ ] 3.2 Wire `assembleVisionCheckContext` into rouge-loop.js phase dispatch block (else if currentState === 'vision-check')
- [ ] 3.3 Update vision-check prompt (src/prompts/loop/06-vision-check.md) — change "From `cycle_context.json`" to "From `vision_check_context.json`"
- [ ] 3.4 Add tests: correct shape, divergences preserved in full, implemented items aggregated from story results

## 4. Integration Testing

- [ ] 4.1 Run full test suite (`npm test`) and verify no regressions
- [ ] 4.2 Verify context-assembly exports updated (module.exports includes new functions)
