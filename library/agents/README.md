# Agents

Specialized subagent personas the factory and evaluation phases can dispatch to. Shape borrowed from [everything-claude-code](https://github.com/affaan-m/everything-claude-code)'s agents surface.

## Shape

Each agent is a single markdown file:

```
library/agents/<agent-name>.md
```

With YAML frontmatter + markdown body:

```yaml
---
name: typescript-reviewer
description: Reviews TypeScript code for strict-mode correctness, type safety, and idiomatic patterns
tools: [Read, Grep, Glob]      # tools the agent is permitted to use
model: opus                    # opus | sonnet | haiku
origin: ECC
stage: [evaluation]            # where in Rouge's flow it can be invoked
---

# TypeScript Reviewer

(markdown body describing the agent's responsibilities and heuristics)
```

## Dispatch

The evaluation orchestrator (`02c-code-review.md`) reads `cycle_context.active_spec.infrastructure.primary_language` and dispatches to a matching reviewer agent if one exists. Falls back to the generic reviewer behavior if no language match.

## When to add an agent vs a skill

- **Agent** — a persona with its own context and tool budget. Dispatches as a subagent call.
- **Skill** — a process that any prompt can follow inline.

## Validation

`node scripts/ci/validate-agents.js` checks frontmatter and enforces that `tools` is a subset of permitted tools.
