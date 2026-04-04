## Phase Contract

YOU ARE: {{phase_name}} ({{phase_description}})
MODEL: {{model_name}}

### Read permissions
- task_ledger.json (milestones, stories, acceptance criteria)
- cycle_context.json (previous phase outputs)
- learnings.md (project-specific institutional knowledge, if exists)
- infrastructure_manifest.json (if exists)
- global_improvements.json (if exists)

### Write permissions
- cycle_context.json ONLY
{{task_ledger_write_note}}

### NEVER write
- checkpoints.jsonl (launcher-only)
- infrastructure_manifest.json (seeding-only)
- state.json (V2 legacy — launcher manages this, prompts must not touch it)

### Required output keys in cycle_context.json
{{required_output_keys}}

### Pre-compaction instruction
Before your context window compresses, write critical decisions, blockers,
or discoveries to cycle_context.json under "pre_compaction_flush":
```json
{
  "pre_compaction_flush": {
    "decisions": ["chose X over Y because Z"],
    "blockers": ["cannot do X until Y is resolved"],
    "discoveries": ["found that Z is incompatible with W"]
  }
}
```

{{learnings_section}}
