## Why

`cycle_context.json` grows unbounded as stories complete within a milestone. At 7 stories it reaches 41,750 tokens — exceeding the 25,000 token read limit for phase agents. The analyzing and vision-check phases have no focused views, so they attempt to read the raw file and fail. This blocks every project once it builds more than ~5 stories in a single milestone.

## What Changes

- Add `assembleAnalysisContext()` function to `context-assembly.js` — writes a focused `analysis_context.json` with evaluation report, relevant decisions filtered by gap areas, confidence trend, and capability assessments (target: 6-8k tokens)
- Add `assembleVisionCheckContext()` function to `context-assembly.js` — writes a focused `vision_check_context.json` with vision summary, story outcomes, divergences, and confidence trend (target: 8-10k tokens)
- Add story-boundary compaction to `rouge-loop.js` — after story-building completes, compact older story entries in `cycle_context.json` (files_changed → count + top 3, AC lists → pass/fail counts, alternatives_considered → one sentence, keep 2-3 most recent stories at full fidelity)
- Update the analyzing phase prompt to read `analysis_context.json` instead of raw `cycle_context.json`
- Update the vision-check phase prompt to read `vision_check_context.json` instead of raw `cycle_context.json`
- Wire new assembly functions into `rouge-loop.js` phase dispatch (lines 2593-2608)

## Capabilities

### New Capabilities
- `analysis-context-assembly`: Focused view assembly for the analyzing phase — filters evaluation data, decisions, and trends into a bounded context file
- `vision-check-context-assembly`: Focused view assembly for the vision-check phase — filters vision, story outcomes, and divergences into a bounded context file
- `story-compaction`: Compacts completed story entries in cycle_context.json at story boundaries to prevent unbounded growth

### Modified Capabilities

(none — no existing spec-level requirements change)

## Impact

- `src/launcher/context-assembly.js` — two new exported functions added
- `src/launcher/rouge-loop.js` — phase dispatch expanded (lines 2593-2608), compaction hook added after story-building completion
- `src/prompts/loop/04-analyzing.md` — reads `analysis_context.json` instead of `cycle_context.json`
- `src/prompts/loop/06-vision-check.md` — reads `vision_check_context.json` instead of `cycle_context.json`
- `test/launcher/context-assembly.test.js` — new tests for both assembly functions and compaction
- `schemas/cycle-context-v3.json` — no schema change (compaction preserves required keys, just summarizes values)
