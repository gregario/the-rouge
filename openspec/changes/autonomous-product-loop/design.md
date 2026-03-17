## Context

The AI Factory is a personal AI product development system that orchestrates specs (OpenSpec), design (Design Mode), and engineering (Superpowers) to build software products. It works well within a single session but has no persistence between sessions — the human is the brain that decides what's shallow, what needs deepening, and what to work on next. This results in shallow output that technically works but doesn't meet production quality standards.

The Rouge adds an autonomous outer loop that removes the human as the between-session bottleneck. It evaluates product quality using external signals, iterates until a production bar is met, accumulates design intelligence across projects, and only involves the human for seeding, feedback, and pivot decisions.

Karpathy's autoresearch system is the inspiration: tight feedback loops, external evaluation metrics, autonomous iteration. The key difference is that autoresearch has a single unambiguous metric (val_bpb) while product quality requires a composite of measurable signals.

**Constraints:**
- Solo founder use case — no multi-tenancy, no web UI needed
- Web products first (SaaS, marketing sites) — full browser control for evaluation
- AI Factory exists and works — The Rouge wraps it, doesn't replace it
- Token budget is not a constraint (willing to spend on quality)
- Must work with Claude Code as the execution environment

## Goals / Non-Goals

**Goals:**
- Autonomous build-evaluate-iterate loop that runs for hours/days without human intervention
- Quality evaluation grounded in external, measurable signals (not LLM self-assessment)
- Persistent Library that accumulates global standards, domain taste, and personal taste fingerprint
- Interactive seeding phase that produces a comprehensive vision and seed spec
- Human notification via Slack when product is ready or pivot is needed
- Feedback ingestion that updates both the current product and The Library
- Meta-loop: The Factory itself is a project that The Rouge improves

**Non-Goals:**
- Multi-user platform or web UI (solo founder first, productize later)
- Game evaluation (web products first — games are a future domain)
- Generated artifact evaluation (books, videos — future domain)
- Replacing the AI Factory's internal tools (OpenSpec, Superpowers, Design Mode stay as-is)
- Real-time human-in-the-loop during autonomous cycles
- Custom model training or fine-tuning for taste (use prompt-based approaches)

## Decisions

### 1. Composite quality signal over single metric

Product quality cannot be reduced to a single number like val_bpb. Instead, The Rouge aggregates multiple external signals into a composite evaluation:
- Browser QA (functional correctness, console errors, interaction testing)
- Lighthouse (performance, accessibility, SEO — non-functional)
- Spec-completeness (% of vision-derived acceptance criteria met — functional)
- Pairwise comparison against reference products (is this closer to Stripe or a student project?)

**Why not a single score?** Research shows LLMs are ~93% accurate on large quality gaps but only ~60% on subtle ones. Composite signals surface different failure modes — a product can pass QA but fail on information hierarchy, or score well on Lighthouse but have broken user journeys.

**Alternative considered:** LLM-as-judge with a single 1-10 score. Rejected because research shows absolute scoring is only 35-38% accurate and self-assessment without external grounding degrades with iteration.

### 2. Two-loop architecture

Inner loop (autonomous): Build → evaluate → identify gaps → expand spec → rebuild. Aims for "great," accepts "good." Grounded in external signals.

Outer loop (human): Review → feedback → change specs + Library updates. Gets from "good" to "great." Human provides the taste judgment AI cannot.

**Why two loops?** Research confirms iteration with external feedback works (Self-Refine: ~20% improvement). But "good" vs "great" requires human judgment — AI can detect "this is bad" reliably but cannot reliably distinguish "good" from "great." The inner loop handles the 80%; the human handles the final 20%.

**Alternative considered:** Single loop with human checkpoint every N cycles. Rejected because it interrupts the human too often (15 checks/day vs 1 daily review) without proportionate value.

### 3. Taste encoded as measurable heuristics

Design taste is not stored as subjective opinions but as testable assertions:
- "Primary content occupies >50% of above-the-fold area" (measurable via DOM analysis)
- "Core task completes in ≤3 clicks" (measurable via user journey simulation)
- "No page loads in >2 seconds" (measurable via Lighthouse)
- "Information hierarchy has exactly one primary element per screen" (measurable via component analysis)

**Why not subjective assessment?** Research shows AI can apply design heuristics reliably but cannot make novel aesthetic judgments. Encoding taste as heuristics plays to AI's strength (rule application) and avoids its weakness (subjective evaluation).

**Alternative considered:** LLM-as-judge with reference screenshots for visual comparison. Not rejected outright — useful as a supplementary signal for pairwise comparison — but not sufficient as the primary evaluation method.

### 4. Non-linear seeding phase

The first human interaction for a new project is a swarm, not a pipeline. Brainstorming, product taste, OpenSpec, and design challenge each other:
- Product taste might reject the brainstorm's scope
- Design might push back on a spec that can't produce good UX
- OpenSpec might surface missing user journeys

**Why non-linear?** The current linear pipeline (brainstorm → taste → spec → design) misses cross-cutting concerns. A spec might look fine until design reveals the user journey is broken. The swarm catches these before the autonomous loop begins.

**Alternative considered:** Keep the linear pipeline, add a validation pass at the end. Rejected because it's slower — a single validation pass catches fewer issues than continuous cross-pollination.

### 5. Adaptive cycle granularity

One cycle in the autonomous loop = one feature area for large products, or the whole product for small ones. Decided during seeding based on product complexity.

**Why adaptive?** A backgammon game is one cycle. A fleet management SaaS has 5+ feature areas (trips, maintenance, vehicle management, onboarding, analytics). Fixed granularity would be too coarse for large products or too fine for small ones.

### 6. Feedback tagged global vs genre-specific

When the human gives feedback, The Rouge classifies it:
- Global: applies to all future products ("flat information hierarchy is always wrong")
- Genre-specific: applies to web products, games, or artifacts ("SaaS dashboards need a primary metric above the fold")

**Why tag?** Without tagging, game feedback pollutes web product standards and vice versa. Domain-specific taste only helps within its domain.

### 7. Notification threshold: confidence-based

The Rouge notifies the human when:
- It believes the product is ready (high confidence against vision)
- Confidence drops below ~80% (something feels off, may need pivot)

Between these, it runs autonomously. Prefers batching (one daily briefing) over interruption (15 messages/day).

## Risks / Trade-offs

**[Token cost explosion]** → Autonomous multi-hour loops with sub-agents will consume significant tokens. Mitigation: start with web products (faster eval cycles), monitor cost per loop, set configurable budget caps per cycle.

**[Taste heuristics are incomplete]** → Measurable heuristics can't capture everything that makes a product "good." Mitigation: the outer loop (human feedback) catches what heuristics miss, and those catches become new heuristics over time. The system improves.

**[Vision drift]** → The autonomous loop might drift from the original vision through incremental expansion. Mitigation: periodic vision check against the original vision document. Explicit scope expansion requires a confidence threshold.

**[Session fragility]** → Long-running autonomous sessions could fail (crash, context overflow, API errors). Mitigation: state persisted to disk after every cycle. Sessions can resume from last checkpoint.

**[Evaluation false positives]** → The system might believe something is "good" when it's not, due to heuristic blindspots. Mitigation: the human review catches this, and the missed issue becomes a new heuristic. Over time, false positive rate decreases.

**[Library pollution]** → Bad feedback or incorrect tagging could corrupt The Library. Mitigation: Library entries are versioned and prunable. Retrospectives surface conflicting or outdated entries.

## Open Questions

- What is the minimum set of taste heuristics needed to seed The Library on day one?
- How should the vision document be structured to enable automated comparison?
- What's the right confidence threshold for pivot notification vs autonomous resolution?
- How does the consensus engine work in practice? (Multi-LLM evaluation for high-stakes decisions)
- What's the state persistence format? (Files on disk, database, or hybrid)
- How does The Rouge invoke The Factory? (Same process, subprocess, separate session)
