# The Rouge V3 — Engineering Audit

**Date:** 2026-04-04
**Auditor:** Socrates (Claude Opus 4.6, 1M context)
**Branch:** `v2/granularity-refactor`
**Scope:** All 17 loop prompts, 8 seeding prompts, launcher, deploy pipeline, notifications, 86 GitHub issues, competitor synthesis, overnight failure analysis

---

## Executive Summary

The Rouge V2 builds code well but manages itself poorly. The builder (Claude writing code via prompts) produces high-quality output — 659 tests, caught auth bypass and XSS, responsive layouts, a11y. The orchestrator (launcher + state machine + prompt routing) has 4 blockers and 7 high-severity gaps that caused 12 hours of wasted compute in an overnight run with zero net progress.

V3 must focus on orchestration quality, not building quality.

---

## 1. Prompt Contradictions (Issue #77 Confirmed)

The 17 loop prompts have strong individual design but contradictory cross-prompt behaviour. Each prompt was written or evolved independently; the system-level data flow was never unified.

### C1 — Foundation evaluation routing (BLOCKER)

Foundation evaluation exists as a standalone phase (`00-foundation-evaluating.md`) but the evaluation orchestrator (`02-evaluation-orchestrator.md`) explicitly says "you do NOT evaluate foundation." Two parallel evaluation paths exist with no clear routing contract between them.

**Impact:** Foundation could be evaluated twice, or not at all, depending on how the launcher sequences phases.

### C2 — Dual foundation insertion points (HIGH)

Building can activate the `foundation-cycle` capability and exit with `state = "foundation"`. Separately, analyzing can recommend `insert-foundation` as an action. Two code paths can trigger the same infrastructure work with no coordination mechanism.

**Impact:** Risk of double-insertion or conflicting infrastructure decisions if both paths trigger in the same project lifecycle.

### C3 — Verdict vs confidence disagreement (HIGH)

PO verdict is categorical (PRODUCTION_READY / NEEDS_IMPROVEMENT / NOT_READY). Confidence is continuous (0.0-1.0), with both raw and adjusted variants. Analyzing uses confidence thresholds (promote if 0.9+, deepen if 0.7-0.9) while ship-promote checks the categorical verdict. These two signals can disagree — a milestone could be PRODUCTION_READY with confidence 0.85, or NEEDS_IMPROVEMENT with confidence 0.92.

**Impact:** Ambiguous routing at the most critical decision point in the loop (promote vs deepen).

### C4 — Three context assembly patterns (MEDIUM)

Building reads `story_context.json`. QA-fixing reads `fix_story_context.json`. Foundation reads `cycle_context.json` directly. Three different patterns for assembling phase context from the same underlying data model.

**Impact:** Maintenance burden and confusion about which context file is authoritative.

### C5 — Inconsistent subagent dispatch rules (MEDIUM)

Foundation-building says subagents must get "full decomposition_strategy." Building says subagents get "focused context slice." Same pattern name, different context depth.

**Impact:** Subagent quality varies unpredictably between foundation and feature work.

### C6 — factory_decisions[] not append-safe (HIGH)

`factory_decisions[]` is written by building, read by analyzing, and transformed by change-spec-generation. No prompt shows a read-merge-write pattern. Each write risks overwriting previous decisions.

**Impact:** Accumulated project decisions could be silently lost on re-invocation, causing the loop to re-make decisions it already made.

### C7 — "Morning briefing" referenced but undefined (LOW)

Multiple prompts log items "for morning briefing" (document-release, vision-check) but no prompt or launcher code defines what the morning briefing is, when it runs, or who reviews it.

**Impact:** Aspirational feature leaked into prompts. No functional impact, but adds noise to prompt instructions.

---

## 2. Launcher Gaps

The launcher (`src/launcher/rouge-loop.js`) is the strongest piece of V2 infrastructure. Snapshot-before-every-phase, FIX-6 state restoration, 3-signal watchdog, global rate limit coordination, dependency graph enforcement, and circuit breaker at 3 failures are all well-implemented.

### L1 — No milestone lock after promote (BLOCKER)

When a milestone reaches PRODUCTION_READY and is promoted, nothing prevents regression. The overnight run saw vehicle-registry promoted, then GPS-trips failed, then on restart the launcher re-evaluated and routed back to vehicle-registry story-building. The same milestone was "promoted" three times.

**Root cause of:** Issue #86 (12-hour spin), overnight failure phases D, F, G.

### L2 — Deploy failures are non-blocking (HIGH)

`deploy-to-staging.js` returns `null` on failure. The launcher logs a warning but proceeds to milestone-check with stale/broken staging. Milestone-check then evaluates against pages that don't reflect current code.

**Root cause of:** Issue #78. Directly caused evaluation of stale state in the overnight run.

### L3 — No spin detection (BLOCKER)

Zero-delta stories (outcome: pass, delta: +0) are counted as successful. The loop has no concept of "did nothing successfully" being a problem. Combined with cross-milestone story inheritance (#86), this created hours of phantom work.

**Evidence:** 12 cross-milestone stories executed 3 times each overnight, all completing with REUSE/+0, consuming 30-50 minutes of Opus compute per cycle with zero value.

### L4 — No cost tracking (HIGH)

No token usage tracking, no budget caps, no per-phase cost estimates. The overnight run consumed ~12 hours of Opus-tier API calls with no awareness. Competitor synthesis identified cost tracking as a Tier 1 adoption (clear win, small effort).

### L5 — SIGINT recovery is stateless (MEDIUM)

When the user sent SIGINT at 23:30 and restarted at 23:38, the state recovery logic failed to preserve context. Instead of resuming GPS-trips work, the loop re-evaluated from scratch and regressed to vehicle-registry.

**Related to:** L1 (milestone lock would have prevented the regression even with stateless recovery).

### L6 — No story deduplication (HIGH)

The same story names appear in multiple milestone-fix queues and execute each time without deduplication. Stories `openfleet-loop-1-*` (from dashboard-features milestone) were executed in GPS-trips and vehicle-registry contexts, always completing with REUSE.

### L7 — Branch-per-story without incremental merge (BLOCKER)

Every story creates its own branch. Milestone-check evaluates whatever branch is checked out (only that story's code). At promotion, a mega-merge combines all branches — the overnight run's mega-merge resolved ~60 conflicts and fixed 22 post-merge test failures in 44 minutes, then crashed on deploy.

**Systemic:** Branch-per-story is the root architectural cause of fragmentation. Fix stories for branch fragmentation are themselves built on their own branches, recreating the problem they solve.

---

## 3. Deploy & Notification Gaps

### Deploy pipeline (deploy-to-staging.js)

**Working well:**
- Build → deploy → health check → auto-rollback pattern
- Supabase destructive migration detection (DROP TABLE, TRUNCATE, etc.)
- Version tracking for rollback

**Broken:**
- **Silent failures.** Deploy failures return `null` with no Slack notification, no escalation. The caller (launcher) logs a warning but continues. This means milestone-check evaluates stale staging. (#78)
- **No retry logic.** Single attempt, then silent failure.
- **Destructive migrations block but don't alert.** The `migration_blocked` flag is stored in context but no notification fires.

### Notification system (notify-slack.js)

**Working well:**
- 7 notification types with rich Block Kit formatting
- Emoji mapping for visual context
- Escalation notifications include health score, confidence, failure context

**Broken:**
- **Screenshot notifications exist but are never triggered.** The `screenshots` notification type is implemented, but `capture-screenshots.js` is never called from the launcher.
- **Deploy failure notifications don't exist.** Only phase-level escalations fire (after 3 retries).
- **Silent degradation if webhook missing.** No error logged when `ROUGE_SLACK_WEBHOOK` is absent.

### Infrastructure provisioning (provision-infrastructure.js)

**Working well:**
- One-time setup: Cloudflare Workers, Supabase, PostHog, Sentry
- Supabase slot rotation (max 2 active, pauses idle projects)

**Fragile:**
- Supabase slot detection uses substring name matching — could pause wrong project
- macOS-only keychain access (`security` command), env var fallback for Linux
- Sentry DSN extraction is regex-based (fragile)

---

## 4. Seeding Prompt Audit

All 8 seeding prompts are **product-agnostic** — no fleet-manager-specific leakage detected. The 7-discipline swarm architecture (brainstorming, competition, taste, spec, design, legal, marketing) with non-linear execution and convergence detection is well-designed.

**Issues (non-blocking):**
- Competition discipline references `$B browse` tool without defining it
- Spec discipline depends on `openspec` CLI with no fallback path
- Brainstorming outputs prose narrative; downstream prompts (spec, design) need structured data — format mismatch creates parsing fragility
- Loop-back decision logic between disciplines is under-specified ("did this output contradict previous?" — who decides?)
- Legal discipline's multi-jurisdiction precedence is unclear (fintech + education + health product?)

**Assessment:** Seeding works. These are quality-of-life improvements, not architectural issues.

---

## 5. GitHub Issue Analysis

### By the numbers
- **86 total issues** (#2 through #87)
- **42 open**, 44 closed
- **3 blockers** (#77, #86, #87)
- **13 architecture issues** open
- **9 enhancement/backlog** open
- **3 infrastructure** open

### Blockers

| # | Title | Root Cause |
|---|-------|-----------|
| #86 | Loop spinning — 12 hours of waste | No milestone lock, no spin detection, branch fragmentation |
| #87 | Project learnings file missing | No cross-session knowledge persistence |
| #77 | State.json write contradictions | Prompts evolved independently, no unified data model |

### Pattern: Symptoms of the same disease

Many closed issues were launcher bugs that are symptoms of the same underlying structural problem — the state machine has holes that the launcher papers over reactively:

- #57 (watchdog can't detect silent activity) — patched with file activity monitoring
- #59 (rate limit 24h sleep) — patched with timezone-aware parsing
- #62 (escalation to Slack broken) — patched with notification wiring
- #64 (progress events report stale numbers) — patched with fresh reads
- #65 (duplicate loop processes) — patched with process detection
- #75 (rate limit false positives) — patched with exit-code-first checking

Each fix is correct in isolation, but the accumulation of patches indicates the launcher's architecture wasn't designed for the complexity it now handles.

### Strategic issues worth preserving for V3

| # | Title | V3 Relevance |
|---|-------|-------------|
| #76 | Move foundation to spec-time | Directly addresses foundation insertion confusion (C2) |
| #66 | AI rigour gap: shallow passes | Quality of autonomous work; needs prompt-level attention |
| #61 | Sandbox architecture | Security isolation for build loop |
| #60 | Loop must not modify itself | Self-improvement safety boundary |
| #82 | Per-phase model selection | 40-50% cost reduction opportunity |
| #81 | Consensus engine | High-stakes decision quality |
| #87 | Project learnings | Cross-session knowledge retention |

---

## 6. Recent Session Drift Check

22 commits on `v2/granularity-refactor` from the 2026-04-03/04 session. Reviewed for internal consistency.

**Improvement backlog feature** (commits `a8a0692` through `9eff524`): Clean implementation. Evaluation outputs `improvement_items[]` with scope tags, analyzing routes by scope (this-milestone/global/future), vision-check and final-review read `global_improvements.json`. Convergence guardrail prevents infinite polish loops (2+ deepen cycles with same items and no confidence change → force promote).

**Launcher fixes** (`75d6396`, `a7dfd8e`): Correct. Rate limit check now runs after exit code check. Unknown state halts with error instead of silently looping.

**No drift detected.** The session's fixes are internally consistent.

---

## 7. README vs Reality

| Claim | Reality |
|-------|---------|
| Quick start: `rouge init && rouge seed && rouge build` | Works |
| Economics: Small $5-20/2-4hrs, Medium $50-150/1-3 days | Overnight run was 12hrs for "medium" with zero net progress. Economics are aspirational, not measured |
| Safety: validation layer, blocked commands, deploy restrictions | Deploy restrictions work (staging-only). Safety hooks configured in `.claude/settings.json` but `rouge-safety-check.sh` robustness is untested |
| What's next: Rouge Grow, Rouge Maintain, Rouge Embed | None exist |

---

## 8. Process Map Accuracy

The `docs/design/v2-process-map.md` is **accurate** — matches launcher code and prompt files. Created in the same session, so no drift. This document is the best single reference for understanding V2.

The `docs/design/state-machine-v2-transitions.md` also matches. Key invariants are correctly documented:
1. Foundation eval always runs (no seeding bypass)
2. Evaluation orchestrator never routes directly to shipping
3. Final review only runs after all milestones
4. Circuit breaker fires at 3 consecutive failures
5. Deploy happens before milestone-check, not after every story

---

## 9. Competitor Context

From the 9-system comparison (docs/drafts/spike-research/00-comparison-synthesis.md):

**Rouge leads in:** Task Decomposition (3/3), Quality Feedback Loop (3/3), Context Management (3/3)
**Rouge trails in:** State Management (2/3), Error Recovery (2/3), Observability (2/3), Multi-Agent Coordination (1/3)

**Tier 1 steals (adopt now):**
1. Cost tracking & budget caps (OpenClaw ClaWatch pattern)
2. Pre-compaction memory flush (OpenClaw pattern)
3. PreToolUse hooks for dangerous operation blocking (Anthropic SDK)

**Tier 2 steals (explore):**
4. Checkpoint-per-phase state management (LangGraph)
5. Stall detection with rollback-and-retry (Replit)
6. Browser verification in autonomous loop (Replit)
7. Dual ledger for task tracking (Azure Foundry Magentic-One)
8. Pause-and-resume via Slack (LangGraph + Anthropic SDK)

---

## 10. Severity Summary

| Category | Blockers | High | Medium | Low |
|----------|----------|------|--------|-----|
| Prompt contradictions | 1 (C1) | 3 (C2, C3, C6) | 2 (C4, C5) | 1 (C7) |
| Launcher gaps | 2 (L1, L3) | 3 (L2, L4, L6) | 1 (L5) | 0 |
| Branch strategy | 1 (L7) | 0 | 0 | 0 |
| Deploy/notifications | 0 | 1 (silent failures) | 2 (screenshots, provisioning) | 1 (webhook) |
| Seeding | 0 | 0 | 3 (browse, CLI, format) | 2 (loop-back, legal) |
| **Total** | **4** | **7** | **8** | **4** |

---

## Conclusion

The Rouge V2's building capability is production-quality. Its orchestration capability is not. The 4 blockers (milestone lock, spin detection, branch strategy, prompt contradictions) and 7 high-severity issues collectively explain why a 12-hour overnight run produced zero net progress while building individually correct code.

The overnight failure is not a bug — it is the expected outcome of the current architecture under sustained autonomous operation. V3 must address orchestration at the architectural level, not with more patches.
