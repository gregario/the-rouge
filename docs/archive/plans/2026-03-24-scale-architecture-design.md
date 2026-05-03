# Scale Architecture — Hierarchy, Chunking, Parallelism

**Date:** 2026-03-24
**Status:** Design document
**Scope:** How Rouge handles large projects (50+ screens, 80+ flows)

## Problem

Current architecture: flat list of feature areas, built sequentially, one `claude -p` session per phase. This works for 6-screen apps but breaks for large SaaS:
- Context window overflow: opus can't hold 50 screens of spec + code in one session
- Sequential execution: building 30 feature areas one at a time takes days
- No decomposition intelligence: the seeder decides feature areas, but there's no guidance on optimal size

## Design: Three-Level Hierarchy

```
Project
  └── Module (auth, billing, dashboard, admin, ...)
        └── Feature Area (login-form, password-reset, mfa-setup, ...)
              └── Screen (/login, /forgot-password, /mfa/setup, ...)
```

### Level definitions

**Module** (~5-15 per large SaaS): A cohesive functional domain. Has its own data models, its own user journeys, minimal coupling to other modules. Examples: auth, billing, team-management, analytics, admin.

**Feature Area** (~2-6 per module): A buildable unit within a module. Small enough for one `claude -p` building session. Has acceptance criteria, a screen or two, and clear boundaries. Examples within auth: login-form, registration, password-reset, mfa-setup, session-management.

**Screen** (~1-3 per feature area): A single route/page. The unit of observation for the product walk. Examples: /login, /register, /forgot-password.

### How the hierarchy is created

During **seeding** (Rouge Spec), the seeder creates the hierarchy in `vision.json`:

```json
{
  "modules": [
    {
      "name": "auth",
      "description": "Authentication and authorization",
      "feature_areas": [
        {
          "name": "login-form",
          "screens": ["/login"],
          "acceptance_criteria": ["AC-auth-1", "AC-auth-2"],
          "dependencies": ["session-management"],
          "estimated_complexity": "small"
        }
      ],
      "dependencies": []
    }
  ]
}
```

For small projects (< 10 screens), there's only one implicit module containing all feature areas. The current flat list works unchanged.

### Chunking guidelines

The seeder should follow these rules when decomposing:

| Project Size | Modules | Feature Areas/Module | Screens/Area |
|-------------|---------|---------------------|--------------|
| Small (< 10 screens) | 1 (implicit) | 3-6 | 1-2 |
| Medium (10-30 screens) | 2-5 | 3-5 | 1-3 |
| Large (30-80 screens) | 5-10 | 3-6 | 1-3 |
| Enterprise (80+ screens) | 8-15 | 3-6 | 1-3 |

**Target: each feature area should take one `claude -p` building session (10-20 min with opus).** If a feature area takes longer, it's too big. If it takes < 5 min, it's too small (overhead per cycle dominates).

### How the launcher uses the hierarchy

**Building:** One feature area at a time (current behavior). The building prompt receives the module context + feature area spec. Modules are built in dependency order.

**Code Review:** Per-module or per-feature-area, depending on what changed. Small changes = feature area scope. New module = full module review.

**Product Walk:** Per-module. Walk all screens in the module, since screens within a module are likely coupled. Smoke-check screens in other modules.

**Evaluation:** Whole project. All three lenses read all available walk data.

**Promoting:** Per-module. When all feature areas in a module pass evaluation, the module is promoted. When all modules are promoted, the project enters final-review.

## Parallelism

### What can run in parallel

**Independent modules** can build simultaneously. Auth and billing have minimal coupling — building login-form doesn't affect invoice-generation.

**Independent feature areas within a module** can sometimes run in parallel, but dependencies must be respected (password-reset depends on login-form existing).

**Phases within a cycle** are sequential (building → test → code-review → walk → evaluation). No parallelism here — each phase reads the previous phase's output.

### Implementation: worktree-based parallelism

```
main worktree: rouge-loop.js launcher (orchestrator)
  ├── worktree-auth/     ← claude -p building auth/login-form
  ├── worktree-billing/  ← claude -p building billing/invoice-list
  └── worktree-admin/    ← claude -p building admin/user-management
```

Each parallel build gets its own git worktree. The launcher:
1. Identifies independent modules (no unresolved dependencies)
2. Creates worktrees for each
3. Spawns parallel `claude -p` sessions
4. Waits for all to complete
5. Merges worktrees back to main branch
6. Runs review pipeline on the merged result

**Concurrency limit:** `ROUGE_MAX_PARALLEL` env var (default: 2). More than 3 concurrent opus sessions risks rate limits.

### Reference Implementation: gstack WorktreeManager

gstack (garrytan/gstack) has a battle-tested worktree manager at `lib/worktree.ts` that solves the non-obvious edge cases:

- **SHA-256 dedup:** Prevents duplicate work when the same changes are attempted in parallel
- **Gitignored artifact copying:** Auto-copies `.agents/`, `browse/dist/`, and other gitignored but necessary artifacts between worktrees
- **Original SHA tracking:** Detects when a worktree's base has drifted from the target branch
- **Cleanup:** Automatic worktree removal after successful merge

When implementing Rouge's parallel module builds, adapt this implementation rather than building from scratch. The dedup and artifact-copying patterns are the parts most likely to be missed in a greenfield implementation.

**Upstream:** `github.com/garrytan/gstack` at commit 6156122 or later

### State machine changes

The state.json currently tracks one `current_feature_area`. For parallel builds, it needs to track multiple:

```json
{
  "modules": [
    {
      "name": "auth",
      "status": "in-progress",
      "feature_areas": [
        { "name": "login-form", "status": "complete" },
        { "name": "password-reset", "status": "building" }
      ]
    },
    {
      "name": "billing",
      "status": "pending",
      "feature_areas": [...]
    }
  ],
  "parallel_builds": [
    { "module": "auth", "area": "password-reset", "worktree": "/tmp/rouge-auth-pw-reset" }
  ]
}
```

### Dependency resolution

Modules declare dependencies in vision.json. The launcher builds a DAG and resolves build order:

```
auth (no deps) ← team-management (needs auth) ← admin (needs auth + team)
billing (no deps)
analytics (needs auth)
```

Build order: auth + billing first (parallel), then team-management + analytics (parallel, both depend only on auth), then admin (depends on team-management).

## What NOT to build now

This design is for future implementation. The current session should:

1. **Add module support to state.json schema** — so the seeder can create hierarchical structures
2. **Add dependency resolution to advanceState** — build order respects dependencies
3. **Document the chunking guidelines** — so the seeder prompt can reference them

Worktree-based parallelism (#6) is the most complex piece and should be implemented separately when the first large project is seeded. The hierarchy and chunking can be implemented now because they're backwards-compatible — a single-module project with a flat feature area list works exactly as before.

## Backwards Compatibility

Small projects (< 10 screens) continue to work unchanged:
- `state.json` with flat `feature_areas[]` → treated as single implicit module
- No `modules` key in vision.json → flat mode
- Sequential building → no worktrees needed
