# Composable Decomposition with Complexity Profiling

**Issue:** #11
**Date:** 2026-03-26
**Status:** Design

## Problem

The building phase (`01-building.md`) assumes a web app decomposition pattern: foundation (schema, auth, layout) then vertical feature areas. This works for multi-route web apps but fails for other product types Rouge must build:

- A CLI tool has no layout scaffolding or routes. Its decomposition is command-by-command.
- A game decomposes around state machines and game loops, not REST endpoints.
- An MCP server decomposes around tool contracts, not user journeys.
- A landing page needs no decomposition at all -- it ships in one pass.

The building phase needs to detect what KIND of product it is building and select the right decomposition strategy. These strategies must compose, because real products combine patterns (e.g., a full-stack app with game-like stateful UI).

## Complexity Profiles

Five profiles, ordered by decomposition granularity:

### 1. Single-page (`single-page`)
Landing pages, simple calculators, single-screen tools.
- **Decomposition:** None. One-shot build. The entire product is one task.
- **Signal:** 0-1 feature areas in vision, no routing dependency, no database.

### 2. Multi-route (`multi-route`)
Web apps with navigation, multiple screens, standard CRUD patterns.
- **Decomposition:** Feature-area slicing (current default). Foundation pass, then vertical feature areas.
- **Signal:** 2+ feature areas with distinct user journeys, routing dependency present.

### 3. Stateful (`stateful`)
Games, rich interactive apps, anything with complex client-side state transitions.
- **Decomposition:** State-machine-first. Define states and transitions, then build each state's UI/logic as a unit. Game loop or state manager is foundation; individual states are vertical slices.
- **Signal:** Feature areas reference state transitions, game loop, or turn-based mechanics. Dependencies form cycles (state A can reach state B and vice versa).

### 4. API-first (`api-first`)
MCP servers, REST APIs, CLI tools, libraries.
- **Decomposition:** Contract-first. Define the public interface (tool list, command list, API surface), then implement tool-by-tool or command-by-command. Each tool/command is an independent task with its own test suite.
- **Signal:** No UI layer. Feature areas map to tools, commands, or endpoints. Product standard references API contracts or protocol compliance.

### 5. Full-stack (`full-stack`)
Frontend + backend + database. SaaS products, dashboards with server logic.
- **Decomposition:** Horizontal foundation (database schema, API layer, auth, deployment pipeline), then vertical features that cut through all layers. Each vertical slice includes: migration + API endpoint + UI component + test.
- **Signal:** `infrastructure.needs_database: true` combined with 2+ feature areas. Feature areas reference both data operations and user-facing screens.

## Profile Detection

Detection runs at the start of the building phase, before task extraction. Three inputs, checked in priority order:

### 1. Explicit declaration in `vision.json`

New optional field `complexity_profile` on the vision schema:

```json
{
  "complexity_profile": {
    "primary": "api-first",
    "secondary": ["stateful"]
  }
}
```

If present, this is authoritative. The seeding phase sets it based on the product discussion.

### 2. Stack detection (fallback)

Infer from project structure when no explicit declaration exists:

| Signal | Inferred Profile |
|--------|-----------------|
| `@modelcontextprotocol/sdk` in deps | `api-first` |
| `bin` field in package.json | `api-first` |
| No `src/` UI files, CLI framework present | `api-first` |
| Godot project, game framework | `stateful` |
| Next.js/Remix/SvelteKit + Supabase | `full-stack` |
| Next.js/Remix without database | `multi-route` |
| Single HTML file or single-page framework | `single-page` |

### 3. Feature area analysis (validation)

Cross-check the detected profile against feature area structure:

- If profile is `multi-route` but feature areas reference state machines or game loops, escalate to `stateful`.
- If profile is `multi-route` but `infrastructure.needs_database` is true and feature areas reference data mutations, escalate to `full-stack`.
- If only 1 feature area with no dependencies, downgrade to `single-page`.

Log the detection result and reasoning to `factory_decisions` in `cycle_context.json`.

## Decomposition Strategies

Each profile defines a task extraction algorithm that replaces the current hardcoded "foundation then features" approach in Step 3 of the building phase.

| Profile | Foundation Pass | Vertical Unit | Task Granularity |
|---------|----------------|---------------|-----------------|
| `single-page` | None | Entire product | 1 task total |
| `multi-route` | Layout, routing, shared components | Feature area (screen group) | 1 task per feature area |
| `stateful` | State machine skeleton, game loop | Individual state + its transitions | 1 task per state node |
| `api-first` | Project scaffold, shared types, test harness | Single tool/command/endpoint | 1 task per public interface unit |
| `full-stack` | DB schema, API skeleton, auth, deploy pipeline | Full vertical slice (migration + API + UI) | 1 task per feature area, each spanning all layers |

## Composition

Products can combine profiles. The `secondary` array in `complexity_profile` declares additional patterns that overlay the primary.

Composition rules:
- The **primary** profile determines the foundation pass and overall task structure.
- Each **secondary** profile injects its decomposition pattern into relevant feature areas.
- Example: `primary: "full-stack", secondary: ["stateful"]` -- foundation pass follows full-stack (schema, API, auth), but feature areas containing state machines use stateful decomposition internally.
- Example: `primary: "api-first", secondary: ["full-stack"]` -- contract-first tool decomposition, but a database foundation pass runs first.

Conflict resolution: if primary and secondary disagree on foundation, run both foundation passes in dependency order (database before API skeleton before UI scaffold).

Maximum two profiles (one primary, one secondary). More than two signals an under-scoped vision -- the building phase should flag this in `factory_questions` and request a vision refinement.

## Implementation

### Schema changes

**`schemas/vision.json`** -- add `complexity_profile` property:
```json
"complexity_profile": {
  "type": "object",
  "properties": {
    "primary": {
      "type": "string",
      "enum": ["single-page", "multi-route", "stateful", "api-first", "full-stack"]
    },
    "secondary": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": ["single-page", "multi-route", "stateful", "api-first", "full-stack"]
      },
      "maxItems": 1
    }
  },
  "required": ["primary"]
}
```

**`schemas/state.json`** -- add `detected_profile` to track what was resolved:
```json
"detected_profile": {
  "type": "object",
  "properties": {
    "primary": { "type": "string" },
    "secondary": { "type": "array", "items": { "type": "string" } },
    "detection_method": { "type": "string", "enum": ["explicit", "stack-inferred", "feature-analysis"] }
  }
}
```

### Prompt changes

**`src/prompts/loop/01-building.md`** -- three modifications:
1. New Step 2.5 "Detect Complexity Profile" between reading context and extracting tasks. Runs the three-input detection pipeline.
2. Step 3 "Extract and Organize Tasks" becomes profile-aware. Instead of hardcoded foundation-then-features, it dispatches to the strategy table above.
3. Work Unit Guidelines updated: single-page has no splitting; api-first targets 1 tool per task regardless of time estimate.

**`src/prompts/swarm/seeding.md`** -- during product standard discussion, prompt the human to confirm the detected complexity profile or override it. Write the result to `vision.json`.

### No launcher changes

The launcher reads `state.json` and dispatches phases. It does not care about decomposition. All complexity profile logic lives in the building phase prompt and the seeding swarm.
