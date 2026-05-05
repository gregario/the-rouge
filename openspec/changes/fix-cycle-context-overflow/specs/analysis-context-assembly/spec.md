## ADDED Requirements

### Requirement: assembleAnalysisContext produces a focused analysis_context.json

The system SHALL provide an `assembleAnalysisContext(projectDir, state)` function in `src/launcher/context-assembly.js` that reads `cycle_context.json` and produces a bounded `analysis_context.json` file containing exactly the data the analyzing phase needs.

The output SHALL include:
- `evaluation_report` (full: po, qa, design, health_score sub-objects)
- `factory_decisions` array (all decisions from current milestone)
- `factory_questions` array (all questions from current milestone)
- `confidence_history` array
- `previous_cycles` array
- `vision` object
- `product_standard` object
- `retry_counts` object
- `qa_fix_results` object (if present)
- `capability_assessments` array (if present)
- `_cycle_number` metadata
- `_current_milestone` metadata

The output SHALL NOT include:
- Raw `files_changed` arrays from story results (use compacted form)
- `active_spec` (evaluation phase already consumed this)
- `infrastructure` details (building-phase concern)
- `library_heuristics` raw array (evaluation already applied these)

#### Scenario: Analysis context assembled for 7-story milestone

- **WHEN** the analyzing phase is about to run after a milestone with 7 completed stories
- **THEN** `analysis_context.json` is written to projectDir with all required fields present and total token count under 12,000

#### Scenario: Evaluation report preserved in full

- **WHEN** `cycle_context.json` contains a full evaluation_report with po, qa, design, and health_score
- **THEN** the evaluation_report in `analysis_context.json` is identical to the one in cycle_context (no lossy transformation)

#### Scenario: Missing optional fields handled gracefully

- **WHEN** `cycle_context.json` lacks `capability_assessments` or `qa_fix_results`
- **THEN** the assembly function still produces valid output with those fields as empty arrays/objects

### Requirement: Analysis context is wired into the phase dispatch

The launcher SHALL call `assembleAnalysisContext(projectDir, state)` before invoking the analyzing phase, in the same dispatch block as the existing three assembly functions (rouge-loop.js lines 2593-2608).

Assembly failure SHALL be non-blocking (logged but does not halt the loop).

#### Scenario: Dispatch calls assembleAnalysisContext for analyzing phase

- **WHEN** `currentState === 'analyzing'`
- **THEN** `assembleAnalysisContext(projectDir, state)` is called and `analysis_context.json` is written before the prompt runs

#### Scenario: Assembly failure is non-blocking

- **WHEN** `assembleAnalysisContext` throws an error (e.g., malformed cycle_context.json)
- **THEN** the loop logs the error and continues to invoke the analyzing phase (which falls back to reading cycle_context.json directly)

### Requirement: Analyzing prompt reads analysis_context.json

The analyzing phase prompt (`src/prompts/loop/04-analyzing.md`) SHALL reference `analysis_context.json` as its primary data source instead of `cycle_context.json`.

#### Scenario: Prompt references updated

- **WHEN** the analyzing phase prompt is read by an agent
- **THEN** the "What You Read" section references `analysis_context.json` (not `cycle_context.json`)
