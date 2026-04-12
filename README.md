# The Rouge

<p align="center">
  <a href="https://www.npmjs.com/package/the-rouge"><img src="https://img.shields.io/npm/v/the-rouge.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/the-rouge"><img src="https://img.shields.io/npm/dm/the-rouge.svg" alt="npm downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-PolyForm%20NC-blue.svg" alt="PolyForm Noncommercial"></a>
  <a href="https://github.com/sponsors/gregario"><img src="https://img.shields.io/badge/sponsor-♥-ea4aaa.svg" alt="Sponsor"></a>
</p>

In 1928, Ford opened the River Rouge Complex. Iron ore went in one end. Finished cars came out the other. Raw materials to finished product, under one roof.

Rouge is the software version. A product idea goes in. A deployed, tested, monitored application comes out.

Not one-shot code generation. Iterative product development: build, evaluate against external signals, fix, repeat until the quality bar is met. The same loop a good engineering team runs, except it runs overnight while you sleep.

## Quick start

```bash
npm install -g the-rouge

rouge init my-product
rouge seed my-product
rouge build my-product
rouge status
```

> **Experimental. Full filesystem access.** Rouge runs `claude -p --dangerously-skip-permissions` — Claude Code with no permission checks, no workspace boundaries, and full read/write access to your entire machine. It deploys to real infrastructure, makes real git commits, and manages real cloud resources (Vercel, Supabase, GitHub).
>
> **Recommended:** run Rouge on a dedicated machine, VM, or user account — not a machine with sensitive personal data. Rouge includes safety hooks (`rouge-safety-check.sh`) that block some destructive patterns, and prompt-level isolation rules that instruct the model not to touch other projects' infrastructure. These are **convention, not security boundaries** — they reduce the likelihood of accidents but cannot prevent a determined or confused model from accessing anything on the filesystem.
>
> It will not, to our knowledge, sell your grandmother. Use at your own risk.

## How it works

<p align="center">
  <img src="docs/diagrams/rouge-v3-process-map-gen2.png" alt="V3 Process Map: Rouge Spec (8 disciplines) → Foundation → Story Building Loop (with safety layer) → Ship + Self-Improvement" width="720">
</p>

Inspired by [Karpathy's AutoResearch](https://github.com/karpathy/autoresearch). No long-running process. Each phase starts fresh, reads state from the filesystem, does one thing, saves, and exits. Git is the audit trail. The loop iterates as many times as it needs to. There's no fixed limit. It's done when it's done.

**Seed** — you describe the product. Eight discipline-specific personas run through it (brainstorming, competition, taste, spec, infrastructure, design, legal, marketing). About 10-20 minutes of your time. Then it's autonomous. [See a full seeding example.](docs/seeding-example.md)

**Build** — reads specs, writes code with TDD, deploys to staging. All work happens on a single branch with milestone tags per shipped feature area — no branch-per-story sprawl. State is tracked via a dual ledger: `task_ledger.json` for task tracking and `checkpoints.jsonl` for immutable cycle history.

**Evaluate** — five-lens assessment: test integrity, code review, browser QA, product evaluation, design review. One browser session, three evaluation lenses reading the same observation data. All evaluation prompts write output to `cycle_context.json` only — they never mutate the task ledger or project state directly. A strict I/O contract keeps evaluation data readable by the analyse phase without side-effects.

**Analyse** — reads all reports, classifies root causes, decides: fix, advance to the next feature, restructure the architecture, or ship.

The loop runs until all feature areas meet the quality bar. Then it promotes to production and notifies you via the dashboard (or Slack, if configured).

**Self-improvement** — after each completed product, Rouge reviews its own prompts against what worked and what didn't. Improvement proposals become GitHub issues, run in an isolated git worktree with an allowlist/blocklist, and land as PRs for human review. The running loop never modifies itself.

**Linked projects** — products can depend on each other. A fleet manager that needs a maps API triggers the maps project to be built first. The project registry tracks what's shipped and what each project provides. Circular dependencies are detected at seed time.

## Composable decomposition

This is the core innovation. A timer app needs no decomposition. A fleet management system with trips, vehicles, a dashboard, maps, and a trip simulator needs a completely different approach.

Rouge derives a **complexity profile** from your spec. Measurements, not categories. How many entities share relationships? How many integrations? How dense is the dependency graph? These measurements activate composable capabilities:

| Capability | What it does |
|-----------|-------------|
| Foundation cycle | Horizontal infrastructure pass (schema, auth, integrations) before any features |
| Dependency ordering | DAG-resolved build order for milestones and stories. Linked project dependencies resolved at seed time — if Product B needs Product A, Rouge builds A first |
| Integration escalation | Hard blocks on missing patterns instead of silently degrading |
| Foundation evaluation | Structural review (schema completeness), not user journeys |
| Infrastructure discipline | Eighth seeding discipline: resolves database vs deploy target compatibility, auth strategy, data source viability, and known-bad technology combinations at spec time — before the loop starts building. Outputs `infrastructure_manifest.json` that the foundation phase executes without re-deciding |

A timer app produces a trivial infrastructure manifest and a single milestone. A fleet management SaaS activates everything: foundation cycles, multi-milestone dependency ordering, integration escalation, linked project resolution. Same system, different measurements.

**The capability avoidance problem.** Without this, the builder optimises for what it CAN build, not what the product NEEDS. No maps pattern? It substitutes a table of coordinates. Every test passes. The product is useless. Rouge's fix: hard blocking. If maps are needed and the pattern doesn't exist, Rouge blocks and pings you on Slack. It either builds the pattern autonomously (researches the API, evaluates scale trade-offs, creates a wrapper) or escalates. When it does build that pattern, it gets added to the catalogue. The next product that needs maps doesn't start from scratch.

**The backwards flow.** Sometimes the decomposition is wrong. The analysing phase detects the structural issue and inserts a foundation cycle mid-flight, like a startup pivot at a smaller scale. Autonomous when bounded. Escalates when it isn't.

## The integration catalogue

Three tiers of patterns that grow as Rouge builds products:

- **Stacks** — language, framework, runtime (Next.js on Cloudflare, Godot, etc.)
- **Services** — external services with lifecycle (Supabase, Stripe, Sentry, Counterscale)
- **Integrations** — code patterns within services (Stripe checkout, Supabase RLS, Sentry error boundary)

Each entry has setup guides, env vars, free tier limits, scale considerations, and working code. The catalogue ships with seed entries and grows as Rouge builds products. When a foundation cycle creates a new integration pattern, Rouge automatically drafts a catalogue entry and opens a PR to contribute it back. Every product Rouge builds potentially makes Rouge better at building the next one.

## The Library

Rouge's accumulated design intelligence. Not documentation. Machine-readable context that feeds into every phase.

- **Global standards** — 15 universal quality heuristics (page load, accessibility, error recovery)
- **Domain-specific taste** — grows per domain (web apps, APIs, games)
- **Learned judgment** — accumulated from your feedback. Your Rouge learns your taste.

Taste encoded as testable signals: "page load under 2 seconds," "core tasks in 3 clicks or fewer," "primary content in dominant visual position."

## Economics

Rouge runs on your Claude Code subscription. Each phase consumes session time (roughly 10-20 minutes of model time). A simple product takes a few hours. A complex product might take a day or more across sessions.

Rouge uses per-phase model selection: Opus for reasoning-heavy phases (analyse, architecture, backwards flow), Sonnet for mechanical phases (formatting, catalogue entry drafting, status updates). In practice this delivers a 40-50% cost reduction versus running everything on Opus.

If you run via API keys, token costs apply. These are rough estimates — actual costs depend on product complexity, evaluation cycles, and how many fix stories the loop generates:

| Product size | Estimated API cost | Estimated time |
|-------------|----------|-------------|
| Small (1-3 features) | $5-20 | 2-4 hours |
| Medium SaaS (5-10 features) | $50-150 | 1-3 days |
| Large SaaS (10+ features) | $150+ | 3+ days |

Set a budget cap in `rouge.config.json` (`budget_cap_usd`) to prevent runaway costs. The loop escalates when the cap is hit. Infrastructure (Cloudflare free tier, Supabase free tier) adds nothing for small projects. Run `rouge cost <project>` for a live estimate.

## Built with

- **[AI Factory](https://github.com/gregario/AI-Factory)** by Greg Jackson — the factory that built Rouge
- **[GStack](https://github.com/garrytan/gstack)** by Garry Tan — Rouge uses GStack's headless browser for milestone evaluation, product walks, and QA
- **[Superpowers](https://github.com/claude-plugins-official/superpowers)** by Jesse Vincent — engineering discipline skills
- **[OpenSpec](https://github.com/openspecio/openspec)** — product specification and task management
- **[Excalidraw](https://excalidraw.com)** — hand-drawn diagrams
- **[Supabase](https://supabase.com)** — database, auth, and storage for products Rouge builds
- **[Cloudflare Workers](https://workers.cloudflare.com)** — deployment target for products Rouge builds

## Getting started (detailed)

```bash
npm install -g the-rouge
```

Or clone from source:
```bash
git clone https://github.com/gregario/the-rouge.git
cd the-rouge && npm install
```

### Prerequisites

- **Claude Code CLI** — the execution engine for every phase
  ```bash
  npm install -g @anthropic-ai/claude-code
  ```
  Requires a [Claude subscription](https://claude.ai/code) (Pro or Max). Verify: `claude --version`
- **Node.js 18+** — launcher, dashboard, scripts
- **Git** — every phase commits
- **[GStack](https://github.com/garrytan/gstack)** — required for web product evaluation (browser QA, product walk, design review). Install: `git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup`. Verify: `rouge doctor`

Optional:
- **Wrangler CLI** — Cloudflare Workers deployment
- **Supabase CLI** — database, auth, storage
- **Vercel CLI** — Vercel deployment

Run `rouge doctor` to verify all prerequisites are installed.

### First-time setup

```bash
rouge setup                 # Install dashboard, check prerequisites, create dirs
```

This runs `rouge doctor`, installs the dashboard, and prepares the projects directory. Everything else is optional.

### Start the dashboard

```bash
rouge dashboard start       # Background mode (persistent, survives terminal close)
rouge dashboard status      # Check if running
rouge dashboard stop        # Stop background processes
rouge dashboard             # Foreground mode (dev, Ctrl+C to stop)
```

The dashboard is the primary control plane: real-time project visibility, escalation responses, build logs, milestone progress, and seeding sessions. It runs a bridge server (port 3002) that reads live project state.

### Set up integrations

```bash
rouge setup supabase
rouge setup stripe
rouge secrets list
```

Secrets stored in your OS credential store (macOS Keychain, Linux secret-service, Windows Credential Manager). Rouge never sees the values.

### Alternative: Slack control plane (experimental)

For teams that already live in Slack, Rouge can send notifications and accept commands via a Slack bot. The Slack integration is functional but secondary to the dashboard — the dashboard provides richer visibility and doesn't require external tokens.

```bash
rouge slack setup     # Prints step-by-step guide
rouge setup slack     # Store tokens (3 required: bot, app, webhook)
rouge slack start     # Start the bot
rouge slack test      # Verify
```

See [docs/slack-setup.md](docs/slack-setup.md) for the full guide.

> **Note:** The dashboard and Slack bot should not run simultaneously for the same project — they both write to `state.json` and can race. Use `rouge.config.json` `control_plane` field (`"frontend"` or `"slack"`) to choose one. Dashboard is the default.

### Build a product

```bash
rouge init my-product
rouge seed my-product       # Interactive seeding (~10-20 min)
rouge build my-product      # Start the autonomous loop
rouge status                # Check progress
rouge cost my-product       # See cost estimate
```

## Safety

**Safety is deterministic JavaScript, not LLM judgment.** Every safety mechanism is enforced in the launcher — pure code that cannot be hallucinated away, argued with, or forgotten by a prompt. The LLM builds; the launcher constrains.

- **Blocked commands** — `rouge-safety-check.sh` runs as a PreToolUse hook on every Bash and Write call. Blocks `rm -rf /`, `git push --force` to main, production deploys, Stripe live keys, destructive database operations, and writes to safety-critical files
- **Deploy blocking** — only staging and preview deploys allowed by default. Deploy must succeed (with 3 retries) before milestone evaluation runs. Failed deploy → escalation, not stale evaluation
- **Cost caps** — per-phase token tracking with cumulative USD budget. The loop escalates when the cap is hit — it does not silently continue
- **Spin detection** — 3+ zero-delta stories, duplicate story names, or 30 minutes without meaningful progress → escalation. This is what prevented the V2 overnight 12-hour spin
- **Milestone lock** — promoted milestones are locked in the checkpoint stream. The loop cannot regress to re-build a shipped milestone, even after a crash and restart
- **Story deduplication** — stories completed in earlier milestones are skipped, not re-executed
- **Audit trail** — every tool call logged to `tools.jsonl`; every state transition checkpointed to `checkpoints.jsonl`. Both append-only
- **Self-improvement isolation** — Rouge can propose prompt improvements, but changes run in a git worktree with an allowlist/blocklist. The running loop never modifies its own launcher, config, or safety hooks

> [!CAUTION]
> Rouge runs with `--dangerously-skip-permissions` (Claude Code's YOLO mode). The safety hooks above cover known-dangerous patterns, but they are not comprehensive filesystem protection. Rouge can read, write, and execute arbitrary commands within the project directory. Run it on a machine you're comfortable giving that level of access to, and keep your work committed. Git is your undo button.

For common issues, see [troubleshooting](docs/troubleshooting.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

**Integration catalogue entries** — service adapters (Tier 2) or code patterns (Tier 3). Each product you build with Rouge can contribute patterns back. All contributions reviewed by maintainers. This is the fastest way to expand what Rouge can build.

**Stack support** — new deployment targets, frameworks, runtimes. This is how Rouge goes from "builds web apps" to "builds tech products."

**Bug reports and prompt improvements** — if Rouge produces bad output, the fix is usually in a prompt. PRs welcome.

## What's next

Rouge builds products. The architecture is stack-agnostic — what it can build depends on what stacks and integrations are in the catalogue, and that surface grows with every product shipped and every community contribution.

Current priorities:
- **More stacks** — Vercel, Docker Compose, additional database providers, framework support beyond Next.js
- **Dashboard polish** — the dashboard ships as the primary control plane; next steps are live SSE event streaming and the onboarding wizard
- **Community patterns** — every product Rouge builds can contribute integration patterns back to the catalogue, making Rouge better at building the next one

**The Works** — a business operating system that extends Rouge's rigour to the full product lifecycle (marketing, legal, finance, growth, maintenance, operations) — is in development. Early access for [sponsors](https://github.com/sponsors/gregario).

## License

[PolyForm Noncommercial 1.0.0](LICENSE)

Free for personal and non-commercial use. Personal projects, research, learning, tinkering, hobby work, education.

Commercial use available via the [$100/month Commercial tier on GitHub Sponsors](https://github.com/sponsors/gregario).
