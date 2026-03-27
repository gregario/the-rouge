## Why

AI product factories produce technically functional but shallow products. The AI optimizes for session-completable scope, nothing evaluates product quality beyond "does it crash," and no learning accumulates between projects. The human becomes the bottleneck — spending hours reviewing and directing every session. The Rouge solves this by adding an autonomous iteration loop with external quality signals and accumulated design intelligence, enabling a solo founder to ship 2-3 production-quality products per week with under 2 hours total review time.

## What Changes

- Adds an autonomous outer loop (The Rouge/Runner) that manages state across sessions, evaluates product quality against a vision document and measurable standards, and iterates until a production bar is met
- Adds a persistent knowledge store (The Library) with three tiers: global product standards (seeded day one), domain-specific taste (web, games, artifacts), and learned judgment from human feedback
- Introduces a seeding phase where the human interactively defines vision, product standards, and seed spec through a non-linear swarm of brainstorming, product taste, OpenSpec, and design
- Adds an evaluation system grounded in external signals: browser QA, Lighthouse/performance metrics, spec-completeness checking, and pairwise comparison against reference products
- Adds a notification system (Slack) for when the system has something ready or needs a pivot decision
- Adds a feedback ingestion system that translates human feedback into change specs (per-product) and Library updates (cross-project), tagged as global vs genre-specific
- Adds a vision-check phase that periodically re-evaluates the product against the original vision and can autonomously expand scope or flag for pivot
- Establishes the AI Factory as a worker (Studio) that receives scoped briefs and builds products

## Capabilities

### New Capabilities
- `runner`: The outer loop orchestrator — manages state, controls the build-evaluate-iterate cycle, decides when to deepen vs broaden, handles notification and pivot detection
- `library`: Persistent knowledge store — global standards, domain taste, personal taste fingerprint, feedback ingestion, functional/non-functional separation
- `evaluator`: Quality evaluation system — criteria checking against vision, product sense checking via automated user journey testing, external signal aggregation (QA, Lighthouse, spec-completeness, pairwise comparison)
- `seeder`: Interactive project seeding — non-linear swarm through brainstorming, product taste, OpenSpec, and design to produce vision document, product standard, and seed spec
- `notifier`: Human communication — Slack notifications for ready products, morning briefings, pivot requests, feedback ingestion from voice/text

### Modified Capabilities

## Impact

- New project repository (The-Rouge) as a standalone system
- Claude Code skills provide the build worker (Studio layer)
- Requires Slack integration for notifications
- Requires persistent state management across sessions (vision documents, Library data, loop state)
- Requires browser QA and Lighthouse tooling for evaluation signals
- Token usage will increase significantly (autonomous multi-hour/multi-day loops)
- The Library introduces a new data layer that persists across all projects

### Architecture Update (2026-03-17)

Following an architecture exploration session, the execution model has been refined:

- **Karpathy Loop pattern:** Each state machine phase runs as a separate, short-lived `claude -p` invocation. No long-running process. State on disk. Node.js launcher manages the loop.
- **V1 on subscription:** Uses Claude Code subscription auth (`claude -p` with cached OAuth). ~12x cheaper than API. V2 migrates to API key for cloud deployment.
- **Multi-project round-robin:** Launcher iterates through all projects, one phase per project per loop. Supports parallel product development.
- **Supabase 2-slot rotation:** Free tier manages 2 active projects via pause/unpause. Data preserved. No cost.
- **Swarming only during seeding:** Autonomous phases use tight loops, not back-and-forth swarming.
- **Model selection per phase:** Opus for thinking, Sonnet for commodity phases.
- **All tooling confirmed autonomous:** Supabase CLI, Wrangler CLI, GStack browse, ESLint, jscpd, madge, c8, knip, Lighthouse, Slack Bot+Socket Mode, Stripe CLI.
- **Saturday demo deferred from V1.**

Full architecture: `docs/architecture.md`
Tooling research: `docs/research/2026-03-17-tooling-autonomy-report.md`
