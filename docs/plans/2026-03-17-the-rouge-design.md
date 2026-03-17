# The Rouge — Design Vision

**Date:** 2026-03-17
**Status:** Brainstorm complete, pending product taste review
**Type:** New project (peer to AI-Factory, private repo)

## One-Liner

An autonomous product development system that builds production-quality products through iterative self-evaluation, starting from a high baseline standard of "good" and developing design taste that improves across every project it ships.

## The Problem

The AI Factory produces working software, but the output is shallow. A backgammon game that runs but doesn't let you select a source piece. A SaaS dashboard that passes QA but feels like a student project. The specs are technically complete, the tests pass, but no one is holding the output to a production standard.

The root causes:
1. **Session-scoped thinking** — AI optimizes for what fits in one conversation, always shrinking scope to fit.
2. **No automated quality bar** — nothing evaluates "is this actually a good product" beyond "does it crash."
3. **No persistence between sessions** — the human is the brain between sessions, deciding what's shallow and what's next.
4. **Lightweight specs** — product specs can be interpreted as lightweight or production-ready. Without pressure, AI interprets them as lightweight.

Autoresearch (Karpathy) solves the equivalent problem for ML: fixed time budget per experiment, automated metric (val_bpb), infinite loop until interrupted. The Rouge applies the same principle — tight feedback loops, automated evaluation, autonomous iteration — to product development.

## Three Layers

### The Rouge (Runner)

The outer loop orchestrator. A new project, peer to AI-Factory, private repo (for now).

Responsibilities:
- Manages state across sessions (persistent, never sleeps)
- Evaluates product quality against vision and standards
- Decides what to build next: deepen existing features or broaden to new ones
- Refuses to ship until the quality bar is met
- Sends work back to The Factory for iteration
- Notifies the human when something is ready or when a pivot is needed
- Runs The Factory itself as one of its own projects (meta-loop)

### The Factory (Studio)

AI-Factory as it exists today. The worker.

Responsibilities:
- Receives a scoped brief (seed spec or change spec)
- Runs the existing pipeline: design mode → implementation → testing → QA
- Produces a built, deployed product
- Does NOT decide whether what it built is good — The Rouge does that

### The Library (Accumulated Mind)

The body of knowledge. Persistent, growing, cross-project.

Responsibilities:
- Stores global product standards, domain-specific taste, per-project standards
- Informs The Rouge's evaluation decisions
- Informs The Factory's design output
- Grows from human feedback, self-evaluation, and cross-project retrospectives

## The Library — Three Tiers

### Tier 1: Global Standards (every product)

The baseline of "good" that every product starts from. Seeded on day one from real-world product analysis, not learned from scratch.

**Product standards (functional):**
- Information hierarchy: clear primary/secondary/tertiary on every screen
- Core tasks completable in 3 clicks or fewer
- Every state handled: empty, loading, error, populated, overflow
- Progressive disclosure by default
- User journeys mapped and tested end-to-end

**Design standards (functional):**
- Derived from reference products (Stripe, Linear, Netflix, Reddit)
- Production-level visual quality — not prototype, not wireframe
- Consistent spacing, typography, interaction patterns
- Animation on state transitions
- Mobile responsiveness (web products)

**Engineering standards (non-functional):**
- Page load under 2 seconds
- Time to interactive under 3 seconds
- API response under 200ms
- Lighthouse score above 90
- Accessibility baseline (WCAG 2.1 AA)
- Error messages that help, not just inform
- Loading states that feel intentional

**Functional vs non-functional separation:** The Library clearly distinguishes between what a product does (functional — product and design decisions) and how well it does it (non-functional — engineering constraints that enable the feeling of quality). Both contribute to "feels like a real product" but are evaluated differently, owned by different concerns, and have different failure modes.

### Tier 2: Domain-Specific Taste

What "good" means differs fundamentally across domains:

**Web products** — conversion flow, page speed, responsive design. Reference: Stripe, Linear, Netflix.

**Games** — feel, juice, system interlocking. A dice roll without animation is a failure regardless of mechanical correctness. Reference: "would someone choose to play this?"

**Generated artifacts** (books, videos) — output quality. Line weight, complexity, resolution (books). Pacing, transitions, narrative coherence (videos).

This tier grows as The Rouge ships products in each domain.

### Tier 3: Learned Judgment (from feedback)

The layer that makes The Library genuinely intelligent over time:

- **Pattern recognition** — "Every review flags flat information hierarchy. Design phase needs to be more aggressive about visual weight."
- **Taste calibration** — learning the distance between "feels like Stripe" and "feels like a student project."
- **Pivot wisdom** — "We pivoted on project X because the core mechanic wasn't fun despite good UI. Test core mechanics earlier next time."
- **Anti-patterns** — "The system keeps producing equal-weight card grids. That's never the right answer."

### The Consensus Engine

For high-stakes evaluations ("should we pivot?", "is this production-ready?"), The Library doesn't rely on a single judgment. It asks the question multiple ways, potentially across multiple LLMs, and looks for agreement. Disagreement triggers deeper investigation, not a coin flip.

## The Autonomous Loop

### Phase 1: Seeding (Interactive)

The human drops an idea. The Rouge initiates a **swarm** — not a linear pipeline but a back-and-forth conversation across brainstorming, competition review, product taste, OpenSpec, and design. Each discipline challenges the others.

This keeps going until The Rouge has:
- **A vision document** — what this product is, who it's for, what "good" looks like, with reference products
- **A product standard** — per-project definition of done, layered on top of global standards
- **A seed spec** — comprehensive enough to grow, not comprehensive enough to be brittle. A brief for a senior team, not a spec for a junior developer.

The human approves the seed. From here, The Rouge takes over.

### Phase 2: Building (Autonomous)

The Rouge sends the seed spec to The Factory. The Factory builds. When the work comes back, The Rouge evaluates:

**Criteria check (structured):** Vision-derived acceptance criteria. "Can the user select a source piece?" "Do dice animate?" Testable, binary.

**Product sense check (holistic):** An agent uses the product as a real user would. Tries the core journey end-to-end. Reports what feels wrong, shallow, or missing. Compares against reference products and the project's product standard.

If it passes → next feature area (or done for small products).

If it fails → The Rouge identifies WHY. The "why" becomes a change spec. Does this need deeper implementation of an existing feature, or missing breadth? The Rouge decides, expands the spec, sends it back.

### Phase 3: Vision Check (Every N Cycles)

After each feature area completes, The Rouge steps back:
- "Is this still heading toward the vision?"
- "Has building revealed the vision itself is wrong or incomplete?"
- "Should we expand scope? Contract? Pivot?"

High confidence → keep building.
Low confidence on a feature → autonomous pivot.
Low confidence on the whole vision → notify the human.

### Phase 4: Notification

Slack message: "We have something." The human reviews a live, deployed product — not a spec, not a PR. A thing they can use.

### Phase 5: Feedback

The human gives feedback (voice, text, playing the product). The Rouge translates into:
- **Change specs** for this product (immediate)
- **Library updates** for all future products (permanent)

Another building cycle begins. Loop continues until the human says ship.

## Evaluation Dimensions

|  | Functional | Non-functional |
|---|---|---|
| **Product** | Features present, user journeys complete, flows make sense | — |
| **Design** | Information hierarchy clear, progressive disclosure working, 5 states designed | — |
| **Engineering** | Edge cases handled, error states graceful | Page load, TTI, Lighthouse, API response, accessibility |
| **Feel** | Product sense check passes, feels like reference products | Perceived snappiness, animation smoothness, responsiveness |

## The Meta-Loop

The Factory itself is a project in The Rouge. Periodically, The Rouge evaluates: "Are the products The Factory builds getting better? Are the same problems recurring?" That evaluation drives improvement PRs to AI-Factory. The two repos are kept in sync via PR diffs.

## Domains (Priority Order)

1. **Web products** (SaaS, marketing sites, landing pages) — easiest to evaluate, full browser control
2. **Games** — harder evaluation, different definition of "good," system design depth
3. **Generated artifacts** (books, videos) — iterating on output quality

## Human Touchpoints

- **New project seeding** — first loop is interactive, non-linear swarm
- **Slack notification** — when The Rouge has something ready
- **Feedback session** — voice/text, drives change specs + Library updates
- **Pivot approval** — when confidence in the vision drops

## Relationship to AI-Factory

- The Rouge is a **new project at the same level** as AI-Factory, not inside it
- AI-Factory remains open source; The Rouge is private (for now)
- The Factory (AI-Factory) becomes a worker within The Rouge
- Changes to AI-Factory driven by The Rouge are synced via PR diffs
- Opportunity to refactor AI-Factory with learnings from what breaks

## Open Questions (For Future Sessions)

- What does "definition of done" look like per project type? (Parked deliberately)
- How does the consensus engine work in practice? (Multi-LLM evaluation)
- What tooling is needed for game evaluation? (Screenshots from MCP exist, but limited)
- How does the seed spec differ from today's OpenSpec output? (Comprehensiveness threshold)
- How is per-project product standard defined during seeding? (Format, depth)
- Technical architecture of The Rouge (deferred — product vision first)

## Inspirations

- **Autoresearch** (Karpathy) — tight feedback loop, single metric, infinite autonomous iteration
- **Gary Tan's 10-star brainstorming** — expansive thinking about what "good" could be
- **Ford's River Rouge Complex** — the factory of factories, vertical integration
- **Wan Shi Tong's Library** — accumulated knowledge that grows forever
