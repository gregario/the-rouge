# Rouge Vision

This is Rouge's North Star. Every change to Rouge should be evaluated against this document: does it make Rouge better at what it's trying to be?

## What Rouge is

An autonomous product development system. Rouge collapses the distance between "I have an idea" and "it's live and I'm testing it with real users."

Not a code generator. Not a prototype builder. A development process: think through the product (seeding), build it iteratively (the loop), evaluate against external signals, fix, repeat until the quality bar is met. The output is a real, working, deployed product that you can put in front of users.

## Who Rouge is for

**People with more product ideas than capacity to ship them.**

You have ten ideas and one evening a week. You're an agency who wants to validate a concept before committing engineering time. You're a founder testing whether an idea has legs. You're a product person who thinks in user journeys, not code.

Rouge gets you to a real product you can test with real users. When the product validates and starts to scale, you bring in engineers to take it further. Rouge doesn't replace the engineering team. It gets you to the point where you know whether you need one.

**The open source community** extends what Rouge can build by contributing integration patterns, stack support, and evaluation improvements. Every product Rouge builds makes it better at building the next one.

## What Rouge builds

Software products. Web apps, APIs, MCP servers, CLI tools, marketplaces, dashboards, SaaS platforms. What it can build at any given moment depends on what stacks and integrations are in the catalogue.

Rouge does NOT build: mobile apps (yet), games (yet), hardware, electronics, music, video, books, or anything outside the software domain. The architecture is domain-agnostic (the Karpathy Loop works for anything), but V1 scope is software.

## What good looks like for Rouge

### Product output quality

Products Rouge builds should:
- Pass all acceptance criteria from the seed spec
- Score 90+ on Lighthouse (performance, accessibility, best practices, SEO)
- Have zero console errors
- Have comprehensive test suites (not just happy paths)
- Handle error states, empty states, loading states, and overflow
- Be deployable and functional (not just "it runs locally")
- Be good enough to put in front of real users for validation
- Be honest about what they are: validated products, not final scaled systems

### Rouge system quality

Rouge itself should:
- **Expand capability over time.** More stacks, more integrations, more product types it can build.
- **Reduce human intervention.** Each version should need less hand-holding. Fewer escalations, fewer stuck loops, fewer wrong decompositions.
- **Improve evaluation accuracy.** The quality bar should catch real issues and not flag false positives. The Library should grow with useful heuristics, not noise.
- **Maintain prompt quality.** Phase prompts should be clear, complete, and produce consistent output. A prompt change that looks good on one product but breaks another is a regression.
- **Keep the catalogue practical.** Integration patterns should be built from real product needs, tested against real APIs, and include honest trade-off analysis. No theoretical patterns that have never been used.
- **Stay honest about limitations.** If Rouge can't build something well, it should say so (feasibility gate), not produce something half-baked.

## The boundaries

### In scope for Rouge development

- New integration patterns (Tier 2 services, Tier 3 code patterns)
- New stack support (Tier 1)
- Evaluation pipeline improvements (better quality detection, fewer false positives)
- Phase prompt improvements (clearer instructions, better edge case handling)
- CLI and developer experience improvements
- The Library (new heuristics, better calibration)
- Decomposition improvements (better complexity detection, smarter dependency ordering)
- Slack control plane improvements

### Out of scope (for now)

- Non-software domains (electronics, music, video, writing)
- Post-build lifecycle (feature expansion, production maintenance, codebase onboarding) — out of scope for Rouge
- Multi-tenancy or cloud hosting of Rouge itself

## How decisions get made

1. **The human defines the vision** (this document). Rouge delivers against it.
2. **The human approves changes** via PR review. Nothing auto-merges to Rouge's own codebase.
3. **Rouge can propose changes** (issues, PRs, exploration findings) but the human decides.
4. **Taste is a gradient.** The human defines "what good looks like" via the Library. Rouge gets better at interpreting it over time. This is delegation, not abdication.

## Feature areas

| Area | What it covers | Quality signal |
|------|---------------|----------------|
| **Seeding swarm** | Eight discipline personas, vision.json output, spec quality | Does the seed produce enough for the loop to build without ambiguity? |
| **Karpathy Loop** | State machine, phase sequencing, launcher, error handling | Does the loop advance reliably? Does it recover from failures? |
| **Evaluation pipeline** | Five-lens assessment, quality scoring, change spec generation | Does it catch real issues? Does it avoid false positives? |
| **Composable decomposition** | Complexity profiles, foundation cycles, dependency ordering, backwards flow | Can it handle complex products without wasting cycles on rework? |
| **Integration catalogue** | Tier 1-3 entries, validation, self-growing mechanism | Are patterns practical, tested, and honest about trade-offs? |
| **The Library** | Global heuristics, domain-specific taste, learned judgment | Does the quality bar produce good products? Does it learn? |
| **CLI** | init, seed, build, status, cost, doctor, slack, setup | Can a new developer go from install to first build without friction? |
| **Slack control plane** | Bot, notifications, commands, feedback ingestion | Can you monitor and control Rouge from your phone? |
| **Safety** | Hooks, deploy restrictions, secret handling | Does Rouge prevent itself from doing damage? |
