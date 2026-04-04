# State Schema V3

> Canonical schema reference for the V3 data model. All launcher code and prompts reference this document.

**Supersedes:** `docs/design/state-schema-v2.md`

---

## Overview

V3 replaces the monolithic `state.json` with purpose-specific files. Each file has a single writer and defined readers. This eliminates read/write races, makes cost tracking first-class, and gives the launcher a complete audit trail via append-only JSONL.

| File | Writer | Readers |
|------|--------|---------|
| `task_ledger.json` | Seeding (once) + generating-change-spec (fix stories only) | All loop phases |
| `checkpoints.jsonl` | Launcher only | Launcher (recovery), reporting |
| `cycle_context.json` | Loop prompts | Launcher (after each phase) |
| `learnings.md` | Loop prompts (append) + retrospective (prune) | Foundation, story-building, milestone-fix |
| `infrastructure_manifest.json` | INFRASTRUCTURE seeding discipline | Foundation |
| `global_improvements.json` | Analyzing phase | Vision-check, final-review |
| `tools.jsonl` | All phases (append) | Reporting, retrospective |

**Backwards compatibility:** `state.json` is preserved during the transition period. The launcher writes it alongside checkpoints. Prompts must NOT read or write `state.json`.

---

## task_ledger.json

The product plan. Written once by seeding. Read-only during the loop except that `generating-change-spec` may append fix stories to an existing milestone's `stories[]`.

```json
{
  "project": "string — project slug",
  "seeded_at": "ISO 8601",
  "seeded_by": "string",
  "human_approved": true,

  "milestones": [
    {
      "name": "string — milestone name (e.g., 'map-core', 'vehicle-registry')",
      "description": "string — what this milestone delivers",
      "stories": [
        {
          "id": "string — story ID (e.g., 'add-vehicle')",
          "name": "string — human-readable name",
          "description": "string — what this story implements",
          "depends_on": ["string — story IDs this story depends on"],
          "affected_entities": ["string — entity names this story touches"],
          "affected_screens": ["string — screen IDs this story touches"],
          "env_limitations": ["string — documented environment limitations"],
          "fix_story": false
        }
      ],
      "acceptance_criteria": [
        "string — testable criterion (e.g., 'User can add a vehicle with make, model, year')"
      ]
    }
  ]
}
```

### Fix story additions

When `generating-change-spec` adds fix stories, it appends to the relevant milestone's `stories[]` with `fix_story: true`. No other field in `task_ledger.json` may be modified during the loop.

---

## checkpoints.jsonl

Append-only audit trail. One entry written by the launcher at the end of each phase. This is the authoritative recovery source — the launcher reads the last checkpoint to resume after interruption.

Each line is a JSON object:

```json
{
  "id": "cp-2026-04-04T14:23:11Z-story-building",
  "phase": "string — state name (e.g., 'story-building', 'milestone-check')",
  "timestamp": "ISO 8601",

  "state": {
    "current_milestone": "string | null",
    "current_story": "string | null",
    "promoted_milestones": ["string — milestone names that have been promoted (immutable once added)"],
    "consecutive_failures": 0,
    "stories_executed": 0,
    "story_results": {
      "<story-id>": "pass | fail | blocked | skipped"
    }
  },

  "costs": {
    "phase_tokens": 0,
    "phase_cost_usd": 0.0,
    "cumulative_tokens": 0,
    "cumulative_cost_usd": 0.0
  }
}
```

**ID format:** `cp-{ISO 8601 UTC}-{phase}` — sortable, human-readable, no collisions.

**`promoted_milestones`** is the milestone lock list. Once a milestone name appears here it cannot be removed. The launcher enforces this before writing each checkpoint.

---

## cycle_context.json

Phase workspace. Prompts write their outputs here. The launcher reads it after each phase to determine the next transition. Overwritten at the start of each phase — it is ephemeral, not an audit trail.

Per-phase required and forbidden keys are defined in `schemas/cycle-context-v3.json`. The launcher validates `cycle_context.json` against that schema before reading transition keys.

Representative keys (not exhaustive — see `schemas/cycle-context-v3.json`):

```json
{
  "phase": "string — which phase produced this",
  "story_id": "string | null — story being worked on",
  "result": "pass | fail | blocked | skipped | escalate",
  "action": "string — transition hint for launcher (e.g., 'promote', 'deepen', 'notify-human')",
  "summary": "string — human-readable outcome",
  "files_changed": ["string"],
  "test_output": "string | null",
  "diagnosis": "string | null",
  "fix_applied": "string | null",
  "escalation_tier": "0 | 1 | 2 | 3 | null",
  "escalation_classification": "string | null",
  "model_used": "string — model ID that ran this phase"
}
```

---

## learnings.md

Shared context across phases. Append-only during the loop. The retrospective phase prunes it to keep it under 50 lines.

### Format

```markdown
## Infrastructure
- <finding> (<story-id>, <date>)

## Build Patterns
- <finding> (<story-id>, <date>)

## Quality
- <finding> (<story-id>, <date>)
```

### Categories

| Category | What goes here |
|----------|---------------|
| Infrastructure | Deployment quirks, database connection patterns, env var requirements |
| Build Patterns | Code patterns that worked/failed, library gotchas, test setup |
| Quality | Recurring test failures, evaluation signals, false-positive patterns |

**Max 50 lines.** Retrospective prunes oldest/lowest-signal entries when the limit is approached.

---

## infrastructure_manifest.json

Written by the INFRASTRUCTURE seeding discipline. Records all infrastructure decisions made during seeding so the foundation phase executes them rather than re-discovering them.

```json
{
  "database": {
    "type": "string — e.g., 'sqlite', 'postgres', 'supabase'",
    "connection_string_env": "string — env var name",
    "migration_tool": "string — e.g., 'drizzle', 'prisma', 'raw-sql'",
    "notes": "string | null"
  },
  "deploy": {
    "platform": "string — e.g., 'cloudflare-workers', 'railway', 'vercel'",
    "command": "string — deploy command",
    "env_vars_required": ["string"],
    "notes": "string | null"
  },
  "auth": {
    "provider": "string | null — e.g., 'clerk', 'supabase-auth', 'none'",
    "notes": "string | null"
  },
  "data_sources": [
    {
      "name": "string",
      "type": "string — e.g., 'external-api', 'static-file', 'scraper'",
      "endpoint": "string | null",
      "notes": "string | null"
    }
  ],
  "incompatibilities_resolved": [
    "string — e.g., 'Prisma not compatible with CF Workers edge runtime — using @supabase/supabase-js instead'"
  ],
  "depends_on_projects": [
    "string — project slugs this project depends on at runtime"
  ]
}
```

Foundation reads this file and executes the decisions. It does not re-evaluate them.

---

## global_improvements.json

Unchanged from V2. Written by the analyzing phase when `global`-scoped improvement items are identified. Read by vision-check and final-review.

See `docs/design/state-schema-v2.md` § global_improvements.json for the full schema.

---

## tools.jsonl

Per-project audit trail of every tool invocation. Append-only. Each phase appends entries as tools are called.

Each line:

```json
{
  "timestamp": "ISO 8601",
  "tool": "string — tool name (e.g., 'Bash', 'Edit', 'Write')",
  "command_or_path": "string — command run or file path",
  "phase": "string — current state name",
  "story": "string | null — current story ID"
}
```

Used by the retrospective to audit tool usage patterns and by reporting to show per-story activity.

---

## Compatibility

`state.json` is written by the launcher alongside checkpoints during the transition period. Prompts that still read `state.json` will continue to work. This shim is removed once all prompts are migrated to read from `task_ledger.json` + `checkpoints.jsonl`.

Migration checklist:
- [ ] Launcher reads last checkpoint for recovery instead of `state.json`
- [ ] All prompts read story/milestone plan from `task_ledger.json`
- [ ] All prompts write outputs to `cycle_context.json` only
- [ ] Remove `state.json` shim after migration verified
