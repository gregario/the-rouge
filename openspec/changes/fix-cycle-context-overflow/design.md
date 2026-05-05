## Context

The Rouge's loop phases communicate via `cycle_context.json` — an append-only accumulator that each phase reads from and writes to. The V2 context assembly system (`src/launcher/context-assembly.js`) introduced focused views for 3 of 5 loop phases: `story_context.json` (building), `milestone_context.json` (milestone-check), and `fix_story_context.json` (milestone-fix).

Two phases still read raw `cycle_context.json`:
- **analyzing** — reads evaluation reports, factory decisions, confidence history, and vision
- **vision-check** — reads vision, all implemented work, decisions, divergences, and observations

At 7 stories in a milestone, `cycle_context.json` reaches 41k tokens, exceeding the 25k read limit. The analyzing phase (which needs the MOST cross-story context) is the first to break.

The existing V2 pattern is proven: three assembly functions, each ~80 lines, each producing a focused JSON view. Adding two more following the same pattern is the minimal-risk fix.

## Goals / Non-Goals

**Goals:**
- Analyzing and vision-check phases receive bounded, focused context views (under 12k tokens each)
- `cycle_context.json` growth is bounded regardless of milestone size via story-boundary compaction
- Zero breaking changes to existing phase prompts or data flow
- Tests follow the existing pattern in `test/launcher/context-assembly.test.js`
- Compacted data remains available in `checkpoints.jsonl` for audit

**Non-Goals:**
- Replacing the phase I/O architecture (the "Phase-Output Pipeline" from issue comment 2)
- Changing how building, milestone-check, or milestone-fix phases read context
- Modifying the preamble template or phase contract structure
- Changing `cycle_context.json` schema validation
- Adding new schemas for the focused views (they're ephemeral working files, not contracts)

## Decisions

### 1. Assembly functions live in context-assembly.js (not a new file)

**Rationale:** The existing module already has readJson/writeJson helpers, the filterRelevant function, and the exports pattern. Adding two more functions keeps them co-located and discoverable. The file grows from ~400 to ~550 lines — still manageable.

**Alternative considered:** A new `context-assembly-v3.js` as proposed in issue comment 2. Rejected because it implies a new system rather than extending the existing one.

### 2. Compaction runs in rouge-loop.js after story-building outcome processing

**Rationale:** Lines 1292-1332 handle story completion (status='done'). After recording fix patterns and story execution tracking, that's the natural place to compact older entries. The compaction is a single function call and doesn't interfere with the existing flow.

**Alternative considered:** Compaction as a separate module. Rejected because it's ~30 lines of logic and doesn't warrant a new file.

### 3. Compaction keeps the 2 most recent stories at full fidelity

**Rationale:** The most recent stories are most likely to be referenced by the next building phase (for dependency context). Older stories are compressed to summaries. At 2 full stories + N compacted, a 12-story milestone stays under 15k tokens in cycle_context.

### 4. Compaction targets specific verbose fields, not arbitrary truncation

What gets compacted on older stories:
- `files_changed` array → `{ count: N, key_files: [top 3] }`
- `acceptance_criteria` full list → `{ total: N, passed: N, failed: N }`
- `alternatives_considered` (in factory_decisions) → first sentence only
- `test_results` verbose output → `{ tests_added: N, tests_passing: N }`

What is NEVER compacted:
- `story_result.outcome` (pass/blocked/fail)
- `factory_decisions[].decision` and `.rationale` (root cause analysis needs these)
- `divergences` (vision-check needs these)
- `escalation` entries

### 5. Assembly function output paths follow existing naming convention

- `analysis_context.json` (not `analyzing_context.json` — matches the phase's conceptual role)
- `vision_check_context.json` (matches the phase name with underscore)

Both written to projectDir root, same as `story_context.json`, `milestone_context.json`, `fix_story_context.json`.

### 6. Prompt updates are minimal — one line changes

The analyzing prompt currently says "From `cycle_context.json`, extract:". This changes to "From `analysis_context.json`, extract:" with a note that the launcher assembles this view. The list of what's available stays the same (the assembly function provides all listed fields).

Similarly for vision-check: "From `cycle_context.json`:" → "From `vision_check_context.json`:"

### 7. Phase dispatch wiring follows existing pattern exactly

The block at rouge-loop.js lines 2593-2608 gains two more `else if` branches:
```javascript
} else if (currentState === 'analyzing') {
  assembleAnalysisContext(projectDir, state);
} else if (currentState === 'vision-check') {
  assembleVisionCheckContext(projectDir, state);
}
```

Same try/catch, same non-blocking behavior, same log format.

## Risks / Trade-offs

**[Risk] Assembly misses a field the analyzing prompt needs** → Mitigation: The analyzing prompt's "What You Read" section lists exactly 13 data sources. The assembly function provides all 13. Test validates shape.

**[Risk] Compaction loses data needed by downstream phases** → Mitigation: Compaction only touches story-result entries older than the 2 most recent. Evaluation, analysis, and vision-check read aggregated data (confidence trend, factory decisions, divergences) which are separate top-level keys in cycle_context — never compacted. Raw data stays in checkpoints.jsonl.

**[Risk] Race condition: compaction runs while phase is reading** → Mitigation: Compaction runs in the launcher between phases (after story-building returns, before next phase starts). Same single-threaded sequential model as existing state writes.

**[Risk] Vision-check assembly omits global_improvements.json** → Mitigation: Vision-check also reads `global_improvements.json` from the project root (not from cycle_context). The assembly function does NOT need to include this — the prompt reads it directly via file system. Assembly only covers cycle_context data.

**[Trade-off] Compaction is lossy** → Acceptable because: (1) checkpoints.jsonl has the full data, (2) the compacted fields are only used for aggregate statistics by downstream phases, not exact lookup, (3) the alternative (unbounded growth) is broken in production.
