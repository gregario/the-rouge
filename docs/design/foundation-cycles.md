# Foundation Cycles (Horizontal Slice Before Vertical Features)

> Design for GitHub issue #12. Foundation cycles build shared infrastructure before vertical feature cycles begin, preventing the rebuild anti-pattern.

## Problem

The current loop builds feature areas vertically: trip-history end-to-end, then vehicle-management end-to-end. This works when features are independent. It fails when they share infrastructure.

Typical failure sequence:
1. Feature A needs a users table. Building phase creates one shaped for Feature A.
2. Feature B also needs users, plus a relationship Feature A never anticipated.
3. Building phase for Feature B refactors the schema, breaking Feature A's tests.
4. Multiple cycles wasted on integration rework that was predictable from the vision.

The same pattern applies to auth flows, external integrations (Stripe, email), shared UI components (layout, navigation, theme), and any cross-cutting data model.

## Foundation Cycle

A foundation cycle is a special cycle type that runs BEFORE vertical feature cycles. It builds shared infrastructure only. It does NOT build user-facing features.

Scope of a foundation cycle:
- **Shared data models**: Supabase schema covering entities referenced by 2+ feature areas.
- **Auth flows**: Registration, login, session management, role-based access.
- **External integrations**: Stripe customer/subscription setup, email provider config, API key management.
- **Shared UI components**: App shell, navigation, layout, theme tokens, error boundaries.
- **Deployment pipeline**: Staging/production environments, CI, environment variables.

A foundation cycle uses the same state machine phases as a feature cycle (building, test-integrity, qa-gate, etc.) but with a foundation spec instead of a feature spec.

## Detection

The analyzing phase determines when a foundation cycle is needed.

**New projects (post-seeding):** Always insert a foundation cycle before the first feature cycle. The vision document and seed spec are sufficient to extract shared infrastructure.

**Existing projects:** When the analyzing phase prepares the next feature area and discovers it requires infrastructure that does not exist and would benefit other pending feature areas, it inserts a foundation cycle instead of proceeding to the next vertical slice.

**Detection heuristic (vision analysis):**
1. Extract all data entities mentioned across all feature areas.
2. Extract all external services mentioned across all feature areas.
3. Extract all UI patterns mentioned across all feature areas.
4. Any entity, service, or pattern referenced by 2+ feature areas is foundation scope.
5. If foundation scope is non-empty and not yet built, insert a foundation cycle.

## State Machine Changes

Two new states added to `current_state` enum in `state.json`:

```
"foundation-building"   — Building phase for foundation infrastructure
"foundation-evaluating" — Evaluation phase for foundation (lighter gate)
```

New field in `state.json`:

```json
{
  "foundation": {
    "status": "pending" | "in-progress" | "complete",
    "scope": ["shared-schema", "auth", "stripe-integration", "app-shell"],
    "completed_at": "2026-03-26T10:00:00Z"
  }
}
```

State transitions:

```
seeding -> ready -> foundation-building -> test-integrity -> foundation-evaluating
  -> [pass] -> building (first vertical feature)
  -> [fail] -> foundation-building (retry with evaluation feedback)
```

After foundation completes, the normal feature cycle loop resumes: `building -> test-integrity -> qa-gate -> ...` for each feature area.

## Foundation Evaluation

Foundation cycles use a lighter evaluation gate than feature cycles:

- **Test integrity**: Required. All foundation code must have tests.
- **QA gate**: Skipped for backend-only foundation work (schema, integrations). Required if foundation includes UI components (app shell, navigation).
- **PO review**: Replaced with a structural review: does the schema support all feature areas? Are integration configs complete? Are shared components exported and documented?

The `foundation-evaluating` phase reads the foundation spec's acceptance criteria and verifies each one programmatically or via test output. No browser QA unless UI components are in scope.

## Foundation Spec Generation

The analyzing phase generates a foundation spec by cross-referencing the vision document against all feature areas:

1. **Entity extraction**: Parse each feature area's description for data entities (nouns that represent persistent state). Entities appearing in 2+ areas become foundation schema.
2. **Service extraction**: Parse for external service references (payment, email, storage, maps). Each becomes a foundation integration task with config + client wrapper + test stub.
3. **UI pattern extraction**: Parse for layout references (dashboard, settings page, navigation). Shared patterns become foundation UI tasks.
4. **Spec assembly**: Produce a foundation spec in the same format as a seed spec, with acceptance criteria that are testable by the evaluation pipeline. Each criterion maps to either a test assertion or a structural check.

Example foundation spec acceptance criteria:
- `users` table exists with columns supporting all feature areas that reference users.
- Stripe customer creation succeeds with test API keys.
- App shell renders with navigation links for all feature areas (even if pages are stubs).
- Auth flow completes: register, login, logout, session persistence.

## Implementation Changes

**`schemas/state.json`**: Add `foundation-building` and `foundation-evaluating` to the `current_state` enum. Add the `foundation` object to properties.

**`rouge-loop.sh`**: No changes. The launcher already dispatches based on `current_state`. New states map to new skills.

**New skills**:
- `rouge-foundation-build`: Reads foundation spec from `cycle_context.json`, invokes superpowers for each foundation task. Same pattern as `rouge-build` but scoped to infrastructure.
- `rouge-foundation-eval`: Runs test-integrity, then structural checks against foundation spec criteria. Writes evaluation report. Transitions to `building` (first feature area) on pass, or back to `foundation-building` on fail.

**`rouge-analyze` (modified)**: After seeding completes and before the first feature cycle, run the detection heuristic. If foundation scope is non-empty, set `current_state` to `foundation-building` instead of `building`. For existing projects, check foundation scope before each new feature area transition.

**`cycle_context.json`**: Add `foundation_spec` field (same shape as `active_spec`). Feature cycles can reference `foundation.scope` to know what infrastructure is available.
