# gstack Feature Migration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate 13 validated gstack features into The Rouge's phase prompts, launcher infrastructure, and evaluation pipeline — organized in three waves by dependency and effort.

**Architecture:** Wave 1 (tasks 1-4) are surgical prompt edits to existing loop phases — no infrastructure changes. Wave 2 (tasks 5-9) are structural changes to prompt organization, evaluation orchestrator, and retrospective pipeline. Wave 3 (tasks 10-13) are new infrastructure capabilities for open source readiness and scale.

**Tech Stack:** Markdown phase prompts, bash launcher scripts, JSON state schemas, Node.js (Slack bot)

**Reference:** gstack repo at `/Users/gregario/Projects/ClaudeCode/AI-Factory/projects/gstack/` (origin: garrytan/gstack, pinned at origin/main 6156122)

---

## Wave 1: Prompt-Level Migrations (No Infrastructure Changes)

### Task 1: Add "Boil the Lake" Principle to Building Prompt

**Files:**
- Modify: `src/prompts/loop/01-building.md` (after Step 4 TDD section, ~line 136)

**Context:**
gstack's `/autoplan` defines this as Principle 2: "Fix everything in the blast radius. Blast radius = files modified by this plan + direct importers. Auto-approve expansions if in blast radius AND <1 day effort (<5 files, no new infra)."

Rouge's building prompt has TDD discipline but no explicit "fix neighbors" rule. Autonomous builders skip adjacent problems because nothing tells them to look.

**Step 1: Read the current building prompt refactor section**

Read `src/prompts/loop/01-building.md` lines 122-136 (the Refactor section under Step 4).

**Step 2: Add the Boil the Lake section after the Refactor subsection**

After the refactor subsection (after "Fix it now." on ~line 136), before the `---` separator, add:

```markdown
### Boil the Lake — Fix the Blast Radius

When you modify a file, you own its blast radius for this cycle. The blast radius is:
- The file you modified
- Files that directly import it (one hop)
- Files it directly imports (one hop)

For each file in the blast radius, check:
1. Does it have obvious issues you can see now that you're reading it? (dead code, inconsistent naming, missing error handling, stale comments)
2. Does it conform to `product_standard` heuristics?
3. Is it covered by tests?

Fix anything that fails these checks IF:
- The fix touches fewer than 5 files
- The fix doesn't require new infrastructure or dependencies
- The fix doesn't change public interfaces other components depend on

If a fix would exceed these bounds, log it to `factory_questions` with severity `minor` and move on. Do not let blast radius cleanup block forward progress.

**Why this matters:** Autonomous loops accumulate micro-debt faster than supervised sessions because there's no human noticing adjacent problems. Each cycle is an opportunity to improve the neighborhood, not just the house. The PO Review evaluates overall code quality — it will catch the debt you leave behind.

Do not log blast radius fixes as separate `implemented` tasks. They are part of the refactor step, committed alongside the task that surfaced them.
```

**Step 3: Verify the edit**

Read `src/prompts/loop/01-building.md` and confirm the new section sits between the Refactor subsection and Step 5.

**Step 4: Commit**

```bash
git add src/prompts/loop/01-building.md
git commit -m "feat(building): add Boil the Lake blast radius principle

Adapted from gstack /autoplan Principle 2. When modifying a file,
check and fix the one-hop import graph if fixes are small (<5 files,
no new infra). Prevents micro-debt accumulation in autonomous loops."
```

---

### Task 2: Add "Boil the Lake" Principle to QA-Fixing Prompt

**Files:**
- Modify: `src/prompts/loop/03-qa-fixing.md` (after Step 2 section, before Step 3)

**Context:**
QA-fixing is currently laser-focused: fix what QA flagged, nothing else. That's correct for the primary fix. But after fixing a bug, the blast radius check should apply — the fix may have surfaced adjacent issues in the same files.

**Step 1: Read the QA-fixing prompt Step 2 ending**

Read `src/prompts/loop/03-qa-fixing.md` to find where Step 2 ends and Step 3 begins.

**Step 2: Add blast radius check after each fix**

After the "2f. Commit the fix" subsection (before Step 3), add:

```markdown
#### 2g. Blast Radius Check (After Each Fix)

After committing the fix, check the blast radius of the files you just changed:
- The fixed file(s)
- Files that directly import them (one hop)

Look for:
1. Related bugs that share the same root cause
2. Dead code or stale comments left by the original implementation
3. Missing error handling patterns consistent with the fix you just applied

Fix anything that:
- Is clearly related to the bug you just fixed (same root cause family)
- Touches fewer than 3 additional files
- Does not change public interfaces

Commit blast radius fixes separately from the primary fix (preserve bisectability). Use commit type `refactor`, not `fix`.

**Boundary:** This is NOT an invitation to improve the codebase. You are still a debugger on an on-call rotation. The blast radius check catches *related* issues that the original bug masks or creates. If you find an unrelated issue, log it to `factory_questions` and move on.
```

**Step 3: Verify the edit**

Read the modified section and confirm it fits the QA-fixing tone (surgical, minimal, debugger posture).

**Step 4: Commit**

```bash
git add src/prompts/loop/03-qa-fixing.md
git commit -m "feat(qa-fixing): add blast radius check after each fix

After committing a bug fix, check one-hop imports for related issues
sharing the same root cause. Keeps the debugger posture but prevents
leaving related bugs unfixed when they share the same origin."
```

---

### Task 3: Add "Search Before Building" to Building Prompt

**Files:**
- Modify: `src/prompts/loop/01-building.md` (between Step 3 "Extract Tasks" and Step 4 "Build with TDD")

**Context:**
gstack's `/plan-ceo-review` has Step 0.5B: "Map every sub-problem to existing code. Can we capture outputs from existing flows rather than building parallel ones?"

Rouge's builder on cycle 4 of a product has accumulated code from cycles 1-3 but no instruction to search it first. This leads to duplicate utilities, parallel auth helpers, and redundant API wrappers.

**Step 1: Read the transition between Step 3 and Step 4**

Read `src/prompts/loop/01-building.md` lines 78-90 to see the exact boundary.

**Step 2: Add Step 3.5 between task extraction and TDD**

After the Step 3 task organization (after "Polish last" bullet on ~line 83), before the `---` separator, add:

```markdown
### Step 3.5: Search Before Building

Before writing any new code, map every extracted task to existing code in the project. This is especially critical on cycle 2+ — prior cycles left code, utilities, patterns, and abstractions that you MUST reuse rather than reinvent.

For each task:

1. **Search for existing implementations.** Grep the codebase for keywords from the task's acceptance criteria, data model entities, and component names. Check:
   - `src/` for existing components, utilities, hooks, API wrappers
   - `src/lib/` or `src/utils/` for shared helpers
   - Prior cycle's `factory_decisions` for "I created X for Y" patterns
   - Prior cycle's `implemented` entries for overlapping file paths

2. **Classify each task:**
   - **BUILD** — No existing code covers this. Write from scratch with TDD.
   - **EXTEND** — Existing code partially covers this. Extend it, don't duplicate it.
   - **REUSE** — Existing code already does this. Wire it up, don't rebuild it.
   - **REFACTOR-THEN-BUILD** — Existing code is close but needs restructuring before the new task can use it. Refactor first (with tests), then build on top.

3. **Log the search results** to `factory_decisions`:
   ```json
   {
     "decision": "Search Before Building audit for cycle <N>",
     "context": "Pre-implementation code reuse analysis",
     "alternatives_considered": [],
     "rationale": "Found: <N> BUILD, <N> EXTEND, <N> REUSE, <N> REFACTOR-THEN-BUILD tasks. Key reuse: <list specific reused code>",
     "confidence": "high",
     "affects": ["<task list>"]
   }
   ```

**Why this matters:** Without this step, an autonomous builder with no human watching is *more* likely to reinvent existing code than a supervised one. Code duplication compounds across cycles — the PO Review catches it as "code quality degradation" but by then the damage requires refactoring to undo. Finding reuse opportunities upfront is cheaper than fixing duplication later.
```

**Step 3: Verify the edit**

Read the modified area and confirm Step 3.5 sits between Step 3 (task extraction) and Step 4 (TDD).

**Step 4: Commit**

```bash
git add src/prompts/loop/01-building.md
git commit -m "feat(building): add Search Before Building pre-implementation audit

Before writing new code, grep the codebase for existing implementations.
Classify each task as BUILD/EXTEND/REUSE/REFACTOR-THEN-BUILD. Critical
for cycle 2+ where prior code exists. Adapted from gstack Step 0.5B."
```

---

### Task 4: Add "One Decision Per Question" to Notifier Spec

**Files:**
- Modify: `openspec/changes/autonomous-product-loop/specs/notifier/spec.md` (add new requirement)

**Context:**
gstack enforces a universal rule: one AskUserQuestion = one decision. Rouge's notifier spec currently sends structured Slack messages but doesn't enforce decision atomicity. The pivot notification already offers A/B/C/D options — that's fine. But when multiple issues need human input, they should be sent as sequential messages, not batched.

**Step 1: Read the current notifier spec ending**

Read `openspec/changes/autonomous-product-loop/specs/notifier/spec.md` to find where to add the new requirement.

**Step 2: Add the one-decision-per-message requirement**

Append after the last requirement in the spec:

```markdown
### Requirement: Each Slack message requests exactly one decision
The Notifier SHALL send one decision request per Slack message. When multiple issues require human input (e.g., two separate escalations from different feature areas), each SHALL be sent as a separate message with its own options and context.

#### Scenario: Multiple escalations in one cycle
- **WHEN** two or more issues require human input in the same cycle
- **THEN** the Notifier SHALL send separate messages for each, spaced 2 seconds apart
- **AND** each message SHALL contain:
  - The specific issue context
  - Concrete options (lettered A/B/C/D)
  - Enough context to decide without reading other messages
- **AND** the Slack bot SHALL track responses per-issue (keyed by issue ID, not message timestamp)

#### Scenario: Morning briefing with pending decisions
- **WHEN** the morning briefing includes issues awaiting human input
- **THEN** the briefing SHALL list pending decisions as a summary ("3 decisions pending")
- **AND** each decision SHALL be sent as a follow-up message after the briefing
- **AND** the briefing itself SHALL NOT contain decision options (it is informational only)

**Rationale:** Batching multiple decisions into one message causes snap decisions. Sequential, focused messages force deliberation on each issue independently. This is adapted from gstack's "one decision per AskUserQuestion" principle.
```

**Step 3: Verify the edit**

Read the modified spec and confirm the new requirement is consistent with existing notifier requirements.

**Step 4: Commit**

```bash
git add openspec/changes/autonomous-product-loop/specs/notifier/spec.md
git commit -m "feat(notifier): add one-decision-per-message requirement

Each Slack message requests exactly one decision. Multiple escalations
are sent as sequential messages, not batched. Adapted from gstack's
universal 'one decision per AskUserQuestion' rule."
```

---

## Wave 2: Structural Migrations (Evaluation, Retrospective, Context)

### Task 5: Add Gate vs Periodic Evaluation Tiers to Orchestrator

**Files:**
- Modify: `src/prompts/loop/02-evaluation-orchestrator.md`

**Context:**
gstack splits CI into fast "gate" tests (block PRs) and slow "periodic" tests (weekly). Rouge's evaluation orchestrator currently runs all three sub-phases (test integrity → QA gate → PO review) every cycle. But on QA-fix cycles (where only small bug fixes were applied), running a full PO Review is expensive and unlikely to change the verdict.

The evaluation orchestrator already has diff-scope awareness. This task extends it with cycle-type awareness to skip expensive evaluations on fix-only cycles.

**Step 1: Read the current orchestrator Step 3**

Read `src/prompts/loop/02-evaluation-orchestrator.md` to understand the current sub-phase dispatch logic.

**Step 2: Add cycle-type classification after Step 1 (Diff Scope)**

After Step 1 (Determine Diff Scope), before Step 2 (Reset Dashboard), add:

```markdown
### Step 1.5: Classify Cycle Type (Gate vs Full Evaluation)

Determine the cycle type from `state.json` and `cycle_context.json`:

| Cycle Type | Trigger | Evaluation Tier |
|------------|---------|-----------------|
| **initial-build** | First cycle for a feature area | **Full** — all sub-phases |
| **feature-build** | Building phase added new features | **Full** — all sub-phases |
| **qa-fix** | Previous state was `qa-fixing`, only bug fixes applied | **Gate** — test integrity + QA gate only |
| **re-evaluation** | PO Review requested re-check after analyzing phase generated new specs | **Full** — all sub-phases |

**How to detect cycle type:**
1. Read `state.json.previous_state`. If it was `qa-fixing`, this is a `qa-fix` cycle.
2. Read `cycle_context.json.implemented`. If all tasks are classified as `fix` (not `feat`), confirm `qa-fix`.
3. If `state.json.previous_state` was `analyzing` and the current cycle implements change specs, this is a `re-evaluation`.
4. Otherwise, check `cycle_context.json.implemented` for new feature tasks → `feature-build` or `initial-build`.

Write the classification to `cycle_context.json`:

```json
{
  "evaluation_tier": "full | gate",
  "cycle_type": "initial-build | feature-build | qa-fix | re-evaluation",
  "tier_rationale": "<why this tier was selected>"
}
```

**Gate tier behavior:**
- Sub-Phase 0 (Test Integrity): **Always runs**
- Sub-Phase 1 (QA Gate): **Always runs** (but scope-aware sub-checks still apply)
- Sub-Phase 2 (PO Review): **Skipped** — carry forward the previous cycle's PO Review verdict and confidence unchanged
- When PO Review is skipped, log it: `"evaluator_observations": [{"phase": "evaluation-orchestrator", "decision": "Skipped PO Review — gate-tier cycle (qa-fix). Carrying forward previous PO verdict."}]`

**Full tier behavior:**
- All sub-phases run as currently defined.

**Override:** If a `qa-fix` cycle's diff touches more than 10 files OR modifies any file not mentioned in the QA report's failure list (i.e., the fix had unexpected scope), upgrade to `full` tier and log the override reason.
```

**Step 3: Update Sub-Phase 2 dispatch to respect the tier**

In the existing Sub-Phase 2 section, wrap the PO Review dispatch:

```markdown
#### Sub-Phase 2: PO Review (02c-po-review.md)

**Only runs if:**
1. Sub-Phase 0 and Sub-Phase 1 both passed, AND
2. `evaluation_tier` is `full`

If `evaluation_tier` is `gate`:
- Skip PO Review entirely
- Carry forward `po_review_report` from `cycle_context.json` (written by the previous full-tier cycle)
- Update dashboard: preserve previous PO Review gate status (do not reset it in Step 2 for gate-tier cycles)
- Log the skip to `evaluator_observations`

If `evaluation_tier` is `full`:
- [existing PO Review dispatch logic unchanged]
```

**Step 4: Verify the edits**

Read the modified orchestrator and confirm: gate-tier skips PO Review but runs everything else, full-tier is unchanged, override exists for scope-exceeded fixes.

**Step 5: Commit**

```bash
git add src/prompts/loop/02-evaluation-orchestrator.md
git commit -m "feat(evaluation): add gate vs full evaluation tiers

QA-fix cycles run gate-tier evaluation (test integrity + QA gate only,
skip PO Review). Feature builds run full-tier. Override to full if fix
scope exceeds 10 files. Reduces cost for fix-only cycles.
Adapted from gstack's 2-tier gate/periodic test system."
```

---

### Task 6: Dual-Model PO Review (Consensus Scoring)

**Files:**
- Modify: `src/prompts/loop/02c-po-review.md` (add dual-voice section)
- Modify: `src/prompts/loop/02-evaluation-orchestrator.md` (update PO Review dispatch)

**Context:**
gstack runs Codex + Claude subagent in parallel per review phase, producing consensus tables that surface disagreements as data. Rouge's PO Review is the most subjective evaluation — "does this feel like Stripe or a student project?" A single model's taste has blind spots.

This task adds an optional dual-model mode where a second model independently evaluates the same product and disagreements are surfaced as additional quality signals.

**Step 1: Read the PO Review prompt structure**

Read `src/prompts/loop/02c-po-review.md` to understand the current evaluation flow — especially the scoring dimensions and verdict logic.

**Step 2: Add dual-voice configuration to the PO Review prompt**

At the top of `02c-po-review.md`, after the Phase Identity section, add:

```markdown
## Dual-Voice Mode (Optional)

If `cycle_context.json` contains `"dual_voice_po_review": true` (set by the evaluation orchestrator based on project configuration), run this phase in dual-voice mode.

### How Dual-Voice Works

1. **Primary voice (you):** Execute the full PO Review as described below. Produce your `po_review_report` as normal.

2. **Challenge voice (subagent):** After completing your review, dispatch a subagent with:
   - The same `cycle_context.json` (deployment_url, active_spec, vision, library_heuristics)
   - The instruction: "You are an independent product reviewer. Evaluate this product against the spec and vision. Score each dimension independently. Do NOT read or reference any prior review. Produce your scores and quality gaps."
   - The subagent writes its review to a temporary file: `cycle_context_challenge_review.json`

3. **Consensus synthesis:** After both reviews complete, compare:
   - For each scoring dimension, calculate the delta between primary and challenge scores
   - **Agreement (delta ≤ 0.1):** Use the primary score. Log: "Consensus on {dimension}: {score}"
   - **Minor disagreement (0.1 < delta ≤ 0.2):** Average the scores. Log both scores and the average.
   - **Significant disagreement (delta > 0.2):** Flag as a quality signal. Write to `po_review_report.disagreements[]`:
     ```json
     {
       "dimension": "<dimension name>",
       "primary_score": 0.0,
       "challenge_score": 0.0,
       "delta": 0.0,
       "primary_rationale": "<why primary scored this way>",
       "challenge_rationale": "<why challenge scored differently>",
       "resolution": "The lower score is used as the conservative estimate. This disagreement indicates the dimension is ambiguous or the product is on a quality boundary."
     }
     ```
   - **Overall confidence adjustment:** If 3+ dimensions have significant disagreements, reduce the overall confidence by 0.05. The product is harder to evaluate than the primary review assumed.

4. **Verdict:** The final verdict uses the consensus scores (averaged where disagreement, primary where agreement). The challenge voice cannot override the primary verdict — it can only reduce confidence and surface quality gaps.

### When Dual-Voice is NOT Used

If `dual_voice_po_review` is false or absent, execute the standard single-voice PO Review. Dual-voice approximately doubles the token cost of PO Review — it should be enabled for:
- First evaluation of a new feature area
- Re-evaluations after significant spec changes
- Any cycle where PO confidence was previously < 0.8

### Degradation

If the challenge subagent fails (timeout, error, malformed output):
- Log the failure to `evaluator_observations`
- Proceed with primary-only scores
- Do NOT retry — a failed challenge voice is not a blocking error
```

**Step 3: Update the evaluation orchestrator to pass dual-voice config**

In `02-evaluation-orchestrator.md`, in the Sub-Phase 2 section, before dispatching PO Review, add:

```markdown
Before dispatching PO Review, determine dual-voice eligibility:

```json
{
  "dual_voice_po_review": true
}
```

Enable dual-voice when ANY of:
- This is the first `full` evaluation for the current feature area (no prior `po_review_report` exists)
- The previous PO confidence was < 0.8
- The `active_spec` was updated by the analyzing phase (re-evaluation after spec changes)

Write `dual_voice_po_review` to `cycle_context.json` before dispatching.
```

**Step 4: Verify both edits**

Read both modified files. Confirm: dual-voice is opt-in, degrades gracefully, disagreements surface as data (not overrides), cost impact is documented.

**Step 5: Commit**

```bash
git add src/prompts/loop/02c-po-review.md src/prompts/loop/02-evaluation-orchestrator.md
git commit -m "feat(po-review): add dual-model consensus scoring

Optional dual-voice mode dispatches a challenge subagent for independent
PO Review. Disagreements (delta > 0.2) surface as quality signals with
conservative scoring. Reduces taste blind spots in subjective evaluation.
Adapted from gstack's triple-voice multi-model review pattern."
```

---

### Task 7: Cross-Cycle Retrospective Trend Snapshots

**Files:**
- Modify: `src/prompts/loop/09-cycle-retrospective.md` (add cross-cycle trend analysis)

**Context:**
gstack's `/retro` produces persistent JSON snapshots with cross-week trend comparison. Rouge's cycle-retrospective already produces per-cycle metrics and journey entries, but doesn't aggregate trends across cycles or produce trend snapshots that future sessions can compare.

The journey.json has the raw data. This task adds trend synthesis.

**Step 1: Read the current retrospective Steps 6-7**

Read `src/prompts/loop/09-cycle-retrospective.md` from Step 6 (Journey Entry) onward.

**Step 2: Add Step 7.5: Cross-Cycle Trend Analysis**

After Step 7 (Cycle Context Metrics), before any closing section, add:

```markdown
### Step 7.5 — Cross-Cycle Trend Analysis

Read `journey.json` and extract trends across the last 5 cycles (or all cycles if fewer than 5 exist). This step produces a trend snapshot that future phases and the launcher can use for decision-making.

#### Quality Trajectory

```json
{
  "trend_snapshot": {
    "window": "<oldest cycle in window> to <current cycle>",
    "cycles_analyzed": 0,

    "quality_trajectory": {
      "qa_health_scores": [0.0, 0.0, 0.0, 0.0, 0.0],
      "po_confidence_scores": [0.0, 0.0, 0.0, 0.0, 0.0],
      "vision_confidence_scores": [0.0, 0.0, 0.0, 0.0, 0.0],
      "direction": "improving | stable | declining | oscillating",
      "velocity": "accelerating | steady | decelerating"
    },

    "efficiency_trajectory": {
      "fix_to_feature_ratio_per_cycle": [0.0, 0.0, 0.0, 0.0, 0.0],
      "escalations_per_cycle": [0, 0, 0, 0, 0],
      "retries_per_cycle": [0, 0, 0, 0, 0],
      "direction": "improving | stable | declining"
    },

    "debt_indicators": {
      "hotspot_frequency": {
        "<file>": { "cycles_touched": 0, "last_touched": "<cycle N>" }
      },
      "recurring_quality_gaps": [
        { "gap": "<description>", "first_seen": "<cycle N>", "occurrences": 0, "resolved": false }
      ],
      "test_coverage_trend": [0.0, 0.0, 0.0, 0.0, 0.0]
    },

    "process_insights": [
      "Concrete, actionable insight derived from the trend data"
    ]
  }
}
```

#### How to Calculate Direction

- **improving**: 3+ of last 5 values are increasing (each > previous)
- **stable**: values stay within ±5% of the mean
- **declining**: 3+ of last 5 values are decreasing
- **oscillating**: alternating up/down with >10% swings (indicates instability, not steady state)

#### How to Calculate Velocity

- **accelerating**: the delta between consecutive values is increasing
- **steady**: deltas are roughly constant
- **decelerating**: deltas are shrinking (improvement is slowing)

#### Process Insights

Generate 2-4 actionable insights by reading the trend data. Examples of good insights:
- "Fix-to-feature ratio increased from 0.2 to 0.8 over 3 cycles — the codebase is accumulating debt faster than features. Next cycle should include a dedicated refactoring pass."
- "PO confidence plateaued at 0.82 for 3 cycles. The remaining quality gaps are likely taste-level issues that require Library heuristic updates, not more building."
- "src/components/Dashboard.tsx has been a hotspot for 4 consecutive cycles. It should be split — the current abstraction is carrying too many responsibilities."

Bad insights (too vague to act on):
- "Quality is improving" (no action)
- "Tests could be better" (which tests? better how?)

#### Write the Trend Snapshot

Write `trend_snapshot` to `cycle_context.json` alongside `retro_metrics`. Also append a summary to `journey.json` under the current cycle's entry as `trend_at_this_point`.

The launcher reads `trend_snapshot` to make macro decisions:
- If `quality_trajectory.direction` is `declining` for 3+ cycles: trigger human notification
- If `efficiency_trajectory.escalations_per_cycle` trend is rising: flag process issue
- If `debt_indicators.recurring_quality_gaps` has items with `occurrences >= 3`: these become priority specs for the next analyzing phase
```

**Step 3: Verify the edit**

Read the modified retrospective and confirm the trend snapshot builds on existing journey.json data without duplicating it.

**Step 4: Commit**

```bash
git add src/prompts/loop/09-cycle-retrospective.md
git commit -m "feat(retrospective): add cross-cycle trend snapshots

Analyzes last 5 cycles for quality/efficiency/debt trajectories.
Produces actionable process insights and recurring gap detection.
Launcher reads trends for macro decisions (escalation, priority specs).
Adapted from gstack /retro cross-project trend comparison."
```

---

### Task 8: Tiered Context Loading for Phase Prompts

**Files:**
- Modify: `.claude/skills/partials/autonomous-mode.md` (add tier system)
- Modify: `src/prompts/loop/01-building.md` (declare tier, scope context loading)
- Modify: `src/prompts/loop/03-qa-fixing.md` (declare tier, scope context loading)
- Modify: `src/prompts/loop/02c-po-review.md` (declare tier)
- Modify: `src/prompts/loop/02b-qa-gate.md` (declare tier)

**Context:**
gstack uses a 4-tier preamble composition system. Heavy skills get full context; lightweight skills get minimal. Rouge's phase prompts are massive (building: ~24K lines, PO review: ~16K lines) and each loads the full autonomous-mode partial plus all Library heuristics. This causes context dilution — the model pays attention to less of what matters when everything is loaded.

This task defines three tiers for Rouge phases and scopes the context loading instructions in each prompt.

**Step 1: Define the tier system in autonomous-mode.md**

At the end of the autonomous-mode partial, add:

```markdown
### Context Loading Tiers

Each phase prompt declares a tier that determines how much of `cycle_context.json` and the Library to load into working context.

| Tier | Phases | Loads |
|------|--------|-------|
| **T1 — Focused** | qa-fixing, test-integrity, document-release, ship-promote | Active spec (summary only), QA/test reports, factory_decisions (current cycle only), deployment_url. Does NOT load Library heuristics, vision document, or prior cycle history. |
| **T2 — Standard** | building, evaluation-orchestrator, change-spec-generation, cycle-retrospective | Everything in T1, plus: full active spec, Library heuristics (applicable domain only), prior cycle factory_decisions, evaluation_deltas. Does NOT load full vision document or cross-domain Library. |
| **T3 — Full** | po-review, analyzing, vision-check, final-review, product-walk, evaluation | Everything. Full vision document, all Library tiers (global + domain + personal), full journey.json history, all prior cycle data. These phases need maximum context for subjective judgment. |

**How to use tiers in prompts:**
- Each phase prompt declares `Context Tier: T1|T2|T3` in its Phase Contract section
- The "Read the Full Shared Context" step (Step 1 in most prompts) is replaced with tier-appropriate loading instructions
- A phase MAY escalate its tier for a specific invocation by logging the reason (e.g., building phase escalates to T3 on first cycle because no prior context exists)

**Why this matters:** A 24K-line prompt loading the full Library, full vision, and 5 cycles of history dilutes the model's attention. A QA-fixing phase needs the bug report and the code — not the product vision and Library heuristics about information hierarchy. Focused context produces focused work.
```

**Step 2: Add tier declaration to building prompt**

In `src/prompts/loop/01-building.md`, in the Phase Contract section (~line 24), add:

```markdown
**Context Tier:** T2 — Standard. Loads active spec, applicable Library heuristics, current + prior cycle decisions. Does NOT load full vision document (summary from cycle_context is sufficient) or cross-domain Library heuristics.

**Tier escalation:** On cycle 1 (first build for this project), escalate to T3 to absorb the full vision and all Library heuristics. Log: "Escalated to T3 — first build cycle, need full vision context."
```

In Step 1 (Read the Full Shared Context), after "Read it all," add:

```markdown
**Context Tier T2 loading:** Read the following sections in full:
- `active_spec` — your build contract
- `library_heuristics` — but only heuristics tagged with the project's domain (e.g., `domain: web`). Skip cross-domain heuristics.
- `factory_decisions` — current cycle and previous cycle only. Older decisions are in journey.json if you need them.
- `evaluation_deltas` — the quality trend
- `previous_evaluations` — QA and PO reports from the last cycle only
- `skipped` and `divergences` — from the last cycle only

Read `vision` as a **summary reference** — you need to know the product's purpose and target user, but you do not need to internalize the full vision document line by line. The PO Review (T3) does that.

On cycle 1 (no prior evaluations exist), read everything — including full vision and all Library heuristics regardless of domain.
```

**Step 3: Add tier declaration to QA-fixing prompt**

In `src/prompts/loop/03-qa-fixing.md`, after the Phase Identity section, add:

```markdown
**Context Tier:** T1 — Focused. You need the bug report, the spec, and the code. Nothing else.
```

Update the "What You Read" section to explicitly note what is NOT loaded:

```markdown
**Not loaded (T1 tier):** Vision document, Library heuristics, journey.json, prior cycle history beyond factory_decisions. You are a debugger — you fix what QA flagged using the spec as your source of truth. You do not need product vision or design heuristics to fix a broken button.
```

**Step 4: Add tier declaration to PO Review prompt**

In `src/prompts/loop/02c-po-review.md`, in its Phase Identity or Contract section, add:

```markdown
**Context Tier:** T3 — Full. PO Review requires maximum context: full vision, all Library tiers (global + domain + personal), complete evaluation history, and cross-cycle patterns. Subjective quality judgment depends on the richest possible context.
```

**Step 5: Add tier declaration to QA Gate prompt**

In `src/prompts/loop/02b-qa-gate.md`, in its Phase Identity or Contract section, add:

```markdown
**Context Tier:** T2 — Standard. QA Gate needs the spec (for criteria verification), Library heuristics (for quality baselines), and deployment URL. It does not need the full vision document or cross-cycle journey history.
```

**Step 6: Verify all edits**

Read each modified file's Phase Contract section and confirm tier declarations are consistent with the tier table.

**Step 7: Commit**

```bash
git add .claude/skills/partials/autonomous-mode.md \
  src/prompts/loop/01-building.md \
  src/prompts/loop/03-qa-fixing.md \
  src/prompts/loop/02c-po-review.md \
  src/prompts/loop/02b-qa-gate.md
git commit -m "feat(prompts): add tiered context loading system (T1/T2/T3)

T1 (focused) for qa-fixing and narrow phases — bug report + spec only.
T2 (standard) for building — spec + domain heuristics + recent history.
T3 (full) for po-review and subjective phases — everything loaded.
Reduces context dilution and token cost. Adapted from gstack's 4-tier
preamble composition system."
```

---

### Task 9: External Reviewer Triage Pattern for Rouge Maintain (migrated to The Works)

**Files:**
- Create: `docs/design/rouge-maintain-external-reviewer-triage.md`

**Context:**
gstack's Greptile integration triages automated PR review comments (valid, false positive, already fixed, suppressed) with per-project history tracking. Rouge Maintain will need this pattern for Dependabot, Snyk, CodeQL, and similar automated tools.

This task captures the design pattern as a reference document, not an implementation. Rouge Maintain is post-V1. **Note: Rouge Maintain has moved to The Works. This task is retained for historical reference.**

**Step 1: Write the design reference**

Create `docs/design/rouge-maintain-external-reviewer-triage.md`:

```markdown
# External Reviewer Triage Pattern (Rouge Maintain)

> Reference document for Rouge Maintain implementation. Adapted from gstack's Greptile triage system.

## Problem

Rouge Maintain will process automated feedback from external tools:
- Dependabot (dependency updates)
- Snyk / CodeQL (vulnerability scanning)
- Lighthouse CI (performance regression)
- ESLint / type-check (code quality)
- Automated PR reviewers (Greptile, CodeRabbit, etc.)

Without triage, these generate noise. False positives pile up. Already-fixed issues get re-flagged. The autonomous loop wastes cycles on non-issues.

## Pattern: Classify → Act → Learn

### Classification

For each external finding, classify as:

| Classification | Meaning | Action |
|----------------|---------|--------|
| **VALID_ACTIONABLE** | Real issue, needs fixing | Create fix task, prioritize by severity |
| **VALID_ALREADY_FIXED** | Real issue, but already addressed in a recent commit | Auto-reply with fix SHA, suppress |
| **FALSE_POSITIVE** | Not a real issue (tool misunderstanding, style preference, context-insensitive) | Suppress, add to suppression list |
| **DEFERRED** | Real issue, but not urgent enough for this cycle | Log to backlog, revisit in N cycles |

### History Tracking

Per-project history file: `projects/<name>/external-review-history.json`

```json
{
  "suppressions": [
    { "tool": "dependabot", "pattern": "eslint-*", "reason": "Pinned to v8 until Next.js 15 migration", "added": "2026-03-24", "expires": "2026-06-01" }
  ],
  "false_positive_patterns": [
    { "tool": "coderabbit", "file_pattern": "*.test.ts", "category": "no-magic-numbers", "reason": "Test fixtures use literal values by design" }
  ],
  "triage_stats": {
    "total_findings": 0,
    "valid_actionable": 0,
    "false_positives": 0,
    "already_fixed": 0,
    "deferred": 0
  }
}
```

### Learning Loop

After each triage cycle:
1. Check if any suppression has expired → un-suppress
2. Check if any false positive pattern no longer matches → remove
3. Update triage stats
4. If `false_positives / total_findings > 0.5` for a tool → flag the tool as noisy, consider disabling

## gstack Reference

gstack's implementation: `projects/gstack/review/greptile-triage.md`
Key patterns to adapt: per-project history file, auto-reply for already-fixed, suppression list with expiry dates.
```

**Step 2: Commit**

```bash
git add docs/design/rouge-maintain-external-reviewer-triage.md
git commit -m "docs(maintain): add external reviewer triage pattern reference

Design document for Rouge Maintain's automated feedback processing.
Classify → Act → Learn pattern with suppression lists and history tracking.
Adapted from gstack's Greptile triage system. Implementation deferred to post-V1."
```

---

## Wave 3: Open Source & Scale Infrastructure

### Task 10: Usage Telemetry Design for Open Source

**Files:**
- Create: `docs/design/usage-telemetry.md`

**Context:**
gstack implemented opt-in usage telemetry with source tagging (live vs CI vs evaluation) and UUID fingerprinting. Rouge is going open source and needs to understand how people use it — which phases succeed/fail, which project types are built, where the loop gets stuck.

**Step 1: Write the telemetry design document**

Create `docs/design/usage-telemetry.md`:

```markdown
# Usage Telemetry Design (Open Source)

> Adapted from gstack's opt-in telemetry system. Implementation priority: post-V1 launch.

## Principles

1. **Opt-in only.** Telemetry is OFF by default. First run asks once. "No" is permanent until manually changed.
2. **Transparent.** Every data point collected is documented here. No hidden fields.
3. **Anonymous.** No personally identifiable information. No project names, file paths, code content, or spec content.
4. **Useful.** Every field must answer a specific product question. No "nice to have" fields.

## What We Collect

### Per-Cycle Event

```json
{
  "event": "cycle_complete",
  "session_id": "<UUID, rotated per session>",
  "install_id": "<UUID, stable per install>",
  "rouge_version": "1.0.0",
  "source": "live | ci | evaluation",
  "timestamp": "<ISO 8601>",

  "cycle": {
    "number": 0,
    "type": "initial-build | feature-build | qa-fix | re-evaluation",
    "evaluation_tier": "full | gate",
    "duration_seconds": 0,
    "phases_executed": ["building", "evaluation", "qa-fixing"],
    "phases_retried": 0
  },

  "outcome": {
    "qa_verdict": "PASS | FAIL",
    "po_verdict": "PRODUCTION_READY | NEEDS_IMPROVEMENT | NOT_READY | SKIPPED",
    "escalations": 0,
    "shipped": false
  },

  "project_shape": {
    "domain": "web | game | artifact",
    "feature_areas_total": 0,
    "feature_areas_complete": 0,
    "total_cycles": 0
  }
}
```

### Product Questions This Answers

| Question | Field(s) |
|----------|----------|
| How many cycles does it take to ship a product? | total_cycles, shipped |
| Which phase is the bottleneck? | phases_executed, duration_seconds, phases_retried |
| How often does the loop escalate to humans? | escalations |
| What project types are people building? | domain |
| Does gate-tier evaluation save meaningful cycles? | evaluation_tier, qa_verdict |
| How often does PO Review disagree with QA? | qa_verdict vs po_verdict |

## What We Do NOT Collect

- Project names, URLs, or code
- Spec content, vision documents, or Library heuristics
- File paths or directory structures
- Error messages or stack traces (may contain code)
- User names, emails, or machine identifiers beyond install_id

## Implementation Notes

- **Endpoint:** HTTPS POST to a telemetry endpoint (self-hosted, not third-party)
- **Failure mode:** Fire-and-forget. Telemetry failures NEVER block the loop. No retries.
- **Storage:** Append-only JSONL. No database. Read with jq for analysis.
- **Consent file:** `~/.rouge/telemetry-consent` — `opted-in | opted-out | not-asked`
- **Source tagging:** Launcher sets `source` based on environment detection (CI env vars, evaluation flag, default to live)

## gstack Reference

gstack's implementation: `projects/gstack/.claude/skills/partials/session-meta.md` (source tagging), `lib/telemetry.ts` (send logic), `TRANSPARENCY.md` (public disclosure).
```

**Step 2: Commit**

```bash
git add docs/design/usage-telemetry.md
git commit -m "docs(telemetry): add opt-in usage telemetry design for open source

Anonymous, opt-in telemetry for understanding cycle patterns, bottleneck
phases, and project shapes. Fire-and-forget, no PII, transparent collection.
Adapted from gstack's telemetry system. Implementation deferred to post-V1."
```

---

### Task 11: Safety Hooks Design for Open Source

**Files:**
- Create: `docs/design/safety-hooks.md`

**Context:**
gstack implements safety hook skills that execute before/after certain tool calls — preventing destructive operations, enforcing guardrails, and adding telemetry. Rouge's phase prompts have inline guardrails (e.g., "never deploy to production," "never delete projects"), but these are prompt-level instructions that could be ignored. Safety hooks are infrastructure-level enforcement.

**Step 1: Write the safety hooks design document**

Create `docs/design/safety-hooks.md`:

```markdown
# Safety Hooks Design (Open Source)

> Adapted from gstack's safety hook system. Implementation priority: before open source launch.

## Problem

Rouge's guardrails are currently prompt-level instructions ("never deploy to production," "never delete projects," "Stripe test mode only"). These work for a controlled single-user system but are insufficient for open source:

1. **Prompt instructions can be overridden** by context window pressure or conflicting instructions
2. **No audit trail** of which guardrails were active during a cycle
3. **No user customization** — everyone gets the same guardrails regardless of their deployment setup

## Design: Claude Code Hooks

Claude Code supports [hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) — shell commands that execute before/after tool calls. These are infrastructure-level, not prompt-level. They run regardless of what the model decides.

### Required Hooks (Always Active)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "command": "rouge-safety-check pre-bash \"$TOOL_INPUT\""
      },
      {
        "matcher": "Write",
        "command": "rouge-safety-check pre-write \"$TOOL_INPUT\""
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash",
        "command": "rouge-safety-check post-bash \"$TOOL_OUTPUT\""
      }
    ]
  }
}
```

### `rouge-safety-check` CLI (bash script)

**Pre-Bash checks:**
- Block `rm -rf /` and variants (path traversal outside project)
- Block `git push --force` to production branches
- Block `wrangler deploy` without `--env staging` (production deploy guard)
- Block `stripe` commands without `--test-mode` or test API keys
- Block `supabase` commands that drop/delete databases
- Log the command to `~/.rouge/audit-log.jsonl`

**Pre-Write checks:**
- Block writes to files outside the project directory
- Block writes to `.env` files (credentials must be set manually)
- Block writes to `~/.rouge/telemetry-consent` (user sets this manually)

**Post-Bash checks:**
- Log exit code and (truncated) output to audit log
- Detect error patterns that indicate credential issues → flag for human

### User-Customizable Hooks

Users can add project-specific hooks in `rouge.config.json`:

```json
{
  "safety": {
    "blocked_commands": ["docker rm", "kubectl delete"],
    "allowed_deploy_targets": ["staging", "preview"],
    "custom_pre_hooks": ["./my-safety-check.sh"]
  }
}
```

### Audit Log

Every hook invocation is logged to `~/.rouge/audit-log.jsonl`:

```json
{
  "timestamp": "<ISO 8601>",
  "hook": "pre-bash",
  "project": "<project name>",
  "cycle": 0,
  "phase": "building",
  "command_summary": "wrangler deploy --env staging",
  "verdict": "ALLOW | BLOCK",
  "reason": "<why blocked, if blocked>"
}
```

## gstack Reference

gstack's implementation: `projects/gstack/.claude/skills/safety-hooks/SKILL.md.tmpl`, `lib/safety.ts` (check logic).
Key patterns: matcher-based routing, pre/post separation, audit logging, graceful degradation (if hook script is missing, warn but don't block).
```

**Step 2: Commit**

```bash
git add docs/design/safety-hooks.md
git commit -m "docs(safety): add safety hooks design for open source

Infrastructure-level guardrails using Claude Code hooks. Blocks production
deploys, credential writes, and destructive operations regardless of prompt.
User-customizable via rouge.config.json. Audit log for all hook invocations.
Adapted from gstack's safety hook system. Must implement before open source launch."
```

---

### Task 12: Pin WorktreeManager as Scale Architecture Reference

**Files:**
- Modify: `docs/plans/2026-03-24-scale-architecture-design.md` (add gstack reference)

**Context:**
The scale architecture design doc already proposes worktree-based parallel module builds. gstack has a battle-tested WorktreeManager with edge cases solved (SHA-256 dedup, gitignored artifact copying, cleanup). Pin it as the reference implementation.

**Step 1: Read the current scale architecture doc's parallelism section**

Read `docs/plans/2026-03-24-scale-architecture-design.md` to find the worktree parallelism section.

**Step 2: Add reference implementation section**

In the parallelism section (or "What NOT to build now"), add:

```markdown
### Reference Implementation: gstack WorktreeManager

gstack (garrytan/gstack) has a battle-tested worktree manager at `lib/worktree.ts` that solves the non-obvious edge cases:

- **SHA-256 dedup:** Prevents duplicate work when the same changes are attempted in parallel
- **Gitignored artifact copying:** Auto-copies `.agents/`, `browse/dist/`, and other gitignored but necessary artifacts between worktrees
- **Original SHA tracking:** Detects when a worktree's base has drifted from the target branch
- **Cleanup:** Automatic worktree removal after successful merge

When implementing Rouge's parallel module builds, adapt this implementation rather than building from scratch. The dedup and artifact-copying patterns are the parts most likely to be missed in a greenfield implementation.

**Local reference:** `/Users/gregario/Projects/ClaudeCode/AI-Factory/projects/gstack/lib/worktree.ts`
**Upstream:** `github.com/garrytan/gstack` at commit 6156122 or later
```

**Step 3: Commit**

```bash
git add docs/plans/2026-03-24-scale-architecture-design.md
git commit -m "docs(scale): pin gstack WorktreeManager as reference implementation

Points to garrytan/gstack lib/worktree.ts for worktree parallelism.
Key patterns: SHA-256 dedup, gitignored artifact copying, drift detection.
Adapt when implementing Rouge's parallel module builds."
```

---

### Task 13: Soft Dependencies Framework Design + Natural Language Routing Note

**Files:**
- Create: `docs/design/soft-dependencies-and-routing.md`

**Context:**
Two gstack patterns bundled into one design doc because they're both post-V1 and both about phase/skill composition:

1. **Soft dependencies (BENEFITS_FROM):** Skills can optionally consult neighboring skills without explicit orchestration. Non-blocking.
2. **Natural language skill routing:** Users invoke capabilities by intent, not by memorizing phase names.

**Step 1: Write the design document**

Create `docs/design/soft-dependencies-and-routing.md`:

```markdown
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

- Soft dependencies: `BENEFITS_FROM` in skill YAML headers, `gen-skill-docs.ts` (resolution logic)
- Natural language routing: skill metadata `trigger_phrases` + Codex `openai_short_description`
```

**Step 2: Commit**

```bash
git add docs/design/soft-dependencies-and-routing.md
git commit -m "docs(design): add soft dependencies and natural language routing

Soft deps (BENEFITS_FROM): phases optionally consult neighbors for better
output without requiring it. NL routing: intent-based Slack command mapping
for open source users. Both deferred to post-V1. Adapted from gstack."
```

---

## Execution Summary

| Wave | Tasks | Type | Effort |
|------|-------|------|--------|
| Wave 1 | 1-4 | Prompt edits | ~30 min each |
| Wave 2 | 5-8 | Structural prompt changes | ~45-60 min each |
| Wave 2 | 9 | Design doc (Maintain) | ~20 min |
| Wave 3 | 10-11 | Design docs (open source) | ~20 min each |
| Wave 3 | 12 | Reference pin | ~10 min |
| Wave 3 | 13 | Design doc (post-V1) | ~20 min |

**Total estimated commits:** 13

**Dependencies:** Tasks 1-4 are independent. Task 5 should precede Task 6 (tier system informs dual-voice dispatch). Tasks 7-13 are independent of each other.

**Parallelization:** Tasks 1+2 can run in parallel (different files). Tasks 3+4 can run in parallel. Tasks 9+10+11+12+13 can all run in parallel (all create new files).
