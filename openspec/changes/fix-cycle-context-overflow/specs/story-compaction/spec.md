## ADDED Requirements

### Requirement: Story entries are compacted at story boundaries

The system SHALL compact older story entries in `cycle_context.json` after each story-building phase completes with outcome 'pass'. Compaction runs in `rouge-loop.js` after story completion processing (line ~1332).

Compaction rules:
- The 2 most recent completed story results SHALL remain at full fidelity
- Older story results SHALL have verbose fields replaced with summaries
- Compaction SHALL be idempotent (running twice produces the same result)

Fields compacted on older stories:
- `files_changed` array → `{ count: N, key_files: [first 3 entries] }`
- Full acceptance_criteria lists → `{ total: N, passed: N, failed: N }`
- `alternatives_considered` in factory_decisions → first sentence only (split at '. ')
- Verbose test output → `{ tests_added: N, tests_passing: N }`

Fields NEVER compacted:
- `story_result.outcome`
- `factory_decisions[].decision` and `.rationale`
- `divergences`
- `escalation` entries
- `story_result.story_id`

#### Scenario: First story completes — no compaction

- **WHEN** the first story in a milestone completes
- **THEN** no compaction occurs (fewer than 3 completed stories)

#### Scenario: Third story completes — first story compacted

- **WHEN** the third story in a milestone completes
- **THEN** the first story's entry in cycle_context.json has its verbose fields compacted while the second and third stories remain at full fidelity

#### Scenario: Seventh story completes — first five compacted

- **WHEN** the seventh story in a milestone completes
- **THEN** stories 1-5 are compacted and stories 6-7 remain at full fidelity

#### Scenario: Compaction is idempotent

- **WHEN** compaction runs on a story entry that was already compacted
- **THEN** the entry is unchanged (no double-compaction artifacts)

#### Scenario: Already-compact files_changed field

- **WHEN** a story entry's files_changed is already `{ count: N, key_files: [...] }` (object not array)
- **THEN** compaction skips that field

### Requirement: Compaction preserves audit trail in checkpoints

Raw uncompacted data SHALL remain available in `checkpoints.jsonl`. Compaction only affects the working-memory file (`cycle_context.json`).

#### Scenario: Checkpoint written before compaction

- **WHEN** a story completes
- **THEN** the checkpoint entry is written (by the existing checkpoint mechanism) BEFORE compaction runs, preserving the full uncompacted data

### Requirement: Compaction bounds cycle_context growth

After compaction, `cycle_context.json` SHALL remain under 25,000 tokens for milestones up to 20 stories.

Each compacted story contributes approximately:
- ~200 tokens for the story_result summary
- ~100 tokens per factory_decision (decision + rationale, no alternatives)
- ~50 tokens per divergence

A 20-story milestone with compaction: 2 full stories (~3k tokens each) + 18 compacted stories (~350 tokens each) + shared context (~8k tokens) = ~20.3k tokens.

#### Scenario: 12-story milestone stays under limit

- **WHEN** 12 stories complete in a single milestone
- **THEN** cycle_context.json remains under 25,000 tokens

#### Scenario: 20-story milestone stays under limit

- **WHEN** 20 stories complete in a single milestone
- **THEN** cycle_context.json remains under 25,000 tokens
