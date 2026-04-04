# The Rouge V3 — Execution Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite the Rouge orchestration layer so it can run unattended overnight without spinning, losing state, or wasting compute.

**Architecture:** Hybrid rewrite — new state model (checkpoint-per-phase with dual ledger), new prompt architecture (shared preamble + strict I/O contract), refactored launcher (safety mechanisms), kept building + evaluation logic. See `docs/plans/2026-04-04-v3-architecture-proposal.md` for full architecture.

**Tech Stack:** Node.js (launcher), Markdown (prompts), JSONL (checkpoints), JSON (task ledger, config)

**Key docs to read before starting:**
- `docs/plans/2026-04-04-v3-architecture-proposal.md` — the architecture (MUST READ)
- `docs/plans/2026-04-04-v3-engineering-audit.md` — what's broken and why
- `docs/plans/2026-04-04-v3-product-review.md` — product decisions
- `docs/design/v2-process-map.md` — how V2 works (ground truth)
- `docs/design/state-schema-v2.md` — current data schema

---

## Execution Phases

This plan is divided into 5 execution phases. Each phase is one session. Each phase ends with a commit checkpoint and verification.

```
Phase A: State Model + Launcher Safety     ← Critical path, do first
Phase B: Prompt Rewrite                    ← Largest phase, 17 files
Phase C: Branch Strategy + Small Items     ��� Launcher changes + config
Phase D: Seeding Expansions                ← New discipline + self-improvement + linked deps
Phase E: Test Suite + Integration          ← Verification
```

**Dependency graph:**
```
Phase A ──→ Phase B ──→ Phase C ──→ Phase E
                    └──→ Phase D ──→ Phase E
```
Phase B depends on A (prompts need the new data contract from the state model).
Phases C and D can run in parallel after B.
Phase E runs last (integration test validates everything).

---

## Phase A: State Model + Launcher Safety

**Goal:** Replace mutable state.json with checkpoint-per-phase + dual ledger. Add all 6 safety mechanisms to the launcher.

**Branch:** `v3/state-model-and-safety` (from `v2/granularity-refactor`)

### Task A1: Create checkpoint I/O module

**Files:**
- Create: `src/launcher/checkpoint.js`
- Test: `test/launcher/checkpoint-io.test.js`

**Step 1: Write the failing test**

```javascript
// test/launcher/checkpoint-io.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { writeCheckpoint, readLatestCheckpoint, readAllCheckpoints, recoverFromCheckpoint } from '../src/launcher/checkpoint.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Checkpoint I/O', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('writeCheckpoint appends to JSONL file', () => {
    const cpPath = path.join(tmpDir, 'checkpoints.jsonl');
    writeCheckpoint(cpPath, {
      phase: 'story-building',
      state: { current_milestone: 'vehicle-registry', current_story: 'add-edit' },
      costs: { phase_tokens: 45000, cumulative_tokens: 45000 }
    });
    const lines = fs.readFileSync(cpPath, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    const cp = JSON.parse(lines[0]);
    assert.equal(cp.phase, 'story-building');
    assert.ok(cp.id.startsWith('cp-'));
    assert.ok(cp.timestamp);
  });

  test('readLatestCheckpoint returns most recent', () => {
    const cpPath = path.join(tmpDir, 'checkpoints.jsonl');
    writeCheckpoint(cpPath, { phase: 'foundation', state: { step: 1 }, costs: {} });
    writeCheckpoint(cpPath, { phase: 'story-building', state: { step: 2 }, costs: {} });
    const latest = readLatestCheckpoint(cpPath);
    assert.equal(latest.phase, 'story-building');
    assert.equal(latest.state.step, 2);
  });

  test('readLatestCheckpoint returns null for empty file', () => {
    const cpPath = path.join(tmpDir, 'checkpoints.jsonl');
    const latest = readLatestCheckpoint(cpPath);
    assert.equal(latest, null);
  });

  test('readAllCheckpoints returns array of all entries', () => {
    const cpPath = path.join(tmpDir, 'checkpoints.jsonl');
    writeCheckpoint(cpPath, { phase: 'foundation', state: {}, costs: {} });
    writeCheckpoint(cpPath, { phase: 'story-building', state: {}, costs: {} });
    writeCheckpoint(cpPath, { phase: 'milestone-check', state: {}, costs: {} });
    const all = readAllCheckpoints(cpPath);
    assert.equal(all.length, 3);
  });

  test('recoverFromCheckpoint truncates after given checkpoint ID', () => {
    const cpPath = path.join(tmpDir, 'checkpoints.jsonl');
    writeCheckpoint(cpPath, { phase: 'foundation', state: { step: 1 }, costs: {} });
    writeCheckpoint(cpPath, { phase: 'story-building', state: { step: 2 }, costs: {} });
    writeCheckpoint(cpPath, { phase: 'milestone-check', state: { step: 3 }, costs: {} });
    const all = readAllCheckpoints(cpPath);
    recoverFromCheckpoint(cpPath, all[0].id); // recover to foundation
    const after = readAllCheckpoints(cpPath);
    assert.equal(after.length, 1);
    assert.equal(after[0].phase, 'foundation');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /path/to/the-rouge && node --test test/launcher/checkpoint-io.test.js`
Expected: FAIL — module not found

**Step 3: Implement checkpoint module**

```javascript
// src/launcher/checkpoint.js
import fs from 'fs';
import path from 'path';

export function writeCheckpoint(filePath, { phase, state, costs }) {
  const checkpoint = {
    id: `cp-${new Date().toISOString()}-${phase}`,
    phase,
    timestamp: new Date().toISOString(),
    state: { ...state },
    costs: { ...costs }
  };
  const line = JSON.stringify(checkpoint) + '\n';
  fs.appendFileSync(filePath, line, 'utf8');
  return checkpoint;
}

export function readLatestCheckpoint(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) return null;
  const lines = content.split('\n').filter(Boolean);
  return JSON.parse(lines[lines.length - 1]);
}

export function readAllCheckpoints(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) return [];
  return content.split('\n').filter(Boolean).map(line => JSON.parse(line));
}

export function recoverFromCheckpoint(filePath, checkpointId) {
  const all = readAllCheckpoints(filePath);
  const idx = all.findIndex(cp => cp.id === checkpointId);
  if (idx === -1) throw new Error(`Checkpoint ${checkpointId} not found`);
  const kept = all.slice(0, idx + 1);
  fs.writeFileSync(filePath, kept.map(cp => JSON.stringify(cp)).join('\n') + '\n', 'utf8');
}
```

**Step 4: Run tests to verify they pass**

Run: `node --test test/launcher/checkpoint-io.test.js`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add src/launcher/checkpoint.js test/launcher/checkpoint-io.test.js
git commit -m "feat(v3): add checkpoint I/O module — append-only JSONL state management"
```

---

### Task A2: Create task ledger module

**Files:**
- Create: `src/launcher/task-ledger.js`
- Test: `test/launcher/task-ledger.test.js`

**Step 1: Write the failing test**

```javascript
// test/launcher/task-ledger.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readTaskLedger, addFixStories, getNextStory, getNextMilestone, isStoryCompleted } from '../src/launcher/task-ledger.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Task Ledger', () => {
  let tmpDir, ledgerPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-test-'));
    ledgerPath = path.join(tmpDir, 'task_ledger.json');
    fs.writeFileSync(ledgerPath, JSON.stringify({
      milestones: [
        {
          name: 'dashboard',
          stories: [
            { id: 's1', name: 'add-list', status: 'done' },
            { id: 's2', name: 'add-edit', status: 'pending' }
          ]
        },
        {
          name: 'gps-trips',
          stories: [
            { id: 's3', name: 'trip-api', status: 'pending' }
          ]
        }
      ]
    }));
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

  test('readTaskLedger returns milestones and stories', () => {
    const ledger = readTaskLedger(ledgerPath);
    assert.equal(ledger.milestones.length, 2);
    assert.equal(ledger.milestones[0].stories.length, 2);
  });

  test('getNextStory returns first pending story in milestone', () => {
    const ledger = readTaskLedger(ledgerPath);
    const story = getNextStory(ledger, 'dashboard');
    assert.equal(story.name, 'add-edit');
  });

  test('getNextStory returns null when all done', () => {
    const ledger = readTaskLedger(ledgerPath);
    ledger.milestones[0].stories[1].status = 'done';
    const story = getNextStory(ledger, 'dashboard');
    assert.equal(story, null);
  });

  test('getNextMilestone returns first milestone with pending stories', () => {
    const ledger = readTaskLedger(ledgerPath);
    ledger.milestones[0].stories.forEach(s => s.status = 'done');
    const ms = getNextMilestone(ledger);
    assert.equal(ms.name, 'gps-trips');
  });

  test('addFixStories appends stories to milestone', () => {
    const ledger = readTaskLedger(ledgerPath);
    addFixStories(ledgerPath, 'dashboard', [
      { id: 'fix1', name: 'fix-layout', status: 'pending' }
    ]);
    const updated = readTaskLedger(ledgerPath);
    assert.equal(updated.milestones[0].stories.length, 3);
  });

  test('isStoryCompleted checks across all milestones', () => {
    const ledger = readTaskLedger(ledgerPath);
    assert.equal(isStoryCompleted(ledger, 'add-list'), true);
    assert.equal(isStoryCompleted(ledger, 'add-edit'), false);
  });
});
```

**Step 2: Run test — expect FAIL**

**Step 3: Implement task-ledger.js**

Implement: `readTaskLedger`, `addFixStories` (the ONLY write operation), `getNextStory`, `getNextMilestone`, `isStoryCompleted`. Only `addFixStories` writes to disk — all other operations are read-only.

**Step 4: Run tests — expect PASS**

**Step 5: Commit**

```bash
git add src/launcher/task-ledger.js test/launcher/task-ledger.test.js
git commit -m "feat(v3): add task ledger module — read-only during loop except fix stories"
```

---

### Task A3: Milestone lock

**Files:**
- Create: `src/launcher/safety.js`
- Test: `test/launcher/milestone-lock.test.js`

**Step 1: Write failing test**

Test that `checkMilestoneLock(checkpoint, milestoneName)` returns `true` if milestone is in `promoted_milestones[]`, `false` otherwise. Test that `promoteMilestone(checkpoint, name)` adds to the array.

**Step 2: Run — FAIL**
**Step 3: Implement in `safety.js`**

```javascript
export function checkMilestoneLock(checkpoint, milestoneName) {
  return (checkpoint.state.promoted_milestones || []).includes(milestoneName);
}

export function promoteMilestone(state, milestoneName) {
  if (!state.promoted_milestones) state.promoted_milestones = [];
  if (!state.promoted_milestones.includes(milestoneName)) {
    state.promoted_milestones.push(milestoneName);
  }
  return state;
}
```

**Step 4: Run — PASS**
**Step 5: Commit**

```bash
git commit -m "feat(v3): add milestone lock — prevent regression after promotion"
```

---

### Task A4: Spin detection

**Files:**
- Modify: `src/launcher/safety.js`
- Test: `test/launcher/spin-detection.test.js`

**Tests to write:**
1. `detectZeroDeltaSpin` — returns true when 3+ stories have delta === 0
2. `detectDuplicateStories` — returns duplicate story names from execution history
3. `detectTimeStall` — returns true when no meaningful progress for 30 minutes
4. `shouldEscalateForSpin` — combines all three checks, returns escalation reason or null

**Step 1: Write tests for all 4 functions**
**Step 2: Run — FAIL**
**Step 3: Implement all 4 in `safety.js`**
**Step 4: Run — PASS**
**Step 5: Commit**

```bash
git commit -m "feat(v3): add spin detection — zero-delta, duplicate, time-based stall"
```

---

### Task A5: Cost tracking

**Files:**
- Create: `src/launcher/cost-tracker.js`
- Test: `test/launcher/cost-tracking.test.js`

**Tests to write:**
1. `estimatePhaseCost(tokenCount)` — returns USD estimate based on model pricing
2. `trackPhaseCost(checkpoint, phaseTokens, model)` — accumulates costs in state
3. `checkBudgetCap(checkpoint, budgetCapUsd)` — returns true if over budget
4. `getCostSummary(checkpoints)` — returns per-phase and cumulative breakdown

**Implementation notes:**
- Token → USD conversion: Opus input $15/M, output $75/M; Sonnet input $3/M, output $15/M
- Store in checkpoint: `costs.phase_tokens`, `costs.phase_cost_usd`, `costs.cumulative_tokens`, `costs.cumulative_cost_usd`
- Budget cap read from `rouge.config.json`: `{ "budget_cap_usd": 50 }`

**Step 1-5: TDD cycle, commit**

```bash
git commit -m "feat(v3): add cost tracking — per-phase tokens, cumulative USD, budget cap"
```

---

### Task A6: Deploy blocking

**Files:**
- Test: `test/launcher/deploy-blocking.test.js`
- Modify: `src/launcher/deploy-to-staging.js` (add retry + notification)

**Tests to write:**
1. `deployWithRetry` — retries 3 times on failure, returns null after 3
2. `deployWithRetry` — succeeds on 2nd attempt, returns staging URL
3. `shouldBlockMilestoneCheck(deployResult)` — returns true if deploy failed

**Implementation:** Wrap existing `deploy()` function in retry logic. On final failure, return `{ blocked: true, reason: '...' }` instead of silent null.

**Step 1-5: TDD cycle, commit**

```bash
git commit -m "feat(v3): add deploy blocking — retry 3x, block milestone-check on failure"
```

---

### Task A7: Story deduplication

**Files:**
- Modify: `src/launcher/safety.js`
- Test: `test/launcher/story-dedup.test.js`

**Tests to write:**
1. `getCompletedStoryNames(checkpoints)` — extracts all story names with outcome=pass
2. `isStoryDuplicate(storyName, completedNames)` — returns true if already completed
3. Dedup skips stories across milestone boundaries

**Step 1-5: TDD cycle, commit**

```bash
git commit -m "feat(v3): add story deduplication — skip stories already completed"
```

---

### Task A8: Wire safety into rouge-loop.js

**Files:**
- Modify: `src/launcher/rouge-loop.js`

**Changes:**
1. Replace `readJson('state.json')` with `readLatestCheckpoint(checkpointsPath)`
2. Replace state.json writes with `writeCheckpoint()`
3. Add `checkMilestoneLock()` call in `advanceState()` before milestone transitions
4. Add `shouldEscalateForSpin()` call after each story completion
5. Add `trackPhaseCost()` call after each phase execution
6. Add `checkBudgetCap()` call before starting a phase
7. Add `deployWithRetry()` replacement for current deploy call
8. Add `isStoryDuplicate()` check before executing a story
9. Remove old snapshot logic (checkpoints replace it)
10. Remove FIX-6 state.json restore logic (no more state.json corruption)

**This is the largest single task.** Read the current `rouge-loop.js` carefully before starting. The safety module functions are already tested — this task wires them into the existing control flow.

**Do NOT rewrite rouge-loop.js from scratch.** Refactor incrementally:
1. First: replace state I/O (checkpoint read/write)
2. Second: add safety checks at decision points
3. Third: remove old snapshot/restoration code
4. Test after each sub-step by running existing tests

**Commit:**

```bash
git commit -m "refactor(v3): wire checkpoint model + safety mechanisms into launcher"
```

---

### Task A9: Create task_ledger.json from seeding output

**Files:**
- Modify: `src/launcher/rouge-loop.js` (the `advanceState` for foundation-eval → story-building)

**Change:** When transitioning from seeding to foundation, split `state.json` into:
- `task_ledger.json` — milestones[], stories[], acceptance criteria
- First checkpoint entry in `checkpoints.jsonl`

This is a migration step — V3 needs to read V2 `state.json` on first run and produce the new dual-ledger format.

**Commit:**

```bash
git commit -m "feat(v3): migrate state.json to task_ledger.json + checkpoints on first run"
```

---

### Phase A Checkpoint

**Verify:** Run all launcher tests: `node --test test/launcher/*.test.js`
Expected: All pass (~40 tests across 7 test files)

**Verify:** Run existing tests: `npm test`
Expected: Existing tests still pass (backwards compatible)

**Commit tag:** `git tag v3-phase-a`

---

## Phase B: Prompt Rewrite

**Goal:** Rewrite all 17 loop prompts with shared preamble, strict I/O contract, no state.json references.

**Branch:** Continue on `v3/state-model-and-safety`

### Task B1: Create shared preamble template

**Files:**
- Create: `src/prompts/loop/_preamble.md`
- Create: `src/launcher/preamble-injector.js`
- Test: `test/launcher/preamble-injector.test.js`

**Preamble template** (`_preamble.md`):

```markdown
## Phase Contract

YOU ARE: {{phase_name}} ({{phase_description}})
MODEL: {{model_name}}

### Read permissions
- task_ledger.json (milestones, stories, acceptance criteria)
- cycle_context.json (previous phase outputs)
- learnings.md (project-specific institutional knowledge, if exists)
- infrastructure_manifest.json (if exists)
- global_improvements.json (if exists)

### Write permissions
- cycle_context.json ONLY

### NEVER write
- task_ledger.json (except generating-change-spec phase)
- checkpoints.jsonl (launcher-only)
- infrastructure_manifest.json (seeding-only)

### Required output keys in cycle_context.json
{{required_output_keys}}

### Pre-compaction instruction
Before your context window compresses, write critical decisions, blockers,
or discoveries to cycle_context.json under "pre_compaction_flush".

### Project learnings
{{learnings_content}}
```

**Preamble injector:** Function that reads the template, fills in variables, prepends to the phase prompt.

**Test:** Verify preamble injector produces correct output for each phase, includes learnings content when learnings.md exists, omits it when absent.

**Commit:**

```bash
git commit -m "feat(v3): add shared preamble template + injector for prompt I/O contract"
```

---

### Task B2: Define data contract schema

**Files:**
- Create: `schemas/cycle-context-v3.json` (JSON Schema for cycle_context outputs per phase)
- Create: `schemas/task-ledger-v3.json` (JSON Schema for task ledger)
- Create: `schemas/checkpoint-v3.json` (JSON Schema for checkpoint entries)

**Purpose:** These schemas are referenced by the preamble and used by prompt contract tests (Phase E). Define the required and forbidden keys for each phase's cycle_context output.

**Commit:**

```bash
git commit -m "feat(v3): add JSON schemas for data contract — cycle_context, task_ledger, checkpoint"
```

---

### Task B3: Rewrite loop prompts (17 files)

**Files to modify:** All files in `src/prompts/loop/`:

```
00-foundation-building.md
00-foundation-evaluating.md
01-building.md
02-evaluation-orchestrator.md
02a-test-integrity.md
02c-code-review.md
02d-product-walk.md
02e-evaluation.md
02f-re-walk.md
03-qa-fixing.md
04-analyzing.md
05-change-spec-generation.md
06-vision-check.md
07-ship-promote.md
08-document-release.md
09-cycle-retrospective.md
10-final-review.md
```

**For each prompt, apply these changes:**
1. Remove any "read state.json" instructions → replace with "read from cycle_context provided by launcher"
2. Remove any "write to state.json" instructions → replace with "write to cycle_context.json"
3. Remove any branch creation instructions (`git checkout -b rouge/story-{name}`) → stories commit to the current branch
4. Add required output keys per the data contract schema
5. Remove V1 vestiges (old state names, old branch naming, old field references)
6. Resolve contradictions C1-C7 from the engineering audit:
   - C1: Foundation evaluation routing → clarify that foundation-eval is handled by launcher, not evaluation orchestrator
   - C2: Dual foundation insertion → only analyzing can recommend insert-foundation; building just builds
   - C3: Verdict vs confidence → analyzing uses `confidence_adjusted` only; ship-promote checks `po_verdict`; document which is authoritative where
   - C6: factory_decisions append → explicitly state "APPEND to existing factory_decisions, do not overwrite"

**IMPORTANT:** Preserve the core logic of each prompt. The building prompt's TDD rhythm, the evaluation's 5-lens pipeline, the analyzing phase's root cause classification — these work well. Only change the I/O contract and remove contradictions.

**This is the largest task in the plan.** Work through prompts in pipeline order:
1. Foundation (00, 00-eval) — commit
2. Building (01) — commit
3. Evaluation (02, 02a, 02c, 02d, 02e, 02f) — commit
4. Fixing (03) — commit
5. Analyzing + change-spec (04, 05) — commit
6. Ship pipeline (06, 07, 08, 09, 10) — commit

Six commits, each covering a logical group.

---

### Task B4: Wire preamble injection into launcher

**Files:**
- Modify: `src/launcher/rouge-loop.js` (the `runPhase` function)

**Change:** Before spawning `claude -p <prompt>`, prepend the preamble (using the injector from B1). Pass learnings.md content if the file exists.

**Commit:**

```bash
git commit -m "feat(v3): inject shared preamble into all phase prompts at runtime"
```

---

### Phase B Checkpoint

**Verify:** Read each rewritten prompt and confirm:
- No references to state.json
- No branch creation instructions
- Required output keys listed
- Pre-compaction flush instruction present
- No contradictions between prompts

**Commit tag:** `git tag v3-phase-b`

---

## Phase C: Branch Strategy + Small Items

**Goal:** Single branch strategy, model selection, PreToolUse hooks, project learnings.

### Task C1: Single branch strategy in launcher

**Files:**
- Modify: `src/launcher/rouge-loop.js`
- Test: `test/launcher/branch-strategy.test.js`

**Changes:**
1. Remove all `git checkout -b rouge/story-{milestone}-{story_id}` logic
2. Create single branch on project init: `rouge/build-{project-name}`
3. After milestone promotion: `git tag milestone/{name}`
4. Story rollback (if needed): `git revert` commits for that story

**Tests:**
1. `createBuildBranch(projectName)` — creates `rouge/build-{name}` branch
2. `tagMilestone(milestoneName)` — creates tag `milestone/{name}` at HEAD
3. Branch is never changed during story execution

**Commit:**

```bash
git commit -m "feat(v3): single branch strategy — one branch per project, milestone tags"
```

---

### Task C2: Per-phase model selection

**Files:**
- Create: `src/launcher/model-selection.js`
- Test: `test/launcher/model-selection.test.js`
- Modify: `src/launcher/rouge-loop.js` (pass model to `claude -p --model`)

**Implementation:**

```javascript
// src/launcher/model-selection.js
const STATE_TO_MODEL = {
  'seeding':                'opus',
  'analyzing':              'opus',
  'vision-check':           'opus',
  'generating-change-spec': 'opus',
  'final-review':           'opus',
  'story-building':         'opus',
  'foundation':             'sonnet',
  'foundation-eval':        'sonnet',
  'milestone-check':        'sonnet',
  'milestone-fix':          'sonnet',
  'shipping':               'sonnet',
  'story-diagnosis':        'sonnet',
};

export function getModelForPhase(phase, configOverrides = {}) {
  return configOverrides[phase] || STATE_TO_MODEL[phase] || 'opus';
}
```

**Tests:** Verify mapping for all phases, verify config override works.

**Commit:**

```bash
git commit -m "feat(v3): per-phase model selection — Opus for reasoning, Sonnet for mechanical"
```

---

### Task C3: Project learnings system

**Files:**
- Create: `src/launcher/learnings.js`
- Test: `test/launcher/learnings.test.js`

**Implementation:**
- `readLearnings(projectDir)` — reads `learnings.md` from project root, returns content or empty string
- `appendLearning(projectDir, category, learning)` — appends a line under the right category header
- `pruneLearnings(projectDir, maxLines)` — trims to max lines (default 50), keeping most recent per category

**Preamble integration:** Already handled in B1 — the preamble template includes `{{learnings_content}}`.

**Commit:**

```bash
git commit -m "feat(v3): project learnings system — read/append/prune learnings.md"
```

---

### Task C4: PreToolUse hooks + audit trail

**Files:**
- Modify: `rouge-safety-check.sh` (strengthen blocked patterns)
- Create: `src/launcher/audit-trail.js`
- Test: `test/launcher/audit-trail.test.js`

**Strengthen safety check to block:**
- `wrangler deploy` without `--env staging`
- `rm -rf` on project directories
- `git push --force`
- Modifications to files on the blocklist (launcher, config, settings, safety check)

**Audit trail:** Append tool calls to `tools.jsonl`:
```json
{"timestamp":"...","tool":"Bash","command":"npm run build","phase":"story-building","story":"vehicle-edit"}
```

**Commit:**

```bash
git commit -m "feat(v3): strengthen PreToolUse safety hooks + append-only audit trail"
```

---

### Phase C Checkpoint

**Verify:** Run all tests: `node --test test/launcher/*.test.js`
Expected: All pass (~80 tests)

**Commit tag:** `git tag v3-phase-c`

---

## Phase D: Seeding Expansions

**Goal:** New INFRASTRUCTURE seeding discipline, self-improvement isolation, linked project dependencies.

### Task D1: INFRASTRUCTURE seeding discipline

**Files:**
- Create: `src/prompts/seeding/08-infrastructure.md`
- Modify: `src/prompts/seeding/00-swarm-orchestrator.md` (add 8th discipline, update sequence)

**Prompt content for 08-infrastructure.md:**
- Input: feature areas, data models, integration needs from SPEC
- Checks: DB vs deploy compat, auth vs framework compat, data source viability, known-bad combos, project dependencies
- Output: `infrastructure_manifest.json` (schema defined in B2)
- Must run AFTER spec, BEFORE design

**Update orchestrator:**
- Add INFRASTRUCTURE to discipline list
- Update mandatory sequence: `BRAINSTORMING → TASTE → SPEC → INFRASTRUCTURE → DESIGN`
- Add convergence check: `incompatibilities` array must be empty before proceeding

**Commit:**

```bash
git commit -m "feat(v3): add INFRASTRUCTURE seeding discipline — resolve foundation at spec time"
```

---

### Task D2: Self-improvement trigger

**Files:**
- Create: `src/launcher/self-improve.js`
- Test: `test/launcher/self-improve.test.js`
- Modify: `rouge.config.json` (add self-improvement settings)

**Implementation:**
- `createImprovementIssues(proposals)` — creates GitHub issues from prompt_improvement_proposals[]
- `startImprovementRun(issueNumber)` — creates git worktree, runs Rouge with modified prompts
- `cleanupImprovementRun(worktreePath)` — removes worktree after PR created
- File access control: check allowlist/blocklist before any write in worktree

**Config addition:**
```json
{
  "self_improvement": {
    "enabled": true,
    "allowlist": ["src/prompts/loop/*.md", "src/prompts/seeding/*.md", "docs/design/*.md"],
    "blocklist": ["src/launcher/*.js", ".claude/settings.json", "rouge.config.json"],
    "test_budget_usd": 5
  }
}
```

**Tests:**
1. `createImprovementIssues` creates issues with correct labels
2. File access control rejects blocklisted paths
3. File access control allows allowlisted paths
4. Worktree creation and cleanup works

**Commit:**

```bash
git commit -m "feat(v3): self-improvement — worktree isolation, allowlist/blocklist, test budget"
```

---

### Task D3: Linked project dependencies

**Files:**
- Create: `src/launcher/project-registry.js`
- Create: `src/launcher/dependency-resolver.js`
- Test: `test/launcher/linked-projects.test.js`

**project-registry.js:**
- `readRegistry()` — reads `~/.rouge/registry.json`
- `registerProject(name, path, provides)` — adds/updates project entry
- `isProjectShipped(name)` — checks status === 'shipped'
- `getProjectArtifacts(name)` — returns provides{} (URLs, schemas)

**dependency-resolver.js:**
- `resolveDependencies(manifest)` — reads `depends_on_projects[]` from infrastructure_manifest
- For each dep: check registry, if not shipped → return `{ unresolved: [...] }`
- `checkCircularDeps(registry)` — detects cycles, returns them
- Max depth enforcement (default 3)

**Launcher integration:** In the main loop, before starting a project, call `resolveDependencies()`. If unresolved deps exist, enqueue them first.

**Tests:**
1. Dependency resolution with all deps shipped → proceed
2. Dependency resolution with unresolved dep → returns unresolved list
3. Circular dependency detection
4. Max depth enforcement (depth 4 → escalate)
5. Registry CRUD operations

**Commit:**

```bash
git commit -m "feat(v3): linked project dependencies — registry, resolver, max depth 3"
```

---

### Phase D Checkpoint

**Verify:** Run all tests: `node --test test/launcher/*.test.js`
Expected: All pass (~120 tests)

**Commit tag:** `git tag v3-phase-d`

---

## Phase E: Test Suite + Integration

**Goal:** Prompt contract tests, integration smoke test, documentation update.

### Task E1: Prompt contract tests

**Files:**
- Create: `test/prompts/contract-validation.test.js`

**For each of the 17 loop prompts:**
1. Feed mock cycle_context + task_ledger as input
2. Validate the prompt file contains preamble markers (injected at runtime, but verify template slots)
3. Validate the prompt references only permitted read sources
4. Validate the prompt's documented output keys match the schema
5. Verify no references to `state.json` exist in any prompt
6. Verify no branch creation instructions exist in building/fixing prompts

**Commit:**

```bash
git commit -m "test(v3): add prompt contract validation — schema compliance for all 17 prompts"
```

---

### Task E2: Integration smoke test

**Files:**
- Create: `test/integration/tiny-project.test.js`

**This test is expensive (~$2, ~10 minutes). Run manually, not in CI.**

Test flow:
1. Create a temporary project directory
2. Write a minimal task_ledger.json (1 milestone, 2 stories)
3. Write a minimal infrastructure_manifest.json
4. Run the launcher for 2 stories + milestone-check
5. Verify: checkpoints written, task_ledger unchanged, costs tracked, no spin detected
6. Clean up

**Commit:**

```bash
git commit -m "test(v3): add integration smoke test — tiny project end-to-end"
```

---

### Task E3: Update README and project documentation

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

**README changes:**
1. **Architecture section:** Replace the Karpathy Loop description with V3 pipeline (dual ledger, checkpoint model, shared preamble). The loop is still seed → foundation → build/evaluate → ship, but the internals are different.
2. **How it works → Build phase:** Update to reflect single-branch strategy (no branch-per-story), mention milestone tags.
3. **How it works → Evaluate phase:** Still 5-lens, but mention the I/O contract and that prompts write to cycle_context only.
4. **Composable decomposition:** Add the INFRASTRUCTURE discipline (8th) and foundation-at-spec-time concept.
5. **Economics:** Update cost estimates based on per-phase model selection (Opus for reasoning, Sonnet for mechanical). Note 40-50% reduction vs V2.
6. **Safety section:** Add cost caps, spin detection, milestone lock, deploy blocking, PreToolUse hooks + audit trail.
7. **What's next:** Update Rouge Grow / Rouge Maintain / Rouge Embed descriptions. Add self-improvement and linked project dependencies as shipped V3 features.
8. **Getting started → Prerequisites:** No changes expected, but verify accuracy.
9. **Badge pills:** Verify shields.io badges still render (no URL changes).

**CLAUDE.md changes:**
1. **Conventions → State management:** Replace state.json references with dual ledger (task_ledger.json + checkpoints.jsonl) and cycle_context.json. Document that prompts write to cycle_context ONLY.
2. **Conventions → Git:** Replace branch-per-story with single branch + milestone tags.
3. **Key files:** Update the 8 critical files list to include new files (checkpoint.js, safety.js, task-ledger.js, preamble-injector.js, etc.).
4. **What NOT to do:** Add "do not write to task_ledger.json from prompts (except generating-change-spec)" and "do not modify safety mechanism logic from prompts."

**Commit:**

```bash
git commit -m "docs(v3): update README and CLAUDE.md for V3 architecture"
```

---

### Task E4: Update design documents

**Files:**
- Create: `docs/design/state-schema-v3.md` (new, based on state-schema-v2.md)
- Create: `docs/design/state-machine-v3-transitions.md` (new, based on v2 transitions)
- Keep: `docs/design/state-schema-v2.md` and `state-machine-v2-transitions.md` as historical reference

**state-schema-v3.md:**
1. Document `task_ledger.json` schema — milestones[], stories[], acceptance criteria, infrastructure_manifest reference
2. Document `checkpoints.jsonl` entry schema — id, phase, timestamp, state snapshot, costs
3. Document `cycle_context.json` schema — per-phase required/forbidden keys (reference `schemas/cycle-context-v3.json`)
4. Document `learnings.md` format — categories, max 50 lines, append-only during loop
5. Document `infrastructure_manifest.json` schema — database, deploy, auth, data_sources, depends_on_projects
6. Document `global_improvements.json` schema (unchanged from V2)
7. Document `tools.jsonl` audit trail schema

**state-machine-v3-transitions.md:**
1. Same states as V2 but with updated invariants:
   - Milestone lock: promoted milestones cannot regress
   - Spin detection: zero-delta and time-based escalation
   - Deploy blocking: deploy failure blocks milestone-check
   - Story dedup: completed stories skipped across milestones
2. New states/transitions for self-improvement (worktree lifecycle)
3. New transitions for linked project resolution (dependency queue)
4. Updated foundation flow (INFRASTRUCTURE discipline → simplified foundation phase)

**Commit:**

```bash
git commit -m "docs(v3): add V3 state schema and state machine transition docs"
```

---

### Task E5: Generate V3 process map diagram

**Files:**
- Create: `docs/diagrams/build-rouge-v3-process-map.py` (Python generator script)
- Create: `docs/diagrams/rouge-v3-process-map.excalidraw` (generated)
- Create: `docs/diagrams/rouge-v3-process-map.png` (rendered)

**The V3 process map should follow the same visual language as the V2 diagram** (`docs/diagrams/rouge-v3-process-map-gen3.png`) but reflect the new architecture:

**Panel 1: Rouge Spec (seeding swarm)**
- 8 disciplines (add INFRASTRUCTURE as 8th)
- Mandatory sequence: BRAINSTORMING → TASTE → SPEC → INFRASTRUCTURE → DESIGN
- Outputs: task_ledger.json, infrastructure_manifest.json, vision.json, product_standard.json
- Linked project dependency detection (depends_on_projects[])

**Panel 2: Foundation (simplified)**
- Reads infrastructure_manifest.json (decisions already made)
- EXECUTES decisions, doesn't MAKE them
- Outputs to cycle_context.json
- Foundation evaluation → checkpoints.jsonl

**Panel 3: Story Building Loop**
- Single branch (`rouge/build-{project}`)
- Story → build → commit (no branching)
- Safety layer visible: milestone lock, spin detection, cost tracking, story dedup
- Checkpoint written before and after each phase
- Milestone tag on promotion
- Deploy blocking: deploy must succeed before milestone-check

**Panel 4: Ship + Self-Improvement**
- Ship pipeline: vision-check → shipping → final-review → complete
- Self-improvement flow: prompt_improvement_proposals → GitHub issues → worktree → PR → human review
- Project learnings: append-only, read by all phases

**Use the Excalidraw diagram skill** (`.claude/skills/excalidraw-diagram/SKILL.md`) and the design rules (`docs/design/diagram-design-rules.md`) to generate the diagram. Follow the same two-phase process: generate Python script → render to PNG.

**Commit:**

```bash
git commit -m "docs(v3): V3 process map diagram — 4 panels showing new architecture"
```

---

### Task E6: Update rouge.config.json

**Files:**
- Modify: `rouge.config.json`

**Add V3 configuration:**

```json
{
  "safety": {
    "blocked_commands": [],
    "allowed_deploy_targets": ["staging", "preview"],
    "custom_pre_hooks": []
  },
  "budget_cap_usd": 50,
  "spin_detection": {
    "zero_delta_threshold": 3,
    "time_stall_minutes": 30,
    "dedup_enabled": true
  },
  "model_overrides": {},
  "self_improvement": {
    "enabled": true,
    "allowlist": ["src/prompts/loop/*.md", "src/prompts/seeding/*.md", "docs/design/*.md"],
    "blocklist": ["src/launcher/*.js", ".claude/settings.json", "rouge.config.json"],
    "test_budget_usd": 5
  },
  "linked_projects": {
    "max_depth": 3,
    "registry_path": "~/.rouge/registry.json"
  }
}
```

**Commit:**

```bash
git commit -m "feat(v3): update rouge.config.json with V3 settings — safety, cost, model, self-improve"
```

---

### Phase E Checkpoint (FINAL)

**Verify all tests:**
```bash
node --test test/launcher/*.test.js    # ~120 tests, <5 seconds
node --test test/prompts/*.test.js     # ~50 tests, <10 seconds
npm test                                # existing tests still pass
```

**Verify manually:**
- Read each prompt — no state.json references, no branch creation, preamble slots present
- Read rouge-loop.js — checkpoint I/O, safety checks at decision points, model selection
- Read rouge.config.json — all V3 settings present

**Final commit tag:** `git tag v3-complete`

---

## Summary

| Phase | Tasks | Tests Added | Key Deliverable |
|-------|-------|-------------|-----------------|
| A | 9 | ~40 | Checkpoint model + all safety mechanisms |
| B | 4 | 0 (contract tests in E) | 17 prompts rewritten with shared preamble |
| C | 4 | ~40 | Branch strategy + model selection + learnings + hooks |
| D | 3 | ~40 | Infrastructure discipline + self-improvement + linked deps |
| E | 6 | ~50 | Contract tests + integration smoke + docs + diagrams |
| **Total** | **26 tasks** | **~170 tests** | **V3 complete** |

**Estimated effort:** Human: 8-10 weeks / CC+gstack: 8-12 hours across 5 sessions

**Estimated cost:** ~$30-50 in API calls (mostly integration smoke tests)

---

## Execution Notes for the Third Session

1. **Start on Phase A.** Everything else depends on the state model.
2. **Read the architecture proposal first.** Every decision is documented with rationale.
3. **Don't rewrite rouge-loop.js from scratch.** Refactor incrementally. The existing rate limiting, watchdog, and process management code is solid.
4. **Test after every commit.** The launcher tests should always pass.
5. **Phase B is the longest.** Work through prompts in pipeline order, commit per group.
6. **The integration smoke test (E2) costs ~$2.** Only run when all other tests pass.
7. **If something contradicts the architecture proposal, trust the proposal.** It was reviewed in CEO + Eng modes with all decisions confirmed.
