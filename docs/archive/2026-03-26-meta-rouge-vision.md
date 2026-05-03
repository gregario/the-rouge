# Meta Rouge Vision — Conversation Evolution

> Captured 2026-03-26. Working title: "Rouge Squares" (name TBD).
> This document records the full evolution of a conversation that started with "should we mention book generation?" and ended with a vision for cross-domain AI product development.

---

## Thread 1: The Book Question

**Starting question:** Rouge is going open source. Should we publicly position it as capable of generating books/novels?

**Sensitivity:** AI novel generation is culturally controversial. The creative writing community is hostile to AI-generated fiction. Leading with "AI that writes novels" would overshadow Rouge's engineering achievements.

**Options explored:**
- A: Include everything including fiction — risk: fiction becomes the headline
- B: Exclude books entirely — risk: dishonest by omission
- C: Include as "generated artifacts," de-emphasise fiction — risk: journalists still ask

## Thread 2: The Reframing — Rouge Builds Software, Not Artifacts

**Key correction:** Rouge doesn't generate books. Rouge built colourbookpub — a SaaS product that generates colouring books. Rouge built the ENGINE, not the books. Similarly, ai-book-engine is a software product. Rouge would build the fiction engine, not write novels.

**Insight:** The book question dissolves at this framing. Rouge builds software products. What those products DO (generate books, manage fleets, process payments) is the product's business logic, not Rouge's positioning.

**Decision:** We don't need to mention books, fiction, or content generation at all. If someone asks "can it write novels?" — "Rouge builds software products. One of those could be a content generation engine."

## Thread 3: What Does Rouge Actually Build Today?

**Correction applied:** Rouge can only autonomously build and evaluate web applications today (Next.js + Cloudflare + Supabase). The architecture is domain-agnostic but the evaluation pipeline is web-specific.

- MCP servers: no MCP QA in Rouge's evaluation loop yet
- Games: no autonomous gameplay testing
- CLI tools: no autonomous testing path in the loop
- Mobile apps: no mobile testing infrastructure

**Insight:** The Karpathy Loop only works when evaluation can judge quality. No evaluation = no quality ratchet. Domain expansion requires domain-specific evaluation pipelines.

## Thread 4: "Builds Tech" — Not Web Apps, Tech Products

**Reframing:** Rouge doesn't build "web apps like Lovable." Rouge builds tech products. It could build GitHub. It could build an API middleware. It could build a marketplace. It could build an MCP server.

What it CAN build is determined by what stacks, services, and integrations are available to it. As more get added (including by the community), Rouge can build more types of products and pick the best fit.

**Competitive positioning evolution:**
- ~~"Web app builder"~~ — competes with Lovable, Bolt, v0. Loses on budget.
- ~~"Builds everything"~~ — can't deliver on the claim.
- **"Autonomous tech product development"** — unique positioning. Nobody else has the quality ratchet loop.
- **"Lovable generates. Rouge develops."** — five words that capture the difference.

## Thread 5: The Tier Model

A hierarchy of what Rouge needs to know to build a product:

```
Tier -1: DOMAIN           "What kind of thing?"
          │                Software, electronics, books, physical products,
          │                music, video, scientific research...
          │
Tier 0:  PRODUCT TYPE     "What kind of software?"
          │                Web app, API, CLI tool, MCP server, Windows app,
          │                desktop app, embedded firmware...
          │
Tier 1:  STACK            "What language/framework/runtime?"
          │                Next.js, Kotlin/Spring, Rust, Python/FastAPI...
          │
Tier 2:  SERVICE          "What infrastructure services?"
          │                Auth0 vs Supabase Auth, PostgreSQL vs MongoDB...
          │
Tier 3:  INTEGRATION      "What external APIs?"
                           Google Maps, Stripe, Resend, Unsplash...
```

**Community growth model:** Contributors can add at any tier. New stacks, new services, new integrations. Each addition makes Rouge capable of building more types of products. The decomposition phase discovers and selects automatically.

**Manifest format needed:** A standard way for community contributions at each tier to be discovered by the decomposition and spec phases. Integration standard spec expanded to all tiers.

## Thread 6: Composition Across Domains — The Breakthrough Idea

**The question that changed everything:** "Does it make sense for it to be one project?"

A movie needs: script (writing) + score (audio) + VFX (video/3D) + marketing site (software). A game needs: code + art + audio + level design. These are multi-domain products.

If Rouge domains are separate projects, they never compose. The script doesn't inform the music. The music doesn't match the VFX. You get five independent outputs, not a movie.

**The VLSI analogy:** Modern chip design decomposes from high-level synthesis → RTL → logic → physical layout. Each level uses different tools and different expertise. But it's ONE integrated design flow. Cadence and Synopsys are worth billions because they integrated the levels. Separate tools existed first. The integrated suite won.

**Meta Rouge / Rouge Squares vision:**

```
Meta-seeding: "I want to make a game"
        ↓
Meta-decomposition: discovers this needs code + art + audio + design
        ↓
Cross-domain dependency graph:
  - Art direction established first (everything visual depends on it)
  - Code + Audio build in parallel (both informed by art direction)
  - Integration pass: does the music match the gameplay? Does the art
    match the code's capabilities?
        ↓
Cross-domain feedback loop:
  - Building the audio reveals the game needs a different pacing
  - Feeds back to code (gameplay) and art (visual rhythm)
  - This is the decomposition feedback loop applied across domains
        ↓
Cross-domain evaluation:
  - Does the music match the gameplay's emotional arc?
  - Does the art style work with the engine's rendering?
  - Does the whole product feel cohesive?
```

**Why this is significant:** Nothing like this exists. The Karpathy Loop is domain-agnostic at its core — build, evaluate, improve works for code, music, 3D models, prose, circuits. The cross-domain feedback (score informs script informs VFX) is how real creative teams work. No AI system does this.

**Architecture decision:** One repo with clear internal boundaries, not separate projects:

```
rouge/
├── core/           (loop, state machine, launcher, seeding, Library framework)
├── domains/
│   ├── software/   (web apps, MCP, APIs, CLI tools)
│   ├── audio/      (future)
│   ├── writing/    (future)
│   └── ...
├── meta/           (cross-domain decomposition, multi-domain evaluation)
└── library/
    ├── global/     (quality standards that apply everywhere)
    └── domains/    (per-domain heuristics)
```

Users only see the domains they use. No bloat. But composition is possible when needed.

## Thread 7: Is This the Meta Layer?

**The question:** Is Meta Rouge essentially AI-driven creative production? Like Stanford's Generative Agents / ChatDev — but production-grade and shipping real products?

**The analogy:** The way Rouge builds a tech product mirrors how a solo developer or small startup works — go to market, hypothesis, build, test, feedback loop. Meta Rouge does the same for multi-domain products: a movie, a game, a physical product. Spin up all the domains, they work in their areas, they have their "meetings" (cross-domain evaluation), and they iterate toward a cohesive product.

**Feasibility concern:** Some domains' AI capabilities aren't mature enough yet. Video generation (Sora) is vendor-locked and can't do frame-by-frame movie production. Image generation isn't consistent enough for stop-motion. Music generation is closer but still limited.

**Better near-term examples than a movie:**
- A game with procedural/simple art (code + audio + design — all feasible with current AI)
- A research paper (literature review + data analysis + writing + visualization — all feasible)
- A physical product (CAD + firmware + documentation + e-commerce site — mostly feasible)
- An educational course (content writing + video scripts + web platform + exercises)

**Assessment:** The vision is sound. The architecture is right. The question is sequencing — software domain first, prove the loop works, then expand to domains where AI capabilities are mature enough for autonomous evaluation.

## Sequencing

1. **V1 (now):** Rouge Core + Software domain. Web apps + MCP servers.
2. **V1.x:** Community adds more stacks, services, integrations within software domain.
3. **V2:** Second domain added (most likely: writing or research, where evaluation is closest to feasible).
4. **V2.x:** Meta-orchestration layer for multi-domain products.
5. **V3+:** Domains expand as AI capabilities mature (audio, 3D, video, electronics).

## Open Questions

- What's the name? "Meta Rouge"? "Rouge Squares"? "Rouge Compose"?
- Where does the meta-orchestration layer live? Separate process? Extension of the launcher?
- How does cross-domain evaluation work? Who judges "does the music match the script"? An LLM with multi-modal understanding? A domain-specific evaluator that understands the interface between domains?
- How do domain contributions get quality-gated? A bad software stack is one thing. A bad audio evaluation pipeline that says tone-deaf music is good is worse.
- How do we prevent scope creep into Meta Rouge while building V1 Software?

## The Philosophical Observation

"We're basically building a capitalist version of human consciousness."

A system that:
1. Learns — Library accumulates taste across projects
2. Evaluates — judges its own work against quality standards
3. Improves — iterates until quality bar is met
4. Expands capability — community adds new domains
5. Transfers knowledge — what it learns building one product informs the next
6. Composes — combines domain expertise to create multi-disciplinary products

Each Tier -1 domain expansion is like a human learning a new discipline. The meta-process — build, evaluate, improve, accumulate taste — is universal. The specifics change per domain. The loop doesn't.

## The Evolution of Abstraction

The chain of abstraction that leads to Meta Rouge:

1. **AI Factory** — Human-supervised AI product development. Socrates (Claude) orchestrates skills, stacks, and workflows. Human is the product owner. Manual.
2. **The Rouge** — AI Factory automated end-to-end. The same spec → design → build → evaluate → ship workflow, but autonomous. The Karpathy Loop replaces the human-in-the-loop. Built BY AI Factory.
3. **Rouge Open Source** — Rouge hardened through public use, community contributions, and battle-testing against diverse real-world products. This phase exists to make Rouge robust enough for what comes next.
4. **Meta Rouge** — Rouge used as a software development tool to build the capabilities for non-software domains. Rouge builds the audio evaluation pipeline. Rouge builds the 3D model evaluator. Rouge builds the domain plugins that let it expand beyond software.

**Key principle:** Meta Rouge is the internal vision. It is NOT part of the open source launch messaging. The public sees: "Rouge builds tech products autonomously." The private roadmap is: "Rouge eventually builds the tools that let it build anything."

**Why open source first:** Rouge needs to be hardened on software products before it can reliably build the domain expansion tools. Releasing it publicly creates the pressure-testing, community contributions, and real-world edge cases that make it robust. Rushing to Meta Rouge on a fragile foundation would produce unreliable domain plugins.

**The bootstrap sequence:**
- AI Factory builds Rouge (manual, human-supervised)
- Rouge builds software products (autonomous, Karpathy Loop)
- Rouge builds domain expansion tools (autonomous, Meta Rouge)
- Domain-expanded Rouge builds multi-domain products (autonomous, cross-domain composition)

Each layer is built BY the previous layer. Each layer is more autonomous than the last.
