# Task 0a.1 — Full Skill Audit Results

**Date:** 2026-03-18
**Scope:** 44 skills across 4 ecosystems + 2 PR skills
**Purpose:** Classify every skill for Rouge autonomous compatibility

## Unified Audit Table

### Factory Skills (13 skills + 6 partials)

| # | Skill | Classification | Timing | Key Change |
|---|-------|---------------|--------|-----------|
| F1 | factory-overview | **not-needed** | — | Human dashboard. Rouge uses state.json |
| F2 | factory-retrospective | **not-needed** | — | Human reflection. Rouge has continuous evaluation |
| F3 | marketing-copy | **extend** | seed-once | Remove ask gates, auto-pull from vision doc |
| F4 | openspec-apply-change | **dependency-only** | — | Human implementation skill. Rouge uses Superpowers |
| F5 | openspec-archive-change | **extend** | every-loop | Auto-archive completed changes, log warnings |
| F6 | openspec-explore | **dependency-only** | — | Fundamentally interactive thinking partner |
| F7 | openspec-propose | **rewrite** | seed-once | Deep rewrite per 0a.2a/0a.2b (depth + autonomous) |
| F8 | qa | **extend** | every-loop | Add regression tests, test bootstrap, diff-scope |
| F9 | competition-review | **extend** | seed-once | Remove ask gates, auto-detect project type |
| F10 | structural-review | **extend** | every-loop | Add fix-first heuristic, auto-decide on CRITICALs |
| F11 | mcp-qa | **dependency-only** | — | BACKLOG: needs separate loop design |
| F12 | ship | **extend** | every-loop | Add coverage audit, design review lite, dashboard |
| F13 | product-taste | **rewrite** | seed-once | Multi-invocation, reads vision doc, auto-modes |

| Partial | Classification | Key Change |
|---------|---------------|-----------|
| preamble.md | **extend** | Replace Socrates voice with autonomous agent identity, add cycle_context awareness |
| contributor-mode.md | **extend** | Route self-ratings to cycle_context.json |
| ask-format.md | **rewrite** | Replace AskUserQuestion with autonomous decision-logging to cycle_context.json |
| health-scoring.md | **keep-as-is** | Pure math, no interactivity |
| artifact-save.md | **keep-as-is** | Fully autonomous already |
| pipeline-handoff.md | **rewrite** | Write next-phase to state.json instead of suggesting to user |

### Superpowers Skills (14 skills + 2 PRs)

| # | Skill | Classification | Timing | Key Change |
|---|-------|---------------|--------|-----------|
| S1 | brainstorming | **rewrite** | seed-once | Add depth mode, remove YAGNI pressure, remove all AskUserQuestion |
| S2 | dispatching-parallel-agents | **keep-as-is** | every-loop | Already non-interactive |
| S3 | executing-plans | **extend** | every-loop | Log concerns to cycle_context, structured escalation |
| S4 | finishing-a-development-branch | **extend** | every-loop | Deterministic: always commit+push+PR, no menu |
| S5 | receiving-code-review | **extend** | every-loop | Log disagreements, escalation state for architectural |
| S6 | requesting-code-review | **extend** | every-loop | Remove human pushback path, autonomous fix loop |
| S7 | subagent-driven-development | **extend** | every-loop | Populate NEEDS_CONTEXT from cycle_context, BLOCKED → state transition |
| S8 | systematic-debugging | **keep-as-is** | every-loop | Pure methodology, minimal change |
| S9 | test-driven-development | **keep-as-is** | every-loop | Pure methodology, zero interactive elements |
| S10 | using-git-worktrees | **extend** | every-loop | Deterministic: always .worktrees/, abort on test fail |
| S11 | using-superpowers | **dependency-only** | — | Meta-skill for human skill discovery |
| S12 | verification-before-completion | **keep-as-is** | every-loop + final-gate | Pure methodology, zero interactive elements |
| S13 | writing-plans | **extend** | seed-once | Auto SDD, abort after 3 review iterations |
| S14 | writing-skills | **not-needed** | — | Skill authoring is human-session factory work |
| P1 | PR #564: ai-code-audit | **adopt-and-adapt** | every-loop | Structure output as JSON, integrate as hard gate |
| P2 | PR #560: security-review | **adopt-and-adapt** | every-loop | Structure output as JSON, integrate with verification |

### GStack Skills (14 skills)

| # | Skill | Classification | Timing | Key Change |
|---|-------|---------------|--------|-----------|
| G1 | plan-ceo-review | **extend** | seed-once | Mode from parameter, strip preamble, log decisions |
| G2 | plan-eng-review | **extend** | seed-once | Auto-recommend, test plan artifact to cycle_context |
| G3 | plan-design-review | **extend** | seed-once (web) | Auto-apply recommendations, rate-then-fix-to-10 |
| G4 | review | **extend** | every-loop | AUTO-FIX silent, ASK auto-apply recommendation |
| G5 | ship (gstack) | **rewrite** | final-gate | Full autonomous: auto-commit, auto-push, auto-PR |
| G6 | browse | **keep-as-is** | every-loop (web) | Already non-interactive CLI binary |
| G7 | qa (gstack) | **extend** | every-loop (web) | Remove auth prompts, auto Standard tier, log scores |
| G8 | qa-only | **dependency-only** | — | Rouge always wants fix+verify |
| G9 | setup-browser-cookies | **not-needed** | — | Requires human for Keychain dialogs |
| G10 | retro (gstack) | **extend** | final-gate | Output JSON metrics, strip team awareness |
| G11 | document-release | **extend** | final-gate | Auto-apply factual, skip subjective, log to context |
| G12 | gstack-upgrade | **not-needed** | — | GStack self-upgrade, not Rouge's concern |
| G13 | design-consultation | **not-needed** | — | Fundamentally interactive, needs human taste input |
| G14 | design-review | **extend** | every-loop (web) | Auto-apply fixes, keep 80-item checklist + AI slop |

## Summary Statistics

| Classification | Factory | Superpowers | GStack | PRs | **Total** |
|---|---|---|---|---|---|
| **keep-as-is** | 0 (+2 partials) | 4 | 1 | 0 | **5** (+2 partials) |
| **extend** | 6 (+2 partials) | 7 | 9 | 0 | **22** (+2 partials) |
| **rewrite** | 2 (+2 partials) | 1 | 1 | 0 | **4** (+2 partials) |
| **adopt-and-adapt** | 0 | 0 | 0 | 2 | **2** |
| **dependency-only** | 3 | 1 | 1 | 0 | **5** |
| **not-needed** | 2 | 1 | 3 | 0 | **6** |
| **Total** | 13 (+6) | 14 | 14 | 2 | **44** (+6 partials) |

## By Timing Category

| Timing | Skills |
|---|---|
| **seed-once** (8) | openspec-propose, product-taste, brainstorming, writing-plans, marketing-copy, competition-review, plan-ceo-review, plan-eng-review, plan-design-review (web) |
| **every-loop** (19) | qa, structural-review, ship (factory), openspec-archive, dispatching-parallel-agents, executing-plans, finishing-a-development-branch, receiving-code-review, requesting-code-review, subagent-driven-development, systematic-debugging, test-driven-development, using-git-worktrees, verification-before-completion, review, browse, qa (gstack, web), design-review (web), ai-code-audit, security-review |
| **final-gate** (3) | ship (gstack), retro, document-release |
| **dependency-only** (5) | openspec-apply-change, openspec-explore, mcp-qa, using-superpowers, qa-only |
| **not-needed** (6) | factory-overview, factory-retrospective, writing-skills, setup-browser-cookies, gstack-upgrade, design-consultation |

## Still to Create from Scratch (from tasks.md)

These don't exist in any ecosystem — Rouge-native skills:

| Skill | Timing | Task |
|---|---|---|
| PO Review | every-loop | 0a.7 |
| Seeding Swarm orchestrator | seed-once | 0a.8 |
| Runner Loop | every-loop | 0a.9 |
| Vision Check | every-loop | 0a.10 |
| Evaluation Orchestrator | every-loop | 0a.11 |
| a11y-review | every-loop | 0a.16 |
| legal-scaffold | seed-once | 0a.17 |
| privacy-review | seed-once | 0a.18 |
| marketing-landing-page | seed-once | 0a.19 |
| final-validation-gate | final-gate | 0a.26 |

## Key Insight: The Dominant Pattern

**AskUserQuestion is the main blocker.** The single most common change across all 22 "extend" skills is: replace AskUserQuestion / human escalation with cycle_context.json logging and deterministic state transitions.

This should be implemented as a shared partial (`partials/autonomous-mode.md`) defining:
- How to log decisions to cycle_context.json (format, fields)
- How to handle BLOCKED (state transition, not human escalation)
- How to handle ambiguity (best judgment + log rationale, not ask)
- How to handle 3+ failures (abort phase, not "discuss with human partner")

## Overlap Resolution

Some skills exist in multiple ecosystems. Rouge should use ONE source for each:

| Capability | Factory | GStack | Superpowers | **Rouge uses** |
|---|---|---|---|---|
| QA | qa (factory) | qa (gstack) | — | **GStack qa** (more mature, fix loop, diff-aware, health scoring) |
| Ship | ship (factory) | ship (gstack) | — | **GStack ship** (coverage audit, review dashboard, bisectable commits) |
| Code review | structural-review | review (gstack) | requesting/receiving-code-review | **Merge**: GStack review (fix-first) + superpowers code review (subagent dispatch) + factory structural review (trust boundaries) |
| Design review | Design Mode (CLAUDE.md) | plan-design-review + design-review | — | **GStack design-review** (80-item checklist, AI slop) + design scoring from plan-design-review |
| Retro | factory-retrospective | retro (gstack) | — | **GStack retro** (more metrics, JSON snapshots, trend tracking) |
