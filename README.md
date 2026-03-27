# The Rouge

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-PolyForm%20NC-blue.svg" alt="PolyForm Noncommercial"></a>
  <a href="https://github.com/sponsors/gregario"><img src="https://img.shields.io/badge/sponsor-♥-ea4aaa.svg" alt="Sponsor"></a>
</p>

> **Experimental.** Rouge is a research project. It invokes Claude Code autonomously, deploys to real infrastructure, and makes real git commits. It could rack up your token usage, deploy broken code to staging, or commit something embarrassing. It will not, to our knowledge, sell your grandmother. Use at your own risk.

Describe what you want to build. Rouge figures out the architecture, builds it iteratively, evaluates its own work, and ships production-quality tech products.

Not one-shot code generation. Iterative product development: build, evaluate against external signals, fix, repeat until the quality bar is met. The same loop a good engineering team runs, except it runs overnight while you sleep.

## What this looks like

You describe a product in Slack. Rouge seeds it (brainstorms, writes specs, produces a design system), then builds it autonomously. Five build cycles later, you've got a deployed app with passing tests, accessibility scores, security headers, analytics, and error monitoring. The evaluation system found a missing focus trap by tabbing through the UI eleven times. Nobody told it to do that.

The system is designed for products that are actually complex. A fleet management system with trips, vehicles, a dashboard, maps integration, and a trip simulator. A testimonial wall with embeddable widgets, auth, and a moderation queue. Not just landing pages (though it handles those too, in one cycle).

Here's how it works.

## The Karpathy Loop

Inspired by [Karpathy's AutoResearch](https://github.com/karpathy/autoresearch): tight feedback loops with external evaluation. No long-running process. Each phase starts fresh, reads state from the filesystem, does one thing, saves, and exits. The filesystem is the memory. Git is the audit trail. The launcher is a small Node.js script.

<p align="center">
  <img src="docs/diagrams/karpathy-loop.png" alt="The Karpathy Loop: Seed → Foundation → Build/Evaluate → Ship, with backwards restructure flow" width="480">
</p>

The loop iterates as many times as it needs to. A simple product might pass evaluation on the first cycle. A complex product with dense dependencies might loop dozens of times, fixing quality gaps, restructuring its foundation, and refining until every feature area meets the bar. There's no fixed limit. It's done when it's done.

### Seeding (you do this part)

You describe the product. Rouge runs eight discipline-specific personas through it: brainstorming, competition analysis, product taste, spec generation, design, legal, marketing. You approve the vision, Rouge writes `vision.json` (the north star for all autonomous decisions), and hands off to the loop.

About 10-20 minutes of your time. Then it's autonomous.

### The autonomous loop (Rouge does this part)

The launcher picks up your seeded project and iterates:

1. **Build** — reads specs, writes code with TDD, deploys to staging
2. **Evaluate** — five-lens assessment: test integrity, code review, browser QA walkthrough, product evaluation, and design review. One browser session, three evaluation lenses reading the same observation data
3. **Analyse** — reads all evaluation reports, computes quality deltas, classifies root causes, decides what to do next
4. **Fix or advance** — if quality gaps exist, generate a change spec and rebuild. If the feature area passes, move to the next one. If everything passes, ship.

The loop runs until all feature areas meet the quality bar. Then it promotes to production and pings you on Slack.

## Composable decomposition

This is the core innovation. Simple products (a timer app) need no decomposition. Complex products (a fleet management system with trips, vehicles, a dashboard, maps integration, mobile view, and a trip simulator) need a completely different approach.

Rouge doesn't ask "are you building an MCP or a SaaS?" and hand you a different workflow. That's a switch statement, and switch statements don't scale.

Instead, Rouge derives a **complexity profile** from your spec. Measurements, not categories:

- How many entities share relationships across feature areas?
- How many external integrations does the product need?
- How dense is the feature dependency graph?
- Are there cross-cutting concerns?

These measurements activate **composable capabilities**:

| Capability | Activates when | What it does |
|-----------|---------------|-------------|
| Foundation cycle | Shared schema needed or integrations required | Horizontal infrastructure pass before any features |
| Dependency ordering | Dense feature graph | DAG-resolved build order |
| Integration escalation | Missing integration pattern | Hard blocks instead of silently degrading |
| Foundation evaluation | Foundation cycle ran | Structural review, not user journeys |

A timer activates nothing. Fleet management activates everything. Same system, different measurements, different capabilities.

### The capability avoidance problem

Here's why this matters. Without decomposition, Rouge builds features vertically. The trips feature stores GPS coordinates as a JSON blob. The maps feature needs PostGIS geometry. The dashboard can't aggregate geographically. Three cycles wasted on rework that was predictable from the vision.

Worse: the builder optimises for what it CAN build, not what the product NEEDS. If it doesn't have a maps integration pattern, it substitutes a table of coordinates. Every test passes. QA is green. But the product is useless.

Rouge's fix: **hard blocking**. If the product needs maps and the integration pattern doesn't exist, Rouge blocks and pings you on Slack. It doesn't substitute. It either builds the pattern autonomously (researches the API, evaluates trade-offs at different scales, creates a wrapper, writes tests) or escalates: "This product needs maps and I can't build that pattern. Here are your options."

When it does build that maps pattern, the pattern gets added to Rouge's integration catalogue. The next product that needs maps doesn't have to build it again. Every product Rouge builds makes Rouge better at building the next one.

A blocked product is better than a degraded one.

### Foundation cycles

When the complexity profile shows shared infrastructure, Rouge runs a foundation cycle before any features. This is a horizontal slice: unified data model, integration scaffolds, auth flows, shared UI components, deployment pipeline, test fixtures.

Foundation cycles get evaluated differently. No user journeys to test. Instead: does the schema support all feature areas? Do integration scaffolds work? Would any feature need to ALTER TABLE? If yes, foundation fails and retries.

### The backwards flow

Sometimes the decomposition is wrong. Rouge builds two features, gets to the third, and discovers the data model needs rework. Instead of pushing through (silent degradation), the analysing phase detects the structural issue and inserts a foundation cycle mid-flight.

This is like a startup pivot, at a smaller scale. The system goes backwards to fix the architecture, then resumes building features on solid ground. Autonomous when the restructure is bounded. Escalates to you when it isn't.

## The integration catalogue

Rouge maintains a catalogue of integration patterns at three tiers:

- **Tier 1 (Stacks)** — Language, framework, runtime. Next.js on Cloudflare, Godot, etc.
- **Tier 2 (Services)** — External services with lifecycle. Supabase, Stripe, Sentry, Counterscale.
- **Tier 3 (Integrations)** — Code patterns within services. Stripe checkout session, Supabase RLS, Sentry error boundary.

Each entry includes setup guides, env var management, free tier limits, scale considerations, and working code patterns. The catalogue ships with seed entries and **grows as Rouge builds products**. When Rouge builds an integration it doesn't have a pattern for, it writes a draft entry. After the product ships, that pattern can be contributed back.

This is how the community grows Rouge's capabilities. You launch with 15 patterns. The community builds products, contributes patterns, and within months the catalogue has hundreds. Each one was built by Rouge itself while building a real product, so the quality is practical.

## The Library

The Library is Rouge's accumulated design intelligence. Not documentation. Machine-readable context that feeds into every phase.

**Global standards** — 15 universal quality heuristics. Page load time, accessibility, error recovery, responsive design. Ship on day one.

**Domain-specific taste** — Grows per domain. Web apps have different standards than API services or games.

**Learned judgment** — Accumulated from your feedback. Phase timing calibration, quality patterns, heuristic performance. Your Rouge learns your taste.

Each heuristic has a name, a measurement method, a threshold, and a rationale. "Page load time under 2 seconds." "Core tasks complete in 3 clicks or fewer." "Primary content occupies dominant visual position." Taste encoded as testable signals.

## Getting started

```bash
git clone https://github.com/gregario/the-rouge.git
cd the-rouge
npm install
```

### Prerequisites

- **[Claude Code CLI](https://claude.ai/code)** — `claude -p` is the execution engine for every phase
- **Node.js 18+** — launcher, Slack bot, supporting scripts
- **Git** — every phase commits. Git is the audit trail
- **[GStack browse](https://github.com/garrytan/gstack)** — browser automation for evaluation phases. Screenshots, DOM analysis, Lighthouse, console errors. Required for web products. macOS only for now (Playwright fallback is on the roadmap)
- **[Slack App](docs/slack-setup.md)** — notifications and control plane. Rouge pings you when it ships, when it's blocked, when it needs feedback. You can start, pause, and monitor projects from your phone

Optional:
- **Wrangler CLI** — Cloudflare Workers deployment
- **Supabase CLI** — database, auth, storage

### Set up integrations

```bash
# Walk through integration setup (progressive, one at a time)
rouge setup supabase
rouge setup stripe

# Check what's configured
rouge secrets list
```

Secrets are stored in your OS credential store (macOS Keychain, Linux secret-service, Windows Credential Manager). Rouge never sees the values. The launcher sets env vars before spawning each phase.

### Set up Slack

```bash
rouge slack setup     # Prints step-by-step guide
rouge setup slack     # Store your Slack tokens
rouge slack start     # Start the bot
rouge slack test      # Verify it works
```

See [docs/slack-setup.md](docs/slack-setup.md) for the full setup guide.

### Build a product

```bash
rouge init my-product       # Create project directory
rouge seed my-product       # Interactive seeding (~10-20 min)
rouge build my-product      # Start the Karpathy Loop
rouge status                # Check progress
rouge cost my-product       # See cost estimate
```

## Safety

Rouge includes a safety layer (`rouge-safety-check.sh`) that validates every phase before execution. Blocked commands, deploy target restrictions, custom pre-hooks. The defaults are conservative: only staging and preview deploys allowed. Production promotion requires passing the full evaluation pipeline.

```json
{
  "safety": {
    "blocked_commands": [],
    "allowed_deploy_targets": ["staging", "preview"],
    "custom_pre_hooks": []
  }
}
```

## Economics

Rouge runs on your Claude Code subscription. Each build cycle consumes session time (roughly 10-20 minutes of model time per phase). A simple product takes a few hours of total session time across all cycles. A complex product might take a day or more spread across multiple sessions.

If you run Rouge via API keys instead of a subscription, token costs apply. Rough estimates based on calibration data:

| Product size | API cost estimate | Session time estimate |
|-------------|-------------------|----------------------|
| Small (1-3 features) | $5 to $20 | 2-4 hours |
| Medium SaaS (5-10 features) | $50 to $150 | 1-3 days |
| Large SaaS (10+ features) | $150 to $400 | 3-7 days |

Infrastructure costs (Cloudflare free tier, Supabase free tier) add nothing for small projects. Run `rouge cost <project>` for project-specific estimates.

## Built with

Rouge is built on top of these excellent open source projects:

- **[Claude Code](https://claude.ai/code)** by Anthropic — the execution engine for every phase
- **[GStack](https://github.com/garrytan/gstack)** by Garry Tan — browser automation and QA patterns that inspired Rouge's evaluation system
- **[Superpowers](https://github.com/claude-plugins-official/superpowers)** by Jesse Vincent — engineering discipline skills (TDD, code review, debugging)
- **[Excalidraw](https://excalidraw.com)** — hand-drawn diagrams
- **[Supabase](https://supabase.com)** — database, auth, and storage for products Rouge builds
- **[Cloudflare Workers](https://workers.cloudflare.com)** — deployment target for products Rouge builds

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The most valuable contributions:

**Integration catalogue entries** — New service adapters (Tier 2) or code patterns (Tier 3). Each product you build with Rouge can contribute patterns back. All contributions reviewed by maintainers before merge. This is the fastest way to expand what Rouge can build.

**Stack support** — New deployment targets, frameworks, or runtimes. Core team review required. This is how Rouge goes from "builds web apps" to "builds tech products."

**Bug reports and prompt improvements** — If Rouge produces bad output, the fix is usually in a prompt. PRs welcome.

Run `bash src/launcher/validate-contribution.sh <path>` to validate catalogue entries before submitting.

## What's next

Rouge currently builds web products on Next.js with Cloudflare and Supabase. The architecture is stack-agnostic, though. What Rouge can build at any given moment depends on what stacks and integrations are available in the catalogue. We aim to grow this catalogue over time with the help of contributions, expanding the palette of products Rouge can build as more service adapters, code patterns, and stack support are added by the community.

### Rouge Grow

Feature expansion on shipped products. Unlike Build (which creates from zero), Grow works from a known state: an existing codebase with existing users, existing data, and existing patterns that must be preserved. It reads analytics and user feedback to decide what to build next, then runs a modified loop that respects backwards compatibility.

Grow operates on products built by Rouge Build or onboarded through Rouge Embed. In both cases, it starts from a well-understood foundation.

### Rouge Maintain

Autonomous production upkeep. SBOM scanning, bug triage from Sentry error streams, dependency updates, performance regression detection, SSL renewals. No new features. Just keeping the lights on for products that are already shipped.

### Rouge Embed

Bring an existing codebase into the Rouge ecosystem. Embed works in three phases:

1. **Understanding** — Rouge analyses the existing codebase, reverse-engineers the architecture into specs, maps the dependency graph, and documents what exists.
2. **Standardisation** — Cleans up spaghetti code, decouples tightly bound modules, removes dead code, and brings the codebase to a state where it can be operated on predictably. No more mystery hooks or undocumented side effects.
3. **Handoff** — The codebase is now in a known state. Rouge Maintain can keep the lights on. Rouge Grow can add features. The product is in the loop.

These are on the roadmap. Early access will be available to [sponsors](https://github.com/sponsors/gregario) as they're built. If you're interested in contributing to any of them, [open a discussion](https://github.com/gregario/the-rouge/discussions) or reach out.

## License

[PolyForm Noncommercial 1.0.0](LICENSE)

Rouge is free for personal and non-commercial use. Personal projects, research, learning, tinkering, hobby work, education.

Commercial use (building products for clients, running a business on Rouge) is available via the [$100/month Commercial tier on GitHub Sponsors](https://github.com/sponsors/gregario).
