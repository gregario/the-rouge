## ADDED Requirements

### Requirement: assembleVisionCheckContext produces a focused vision_check_context.json

The system SHALL provide an `assembleVisionCheckContext(projectDir, state)` function in `src/launcher/context-assembly.js` that reads `cycle_context.json` and produces a bounded `vision_check_context.json` file containing exactly the data the vision-check phase needs.

The output SHALL include:
- `vision` object (full vision document)
- `implemented` — aggregated list of what was built across all stories in current milestone
- `previous_cycles` — summaries of prior cycle outcomes
- `factory_decisions` array (all decisions — vision-check reviews the full decision trail)
- `factory_questions` array
- `evaluator_observations` array (from QA and PO review phases)
- `evaluation_report.po.confidence` and `evaluation_report.po.quality_gaps`
- `divergences` array (critical for drift detection)
- `skipped` — aggregated list of what was skipped across stories
- `_cycle_number` and `_current_milestone` metadata

The output SHALL NOT include:
- `infrastructure` details
- `library_heuristics` raw array
- `retry_counts` (not relevant to vision alignment)
- Raw test result details

Note: The vision-check prompt also reads `journey.json` and `global_improvements.json` directly from the filesystem. These are NOT included in the assembled view — the prompt handles them independently.

#### Scenario: Vision-check context assembled for completed milestone

- **WHEN** the vision-check phase is about to run after milestone evaluation
- **THEN** `vision_check_context.json` is written to projectDir with all required fields and total token count under 12,000

#### Scenario: Divergences preserved in full

- **WHEN** `cycle_context.json` contains divergences from building phases
- **THEN** all divergences appear in `vision_check_context.json` without truncation (vision-check uses these to detect drift)

#### Scenario: Implemented items aggregated from story results

- **WHEN** multiple stories have written `implemented` arrays to cycle_context
- **THEN** `vision_check_context.json` contains a merged list of all implemented items with story_id attribution

### Requirement: Vision-check context is wired into the phase dispatch

The launcher SHALL call `assembleVisionCheckContext(projectDir, state)` before invoking the vision-check phase, in the same dispatch block as the other assembly functions.

Assembly failure SHALL be non-blocking.

#### Scenario: Dispatch calls assembleVisionCheckContext for vision-check phase

- **WHEN** `currentState === 'vision-check'`
- **THEN** `assembleVisionCheckContext(projectDir, state)` is called and `vision_check_context.json` is written before the prompt runs

### Requirement: Vision-check prompt reads vision_check_context.json

The vision-check phase prompt (`src/prompts/loop/06-vision-check.md`) SHALL reference `vision_check_context.json` as its primary data source for cycle context.

The prompt SHALL continue to read `journey.json` and `global_improvements.json` directly.

#### Scenario: Prompt references updated

- **WHEN** the vision-check phase prompt is read by an agent
- **THEN** the "Inputs You Read" section references `vision_check_context.json` for cycle data
