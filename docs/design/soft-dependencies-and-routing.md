# Soft Dependencies & Natural Language Routing

> Design reference for post-V1 phase composition improvements. Adapted from gstack's BENEFITS_FROM framework and natural language skill routing.

## Part 1: Soft Dependencies

### Problem

Rouge's phases are rigidly sequenced by the launcher's state machine. Within phases, there are implicit soft dependencies:
- Building phase *could* benefit from a quick design consistency check
- QA-fixing phase *could* benefit from running test integrity before each fix
- Analyzing phase *could* benefit from checking the Library for similar quality gaps in past projects

Currently these cross-phase consultations don't exist. Each phase operates in isolation.

### Pattern: BENEFITS_FROM

From gstack: phases declare optional dependencies that enhance their output but aren't required for correctness.

```yaml
# In phase prompt header
phase: building
benefits_from:
  - test-integrity  # Quick pre-build check
  - library-lookup  # Check Library for relevant patterns
```

**Behavior:**
- Before the phase's main work begins, check if benefiting phases are available
- If available: execute them inline (as subagent or function call), absorb their output
- If unavailable or failed: proceed without them — the phase works correctly either way
- Log whether the soft dependency was used: `"soft_deps": {"test-integrity": "used", "library-lookup": "skipped-not-available"}`

### When to Use

- When a phase would produce *better* output with additional context but doesn't *require* it
- When the consulting phase is fast (<30 seconds) and cheap (<$0.10)
- NOT when the phases have ordering dependencies (use the state machine for that)

## Part 2: Natural Language Routing

### Problem

When Rouge is open source, users interact with it through Slack. They'll say "check the quality of my app" not "invoke phase 02c-po-review." Seeding is already interactive — users describe what they want to build in natural language.

### Pattern: Intent-Based Phase Selection

For the Slack bot's interactive mode, map natural language intents to Rouge capabilities:

| User Says | Maps To |
|-----------|---------|
| "build something" / "I have an idea" | Seeding swarm (00-swarm-orchestrator) |
| "how's it going" / "status" | Status summary from state.json + trend_snapshot |
| "check the quality" / "review it" | Manual PO Review trigger |
| "fix the bugs" / "it's broken" | Manual QA-fix trigger |
| "ship it" / "looks good" | Manual promote trigger |
| "pause" / "stop" | Pause project |
| "what did you do overnight" | Morning briefing replay |

Implementation: keyword matching + intent classification in the Slack bot. No LLM needed for routing — these are finite, predictable intents.

## gstack References

- Soft dependencies: `BENEFITS_FROM` in skill YAML headers, gen-skill-docs resolution logic
- Natural language routing: skill metadata `trigger_phrases` + Codex `openai_short_description`
