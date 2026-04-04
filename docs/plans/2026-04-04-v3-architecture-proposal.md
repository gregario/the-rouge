# The Rouge V3 — Architecture Proposal

**Date:** 2026-04-04
**Author:** Socrates (Claude Opus 4.6, 1M context)
**Input:** Engineering Audit (Phase 1), Product Review (Phase 2), Eng Review (Phase 3)
**Branch:** `v2/granularity-refactor`
**Decision:** Hybrid — rewrite prompts + state model, refactor launcher, keep building + evaluation

---

## Architecture Decisions Summary

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | State management | Checkpoint-per-phase with dual ledger | Fixes mutable state corruption. Append-only, no new deps |
| 2 | Branch strategy | Single branch, incremental commits, milestone tags | Eliminates fragmentation — root cause of overnight failure |
| 3 | Prompt architecture | Shared preamble + strict I/O contract | Fixes all 7 cross-prompt contradictions |
| 4 | Safety mechanisms | All in launcher, prompts have zero safety authority | Deterministic JS, can't be hallucinated away |
| 5 | Foundation-at-spec-time | New INFRASTRUCTURE seeding discipline (08) | Resolves infra decisions before loop starts |
| 6 | Self-improvement | Git worktree isolation with allowlist/blocklist | Safety boundary: never modify running code |
| 7 | Linked project deps | Seeding detects, launcher orchestrates (max depth 3) | Dependency graph in infrastructure_manifest.json |

---

## V3 System Architecture

```
                         THE ROUGE V3 — SYSTEM ARCHITECTURE

  ┌─────────────────────────────────────────────────────────────────────┐
  │                        SEEDING SWARM (8 disciplines)                │
  │  01-brainstorming → 02-competition → 03-taste → 04-spec            │
  │  → 05-design → 06-legal → 07-marketing → 08-infrastructure         │
  │                                                                     │
  │  Outputs:                                                           │
  │    task_ledger.json          (milestones, stories, acceptance)      │
  │    infrastructure_manifest   (db, deploy, auth, data, deps)         │
  │    vision.json               (persona, problem, north star)         │
  │    product_standard.json     (quality overrides)                    │
  └────────────────────────────────┬────────────────────────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │  LINKED PROJECT RESOLUTION   │
                    │  (launcher orchestrates)      │
                    │                              │
                    │  For each depends_on_project: │
                    │    If not shipped → seed +    │
                    │    build dependency first     │
                    │  Max depth: 3                 │
                    │  Circular: escalate to human  │
                    └──────────────┬───────────────┘
                                   │
  ┌────────────────────────────────▼────────────────────────────────────┐
  │                        ROUGE LOOP (launcher)                        │
  │                                                                     │
  │  ┌───────────────────────────────────────────────────────────────┐  │
  │  │ SAFETY LAYER (deterministic JavaScript, zero LLM authority)   │  │
  │  │  • Milestone lock (promoted_milestones[] in checkpoint)       │  │
  │  │  • Spin detection (zero-delta, time-based, story dedup)       │  │
  │  │  • Cost tracking (tokens per phase, budget cap from config)   │  │
  │  │  • Deploy blocking (failure → block milestone-check)          │  │
  │  │  • PreToolUse hooks + audit trail (tools.jsonl)               │  │
  │  └───────────────────────────────────────────────────────────────┘  │
  │                                                                     │
  │  ┌───────────────────────────────────────────────────────────────┐  │
  │  │ STATE MODEL (dual ledger + checkpoints)                       │  │
  │  │                                                               │  │
  │  │  task_ledger.json ← Seeding output. Read-only during loop.    │  │
  │  │    Updated ONLY by generating-change-spec (add fix stories).  │  │
  │  │                                                               │  │
  │  │  checkpoints.jsonl ← Append-only. Written by launcher ONLY.   │  │
  │  │    Each entry: {phase, timestamp, state_snapshot, costs}       │  │
  │  │    On crash: resume from last checkpoint.                     │  │
  │  │    Time-travel: replay from any checkpoint.                   │  │
  │  │                                                               │  │
  │  │  cycle_context.json ← Phase workspace. Prompts write here.    │  │
  │  │    Launcher reads after phase, merges into next checkpoint.    │  │
  │  └───────────────────────────────────────────────────────────────┘  │
  │                                                                     │
  │  ┌───────────────────────────────────────────────────────────────┐  │
  │  │ PHASE EXECUTION                                               │  │
  │  │                                                               │  │
  │  │  Shared preamble (injected by launcher):                      │  │
  │  │    • Phase identity, read/write permissions                   │  │
  │  │    • Data contract (schema reference)                         │  │
  │  │    • Project learnings (learnings.md)                         │  │
  │  │    • Pre-compaction flush instruction                         │  │
  │  │                                                               │  │
  │  │  Model selection (STATE_TO_MODEL config):                     │  │
  │  │    • Opus: seeding, analyzing, vision-check, change-spec,     │  │
  │  │            final-review, story-building                       │  │
  │  │    • Sonnet: foundation, foundation-eval, milestone-check,    │  │
  │  │              milestone-fix, shipping, story-diagnosis          │  │
  │  └───────────────────────────────────────────────────────────────┘  │
  │                                                                     │
  │  GIT: Single branch rouge/build-{project}                          │
  │       Bisectable commits per story                                  │
  │       Milestone tags: milestone/{name}                              │
  │       No branches, no merges, no fragmentation                      │
  └─────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────┐
  │                    SELF-IMPROVEMENT (isolated)                       │
  │                                                                     │
  │  Trigger: completion phase → prompt_improvement_proposals[]          │
  │           → GitHub issues (label: self-improvement)                  │
  │           → Human triggers improvement run                           │
  │                                                                     │
  │  Execution:                                                          │
  │    git worktree add /tmp/rouge-improve rouge/self-improve/{issue}    │
  │    Rouge Build runs in worktree (modified prompts)                   │
  │    Test project validates changes                                    │
  │    gh pr create → Human reviews → merge or reject                    │
  │    git worktree remove                                               │
  │                                                                     │
  │  ALLOWLIST: src/prompts/**/*.md, docs/design/*.md                    │
  │  BLOCKLIST: src/launcher/*.js, .claude/settings.json,                │
  │             rouge.config.json, rouge-safety-check.sh                 │
  └─────────────────────────────────────────────────────────────────────┘
```

---

## 1. State Management: Checkpoint-per-Phase with Dual Ledger

### The problem
V2 uses a mutable `state.json` that both the launcher and prompts read/write. This caused:
- State corruption from prompt contradictions (#77)
- Regression after milestone promotion (#86)
- Stateless SIGINT recovery losing work context

### The design

**Task Ledger** (`task_ledger.json`):
- Written by seeding (8 disciplines)
- Contains: milestones[], stories[] (with acceptance criteria), feature areas
- Read-only during the build loop
- Updated ONLY by `generating-change-spec` when adding fix stories
- This is the "what to build" artifact — stable, strategic

**Checkpoint Stream** (`checkpoints.jsonl`):
- Append-only JSONL file
- Written by launcher ONLY, before and after each phase
- Each entry contains a full state snapshot:

```json
{
  "id": "cp-2026-04-04T20:00:00Z-story-building",
  "phase": "story-building",
  "timestamp": "2026-04-04T20:00:00.000Z",
  "state": {
    "current_milestone": "vehicle-registry",
    "current_story": "add-edit-mode",
    "promoted_milestones": ["dashboard-features"],
    "story_results": { ... },
    "confidence": 0.85,
    "consecutive_failures": 0
  },
  "costs": {
    "phase_tokens": 45000,
    "phase_cost_usd": 0.67,
    "cumulative_tokens": 1250000,
    "cumulative_cost_usd": 18.75
  }
}
```

**Cycle Context** (`cycle_context.json`):
- Phase workspace — prompts write their outputs here
- Launcher reads after phase completion, merges into next checkpoint
- Overwritten each phase (not append-only — it's a scratch pad)

**Recovery**: On crash, launcher reads last checkpoint from `checkpoints.jsonl`. On SIGINT + restart, resumes from last checkpoint. No state loss, no regression.

**Time-travel debugging**: Read any checkpoint to see exact state at any point. Replay from any checkpoint by truncating `checkpoints.jsonl` and restarting.

### Dual ledger integration (from Azure Foundry Magentic-One comparison)
The task ledger / checkpoint stream split IS the dual ledger pattern:
- Task Ledger = seeding output (what milestones exist, what stories are planned)
- Progress Ledger = checkpoint stream (where we are now, what's been done)

This was identified separately in the competitor synthesis but naturally aligns with the checkpoint architecture. The separation is the key insight: the task ledger changes rarely (only when fix stories are added), while the progress ledger changes every phase. V2 conflated both in one mutable file — V3 separates them.

---

## 2. Branch Strategy: Single Branch with Incremental Commits

### The problem
V2 creates a branch per story. This caused:
- Branch fragmentation (milestone-check evaluates only one story's branch)
- Mega-merges at promotion (60 conflicts, 22 post-merge test failures)
- Fix stories for branch fragmentation built on their own branches (recursive)
- File count tracking noise (branch switches look like hundreds of file changes)

### The design

```
rouge/build-{project-name}
  │
  ├─ feat(schema): add vehicles table           ┐
  ├─ feat(auth): add login flow                  │ foundation
  ├─ feat(deploy): configure staging             │
  ├─ test(foundation): structural integrity      ┘
  │
  ├─ feat(vehicle-list): add list page           ┐
  ├─ test(vehicle-list): add unit tests          │ story: vehicle-list
  ├─ feat(vehicle-edit): add edit mode           │ story: vehicle-edit
  ├─ test(vehicle-edit): add edit tests          ┘
  ├─ TAG: milestone/vehicle-registry             ← promote
  │
  ├─ feat(gps-api): add trip recording           ┐
  ├─ test(gps-api): add trip tests               │ story: gps-api
  └─ ...                                         ┘
```

**Rules:**
- One branch per project: `rouge/build-{project-name}`
- Each story produces bisectable commits (type/scope format)
- Milestone promotion = git tag (`milestone/{name}`)
- Story rollback = `git revert` (not branch delete)
- Milestone-check evaluates the full branch (all stories visible)
- Deploy-to-staging deploys the full branch

**What this eliminates:**
- Branch fragmentation (single branch, no merges needed)
- Mega-merges (no merges at all)
- Stale evaluation (milestone-check sees all code)
- File count noise (no branch switching)

---

## 3. Prompt Architecture: Shared Preamble + Strict I/O Contract

### The problem
17 loop prompts evolved independently with no shared data contract. 7 cross-prompt contradictions documented in the engineering audit (C1-C7).

### The design

**Shared preamble** (injected by launcher before every prompt):

```markdown
## Phase Contract

YOU ARE: {phase_name} ({phase_description})
MODEL: {model_name} (selected by launcher)

### Read permissions
- task_ledger.json (milestones, stories, acceptance criteria)
- cycle_context.json (previous phase outputs, accumulated context)
- learnings.md (project-specific institutional knowledge)
- infrastructure_manifest.json (database, deploy, auth, data decisions)
- global_improvements.json (cross-cutting quality items)

### Write permissions
- cycle_context.json ONLY (your outputs go here)
- Git commits (if you are a building/fixing phase)

### NEVER write
- state.json (does not exist in V3 — replaced by checkpoints)
- task_ledger.json (read-only during loop, except generating-change-spec)
- checkpoints.jsonl (launcher-only)
- infrastructure_manifest.json (seeding-only)

### Data contract
Your output in cycle_context.json MUST include these keys:
{phase_specific_required_keys}

Your output MUST NOT include these keys:
{phase_specific_forbidden_keys}

### Pre-compaction instruction
Before your context window compresses, write any critical decisions,
blockers, or discoveries to cycle_context.json under the key
"pre_compaction_flush". This prevents knowledge loss during long phases.

### Project learnings
{contents of learnings.md, if exists}
```

**Per-prompt body**: Phase-specific logic, rewritten for contract compliance. Core logic preserved from V2 (building, evaluation, analyzing are strong). Contradictions eliminated by the preamble's read/write rules.

**Launcher responsibility**: Sole writer of checkpoints. Assembles phase context from latest checkpoint + cycle_context. Injects preamble. Validates prompt output against data contract schema.

---

## 4. Safety Mechanisms: All in Launcher

### The problem
V2 had soft safety in prompts (convergence guardrails, improvement routing) that could be hallucinated away. The overnight run proved prompt-side safety doesn't work — the loop spun for 12 hours.

### The design

All safety is deterministic JavaScript in `rouge-loop.js`:

**4.1 Milestone Lock**
```javascript
// In checkpoint state
promoted_milestones: ["dashboard-features", "vehicle-registry"]

// In advanceState()
if (promoted_milestones.includes(milestone)) {
  log.warn(`Milestone ${milestone} already promoted — skipping regression`);
  return findNextMilestone(); // Skip to next unpromoted milestone
}
```

**4.2 Spin Detection**
```javascript
// Track in checkpoint
stories_executed: [
  { name: "vehicle-edit", delta: 45, duration_ms: 480000 },
  { name: "vehicle-edit", delta: 0, duration_ms: 120000 },  // ← zero delta
]

// Detection rules (checked after each story)
const zeroDeltas = stories_executed.filter(s => s.delta === 0).length;
const duplicates = findDuplicateStoryNames(stories_executed);
const timeSinceProgress = Date.now() - lastMeaningfulProgressTimestamp;

if (zeroDeltas >= 3) escalate("3+ stories with zero code delta");
if (duplicates.length > 0) skipDuplicates(duplicates);
if (timeSinceProgress > 30 * 60 * 1000) escalate("No progress for 30 minutes");
```

**4.3 Cost Tracking**
```javascript
// Track in checkpoint (costs field)
costs: {
  phase_tokens: 45000,
  phase_cost_usd: 0.67,
  cumulative_tokens: 1250000,
  cumulative_cost_usd: 18.75
}

// Budget cap from rouge.config.json
if (costs.cumulative_cost_usd >= config.budget_cap_usd) {
  escalate(`Budget cap reached: $${costs.cumulative_cost_usd} / $${config.budget_cap_usd}`);
}
```

**4.4 Deploy Blocking**
```javascript
// deploy-to-staging.js returns null on failure
const deployResult = await deploy(projectDir);
if (!deployResult) {
  deployRetries++;
  if (deployRetries >= 3) {
    escalate("Staging deploy failed 3 times");
    return; // Do NOT proceed to milestone-check
  }
  await sleep(30000);
  continue; // Retry deploy
}
// Only proceed to milestone-check if deploy succeeded
```

**4.5 Story Deduplication**
```javascript
// Before executing a story
const completedStoryNames = checkpoints
  .flatMap(cp => cp.state.story_results)
  .filter(sr => sr.outcome === 'pass')
  .map(sr => sr.name);

if (completedStoryNames.includes(story.name)) {
  log.info(`Story ${story.name} already completed — skipping`);
  markStoryDone(story);
  continue;
}
```

**4.6 PreToolUse Hooks + Audit Trail**
```javascript
// .claude/settings.json (existing, strengthened)
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash|Write",
      "command": "./rouge-safety-check.sh"
    }]
  }
}

// NEW: Audit trail
// All tool calls logged to tools.jsonl (append-only)
// Enables post-hoc analysis of what Rouge did during a build
```

---

## 5. Foundation-at-Spec-Time: INFRASTRUCTURE Discipline

### The problem
V2's foundation phase discovers infrastructure incompatibilities mid-loop (Prisma + Cloudflare Workers, WebGL + headless browser, Docker Compose vs cloud staging). These are all knowable at spec time.

### The design

New seeding discipline: `08-infrastructure.md`

**Mandatory sequence update:**
```
BRAINSTORMING → TASTE → SPEC → INFRASTRUCTURE → DESIGN
```
INFRASTRUCTURE runs after SPEC (knows what features need) and before DESIGN (informs UI constraints).

**Input:** Feature areas, data models, integration needs from SPEC output.

**Checks:**
1. Database choice vs deploy target compatibility (e.g., Prisma + CF Workers = incompatible)
2. Auth strategy vs framework compatibility
3. Data sources: existence, licence, format, API availability, freshness
4. Integration combinations (flag known-bad combos)
5. Staging strategy (Docker Compose vs cloud providers)
6. Project dependencies (depends_on_projects[])

**Output:** `infrastructure_manifest.json`
```json
{
  "database": {
    "type": "postgres",
    "provider": "supabase",
    "client": "@supabase/supabase-js",
    "reason": "CF Workers incompatible with Prisma ORM"
  },
  "deploy": {
    "target": "cloudflare-workers",
    "staging_env": "staging",
    "production_env": "production"
  },
  "auth": {
    "strategy": "supabase-auth",
    "provider": "supabase"
  },
  "data_sources": [
    {
      "name": "vehicle-gps-simulator",
      "type": "generated",
      "format": "json",
      "licence": "n/a",
      "note": "Synthetic data for staging; real GPS feed in production"
    }
  ],
  "incompatibilities_resolved": [
    "Prisma + CF Workers → switched to @supabase/supabase-js"
  ],
  "depends_on_projects": []
}
```

**Loop foundation phase change:** Reads `infrastructure_manifest.json` and EXECUTES decisions (scaffolding, migrations, deployment). No longer MAKES decisions. Much simpler, much faster.

---

## 6. Self-Improvement: Git Worktree Isolation

### The problem
The completion phase generates `prompt_improvement_proposals[]` but they're never acted on. Rouge should be able to improve its own prompts.

### The safety boundary (non-negotiable)
The running loop MUST NOT modify its own prompts, launcher, or evaluation criteria. Self-improvement is always: propose → isolated environment → human review → merge.

### The design

**Trigger flow:**
1. Completion phase generates `prompt_improvement_proposals[]`
2. Proposals become GitHub issues (label: `self-improvement`)
3. Human decides when to run improvement (not automatic)
4. Launcher creates git worktree: `git worktree add /tmp/rouge-improve rouge/self-improve/{issue-id}`

**Execution in worktree:**
1. Read the GitHub issue
2. Modify prompts in worktree ONLY
3. Run a small test project through modified prompts (integration smoke test)
4. If test project succeeds: commit + push + `gh pr create`
5. Human reviews PR diff
6. Human merges or rejects
7. `git worktree remove /tmp/rouge-improve`

**File access control:**
```
ALLOWLIST (can modify):
  src/prompts/loop/*.md
  src/prompts/seeding/*.md
  docs/design/*.md

BLOCKLIST (CANNOT modify, enforced by safety hooks):
  src/launcher/*.js
  .claude/settings.json
  rouge.config.json
  rouge-safety-check.sh
  schemas/*.json
```

**Validation:** The test project must:
- Complete at least 1 milestone with the modified prompts
- Pass all prompt contract tests
- Not trigger any safety escalations
- Cost less than $5 (budget cap for test runs)

---

## 7. Linked Project Dependencies

### The problem
Products often need sub-products built first (Fleet Manager needs Maps Integration, Maps Integration needs Simulator). V2 has no concept of project dependencies.

### The design

**Detection (seeding):** The INFRASTRUCTURE discipline evaluates whether features need capabilities that should be separate projects:

```json
// infrastructure_manifest.json
"depends_on_projects": [
  {
    "name": "maps-integration",
    "reason": "Fleet manager needs interactive map with tile server",
    "provides": ["map-api", "tile-server-url"],
    "can_use_existing": null
  }
]
```

**Resolution (launcher):**
```
For each project in build queue:
  1. Read infrastructure_manifest.json
  2. For each depends_on_project:
     a. Check ~/.rouge/registry.json — is it shipped?
     b. If shipped: inject dependency artifacts (URLs, schemas) into project context
     c. If not shipped: seed + build dependency first (enqueue with HIGH priority)
  3. Only start building when all deps are resolved
```

**Project registry** (`~/.rouge/registry.json`):
```json
{
  "projects": {
    "maps-integration": {
      "path": "~/.rouge/projects/maps-integration",
      "status": "shipped",
      "provides": {
        "map-api": "https://maps-staging.example.workers.dev/api",
        "tile-server-url": "https://tiles-staging.example.workers.dev"
      },
      "shipped_at": "2026-04-01T10:00:00Z"
    }
  }
}
```

**Constraints:**
- Max recursion depth: 3 (configurable in `rouge.config.json`)
- Circular dependencies detected at seed time → escalate to human
- Each dependency is a full Rouge Build run (separate state, separate branch)
- Shared artifacts: integration URLs, API schemas, deployment URLs

---

## 8. Project Learnings

### The problem
Sessions are stateless. The overnight run repeated the same mistakes (db.ts overwrite, branch fragmentation) because each phase had no memory of what previous phases learned.

### The design

**`learnings.md`** at project root. Read by every phase (via shared preamble). Append-only during the loop.

**Who writes:**
- Analyzing phase: when root cause analysis identifies a pattern
- Evaluation phase: when the same quality gap appears twice
- QA-fixing phase: when a fix reveals a systemic issue
- Escalation resolution: when human provides context that phases should know
- Retrospective phase: when cross-cutting patterns are identified

**Format:**
```markdown
# Project Learnings

## Infrastructure
- Do NOT use Prisma ORM — use @supabase/supabase-js (CF Workers incompatible)
- WebGL components cannot be tested in headless Chrome — use env_limited verdict

## Build Patterns
- Do NOT overwrite db.ts — it has a manually added supabase export
- Merge branches before running milestone evaluation

## Quality
- Loading skeletons required on every page (caught twice in vehicle-registry)
```

**Lifecycle:**
- Created by foundation phase (first learnings from infrastructure manifest)
- Grows during the build loop
- Max 50 lines (pruned by retrospective if exceeded)
- Persists across sessions (committed to project repo)

---

## 9. Per-Phase Model Selection

### The design

```javascript
// rouge-loop.js
const STATE_TO_MODEL = {
  // Reasoning-heavy → Opus
  'seeding':                'opus',
  'analyzing':              'opus',
  'vision-check':           'opus',
  'generating-change-spec': 'opus',
  'final-review':           'opus',
  'story-building':         'opus',

  // Mechanical → Sonnet
  'foundation':             'sonnet',
  'foundation-eval':        'sonnet',
  'milestone-check':        'sonnet',
  'milestone-fix':          'sonnet',
  'shipping':               'sonnet',
  'story-diagnosis':        'sonnet',
};

// Override via rouge.config.json
const model = config.model_overrides?.[phase] || STATE_TO_MODEL[phase] || 'opus';
```

Estimated 40-50% cost reduction. Building and reasoning phases stay on Opus for quality. Mechanical phases (evaluation sub-phases, fixing, shipping) run on Sonnet.

---

## 10. Pre-Compaction Memory Flush

### The design (from OpenClaw comparison)

Added to the shared preamble (Section 3):

```markdown
### Pre-compaction instruction
Before your context window compresses, write any critical decisions,
blockers, or discoveries to cycle_context.json under the key
"pre_compaction_flush":
{
  "pre_compaction_flush": {
    "decisions": ["chose X over Y because Z"],
    "blockers": ["cannot do X until Y is resolved"],
    "discoveries": ["found that Z is incompatible with W"]
  }
}
This prevents knowledge loss during long phases.
```

The launcher reads `pre_compaction_flush` from cycle_context and persists it in the checkpoint. Knowledge survives context compression.

---

## 11. PreToolUse Hooks + Audit Trail

### The design (from Anthropic SDK comparison)

**Strengthen existing safety hooks** (`.claude/settings.json`):

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash|Write",
      "command": "./rouge-safety-check.sh"
    }]
  }
}
```

**`rouge-safety-check.sh` enhanced to block:**
- Production deployments (`wrangler deploy` without `--env staging`)
- Destructive operations (`rm -rf`, `git push --force`, `DROP TABLE`)
- Modifications to safety files (launcher, config, settings)
- During self-improvement: any file not on allowlist

**Audit trail** (`tools.jsonl`):
```json
{"timestamp":"2026-04-04T20:00:00Z","tool":"Bash","command":"npm run build","phase":"story-building","story":"vehicle-edit"}
{"timestamp":"2026-04-04T20:00:05Z","tool":"Write","path":"src/app/vehicles/page.tsx","phase":"story-building","story":"vehicle-edit"}
```

Append-only. Enables post-hoc analysis of what Rouge did during any build.

---

## Test Strategy

### Layer 1: Launcher Unit Tests (~200 tests, <5 seconds)

```
test/launcher/
  milestone-lock.test.js        — lock after promote, reject regression
  spin-detection.test.js        — zero-delta, time-based, story dedup
  cost-tracking.test.js         — accumulation, budget cap, escalation
  deploy-blocking.test.js       — failure blocks milestone-check, retry logic
  story-dedup.test.js           — cross-milestone deduplication
  checkpoint-io.test.js         — write, read, recovery from crash
  state-transitions.test.js     — all valid transitions, reject invalid
  model-selection.test.js       — STATE_TO_MODEL mapping, config overrides
  linked-projects.test.js       — dependency resolution, circular detection
  context-assembly.test.js      — preamble injection, learnings inclusion
```

### Layer 2: Prompt Contract Tests (~50 tests, <10 seconds)

```
test/prompts/
  contract-validation.test.js
    For each prompt:
      - Feed mock cycle_context + task_ledger
      - Validate output has required keys
      - Validate output has no forbidden keys
      - Validate output matches JSON schema
```

### Layer 3: Integration Smoke (~5 tests, ~10 minutes, ~$2)

```
test/integration/
  tiny-project.test.js
    - Seed a 1-milestone, 2-story project
    - Run foundation + 2 stories + milestone-check + promote
    - Verify: checkpoints written, task_ledger unchanged,
      costs tracked, milestone tag created
```

---

## NOT in scope

- Consensus engine (#81) — build on stable V3 + model selection
- Containerised phase execution (#84) — bottleneck is prompt quality, not compute isolation
- Rouge debugging mode (#85) — nice-to-have, defer
- Data provenance as seeding discipline (#83) — can be added to seeding swarm later
- Slack pause-and-resume — defer
- Rouge Grow (#33) — future product, requires stable V3
- Rouge Maintain (#34) — future product, requires stable V3
- Rouge Embed (#18) — future product, requires stable V3

---

## What already exists (reuse map)

| Component | V2 Status | V3 Action |
|-----------|-----------|-----------|
| Building capability (01-building.md) | Strong | Keep core logic, add preamble |
| Evaluation pipeline (02* sub-phases) | Strong | Keep 5-lens structure, add preamble |
| Seeding swarm (8 prompts) | Working | Add 08-infrastructure discipline |
| Rate limiting | Solid | Keep as-is |
| Watchdog (3-signal) | Solid after FIX #57 | Keep as-is |
| Snapshot system | Working | Replace with checkpoints (superset) |
| Safety hooks | Configured | Strengthen + audit trail |
| Deploy pipeline | Working, silent failures | Add retry + blocking + notifications |
| Notification system | 7 types | Wire screenshot capture, deploy alerts |

---

## Failure Modes Registry

| Codepath | Failure Mode | Safety? | Test? | User Sees |
|----------|-------------|---------|-------|-----------|
| Checkpoint write | Disk full | Launcher catches | Layer 1 | Escalation |
| Checkpoint read (recovery) | Corrupted JSONL | Parse error → escalate | Layer 1 | Escalation |
| Task ledger write (change-spec) | Schema violation | Contract validation | Layer 2 | Escalation |
| Spin detection | False positive (legitimate zero-delta) | Threshold tuning | Layer 1 | Escalation (recoverable) |
| Cost tracking | API doesn't report tokens | Estimate from prompt length | Layer 1 | Inaccurate cost (non-critical) |
| Deploy blocking | Deploy flaps (pass/fail/pass) | Retry with backoff | Layer 1 | Escalation after 3 |
| Self-improvement worktree | Git conflict on create | Catch, clean up, escalate | Layer 1 | GitHub issue stays open |
| Linked project resolution | Circular dependency | Detected at seed time | Layer 1 | Escalation to human |
| Model selection | Unknown phase name | Default to Opus | Layer 1 | Slightly higher cost |
| Pre-compaction flush | Phase doesn't write it | Non-critical (best effort) | Layer 2 | Potential knowledge loss |

**Critical gaps: 0.** All failure modes have either safety handling, test coverage, or both.
