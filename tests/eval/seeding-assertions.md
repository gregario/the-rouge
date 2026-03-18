# Seeding Swarm — Eval Assertions

**Prompt:** `src/prompts/seeding/00-swarm-orchestrator.md`
**Model:** opus

## Mock Input

Interactive session (seeding is the only interactive phase). Mock: pre-filled answers for each discipline.

## Swarm Orchestration Assertions (11.1-11.3)

### AC 11.1: Discipline management
- [ ] Tracks which disciplines have run (brainstorming, competition, taste, spec, design)
- [ ] Manages non-linear execution (disciplines can run out of order)

### AC 11.2: Loop-back detection
- [ ] Detects when design challenges spec (e.g., >3 click journeys)
- [ ] Detects when taste challenges scope
- [ ] Detects when spec surfaces competition gap
- [ ] Triggers re-run of challenged discipline

### AC 11.3: Convergence detection
- [ ] All disciplines run at least once
- [ ] No new loop-back triggers in last pass -> convergence declared

## Output Assertions (11.4-11.10)

### AC 11.4: Vision document
- [ ] Structured JSON/YAML matching schemas/vision.json
- [ ] Contains: name, one_liner, persona, problem, emotional_north_star, feature_areas, product_standard

### AC 11.5: Product standard
- [ ] Inherits from global + domain Library
- [ ] Contains overrides and additions
- [ ] Has definition_of_done

### AC 11.6: Seed spec
- [ ] Feature areas with user journeys (step-by-step)
- [ ] Acceptance criteria per journey
- [ ] Data model sketch
- [ ] Edge cases and scope boundaries

### AC 11.7: PO check generation
- [ ] Library check templates instantiated with product-specific parameters
- [ ] Checks cover every journey step

### AC 11.8: Screen checks
- [ ] Primary element defined per screen
- [ ] Screen-level templates instantiated

### AC 11.9: Interaction checks
- [ ] Interaction types classified (form, destructive, data-loading, navigation)
- [ ] Appropriate templates instantiated per type

### AC 11.10: Approval flow
- [ ] Summary presented: feature area count, criteria count, PO check count, journey count
- [ ] state.json set to `ready` (NOT `building`) after approval

### Protocol assertions
- [ ] Writes vision, product_standard, active_spec to cycle_context.json
- [ ] Sets state.json to `ready` on approval
- [ ] Does NOT auto-start the loop (human triggers "rouge start")
