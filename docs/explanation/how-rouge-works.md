# How Rouge Works

> ⚠️ **Open source, experimental, runs with `--dangerously-skip-permissions`.** Rouge gives Claude Code full filesystem access. It can wipe your filesystem, force-push over your git history, and run up thousands of dollars in API charges in a single session. `budget_cap_usd`, dedicated-machine isolation, and frequent commits reduce risk but **don't guarantee** safety — bugs in the cap path and other mitigations have shipped before. Read the [README's safety section](../../README.md#safety) before starting a real build.

## The name

In 1928, Ford opened the River Rouge Complex — a factory so vertically integrated that iron ore and rubber went in one end, and finished automobiles came out the other.

Rouge is the software equivalent. A product idea goes in. A deployed, tested, monitored application comes out. No human writes code. No human triages bugs. The system builds, tests, evaluates, and ships — pausing only when it needs a product decision it cannot make itself.

## Two phases

Rouge has two phases of work, separated by a single explicit handoff.

### Seeding — from idea to plan

You tell Rouge what you want to build through the **dashboard's seeding chat**. Eight discipline-specific personas turn that conversation into a buildable plan. Each persona interrogates the idea from a different angle:

| # | Persona | Role |
|---|---------|------|
| 1 | **Brainstormer** | Expand the idea — 10-star version, emotional core, target user |
| 2 | **Competition Analyst** | Map the landscape — what exists, where's the gap |
| 3 | **Product Taster** | Challenge the idea — kill it or scope it |
| 4 | **Sizer** | Classify the project complexity (XS/S/M/L/XL) so depth scales appropriately |
| 5 | **Spec Writer** | Convert vision into feature areas with acceptance criteria |
| 6 | **Designer** | Three-pass design: architecture → components → visual system |
| 7 | **Legal Advisor** | Privacy, terms, and compliance hooks |
| 8 | **Marketing Strategist** | Positioning, landing page copy, launch strategy |
| 9 | **Technical Architect** | Stack selection, infrastructure plan, deployment target |

The human participates throughout — answering questions, making taste decisions, vetoing bad ideas. The Product Taster is a hard gate: ideas that aren't worth building die before any specs are written. The Sizer determines how deep each subsequent discipline goes — a timer app skips the seven-deep stack architecture pass; a marketplace activates everything.

The output is a **seed package**: vision document, feature area specifications with acceptance criteria, a design system, an infrastructure manifest, and a complexity profile.

### Build — from plan to product

Rouge then builds autonomously. The architecture is a [Karpathy Loop](https://github.com/karpathy/autoresearch): each phase starts fresh, reads state from disk, does one thing, saves, exits. Git is the audit trail. State on disk is the memory.

| Phase | What happens | Browser? |
|-------|-------------|:---:|
| **building** | Write code, run tests, deploy to staging | No |
| **test-integrity** | Verify all tests pass, no regressions | No |
| **code-review** | Engineering audit — architecture, dead code, security | No |
| **product-walk** | Open browser, screenshot every state, record observations | Yes |
| **evaluation** | Three lenses judge the observations (QA, Design, PO) | No |
| **analyzing** | Decide: ship, improve, or escalate | No |
| **vision-checking** | Compare the built product against the original vision | No |
| **shipping** | Promote to production, version bump, changelog, PR | No |
| **final-review** | Holistic "use it as a customer" walkthrough | Yes |

The browser opens once per cycle; all three evaluation lenses judge the same observation data. This is the **observe-once, judge-through-lenses** architecture — it keeps the lenses honest about the same evidence rather than each one running its own slightly-different walk.

The loop iterates until all feature areas meet the quality bar, then promotes to production and notifies you.

## How it judges

Rouge does not evaluate products through vibes. Every judgment is structured data with cited evidence.

**code-review** runs CLI tools: ESLint, dependency audit, duplication detection (`jscpd`), dead code analysis (`knip`), circular-dependency analysis (`madge`), and a multi-dimension AI code audit. No browser needed.

**product-walk** opens a headless browser via [GStack](https://github.com/garrytan/gstack), navigates every screen state, clicks every element, tests keyboard navigation, captures screenshots and accessibility trees. Then the browser closes.

**evaluation** reads both reports and applies three lenses against the same observations:

- **QA lens**: does the product match the spec? Acceptance criteria checked with line-cited evidence.
- **Design lens**: does it look and feel like a real product? Multi-category scores plus AI-slop detection.
- **PO lens**: will this delight customers? Journey quality, screen quality, confidence score.

Findings include closed-vocabulary confidence tags (high / medium / low / insufficient-evidence) and structured `evidence_ref` pointers (path + line range + quote) so claims can be checked against the source. Rouge's judges can output an `unknown` verdict when evidence is missing, rather than guessing.

| Tool | Purpose |
|------|---------|
| GStack | Headless Chromium — click, type, screenshot, test keyboard navigation |
| Lighthouse | Performance, accessibility, best practices, SEO |
| ESLint | Lint errors |
| jscpd | Code duplication |
| madge | Circular dependencies |
| knip | Dead code |
| npm audit | Dependency vulnerabilities |
| AI code audit | Architecture, consistency, robustness, security, tech-debt dimensions |

## Composable decomposition

This is the core innovation behind handling everything from a timer app to a fleet management SaaS. Rouge derives a **complexity profile** from your spec — measurements, not categories. How many entities share relationships? How many integrations? How dense is the dependency graph?

Those measurements activate composable capabilities:

| Capability | What it does |
|-----------|-------------|
| Adaptive depth dial | Sizing tier (XS/S/M/L/XL) scales discipline depth — timer skips deep architecture passes; marketplace activates everything |
| Foundation cycle | Horizontal infrastructure pass (schema, auth, integrations) before any features |
| Dependency ordering | DAG-resolved build order for milestones and stories |
| Integration escalation | Hard blocks on missing patterns instead of silently degrading |
| Capability check | Six-signal screen at the analyzer step — surfaces "Claude can't build this in this codebase" before another fix cycle |

**The capability avoidance problem.** Without measurement-driven decomposition, the builder optimises for what it CAN build, not what the product NEEDS. No maps pattern? It substitutes a table of coordinates. Every test passes. The product is useless. Rouge's fix: hard blocking. If maps are needed and the pattern doesn't exist, Rouge blocks and escalates. It either builds the pattern autonomously (researches the API, evaluates trade-offs, creates a wrapper) or escalates to you. When it does build that pattern, it gets added to the catalogue. The next product that needs maps doesn't start from scratch.

**The backwards flow.** Sometimes the decomposition is wrong. The analyzing phase detects the structural issue and inserts a foundation cycle mid-flight, like a startup pivot at a smaller scale.

## The integration catalogue

Three tiers of patterns that grow as Rouge builds products:

- **Tier 1 — Stacks** — language, framework, runtime (Next.js on Cloudflare, Godot, Vite + React on Vercel, etc.)
- **Tier 2 — Services** — external services with full lifecycle: Supabase, Stripe, Sentry, PostHog, Neon, Clerk, Resend, and more. Each entry has setup steps, env vars, free-tier limits, scale considerations
- **Tier 3 — Integrations** — code patterns within services (Stripe checkout session, Supabase RLS pattern, Sentry React error boundary)

The catalogue ships seeded and grows as Rouge builds. When a foundation cycle creates a new integration pattern, Rouge can draft a catalogue entry and open a PR to contribute it back.

For each MCP server (Model Context Protocol) Rouge wires in for inspection (Vercel, Supabase, GitHub, Context7 for live framework docs, etc.), the catalogue records `read_only_recommended: true` — MCPs are for inspection paths, never for state-mutating operations. Mutations always go through the launcher's intent-callback path, which the dashboard can audit.

## How Rouge stays bounded

Rouge runs with `--dangerously-skip-permissions` against your filesystem and your cloud accounts. The launcher is what keeps it from wandering. **Safety is deterministic JavaScript, not LLM judgment**:

- **Blocked commands** — a PreToolUse hook on every Bash and Write call. Blocks `rm -rf /`, `git push --force` to main, production deploys, Stripe live keys, destructive database operations, writes to safety-critical files. Provider CLIs (vercel, supabase, wrangler, gh repo create, etc.) are denied at the spawn boundary; provider operations route through structured intent callbacks the launcher executes.
- **Cost caps** — per-phase token tracking with a cumulative USD budget. The loop escalates when the cap is hit. It does not silently continue.
- **Deploy blocking** — only staging and preview deploys allowed by default. A deploy must succeed before milestone evaluation runs. Failed deploy → escalation, not stale evaluation.
- **Spin detection** — three-plus zero-delta stories, duplicate story names, or 30 minutes without meaningful progress → escalation. This is what stops overnight 12-hour spins.
- **Milestone lock** — promoted milestones are locked in the checkpoint stream. The loop cannot regress to re-build a shipped milestone, even after a crash and restart.
- **Self-improvement isolation** — Rouge can propose prompt improvements, but changes run in a git worktree with an explicit allowlist/blocklist. The running loop never modifies its own launcher, config, or evaluation rubrics. A separate boundary (GC.1) keeps Rouge from editing the instruments that judge its output.
- **Audit trail** — every tool call logged to `tools.jsonl`; every state transition checkpointed to `checkpoints.jsonl`. Both append-only.

These reduce the likelihood of accidents but cannot prevent a determined or confused model from accessing anything on the filesystem. Run on a dedicated machine, keep your work committed, and treat git as your undo button.

## Cost — what to expect

Costs depend on product complexity, evaluation cycles, and how many fix stories the loop generates. Rough ranges:

| Product size | Estimated API cost | Estimated time |
|-------------|----------|-------------|
| Small (1-3 features) | $5–20 | 2–4 hours |
| Medium SaaS (5–10 features) | $50–150 | 1–3 days |
| Large SaaS (10+ features) | $150+ | 3+ days |

Set a budget cap in `rouge.config.json` (`budget_cap_usd`) to prevent runaway costs. The loop escalates when the cap is hit. Rouge runs Opus by default for every phase except `milestone-check` (a bookkeeping step that runs on Sonnet); override per-phase via `rouge.config.json.model_overrides`.

If you run via your Claude Code subscription rather than direct API keys, each phase consumes session time instead of dollars. Budget cap behaviour is the same.

## Self-improvement

After each completed product, Rouge can review its own prompts against what worked and what didn't. Improvement proposals become GitHub issues, run in an isolated git worktree with an allowlist/blocklist, and land as PRs for human review. The running loop never modifies itself.

The boundary is sharp: Rouge can propose changes to **generation/operational** prompts (build, fix, document, ship), but cannot edit the **measurement instruments** — the rubrics, schemas, gold-sets, and reviewer agents that judge its output. This prevents the boiling-frog drift where sequences of individually-defensible edits soften the instrument until real failures stop being caught. See `CLAUDE.md` § "Judge / pipeline boundary" for the enforced file list.

## Where this fits

Rouge is the local-first, single-developer entry point. You run it on your machine; it builds products you own. It pairs well with longer-form Claude Code work (when you take the wheel manually) and with the Anthropic API directly (when you want to build something Rouge isn't shaped for).

The architecture is stack-agnostic. What Rouge can build at any given moment depends on what's in the catalogue, and that surface grows with every product shipped and every community contribution.

---

The goal: describe a product, approve a cost cap, come back to a deployed, monitored, working application.

Rouge handles everything between the idea and the first user.
