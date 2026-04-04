# The Rouge V3 — Product Review (CEO Mode)

**Date:** 2026-04-04
**Reviewer:** Socrates (Claude Opus 4.6, 1M context)
**Mode:** Selective Expansion
**Input:** Engineering Audit (Phase 1), overnight failure analysis, competitor synthesis, user strategic context

---

## Product Identity

**What The Rouge IS:** A quality-gated autonomous product factory. It doesn't just write code — it evaluates code through 5 lenses (test integrity, code review, product walk, QA assessment, PO review), classifies quality gaps by root cause, and iterates until convergence.

**What it is NOT:**
- Not a code assistant (like Cursor/Copilot) — it runs headless, no human during builds
- Not a deployment pipeline (like CI/CD) — it makes product decisions, not just build/test/deploy
- Not an agent framework (like LangGraph) — it's an opinionated factory built on Claude

**The moat:** The 5-lens evaluation pipeline. Other systems generate code and maybe run tests. Rouge generates, deploys, browses in a real browser, evaluates against acceptance criteria, and decides whether to iterate, promote, or escalate. Quality-as-loop-primitive is the unique insight.

---

## Overnight Run Case Study

The OpenFleet V2 overnight run (2026-04-03 20:00 — 2026-04-04 08:00) is the definitive case study:

**What Rouge delivered:**
- 659 tests passing
- Auth bypass caught and fixed (security)
- XSS vulnerability caught and fixed (security)
- Responsive layouts, a11y improvements, loading states — all correct
- Vehicle edit, photo display, error toasts — legitimate features built

**What Rouge wasted:**
- 8 of 12 hours on phantom work (zero-delta stories, re-evaluation cycles, regressions)
- Vehicle-registry "promoted" then regressed 3 times
- Same 12 cross-milestone stories executed 3 times each
- Mega-merge of 12 branches caused deploy crash

**The insight:** The builder is a skilled engineer. The orchestrator is a confused project manager who assigns the same ticket to three teams, undoes completed work, and doesn't notice when nothing is being accomplished.

---

## Product Line Assessment

### Rouge Spec (seeding swarm) — VIABLE as standalone

The 7-discipline swarm is product-agnostic and independently valuable. People would use this without the build loop — just to produce better specs. Foundation-at-spec-time (accepted) strengthens this by making Spec resolve infrastructure decisions too.

Standalone value: spec generation, competition analysis, taste gating, design synthesis, legal review, marketing copy. This is a complete product definition pipeline.

### Rouge Build (the loop) — CORE PRODUCT, V3 fixes this

The autonomous build-evaluate-iterate loop is the primary product. V3 addresses the orchestration failures that prevent unattended operation. Open-sourcing is the right call — community can contribute prompts, evaluation lenses, and integration patterns.

Rouge Story (#79) is a completion step within Rouge Build — the final phase generates a narrative of how the product was built from journey.json, factory_decisions, confidence_history, escalations, git log, and screenshots. Useful for Substack articles, portfolio pieces, marketing.

### Future product line (NOT in V3 scope)

Three additional products are envisioned but deferred beyond V3:

- **Rouge Grow** — feature expansion loop for shipped products. Takes a live product + feature request, runs the build-evaluate loop to add capabilities. Builds on Rouge Build's foundation.
- **Rouge Maintain** — autonomous production upkeep. Dependency updates, framework upgrades, SBOM management, security patching, monitoring response. Closed source.
- **Rouge Embed** — reverse-engineer existing products. Takes a live product URL, produces specs and architecture docs. Enables Rouge Build to extend products it didn't originally build.

These require a stable, working Rouge Build (V3) as their foundation. They are tracked in GitHub issues (#33, #34, #18) but explicitly out of scope for V3.

---

## Factory Model Assessment

**The Rouge is a product factory.** The code generation is the means, not the end. The distinguishing feature is the evaluation loop.

The factory model's four roles are sound:
1. **Spec** (product manager) defines WHAT
2. **Builder** (engineer) implements HOW
3. **Evaluator** (QA + design + PO) judges WHETHER
4. **Analyzer** (tech lead) decides WHAT NEXT

**Factory gaps addressed by V3 scope:**

| Factory Capability | Status | V3 Fix |
|---|---|---|
| Institutional memory | Missing — sessions are stateless | Project learnings (accepted) |
| Supply chain | Missing — no dependency management | Linked projects (accepted) |
| Process improvement | Missing — can't improve itself | Self-improvement (accepted) |
| Cost accounting | Missing — no cost visibility | Cost tracking (baseline) |

---

## Rewrite vs Refactor Decision

**Recommendation: Hybrid.** Rewrite the prompts and state model. Refactor the launcher. Keep building and evaluation logic.

### Rewrite (clean)
- All 17 loop prompts — with unified data contract, no contradictions
- State management model — checkpoint-based, not mutable JSON
- Branch strategy — single milestone branch, incremental commits

### Refactor (incremental)
- Launcher (`rouge-loop.js`) — add milestone lock, spin detection, cost tracking
- Deploy pipeline — add retry, blocking, notifications
- Notification system — wire up screenshot capture, deploy failure alerts

### Keep as-is
- Building capability (`01-building.md` core logic, subagent patterns)
- Evaluation pipeline (5-lens structure, sub-phase architecture)
- Seeding swarm (8 prompts, product-agnostic)
- Rate limiting, watchdog, snapshot system
- Safety hooks

### Rationale
The overnight failure proved that building and evaluation work. The problems are in orchestration (state management, branch strategy, prompt contradictions) and observability (cost tracking, spin detection). A full rewrite would risk losing the working parts. A pure refactor can't fix the prompt contradictions or branch strategy. Hybrid targets the broken parts precisely.

---

## Self-Improvement Architecture

### Safety boundary (non-negotiable)
The loop MUST NOT modify its own running prompts, launcher, or eval criteria. Self-improvement is always: propose → isolated branch → human review → merge.

### Allowlist
Self-improvement CAN modify: `src/prompts/loop/*.md` only.
Self-improvement CANNOT modify: `rouge-loop.js`, `rouge-safety-check.sh`, `rouge.config.json`, `.claude/settings.json`, evaluation criteria weights.

### Process
1. Completion phase generates `prompt_improvement_proposals[]`
2. Proposals become GitHub issues tagged `self-improvement`
3. A separate Rouge Build run on `rouge/self-improve/{issue-id}` branch
4. Test new prompts by running a small project through them
5. Human reviews diff, approves or rejects
6. Never auto-merge self-improvement PRs

---

## Linked Project Dependencies

### Vision
"Fleet Manager would have built Maps Integration first. Maps Integration would build the Simulator first."

### Design sketch
- Project registry: `~/.rouge/registry.json` (project name → repo path, status, depends_on[])
- Dependency resolution at seed time: when seeding Fleet Manager, detect "needs Maps Integration" → seed and build Maps Integration first
- Build order: topological sort of dependency graph
- Shared artifacts: completed sub-project provides integration scaffold to parent project

### Key constraint
Each project is still a separate Rouge Build run with its own state. Linked projects share artifacts (integration patterns, API schemas, deployment URLs) but not state.

---

## Scope Summary

### V3 Baseline (orchestration fixes)
1. Milestone lock after promote
2. Spin detection (zero-delta, time-based stalls)
3. Prompt contradiction audit (state.json writes → launcher-only)
4. Branch strategy change (single milestone branch, incremental commits)
5. Deploy failure blocking
6. Story deduplication
7. Cost tracking and budget caps

### V3 Expansions (accepted)
8. Project learnings file (#87)
9. Foundation-at-spec-time (#76)
10. Per-phase model selection (#82)
11. Self-improvement loop (with strict isolation)
12. Linked project dependencies

### Deferred
- Consensus engine (#81) — build on stable V3
- Containerised phase execution (#84) — bottleneck is prompt quality
- Rouge debugging mode (#85) — nice-to-have
- Data provenance as seeding discipline (#83) — later
- Slack pause-and-resume — later

---

## Dream State Delta

```
CURRENT STATE                    V3 DELIVERS                    12-MONTH IDEAL
─────────────                    ───────────                    ──────────────
Overnight runs fail              Overnight runs work            48-hour builds work
(12hrs, zero progress)           (milestone lock, spin          Self-healing on failures
                                 detection, cost caps)

Prompts contradict               Unified data contract          Prompts improve themselves
each other                       (launcher-only state writes)   (self-improvement loop)

Branch fragmentation             Single milestone branch        Foundation resolved at
causes mega-merges               with incremental commits       spec time, no mid-loop
                                                                surprises

No cost visibility               Per-phase cost tracking        Per-phase model selection
                                 with budget caps               (40-50% savings)

Sessions are stateless           Project learnings file         Learnings compound across
                                 read by all phases             all projects

Single-project only              -                              Linked project deps
                                                                (build prerequisites first)
```

V3 delivers the middle column. The 12-month ideal builds on V3's foundations.
