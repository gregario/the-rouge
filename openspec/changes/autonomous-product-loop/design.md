## Context

The AI Factory is a personal AI product development system that orchestrates specs (OpenSpec), design (Design Mode), and engineering (Superpowers) to build software products. It works well within a single session but has no persistence between sessions — the human is the brain that decides what's shallow, what needs deepening, and what to work on next. This results in shallow output that technically works but doesn't meet production quality standards.

The Rouge adds an autonomous outer loop that removes the human as the between-session bottleneck. It evaluates product quality using external signals, iterates until a production bar is met, accumulates design intelligence across projects, and only involves the human for seeding, feedback, and pivot decisions.

Karpathy's autoresearch system is the inspiration: tight feedback loops, external evaluation metrics, autonomous iteration. The key difference is that autoresearch has a single unambiguous metric (val_bpb) while product quality requires a composite of measurable signals.

An architecture exploration resolved the execution model: short-lived Claude Code invocations with state on disk (the "Karpathy Loop"), rather than a traditional long-running process. This eliminates session management complexity and makes crash recovery the normal operating mode. See decisions 8-12 for details.

**Constraints:**
- Solo founder use case — me first, others later, but architected for future generalization (open source or SaaS potential)
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

### 8. Karpathy Loop execution model

Each phase of the state machine runs as a separate, short-lived `claude -p` invocation. No long-running process. State lives on disk (`state.json`, `cycle_context.json`). A bash launcher script (~50 lines) reads state, spawns the right Claude Code session, handles errors, and loops forever. Inspired by Karpathy's AutoResearch: each iteration is self-contained, starts fresh, reads state from disk.

**Why not a long-running Node.js process?** Claude Code sessions die (context limits, session timeouts). Fighting this with session chaining and context management adds complexity without value. The Karpathy pattern embraces ephemerality — crash recovery IS the normal operating mode.

**Why not API-based (`claude -p` with API key)?** V1 uses subscription auth (`claude -p` with cached OAuth on the user's machine). Subscription is ~12x cheaper than API pricing. V2 can migrate to API key for full cloud autonomy — same code, different auth.

**Alternative considered:** Claude Code Agent tool for sub-agents within a single session. Rejected because sessions still die, and the state machine is cleaner when each phase is independent.

### 9. Multi-project round-robin launcher

The launcher iterates through all project directories, checking each `state.json`. Projects in `waiting-for-human` or `complete` states are skipped. One phase per project per loop. This naturally supports parallel product development.

**Why round-robin?** Simplest scheduling that works. No priority system needed for V1 — first-in-first-out. If all projects are paused waiting for feedback, the launcher idles (zero cost).

### 10. Model selection per phase

The launcher passes `--model` to `claude -p` per state. Opus for thinking phases (building, PO review, analysis, change specs, vision checks). Sonnet for commodity phases (test integrity, QA gate, promoting, rolling back). This reduces API costs by ~40-60% when migrating to V2.

**Why not Opus for everything?** Commodity phases are mechanical (run tests, check pass/fail, merge PR). Sonnet handles these reliably at lower cost.

### 11. Swarming only during seeding

The seeding phase is the ONE interactive phase where the human is present. It uses a non-linear swarm (brainstorming ↔ taste ↔ spec ↔ design). All autonomous phases use tight Karpathy loops instead — if something fails, the state machine iterates. More loops, less deliberation per loop.

**Why not swarm autonomously?** Swarming requires judgment about when to loop back. Tight loops with clear pass/fail criteria converge mechanically without needing that judgment.

### 12. Supabase 2-slot management

Free tier allows 2 active Supabase projects. Paused projects preserve data and don't count. The launcher tracks active projects and rotates slots: pause least-recently-active, unpause or create as needed. Not every product needs a database — the Rouge detects this from project type.

**Why not Pro plan?** $25/mo base + $10/project adds up fast across many products. Free tier with slot rotation costs $0. Upgrade individual products to Pro only when they generate revenue.

## Risks / Trade-offs

**[Token cost explosion]** → Autonomous multi-hour loops with sub-agents will consume significant tokens. Mitigation: start with web products (faster eval cycles), monitor cost per loop, set configurable budget caps per cycle.

**[Taste heuristics are incomplete]** → Measurable heuristics can't capture everything that makes a product "good." Mitigation: the outer loop (human feedback) catches what heuristics miss, and those catches become new heuristics over time. The system improves.

**[Vision drift]** → The autonomous loop might drift from the original vision through incremental expansion. Mitigation: periodic vision check against the original vision document. Explicit scope expansion requires a confidence threshold.

**[Session fragility]** → Long-running autonomous sessions could fail (crash, context overflow, API errors). Mitigation: state persisted to disk after every cycle. Sessions can resume from last checkpoint.

**[Evaluation false positives]** → The system might believe something is "good" when it's not, due to heuristic blindspots. Mitigation: the human review catches this, and the missed issue becomes a new heuristic. Over time, false positive rate decreases.

**[Library pollution]** → Bad feedback or incorrect tagging could corrupt The Library. Mitigation: Library entries are versioned and prunable. Retrospectives surface conflicting or outdated entries.

**[Subscription auth fragility]** → OAuth tokens on the user's machine may need periodic re-login. Mitigation: the launcher detects auth failures and notifies via Slack. Re-login takes 30 seconds.

**[Supabase slot contention]** → With only 2 active slots, products under human review block other products from being built. Mitigation: review turnaround is typically <24h. If blocking becomes an issue, upgrade one product to Pro.

## Open Questions

- GStack browse on Linux (macOS ARM binary, need Linux alternative for thin client)
- OAuth credential longevity on persistent machine
- Cloudflare Workers vs Pages deployment flow validation
- Stripe end-to-end test flow spike
- Feedback queue format (how Slack bot writes for launcher pickup)
- Morning briefing scheduling mechanism
