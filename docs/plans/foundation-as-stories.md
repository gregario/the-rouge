# Plan: Foundation as Stories

**Date:** 2026-05-03
**Status:** PLANNED (next session)
**Priority:** P0 — foundation is broken for all project sizes

---

## Problem

Foundation is the only phase that runs as a single unstructured blob. Every other phase
(story-building, evaluation, analyzing) operates on discrete, trackable units. Foundation
improvises its own scope from vision.json and builds everything in one 10-90 minute
session with no checkpoints, no per-task evaluation, and no incremental progress tracking.

**Symptoms:**
- highlow (XS): foundation spun for 90 minutes building files with no completion criteria
- testimonial: foundation ran successfully but was opaque (60 min, no progress visible)
- Dashboard shows "Foundation" with a spinner for the entire duration
- `foundation_spec` referenced 6 times in the prompt but never exists in cycle_context.json
- If foundation crashes midway, all work must be redone

**Root cause:** Foundation doesn't use the story-building loop. It should.

---

## Solution

Convert foundation from a single unstructured phase into a set of **foundation stories**
generated during seeding, written to task_ledger.json, and executed one-by-one through
the same story-building → evaluate → advance loop that features use.

---

## Foundation Story Templates by Tier

### XS (entities<=2, integrations==0, screens<=2)

**Example:** highlow (card game), calculator, timer

Typical foundation stories:

| # | Story ID | Name | ACs |
|---|----------|------|-----|
| 1 | `f-scaffold` | Project scaffold | Framework init, deps installed, dev server runs, build succeeds |
| 2 | `f-deploy` | Staging deploy | Output dir exists, deploy succeeds, URL accessible |

**Total: 2 stories, ~10-15 min**

No database, no auth, no integrations. Foundation for XS is literally "can I build and
deploy a static page." This should take one story-building cycle, not 90 minutes of
improvisation.

### S (entities<=5, integrations<=2, screens<=5)

**Example:** todo app, recipe organizer, habit tracker

| # | Story ID | Name | ACs |
|---|----------|------|-----|
| 1 | `f-scaffold` | Project scaffold | Framework init, deps, dev server, build clean |
| 2 | `f-database` | Database setup | Schema covers all entities from vision, migrations run, seed data realistic |
| 3 | `f-auth` | Auth flows | Register, login, logout, session persistence, protected routes reject unauth |
| 4 | `f-ui-shell` | App shell + nav | Layout renders, nav links for all feature areas, theme tokens applied |
| 5 | `f-deploy` | Staging deploy | Deploy succeeds, URL accessible, health check passes |

**Total: 5 stories, ~30-45 min**

### M (entities<=10, integrations<=5, screens<=10)

**Example:** fleet manager, SaaS dashboard, construction coordinator

| # | Story ID | Name | ACs |
|---|----------|------|-----|
| 1 | `f-scaffold` | Project scaffold | Framework, deps, dev server, build |
| 2 | `f-database` | Database schema + migrations | All entities, relationships, indexes, RLS policies |
| 3 | `f-auth` | Auth + RBAC | Register, login, logout, roles, guards, session |
| 4 | `f-integration-{name}` | Integration: {name} | Client wrapper, error handling, rate limiting, test stubs (one story PER integration) |
| 5 | `f-ui-shell` | App shell + design system | Layout, nav, theme tokens, error boundaries, loading states |
| 6 | `f-fixtures` | Test fixtures + seed data | Realistic data for every entity, generators, factories |
| 7 | `f-deploy` | Staging deploy + CI | Deploy pipeline, health check, env var docs |

**Total: 7+ stories (more with integrations), ~1-2 hours**

### L (above M)

Same as M but with:

| Additional | Story ID | Name | ACs |
|------------|----------|------|-----|
| 8 | `f-observability` | Logging + monitoring | Structured logging, error reporting (Sentry), health dashboard |
| 9 | `f-performance` | Performance baselines | Lighthouse scores captured, bundle size tracked, DB query perf |
| 10 | `f-security` | Security hardening | CORS, CSP headers, rate limiting, input sanitization |

**Total: 10+ stories, ~2-4 hours**

### XL (multi-product, linked projects)

Same as L plus cross-project concerns:

| Additional | Story ID | Name | ACs |
|------------|----------|------|-----|
| 11 | `f-shared-api` | Shared API contracts | API schema, versioning, auth tokens between projects |
| 12 | `f-project-registry` | Project registry integration | Register with Rouge project registry, declare provides/requires |

**Total: 12+ stories, ~4-8 hours**

---

## Generation Logic

### When: During seeding finalization (after SEEDING_COMPLETE accepted)

The `finalizeSeeding()` function already runs after all disciplines complete. Add a new
step: `generateFoundationStories(projectDir)`.

### Input: infrastructure_manifest.json + vision.json + sizing.json

Read these three files (all written during seeding) and deterministically generate the
foundation story list.

```javascript
function generateFoundationStories(projectDir) {
  const manifest = readJson(join(projectDir, 'infrastructure_manifest.json'))
  const vision = readJson(join(projectDir, 'vision.json'))
  const sizing = readJson(join(projectDir, 'seed_spec/sizing.json'))
  const size = sizing?.project_size || 'M'

  const stories = []

  // Always: scaffold
  stories.push({
    id: 'f-scaffold',
    name: 'Project scaffold',
    status: 'pending',
    acceptance_criteria: [
      'Framework initialized with correct config',
      'All dependencies installed',
      'Dev server starts without errors',
      'Production build succeeds',
    ],
    depends_on: [],
  })

  // S+: database
  if (['S', 'M', 'L', 'XL'].includes(size) && manifest?.database?.provider) {
    const entityCount = vision?.entities?.length || 0
    stories.push({
      id: 'f-database',
      name: `Database setup (${manifest.database.provider}, ${entityCount} entities)`,
      status: 'pending',
      acceptance_criteria: [
        'Schema covers all entities from vision (2+ feature area references)',
        'Foreign keys and indexes defined',
        'Migrations run cleanly on fresh database',
        'Seed data realistic and domain-appropriate',
        `Entity count: ${entityCount}`,
      ],
      depends_on: ['f-scaffold'],
    })
  }

  // S+: auth
  if (['S', 'M', 'L', 'XL'].includes(size) && manifest?.auth?.strategy) {
    stories.push({
      id: 'f-auth',
      name: `Auth flows (${manifest.auth.strategy})`,
      status: 'pending',
      acceptance_criteria: [
        'Registration creates user and returns session',
        'Login authenticates and returns session',
        'Logout destroys session',
        'Protected routes reject unauthenticated requests',
        'Session persistence works across page refresh',
      ],
      depends_on: ['f-scaffold', ...(manifest?.database ? ['f-database'] : [])],
    })
  }

  // M+: per-integration stories
  if (['M', 'L', 'XL'].includes(size) && manifest?.integrations) {
    for (const integration of manifest.integrations) {
      stories.push({
        id: `f-integration-${integration.name}`,
        name: `Integration: ${integration.name}`,
        status: 'pending',
        acceptance_criteria: [
          'Client wrapper exists with TypeScript types',
          'Error handling covers timeouts, rate limits, auth failures',
          'Environment variables referenced, never hardcoded',
          'Test stubs exist and pass',
          'Setup documented in README',
        ],
        depends_on: ['f-scaffold'],
      })
    }
  }

  // S+: UI shell
  if (['S', 'M', 'L', 'XL'].includes(size) && manifest?.deploy?.target !== 'api-only') {
    stories.push({
      id: 'f-ui-shell',
      name: 'App shell + navigation',
      status: 'pending',
      acceptance_criteria: [
        'App shell renders without errors',
        'Navigation includes links for all feature areas',
        'Theme tokens applied consistently',
        'Error boundaries catch and display errors',
        'Loading states exist for async operations',
      ],
      depends_on: ['f-scaffold'],
    })
  }

  // M+: fixtures
  if (['M', 'L', 'XL'].includes(size)) {
    stories.push({
      id: 'f-fixtures',
      name: 'Test fixtures + seed data',
      status: 'pending',
      acceptance_criteria: [
        'Seed data for every entity in schema',
        'Data is realistic (domain-appropriate names, values, dates)',
        'Data generators produce consistent output',
        'Fixtures importable by feature tests',
      ],
      depends_on: ['f-database'],
    })
  }

  // Always: deploy
  stories.push({
    id: 'f-deploy',
    name: `Staging deploy (${manifest?.deploy?.target || 'auto'})`,
    status: 'pending',
    acceptance_criteria: [
      'Deploy to staging succeeds',
      'Staging URL accessible',
      'Health check endpoint returns 200 (or index.html exists for static)',
      'Environment variables documented',
    ],
    depends_on: stories.filter(s => s.id !== 'f-deploy').map(s => s.id),
  })

  // L+: observability, performance, security
  if (['L', 'XL'].includes(size)) {
    stories.push(
      {
        id: 'f-observability',
        name: 'Logging + monitoring',
        status: 'pending',
        acceptance_criteria: [
          'Structured logging (JSON) on all API routes',
          'Error reporting integration configured',
          'Health dashboard accessible',
        ],
        depends_on: ['f-scaffold', 'f-deploy'],
      },
      {
        id: 'f-performance',
        name: 'Performance baselines',
        status: 'pending',
        acceptance_criteria: [
          'Lighthouse scores captured (baseline)',
          'Bundle size tracked',
          'Database query performance benchmarked',
        ],
        depends_on: ['f-deploy'],
      },
      {
        id: 'f-security',
        name: 'Security hardening',
        status: 'pending',
        acceptance_criteria: [
          'CORS configured correctly',
          'CSP headers set',
          'Rate limiting on auth endpoints',
          'Input sanitization on user-facing forms',
        ],
        depends_on: ['f-scaffold', 'f-auth'],
      },
    )
  }

  return stories
}
```

### Output: Written to task_ledger.json as a "Foundation" milestone

The foundation stories become the first milestone in `task_ledger.json`:

```json
{
  "milestones": [
    {
      "name": "Foundation",
      "status": "pending",
      "stories": [
        { "id": "f-scaffold", "name": "Project scaffold", ... },
        { "id": "f-deploy", "name": "Staging deploy", ... }
      ]
    },
    {
      "name": "Playable Game",
      "status": "pending",
      "stories": [ ... feature stories ... ]
    }
  ]
}
```

---

## Launcher Changes

### Remove the separate `foundation` and `foundation-eval` states

Foundation stories use the same `story-building` state as feature stories. The loop
doesn't need to know it's building "foundation" vs "features" — it just builds the
next pending story in the next pending milestone. Foundation IS milestone 1.

**State machine simplification:**

```
BEFORE:
  ready → foundation → foundation-eval → story-building → milestone-check → ...

AFTER:
  ready → story-building (milestone "Foundation") → milestone-check → 
  story-building (milestone "Core Features") → milestone-check → ...
```

### Foundation-eval becomes a milestone-check

The 6-dimension evaluation from `00-foundation-evaluating.md` runs as the milestone-check
for the Foundation milestone. Same check, same flow, just triggered by the standard
milestone completion path instead of a special `foundation-eval` state.

### `_phase_complete` marker no longer needed

Since foundation runs as stories, the per-story completion marker (story.status = 'done')
replaces the `_phase_complete` hack. Each story completes individually, the loop advances,
and when all Foundation stories are done, milestone-check fires.

---

## Dashboard Changes

### Foundation milestone shows in the Build tab

Currently the Build tab shows milestones starting from the first feature milestone.
After this change, the Foundation milestone appears as the first milestone with its
stories visible in the timeline. Progress is per-story, not per-phase.

### Foundation stories appear in the milestone timeline

Each foundation story (f-scaffold, f-database, f-auth, etc.) shows as a row in the
timeline with status (pending/in-progress/done), just like feature stories.

---

## Prompt Changes

### `00-foundation-building.md` becomes `01-building.md` for foundation stories

Foundation stories use the SAME building prompt as feature stories. The prompt already
reads the active story's ACs from task_ledger.json and builds to meet them. Foundation
stories have ACs (defined above), so the same prompt works.

**Key difference:** Foundation stories have a `foundation: true` flag in their story
definition. The building prompt checks this flag and applies foundation-specific rules:
- Read infrastructure_manifest.json for provider choices
- Never implement feature-area-specific logic
- Apply hard-blocking rule for missing integrations

### `00-foundation-evaluating.md` stays but runs as milestone-check

Rename to something like `milestone-check-foundation.md`. The launcher routes to this
evaluator when the milestone being checked is named "Foundation" (or has a `foundation: true`
flag). For feature milestones, it routes to the standard evaluation orchestrator.

---

## Migration

### Existing projects

Projects already past foundation (testimonial, stack-rank) are unaffected — their
Foundation milestone is marked as complete and the loop skips it.

Projects stuck in foundation (if any) need their state.json manually updated:
- `current_state: "story-building"` (not `"foundation"`)
- Foundation stories added to milestones[0]

### New projects

The `generateFoundationStories()` function runs during `finalizeSeeding()`. Every new
project gets Foundation as milestone 1 with tier-appropriate stories.

---

## Implementation Steps (for next session)

### Phase 1: Story generation (30 min)

1. Create `src/launcher/foundation-stories.js` with `generateFoundationStories()`
2. Wire into `seeding-finalize.ts` — after artifact validation, before promoting to ready
3. Write Foundation as milestone[0] in task_ledger.json
4. Test with XS (2 stories), S (5 stories), M (7+ stories)

### Phase 2: Launcher changes (1 hour)

5. Remove `case 'foundation':` from rouge-loop.js advanceState
6. Remove `case 'foundation-eval':` from rouge-loop.js advanceState
7. Update `startBuild()` in build-runner.ts to transition `ready → story-building` (not `ready → foundation`)
8. Add routing logic: when milestone-check fires for Foundation milestone, use foundation evaluator prompt
9. Update `state.foundation` management — foundation.status derived from milestone[0].status

### Phase 3: Prompt changes (30 min)

10. Update `01-building.md` to check for `foundation: true` flag on stories
11. Add foundation-specific rules (hard-blocking, isolation, infrastructure_manifest reading)
12. Update `00-foundation-evaluating.md` header to work as milestone-check target

### Phase 4: Dashboard changes (30 min)

13. Show Foundation milestone in Build tab timeline
14. Show foundation stories as rows with status
15. Remove the "Foundation & First-Run Setup" special-case display

### Phase 5: Testing (1 hour)

16. Test XS project end-to-end: seed → foundation stories generated (2) → build → milestone-check → feature stories
17. Test S project: seed → foundation stories (5) → build → all pass → features
18. Test M project: seed → foundation stories (7+) → build → foundation-eval → features
19. Regression test: existing testimonial project still works

---

## Expected Outcome

**XS project (highlow):**
- Seeding produces 2 foundation stories + 6 feature stories
- Foundation takes ~10-15 min (2 stories, each ~5 min)
- Dashboard shows: Foundation [✅ scaffold] [✅ deploy] → Core Game [⬜ deck] [⬜ guess] ...

**S project (todo app):**
- Seeding produces 5 foundation stories + feature stories
- Foundation takes ~30-45 min
- Dashboard shows per-story progress throughout

**M project (fleet manager):**
- Seeding produces 7+ foundation stories (including per-integration)
- Foundation takes ~1-2 hours
- Each integration is its own story, individually tested and tracked

**No more opaque 90-minute foundation blobs.** Every foundation task is a story with
ACs, tracked in the same timeline, evaluated individually, with incremental commits
and recovery on crash.

---

## Risks

1. **Foundation stories too granular for XS** — a 2-story foundation might feel like
   overhead for a project that just needs `npm init`. Mitigation: for XS, consider
   collapsing to a single `f-scaffold-and-deploy` story.

2. **Foundation evaluator needs adaptation** — current 6-dimension eval assumes all
   foundation work is available at once. Running per-story means each story gets a
   narrower eval. Mitigation: foundation stories include their own ACs; the per-story
   eval checks ACs, the milestone-check runs the 6-dimension eval on the whole.

3. **Backward compatibility** — existing projects have `state.foundation.status` and
   `current_state: "foundation"`. Need migration path. Mitigation: if `current_state`
   is `"foundation"` or `"foundation-eval"`, auto-migrate to milestone[0] story-building.

---

**Estimated total implementation time: ~3.5 hours**

**This is the single highest-impact fix remaining in Rouge.** Foundation is the first
thing every project does after seeding, and it's the phase that breaks most often.
Making it use the same proven story-building loop that works for features eliminates
an entire class of bugs.
