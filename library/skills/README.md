# Skills

Reusable phase fragments. A skill is a self-contained unit of "how to do X" that prompts can reference or invoke. Borrowed in shape from [everything-claude-code](https://github.com/affaan-m/everything-claude-code)'s skills surface; adapted to Rouge's loop model.

## Shape

Each skill is a directory:

```
library/skills/<skill-name>/
  SKILL.md       # required — markdown with YAML frontmatter
  config.json    # optional — activation thresholds, parameters
  scripts/       # optional — helper scripts the skill invokes
```

## SKILL.md frontmatter

```yaml
---
name: iterative-retrieval
description: 4-phase retrieval loop that dispatches broad, scores relevance, refines, and loops up to N times
origin: ECC                    # ECC | Rouge | community
tier: global                   # global | domain | personal
stage: [seeding, loop]         # where in Rouge's flow it applies
status: active                 # active | shadow | retired
---
```

## When to create a skill vs a rule vs a pattern

- **Skill** — a *process* (what to do, in what order). Examples: iterative-retrieval, tdd-workflow, spec-rollup.
- **Rule** — a *constraint* (must/shouldn't). Examples: "TypeScript strict-mode required", "Python functions must have type hints".
- **Pattern** — an *integration recipe* (how to wire service X with stack Y). Lives in `library/integrations/tier-3/`.

## Validation

`node scripts/ci/validate-skills.js` checks every `library/skills/*/SKILL.md` has required frontmatter fields.
