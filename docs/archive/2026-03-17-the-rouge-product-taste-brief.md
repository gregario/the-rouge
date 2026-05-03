# Product Taste Brief: The Rouge

**Date:** 2026-03-17
**Pipeline stage:** Product Taste (pre-spec)
**Mode:** Expansion
**Verdict:** Approved

## Sharpened Brief

The Rouge is an autonomous product development system that solves the shallow-output problem in AI product factories. Current AI systems (including the AI Factory) produce technically functional but production-unworthy products because nothing holds them to a quality standard between sessions, scope is always minimized to fit one conversation, and no learning accumulates across projects. The Rouge adds three layers: a quality ratchet (runner) that loops autonomously until a production bar is met, an enhanced AI Factory (studio) that builds to full depth and breadth, and an accumulated design intelligence (The Library) that develops measurable taste over time. The inner loop uses external signals — browser QA, Lighthouse, spec-completeness, pairwise reference comparison — to evaluate quality, encoding taste as testable heuristics rather than subjective judgment. The human seeds projects (~30 minutes) and reviews via morning briefings (~20 minutes of feedback). The Library accumulates global standards, domain-specific taste (web, games, artifacts), and a personal taste fingerprint, with feedback tagged as global vs genre-specific. The meta-loop improves the AI Factory itself. Built for a solo founder first; productizable later from learnings. 12-month target: 2-3 production-quality products per week with under 2 hours total human review time.

## Key Decisions

- **Two-loop model:** Inner loop (AI, autonomous) gets to "good" aiming for "great." Outer loop (human feedback) gets from good to great.
- **External oracles, not self-assessment:** Research confirms iteration works only with external feedback signals. The Rouge grounds evaluation in measurable signals (QA, Lighthouse, spec-completeness, pairwise comparison), not LLM self-critique.
- **Taste as measurable heuristics:** Don't attempt subjective aesthetic judgment. Encode taste as objective, testable signals. Simulate taste through measurable heuristics.
- **Spec depth is the gap:** AI shrinks scope to fit sessions. The Rouge removes that constraint — run as many agents as needed to hit production depth and breadth.
- **Solo founder first, productize later:** Same pattern as AI Factory → The Rouge. Build for one user, learn what works, the learnings are the moat.
- **Web products first:** Easiest to evaluate (full browser control, Lighthouse, deployment). Games and artifacts follow.
- **Separate project, peer to AI-Factory:** Private repo for now. AI-Factory stays open source. Kept in sync via PR diffs.
- **The Library has three tiers:** Global standards (seeded high on day one), domain-specific taste (grows per domain), learned judgment (from human feedback, tagged global vs genre-specific).
- **Notification threshold:** System runs autonomously, notifies human when it thinks it's done or when confidence drops ~20%. Prefers one daily check over 15 interruptions.
- **Consensus engine for high-stakes decisions:** Ask questions multiple ways, potentially across multiple LLMs, for pivot decisions and production-readiness assessment.
- **Functional vs non-functional separation:** The Library clearly distinguishes product/design decisions (functional) from engineering constraints (non-functional). Both contribute to quality, evaluated differently.

## Research Inputs

Product taste was informed by industry research on:
- LLM-as-judge reliability (MLLM as UI Judge, 2025): ~93% accuracy on large quality gaps, ~60% on subtle ones
- Iteration effectiveness (Self-Refine 2023, ICLR 2024): Works with external feedback, unreliable with self-critique only
- Autonomous coding benchmarks (SWE-bench Pro): ~23-59% on clean benchmarks, best for scoped tasks
- AI taste development (Patron Fund, Deconstructing Taste 2026): Can learn statistical preferences, cannot make novel aesthetic judgments
- Industry sentiment (Stack Overflow 2025, METR): Trust declining, shift from hype to pragmatism
- Autoresearch (Karpathy): Proof case for autonomous iteration with external feedback signals

## Next Step

Run `/opsx:propose` with this brief as input to generate formal specs, design artifacts, and tasks.
