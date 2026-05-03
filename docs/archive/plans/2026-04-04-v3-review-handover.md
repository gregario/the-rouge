# The Rouge V3 — Review & Planning Handover

> **CRITICAL INSTRUCTION FOR THE RECEIVING SESSION:**
> Do NOT take shallow passes on ANY step. Every analysis must be thorough, evidence-based, and verified against the actual code and logs. Use every skill available (product-taste, structural-review, plan-ceo-review, plan-eng-review, brainstorming) where they add rigour. This is the most important piece of work in the factory. If something would make the analysis better — a deeper read, a second opinion via consensus, a sub-agent to verify — do it. Speed is irrelevant. Quality is everything.

**Date:** 2026-04-04
**Author:** Session that ran 2026-04-03 through 2026-04-04 (longest session to date — ~18 hours of continuous work)
**Purpose:** Complete handover for a new session to conduct a comprehensive review of The Rouge and produce an execution plan for V3.
**Branch:** `v2/granularity-refactor` in The-Rouge repo

---

## What this handover IS

A structured brief for a new session to:
1. Conduct a full engineering and product review of The Rouge V2
2. Determine whether V3 is an incremental refactor or a clean rewrite
3. Produce a detailed execution plan with check-in gates
4. NOT execute the plan — a third session does that

## What this handover is NOT

- An execution plan (that's the output of the NEXT session)
- A summary of fixes to apply (though fixes are documented)
- A partial view — this attempts to be comprehensive

---

## Session Context: What happened 2026-04-03 to 2026-04-04

This session covered an enormous amount of ground. Everything below is context the new session needs.

### 1. Improvement Backlog Feature (designed and implemented)

**Problem:** The evaluation identified non-blocking improvements (missing logout button, user identity, etc.) but they were lost on milestone promotion. The `confidence_adjusted` field wasn't being output because the JSON example didn't include it.

**What was built:**
- Evaluation prompt (02e) now outputs `confidence_adjusted`, `env_limited_impact`, and `improvement_items[]` with scope tags (this-milestone/global/future-milestone) and grounding requirements
- Analyzing prompt (04) routes improvements: this-milestone → deepen (fix in-loop), global → persist to `global_improvements.json`, future → drop. Convergence guardrail prevents infinite polish loops. PROMOTE requires empty this-milestone list.
- Vision-check (06) and final-review (10) read `global_improvements.json`
- State schema documented

**Files changed:** `02e-evaluation.md`, `04-analyzing.md`, `06-vision-check.md`, `10-final-review.md`, `state-schema-v2.md`

**Design doc:** `docs/plans/2026-04-03-excalidraw-diagram-skill-design.md` (note: this is mislabeled, the improvement backlog design is embedded in the commit history — no standalone design doc was created for the improvement backlog itself)

### 2. Launcher Bug Fixes (implemented)

**Rate limit false positives (issue #75, closed):**
- Phase log is append-mode — stale messages from previous runs triggered false positives
- Rate limit check ran before exit code — successful phases got flagged
- Fix: check exit code first, only read NEW log content
- File: `rouge-loop.js`

**Unknown state silent loop (implemented):**
- `STATE_TO_PROMPT[unknownState]` returned undefined → silent infinite no-op loop
- Fix: log error, return failure
- File: `rouge-loop.js`

**Staging deploy fix (manual, twice):**
- `db.ts` missing supabase export — builder keeps overwriting it
- `vehicles.ts` type mismatch — VehicleMarker interface expanded without updating mapper
- Fixed twice during session, builder overwrote it both times

### 3. Overnight Failure (discovered and analysed)

**Full analysis:** `docs/plans/2026-04-04-overnight-failure-analysis.md`

The loop ran 12 hours overnight and ended up where it started. Stories completed with `outcome: pass` and `delta: +0` (did nothing successfully). 14 fix stories generated for a 4-story milestone. Vehicle-registry was "promoted" then regressed to three times.

**5 structural root causes identified:**
1. No milestone lock after promote
2. Branch-per-story creates systemic fragmentation
3. Fix stories inherit cross-milestone baggage
4. No story deduplication
5. No global loop/spin detection

**Issue:** #86 (blocker)

### 4. Process Map & Diagram Tooling (created)

**V2 Process Map:** `docs/design/v2-process-map.md` — comprehensive end-to-end pipeline reference with every phase's inputs, outputs, artifacts, decision points, external tools, and notifications. This is the ground truth for how V2 works.

**Excalidraw Diagram Skill:** `.claude/skills/excalidraw-diagram/SKILL.md` — two-phase skill (generate Python script + review PNG). Design rules at `docs/design/diagram-design-rules.md`. Renderer at `tools/diagrams/`.

**Diagram:** `docs/diagrams/rouge-v2-process-map-gen3.png` — four-panel layout (Rouge Spec → Foundation → Story Building Loop → Final Ship). Generated via `build-rouge-v2-process-map-gen3.py`.

### 5. Competitor Research (completed)

**9 systems evaluated against 10 architectural primitives:**

| System | Category | Research file |
|--------|----------|--------------|
| AgentScope (Alibaba) | Agent platform | `docs/drafts/spike-research/agentscope.md` |
| OpenClaw | Agent framework | `docs/drafts/spike-research/openclaw.md` |
| Auto Research (Karpathy) | Origin point | `docs/drafts/spike-research/auto-research.md` |
| Replit Agent | Code-gen agent | `docs/drafts/spike-research/replit-agent.md` |
| Lovable | Code-gen agent | `docs/drafts/spike-research/lovable.md` |
| Cursor Agent | Code-gen agent | `docs/drafts/spike-research/cursor-agent.md` |
| LangGraph | Orchestration | `docs/drafts/spike-research/langgraph.md` |
| Anthropic Agent SDK | Orchestration | `docs/drafts/spike-research/anthropic-agent-sdk.md` |
| Azure AI Foundry | Enterprise | `docs/drafts/spike-research/azure-ai-foundry.md` |

**Comparison synthesis:** `docs/drafts/spike-research/00-comparison-synthesis.md`
- Comparison matrix (10x10 ratings)
- Steal list (per-primitive best approach + adoption recommendation)
- Prioritised recommendations (Tier 1: adopt now, Tier 2: explore, Tier 3: don't do)

**Key findings:**
- Rouge leads in: Quality Feedback Loop, Task Decomposition, Context Management
- Rouge trails in: State Management, Multi-Agent Coordination, Observability
- Top steals: LangGraph checkpoint-per-phase, OpenClaw cost guardrails, Replit browser verification, Anthropic SDK PreToolUse hooks

### 6. GitHub Issues Filed This Session

| # | Title | Priority | Status |
|---|-------|----------|--------|
| 75 | Rate limit false positives from stale logs | bug | **Closed** (fixed) |
| 76 | Architecture: move foundation to spec-time | architecture | Open |
| 77 | Audit: state.json write contradictions across prompts | **blocker** | Open |
| 78 | Deploy failure not detected | bug | Open |
| 79 | Rouge Story: post-ship narrative | enhancement | Open |
| 80 | Velocity metrics: forecasting dataset | enhancement | Open |
| 81 | Consensus engine for high-stakes decisions | enhancement | Open |
| 82 | Per-phase model selection | enhancement | Open |
| 83 | Data provenance research as seeding discipline | architecture | Open |
| 84 | Containerised phase execution | architecture | Open |
| 85 | Project debugging mode | enhancement | Open |
| 86 | CRITICAL: Loop spinning detection | **blocker** | Open |
| 87 | Project learnings file — shared context | **blocker** | Open |

### 7. Other Research & Context

**Genesis Engine comparison:** `docs/drafts/2026-04-03-genesis-engine-comparison.md` — Godot game builder with in-editor integration, direct scene manipulation. Rouge has better quality loops; Genesis has better tooling integration.

**Ideas backlog updated:** Added EU Card Marketplace (Rouge Build candidate) and research spike (agent architecture comparison).

**OpenFleet V2 velocity data observed:**
- Story build time: ~8-13 min average
- Evaluation cycle: ~25-45 min
- Dashboard-features: 20 stories (3 original + 17 generated), ~5 hours
- Vehicle-registry: 18 stories (3 original + 15 generated), promoted then regressed
- GPS-trips: 4 stories built, never cleanly promoted (overnight spinning)

---

## Key Documents to Read (in order of importance)

The new session MUST read these before starting any analysis:

1. **`docs/plans/2026-04-04-overnight-failure-analysis.md`** — The most important document. Shows exactly how and why the loop fails.

2. **`docs/design/v2-process-map.md`** — Ground truth for how every phase works, what it reads/writes, all decision points.

3. **`docs/drafts/spike-research/00-comparison-synthesis.md`** — Where Rouge stands vs the industry, what to steal.

4. **`docs/design/state-machine-v2-transitions.md`** — The state machine transition map.

5. **`docs/design/state-schema-v2.md`** — The data schema (includes improvement backlog fields added this session).

6. **`src/launcher/rouge-loop.js`** — The launcher. All state transitions, deploy logic, rate limiting. This is where most V3 launcher changes would happen.

7. **All prompt files in `src/prompts/loop/`** — The 16 prompt files that define every phase's behaviour. Issue #77 documents contradictions across these.

8. **`docs/diagrams/rouge-v2-process-map-gen3.png`** — Visual overview of the pipeline.

9. **GitHub issues #75-#87** — The full issue backlog from this session. Run `gh issue list --state all --limit 100` for the complete picture including pre-session issues.

10. **`CLAUDE.md` in The-Rouge repo** — Project-level instructions (if they exist).

---

## Review Phases (for the new session)

The new session should work through these phases sequentially, with check-in gates after each.

### Phase 1: Engineering Audit

**Goal:** Understand the exact current state of the codebase, documentation, and infrastructure. No opinions yet — just facts.

**Steps:**
1. Read all 16 loop prompt files. For each, document: what it reads, what it writes, contradictions with other prompts (ref #77), V1 vestiges.
2. Read `rouge-loop.js` end-to-end. Document: all state transitions, all edge cases, all known bugs.
3. Review all GitHub issues (open AND closed). Categorise: bug, architecture, enhancement, blocker. Note which are symptoms of the same root cause.
4. Review all fixes made in this session on `v2/granularity-refactor` branch. Check for drift — did any fix introduce inconsistency?
5. Check README accuracy against current reality.
6. Check that the process map (`v2-process-map.md`) matches the actual code.
7. Review the Slack integration: `notify-slack.js`, what notifications fire, what's broken (screenshots not sending, thread behaviour, stage names).
8. Review the deploy pipeline: `deploy-to-staging.js`, `provision-infrastructure.js`. Document failure modes.
9. Review the seeding prompts: `src/prompts/seeding/`. Do they still work for arbitrary products, or are they fleet-manager-specific?

**Check-in gate:** Present findings to user. Agree on the severity of each issue before proceeding.

### Phase 2: Product Review

**Goal:** Step back from code and ask: what is The Rouge FOR, and is it achieving that?

**Steps:**
1. Use the `/plan-ceo-review` skill. Rethink the product from first principles.
2. Review the overnight run as a case study: what value did the Rouge actually deliver vs what it wasted?
3. Assess the three-product vision (Rouge Spec, Rouge Build, Rouge Story) — is this still the right framing?
4. Assess the factory model: is the Rouge a product factory, a code generator, a quality assurance system, or something else?
5. Assess the self-improvement angle: can/should the Rouge improve itself? What does that architecture look like?
6. Assess linked projects: should the Rouge manage project dependencies (build Maps Integration → then build Fleet Manager)?

**Check-in gate:** Present product direction to user. Agree on what the Rouge IS before designing V3.

### Phase 3: Architecture Proposal

**Goal:** Based on the engineering audit and product review, propose the V3 architecture.

**Steps:**
1. Use `/plan-eng-review` skill. Lock in the execution plan.
2. Determine: clean rewrite or incremental refactor? The overnight analysis and prompt contradictions (#77) suggest a clean rewrite of prompts may be needed. The launcher may be incrementally fixable.
3. Design the state management model (LangGraph checkpoint-per-phase? SQLite? Keep JSON?).
4. Design the prompt architecture (how many prompts, what boundaries, how to prevent contradictions).
5. Design the safety mechanisms (milestone lock, spin detection, time-based escalation, zero-delta detection, cost tracking).
6. Design the project learnings system (#87).
7. Design the control plane (Slack notifications, debugging mode, human intervention flow).
8. Design foundation-at-spec-time (#76) including linked projects and tool discovery.
9. Design the self-improvement loop (Rouge building Rouge with proper isolation).
10. Address per-phase model selection (#82) and consensus engine (#81).

**Check-in gate:** Present architecture to user. This is the big decision — agree on scope and approach before creating the execution plan.

### Phase 4: Execution Plan

**Goal:** Produce the detailed implementation plan that a THIRD session will execute.

**Steps:**
1. Use the `writing-plans` skill. Bite-sized tasks with exact file paths.
2. Sequence the work: what needs to happen first? (Probably: prompt rewrite → launcher safety mechanisms → control plane → foundation redesign → self-improvement)
3. Define verification criteria for each phase of execution.
4. Estimate effort and identify risks.

**Output:** A plan document that a fresh session can execute with `executing-plans` or `subagent-driven-development`.

---

## Strategic Context (user's thinking, captured during session)

These are the user's stated positions and evolving thoughts, captured verbatim or near-verbatim during discussion:

**On foundation:**
> "Foundation should sit with spec, and then if anything is needed for the stacks, like a new framework or whatever, it gets a Rouge build project to build it for Rouge. When it's done and verified, it gets added to the spec, and then we do another Rouge project."

**On linked projects:**
> "The fleet manager would have built a Maps Integration first. It didn't need one in the end, it used a free one, but a Maps Integration would build the simulator first, because building that would give us the knowledge of the seed data, and then it would build the main app."

**On quality:**
> "Do not take shallow passes. This is the most important piece of work we've done. I'm happy for it to burn a hundred million tokens."

**On V3 scope:**
> "I'd like the plan to determine whether it's a refactor or a completely new, full-on new architectural rework, like we did for the transition between V1 and V2. Because we have a lot of vestigial tails from V1, like conflicting prompt issues, a clean rewrite might be better."

**On Rouge improving Rouge:**
> "I'd like Rouge to be able to fix Rouge, but then we need good git branching logic for that to work, because you're running off its own codebase."

**On the overnight failure:**
> "Why didn't the escalation work? Each session is so stateless, making idiotic mistakes even though we have journeys and histories and all these other logs."

**On project learnings:**
> "Engineers sit in refinement of stories they're not working on because they need to know that they're not going to break other things when they fix things."

**On the control plane:**
> "One thing potentially we should do is not have every story loop report to Slack and just have the milestones report to Slack."

**On data strategy:**
> "How to source data. For instance, if I wanted to make a nutrition app, a place to find open source calorie data."

---

## Memory Files to Check

The AI-Factory memory system has relevant context. Key files:

- `memory/project_rouge_v2_implementation.md` — START HERE for Rouge context
- `memory/project_rouge_v2_design.md` — V2 design process
- `memory/project_rouge_cli_learnings.md` — Fleet manager session findings
- `memory/project_rouge_decomposition_vision.md` — Composable capabilities vision
- `memory/project_rouge_open_questions.md` — Architecture questions
- `memory/feedback_execution_sloppiness.md` — Known pattern: strong architecture, sloppy execution
- `memory/feedback_prisma_cloudflare_edge.md` — Prisma doesn't work on CF Workers (discovered TWICE)
- `memory/feedback_stop_and_verify.md` — Don't keep restarting hoping fixes work

---

## What the OpenFleet Run Proved

**The Rouge's building capability is solid:**
- 659 tests passing
- Auth bypass caught and fixed
- XSS vulnerability caught and fixed
- Responsive layouts, a11y improvements, loading states — all built correctly
- Code quality is high when evaluated

**The Rouge's orchestration is broken:**
- State corruption from prompt contradictions (#77)
- Deploy failures invisible to the loop (#78)
- No spin detection — 12 hours of waste (#86)
- No project learnings — same mistakes repeated across sessions (#87)
- Branch-per-story creates integration debt every milestone
- Foundation decisions not resolved at spec time (#76)
- Staging has no data strategy — evaluation browses empty pages

**The meta-insight:**
The Rouge builds code well but manages itself poorly. The builder (Claude writing code) is excellent. The orchestrator (launcher + prompts managing the loop) is fragile. V3 should focus on orchestration quality, not building quality.

---

## Files Created/Modified This Session

All on `v2/granularity-refactor` branch in The-Rouge repo:

### Prompt changes
- `src/prompts/loop/02e-evaluation.md` — confidence_adjusted + improvement_items
- `src/prompts/loop/04-analyzing.md` — improvement routing, convergence guardrail
- `src/prompts/loop/06-vision-check.md` — reads global_improvements.json
- `src/prompts/loop/10-final-review.md` — reads global_improvements.json

### Launcher changes
- `src/launcher/rouge-loop.js` — rate limit fix, unknown state guard

### Documentation
- `docs/design/v2-process-map.md` — comprehensive pipeline reference
- `docs/design/diagram-design-rules.md` — Excalidraw design rulebook
- `docs/design/state-schema-v2.md` — updated with improvement backlog fields
- `docs/plans/2026-04-03-excalidraw-diagram-skill-design.md`
- `docs/plans/2026-04-03-excalidraw-diagram-skill-implementation.md`
- `docs/plans/2026-04-03-session-handover.md` (earlier handover, superseded by this one)
- `docs/plans/2026-04-04-overnight-failure-analysis.md`
- `docs/plans/2026-04-04-v3-review-handover.md` (this file)

### Tooling
- `.claude/skills/excalidraw-diagram/SKILL.md`
- `tools/diagrams/render_excalidraw.py`, `render_template.html`, `pyproject.toml`
- `docs/diagrams/build-rouge-v2-process-map-gen{1,2,3}.py`
- `docs/diagrams/rouge-v2-process-map-gen{1,2,3}.{excalidraw,png}`

### Research (in AI-Factory, gitignored drafts)
- `docs/drafts/spike-research/*.md` (9 competitor analyses + synthesis)
- `docs/drafts/2026-04-03-genesis-engine-comparison.md`
- `docs/drafts/2026-04-03-agent-architecture-spike.md`
