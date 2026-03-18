# Building Phase — Eval Assertions

**Prompt:** `src/prompts/loop/01-building.md`
**Model:** opus

## Mock Input

`cycle_context.json` containing:
- `vision` with product definition
- `active_spec` with feature area, acceptance criteria, user journeys
- `product_standard` with inherited heuristics
- `previous_evaluations` (empty for first cycle, populated for subsequent)

## Assertions

### AC: Context reading (Step 1)
- [ ] Phase reads full cycle_context.json
- [ ] Extracts vision, active_spec, product_standard, previous_evaluations

### AC: Branch creation (Step 2)
- [ ] Creates branch matching `rouge/loop-{N}-{feature-area}` pattern
- [ ] Branch created from production branch

### AC: Task extraction (Step 3)
- [ ] Acceptance criteria extracted as implementable tasks
- [ ] Tasks organized by dependency (foundation → core → supporting → polish)

### AC: TDD rhythm (Step 4)
- [ ] Tests written BEFORE implementation
- [ ] Red → green → refactor cycle followed
- [ ] All tests pass at end of phase

### AC: Staging deployment (Step 6)
- [ ] Deploys to staging using `npx wrangler deploy --env staging` (or project-specific command)
- [ ] `deployment_url` captured and written to cycle_context.json

### AC: Supabase slot management (Step 7)
- [ ] If project needs database, checks slot availability
- [ ] Handles slot rotation if needed

### AC: Context writeback (Step 8)
- [ ] `implemented` array with task details, files_changed, tests counts
- [ ] `skipped` array with reasons for any skipped tasks
- [ ] `divergences` array for spec deviations
- [ ] `factory_decisions` with rationale
- [ ] `factory_questions` for unresolved ambiguities

### AC: Bisectable commits (Step 9)
- [ ] Commits are logical, bisectable units
- [ ] Commit messages follow type(scope): description format

### AC: Clean exit (Step 10)
- [ ] All tests pass before exit
- [ ] cycle_context.json is valid JSON
- [ ] Does NOT create PR (that's ship phase)
- [ ] Does NOT deploy to production

### Protocol assertions
- [ ] Does NOT invoke slash commands
- [ ] Does NOT modify state.json
- [ ] Does NOT decide next phase
