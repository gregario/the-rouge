# Session Handover — 2026-04-03

> Context from a long session covering Rouge loop debugging, improvement backlog design, process mapping, and diagram tooling. Use this to bootstrap a new session working on Rouge refactoring.

## Branch

All work is on `v2/granularity-refactor` in The-Rouge repo.

## What was done this session

### 1. Improvement Backlog (evaluation → analyzing pipeline fix)

**Problem:** Non-blocking improvements (missing logout button, user identity, etc.) were lost when the evaluation promoted a milestone. The `confidence_adjusted` field wasn't being output because the JSON example in the evaluation prompt didn't include it.

**Fix:** 5 prompt files changed, 0 launcher code changes:
- `02e-evaluation.md` — Added `confidence_adjusted`, `env_limited_impact`, and `improvement_items[]` to the PO lens output + JSON example
- `04-analyzing.md` — Step 2.7 routes improvements by scope: `this-milestone` → deepen (fix in-loop), `global` → persist to `global_improvements.json`, `future-milestone` → drop. Convergence guardrail prevents infinite polish loops. PROMOTE requires empty this-milestone list.
- `06-vision-check.md` — Reads `global_improvements.json` as alignment evidence
- `10-final-review.md` — Reads `global_improvements.json`, reports which are still present vs resolved
- `docs/design/state-schema-v2.md` — Documents all new fields

**Key design decision:** Improvements are fixed in-loop per milestone, not deferred to a backlog. The only persistent file is `global_improvements.json` for cross-cutting issues. Final-review gets a final chance to catch globals.

### 2. Launcher Bug Fixes

**Rate limit false positives (committed, issue #75 closed):**
- Phase log is append-mode — stale rate limit messages from previous runs triggered false positives
- Rate limit check ran before exit code check — successful phases got flagged
- Fix: check exit code first (code 0 = success regardless), only read NEW log content

**Unknown state silent loop (committed):**
- `STATE_TO_PROMPT[unknownState]` returned undefined → `return { success: true }` → infinite no-op loop
- Fix: log error, return `{ success: false }`

**State corruption root cause (issue #77 filed, not fixed):**
- Prompts CONTRADICT each other about writing to state.json
- `01-building.md` says "Write detected_profile to state.json" (line 140) AND "Do NOT update state.json" (line 583)
- `02-evaluation-orchestrator.md` tells Claude to write state transitions to state.json (line 228)
- Claude writes V1 state names (e.g., `qa-fixing`) → launcher doesn't recognise → corruption
- FIX-6 guard catches it on success path only — rate limit false positive bypasses it
- **Needs:** Full prompt audit (#77), make state.json read-only during phases

**Deploy failure not detected (issue #78 filed, not fixed):**
- `deploy()` returns null on failure but launcher doesn't check return value
- Logs "Staging deploy complete" even when deploy failed
- Milestone-check runs against stale/broken staging URL

### 3. Staging Fix (manual)

- `src/lib/db.ts` was missing `supabase` export — API routes imported it but only `prisma` was exported
- Added `createClient` from `@supabase/supabase-js` with env vars
- Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`
- Build now passes, deployed to staging successfully

### 4. Architecture Issues Filed

**#76 — Move foundation from loop phase to spec-time resolution:**
- Foundation should be resolved during seeding, not discovered mid-loop
- Stack gaps become separate Rouge projects
- When capability ships and is verified, it gets added to the stack profile
- Then the original product is seeded with the now-available capability
- Solves #72 (infrastructure constraints not propagating to evaluation) automatically

**#77 — Prompt audit for state.json contradictions:**
- Full file list of every prompt to audit
- Three-part fix: decide the rule, audit all prompts, make state.json read-only
- Blocker priority

**#78 — Deploy failure detection:**
- `deploy()` return value not checked
- Need retry + flag in cycle_context for evaluation awareness

### 5. Process Map & Diagram Tooling

**V2 Process Map document:**
- `docs/design/v2-process-map.md` — comprehensive end-to-end pipeline map
- Every phase with exact field paths for inputs/outputs
- All artifacts, decision points, external tools, notifications
- Launcher infrastructure (watchdog, rate limiting, snapshots, deploy)

**Excalidraw diagram skill:**
- `.claude/skills/excalidraw-diagram/SKILL.md` — two-phase skill (generate Python script + review PNG)
- Design rules at `docs/design/diagram-design-rules.md`
- Renderer at `tools/diagrams/render_excalidraw.py`
- Key principle: NEVER write raw Excalidraw JSON — always generate via Python script with mathematical layout

**Diagram conventions established during iteration:**
- Inputs enter TOP or LEFT of a box
- Outputs exit BOTTOM or RIGHT of a box
- Arrows always point INTO the destination
- Annotations overlap bottom-right corner of parent box
- Red dashed arrows for failure/retry paths
- No arrow may pass through any box
- These should be added to `diagram-design-rules.md`

**Final diagram:**
- `docs/diagrams/rouge-v2-process-map-gen3.png` — the polished version
- Four panels: Rouge Spec → Foundation → Story Building Loop → Final Ship
- Generator: `docs/diagrams/build-rouge-v2-process-map-gen3.py`

### 6. Key Architectural Findings

**The evaluation sub-phase pipeline (milestone-check):**
```
Test Integrity (02a) → Code Review (02c) → Product Walk (02d) → Evaluation (02e) → [Re-Walk (02f)]
```
- Product walk happens EVERY milestone-check (not just final review)
- Product walk takes screenshots systematically to `screenshots/cycle-{N}/walk/`
- Vision check (06) is purely analytical — reads prior data, NO browsing
- Final review (10) is a customer walkthrough — takes opportunistic screenshots, NOT systematic

**The loop's current state (as of session end):**
- OpenFleet V2 on `dashboard-features` milestone — 18/18 stories done, deploying for 2nd milestone-check
- Tests: 355 passing across 35 files
- 5 milestones remaining: vehicle-registry (3), gps-trips (4), maintenance (3), driver-auth (3), inspections (3)
- GPS simulator is a story in gps-trips milestone (not an add-on)
- At current pace (~8 min/story + evaluation time), roughly 8-12 hours remaining

**Foundation issues that caused the original stuck loop:**
- Cloudflare Workers + database incompatibility (Prisma doesn't work on edge runtime)
- WebGL maps can't render in headless Chrome — `env_limited` pattern added
- Test data strategy gap — simulator is a feature milestone but map needs moving vehicles during earlier evaluation
- Deployment model disconnect — Docker Compose for production, Cloudflare for staging

## Files created/modified this session

### The-Rouge (on `v2/granularity-refactor`)

| File | Action | Purpose |
|------|--------|---------|
| `src/prompts/loop/02e-evaluation.md` | Modified | confidence_adjusted + improvement_items |
| `src/prompts/loop/04-analyzing.md` | Modified | Improvement routing, convergence guardrail |
| `src/prompts/loop/06-vision-check.md` | Modified | Reads global_improvements.json |
| `src/prompts/loop/10-final-review.md` | Modified | Reads global_improvements.json |
| `docs/design/state-schema-v2.md` | Modified | Documents new fields |
| `src/launcher/rouge-loop.js` | Modified | Rate limit fix, unknown state guard |
| `docs/design/v2-process-map.md` | Created | Comprehensive pipeline reference |
| `docs/design/diagram-design-rules.md` | Created | Excalidraw design rulebook |
| `.claude/skills/excalidraw-diagram/SKILL.md` | Created | Diagram generation skill |
| `tools/diagrams/render_excalidraw.py` | Created | Playwright PNG renderer |
| `tools/diagrams/render_template.html` | Created | Excalidraw render template |
| `tools/diagrams/pyproject.toml` | Created | Python deps |
| `docs/diagrams/build-rouge-v2-process-map-gen3.py` | Created | Final diagram generator |
| `docs/diagrams/rouge-v2-process-map-gen3.png` | Created | Final polished diagram |
| `docs/plans/2026-04-03-excalidraw-diagram-skill-design.md` | Created | Design doc |
| `docs/plans/2026-04-03-excalidraw-diagram-skill-implementation.md` | Created | Implementation plan |
| `docs/plans/2026-04-03-session-handover.md` | Created | This file |

### GitHub Issues

| # | Title | Status |
|---|-------|--------|
| 75 | Rate limit false positives from stale append-mode logs | Closed (fixed) |
| 76 | Architecture: move foundation from loop to spec-time | Open |
| 77 | Audit: resolve state.json write contradictions | Open (blocker) |
| 78 | Deploy failure not detected | Open |

## What to reference for the refactor

1. **`docs/design/v2-process-map.md`** — the ground truth for how every phase works, what it reads/writes
2. **`docs/diagrams/rouge-v2-process-map-gen3.png`** — visual overview of the pipeline
3. **Issue #77** — the prompt audit is the highest-priority refactor item
4. **Issue #76** — foundation architecture redesign (spec-time resolution)
5. **`docs/design/state-machine-v2-transitions.md`** — the state machine transition map
6. **`docs/design/state-schema-v2.md`** — the data schema (now includes improvement backlog fields)
7. **The launcher code at `src/launcher/rouge-loop.js`** — all state transitions, deploy logic, rate limiting
