# The Rouge — Technical Architecture

> ⚠️ **V2 document retained as architectural record.** This describes the V2 state machine (qa-gate, po-reviewing, feature_areas, etc). V3 replaced those states with a richer evaluation sub-phase chain (02a test-integrity → 02c code-review → 02d product-walk → 02e evaluation), dual-ledger task tracking (`task_ledger.json` + `checkpoints.jsonl`), and dashboard-first onboarding. Cross-reference `src/launcher/rouge-loop.js` `STATE_TO_PROMPT` for the live state map and `CLAUDE.md` for the current loop-phase contract. This doc is NOT updated as the state machine evolves; treat it as an explanatory snapshot of the original design.

**Date:** 2026-03-17
**Status:** Approved (explore session complete, pending spec update)
**Supersedes:** Original spec assumptions about a traditional software runtime

## One-Liner

The Rouge is a Karpathy Loop of Claude Code invocations with state on disk, not a traditional long-running application.

## Core Insight

The Rouge doesn't fight the context window — it embraces ephemerality. Each phase starts fresh, reads state from disk, does one thing, saves, exits. The filesystem IS the memory. Git IS the audit trail. The launcher is ~50 lines of bash.

Inspired by Karpathy's AutoResearch: tight feedback loops, external evaluation metric, autonomous iteration. Each iteration is self-contained. No session chaining, no context management, no complex runtime.

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│  Persistent Machine (thin client, Mac, or cloud VM)          │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  rouge-loop.js (Node.js launcher)                       │  │
│  │                                                        │  │
│  │  for each project in projects/*/; do                   │  │
│  │    state = read state.json                             │  │
│  │    if waiting-for-human: check feedback queue, skip    │  │
│  │    if complete: skip                                   │  │
│  │    else: claude -p --project $dir "execute $state"     │  │
│  │  done                                                  │  │
│  │  sleep 30                                              │  │
│  │  repeat                                                │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Slack Bot    │  │ Project dirs │  │ Library          │   │
│  │ (Bolt.js,   │  │ (state +     │  │ (heuristic files │   │
│  │  ~50 lines) │  │  context)    │  │  on disk)        │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

## Components

### 1. The Launcher (`rouge-loop.js`)

A Node.js script that is the entire "runtime" of The Rouge. It:
- Iterates through all project directories
- Reads `state.json` for each project
- Skips paused/complete projects
- Spawns `claude -p` for the active phase
- Handles rate limiting (wait and retry)
- Handles errors (log and continue)
- Runs forever in a tmux/screen session

**Multi-project support:** Round-robin. Each project gets one phase per loop iteration. Projects in `waiting-for-human` state are skipped until feedback arrives.

**Model selection per phase:** The launcher can pass `--model` to claude:
- Opus for thinking phases: building, po-reviewing, analyzing, change-spec generation, vision-checking
- Sonnet for commodity phases: test-integrity, qa-gate, promoting, rolling-back

### 2. State Files (JSON on disk)

Every phase reads and writes these files. They are the shared context.

**`state.json`** — The state machine position:
```json
{
  "current_state": "qa-gate",
  "cycle_number": 3,
  "feature_areas": [
    { "name": "trip-history", "status": "in-progress" },
    { "name": "vehicle-management", "status": "pending" }
  ],
  "current_feature_area": "trip-history",
  "confidence_history": [0.65, 0.72, 0.78],
  "qa_fix_attempts": 0,
  "po_review_cycles": 1,
  "timestamp": "2026-03-18T03:45:00Z"
}
```

**`cycle_context.json`** — The shared workspace:
- Vision document (full, not summarized)
- Product standard
- Active spec (seed or change spec)
- Library heuristics (applicable set)
- Previous evaluation reports (full)
- Factory decisions and questions
- Evaluator observations
- Runner analysis
- Evaluation deltas
- Journey log
- Staging/production URLs

**`journey.json`** — History of all loops across the product's lifetime.

**`library/`** — Heuristic files:
- `library/global/` — Global standards (seeded day one)
- `library/domain/web/` — Web-specific taste
- `library/personal/` — Personal taste fingerprint
- Version history tracked by git (no separate history directory needed)

### 3. Skills (Prompt Templates)

Each state in the state machine maps to a skill that Claude Code executes. These are the "intelligence" of The Rouge.

| State | Skill | Model | What it does |
|-------|-------|-------|-------------|
| `seeding` | rouge-seed | Opus | Interactive swarm (human present). Produces vision, product standard, seed spec. |
| `ready` | (paused) | — | Seeding complete, awaiting explicit "rouge start" trigger. |
| `building` | rouge-build | Opus | Invokes Factory (superpowers). Reads specs, writes code, deploys to staging. |
| `test-integrity` | rouge-test-integrity | Sonnet | Verifies tests match current spec. Generates missing, removes orphans. |
| `qa-gate` | rouge-qa | Sonnet | Browser QA against staging URL. Spec criteria + functional correctness. |
| `qa-fixing` | rouge-qa-fix | Opus | Reads QA failures, fixes bugs in existing code. Redeploys to staging. |
| `po-reviewing` | rouge-po-review | Opus | Mechanical quality checks. Journey, screen, interaction, heuristic, reference comparison. |
| `analyzing` | rouge-analyze | Opus | Reads PO report, computes delta, decides: continue/deepen/broaden/rollback/notify. |
| `generating-change-spec` | rouge-change-spec | Opus | Translates quality gaps into new specs for the Factory. |
| `vision-checking` | rouge-vision-check | Opus | Holistic re-evaluation against original vision. |
| `promoting` | rouge-promote | Sonnet | Merges PR, promotes staging to production. |
| `rolling-back` | rouge-rollback | Sonnet | Closes PR, reverts staging, preserves learnings. |
| `waiting-for-human` | (paused) | — | Launcher checks for feedback file. No Claude invocation. |
| `complete` | rouge-notify | Sonnet | Sends Slack notification. Product ready for review. |

Skills are NOT interactive (except seeding). They receive full context via cycle_context.json and make decisions autonomously, logging their reasoning to `factory_decisions` or `runner_analysis`.

### 4. Slack Bot

A small Node.js process (~50 lines, Bolt.js + Socket Mode) that runs alongside the launcher.

**Three interaction modes:**
1. **Control plane:** "rouge start/pause/resume/status" → state.json transitions. Direct project lifecycle management from Slack (or your phone).
2. **Interactive seeding:** "rouge new X" → full seeding swarm conversation via Slack. Seed from your phone. Messages relayed bidirectionally between Slack and a Claude Code seeding session. Timeout after 2 hours of inactivity saves state; resume with "rouge seed {name}".
3. **Feedback during loops:** Reply to notifications → feedback.json → launcher picks up on next iteration.

**Sending:** Structured Block Kit messages via `chat.postMessage`.
**Receiving:** Socket Mode WebSocket listener. Writes feedback to `projects/<name>/feedback.json`.
**Hybrid option:** Use webhooks for sending (just `curl` from skills) and Socket Mode only for receiving.

Setup: Free Slack workspace, one custom app, Socket Mode enabled, ~15 min.

### 5. Git

Every phase commits its changes. Git is the audit trail.
- Branch-per-loop: `rouge/loop-{N}-{feature-area}`
- PR-per-loop: structured description with evaluation results
- Merge on promotion, close on rollback
- Library version history = git log of library/ directory

## Tooling Map

### Confirmed Autonomous (CLI, no human interaction needed)

| Category | Tool | Method |
|----------|------|--------|
| **Code generation** | Claude Code | Native (file read/write/edit) |
| **Testing** | Vitest/Jest | CLI: `npx vitest run` |
| **Build** | Bun/npm | CLI: `bun build` / `npm run build` |
| **Database: create project** | Supabase CLI | `supabase projects create "name" --org-id X --db-password Y --region Z` |
| **Database: get keys** | Supabase CLI | `supabase projects api-keys --project-ref X -o json` |
| **Database: migrations** | Supabase CLI | `supabase db push` |
| **Database: edge functions** | Supabase CLI | `supabase functions deploy` |
| **Database: operations** | Supabase MCP | `execute_sql`, `apply_migration`, etc. (per-project, already configured) |
| **Deploy: create + deploy** | Wrangler CLI | `wrangler deploy` (Workers with Static Assets, not deprecated Pages) |
| **Deploy: staging** | Wrangler CLI | `--branch=staging` → `staging.project.pages.dev` |
| **Deploy: production** | Wrangler CLI | `--branch=main` |
| **Deploy: get URL** | Wrangler CLI | Printed to stdout; `--format json` for structured output |
| **Browser: navigation** | GStack browse | `browse goto URL` (V1 Mac), Playwright CLI (V2 Linux/Docker) |
| **Browser: screenshots** | GStack browse | `browse screenshot path.png` |
| **Browser: DOM analysis** | GStack browse | `browse js "..."`, `browse css sel prop` |
| **Browser: interaction** | GStack browse | `browse click @e1`, `browse fill @e2 "val"` |
| **Browser: console errors** | GStack browse | `browse console --errors` |
| **Performance: Lighthouse** | Lighthouse CLI | `npx lighthouse URL --output=json --chrome-flags="--headless=new"` |
| **Code quality: complexity** | ESLint | `eslint . --format json` (complexity rule) |
| **Code quality: duplication** | jscpd | `npx jscpd src/ --min-lines 6 --reporters json --threshold 5` |
| **Code quality: dependencies** | madge | `npx madge --circular src/` (exit 1 if circular) |
| **Code quality: coverage** | c8 / Vitest | `npx c8 --reporter=json-summary --check-coverage` |
| **Code quality: dead code** | knip | `npx knip --reporter json` |
| **Git** | git + gh CLI | Branches, commits, PRs, merges |
| **Slack: send** | Webhook / Bolt.js | `curl` or `chat.postMessage` with Block Kit |
| **Slack: receive** | Bolt.js Socket Mode | WebSocket listener, writes to feedback.json |
| **Payments: testing** | Stripe CLI | Test mode, test API keys, test card numbers |

### Auth Requirements (one-time setup)

| Service | Auth Method | Setup |
|---------|-------------|-------|
| Claude Code | OAuth (subscription) | `claude login` once on the machine. Cached in `~/.claude/` |
| Supabase | Personal Access Token | `supabase login` once, or set `SUPABASE_ACCESS_TOKEN` env var |
| Cloudflare | API Token | Set `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` env vars |
| Slack | Bot + App tokens | Create Slack App, get `SLACK_BOT_TOKEN` + `SLACK_APP_TOKEN` |
| Stripe | Test API key | Set `STRIPE_SECRET_KEY` (test mode) env var |
| GitHub | gh CLI | `gh auth login` once. Cached. |

### Token Efficiency Decisions

| Approach | Tokens/task | Decision |
|----------|-------------|----------|
| GStack browse CLI | Lowest | **Use for V1** (Mac). Plain text output, persistent daemon. |
| Playwright CLI | ~27,000 | **Use for V2** (Linux/Docker). CLI-level efficiency. |
| Playwright MCP | ~114,000 | **Do not use.** 4x more expensive. MCP schema overhead. |
| Supabase MCP | Moderate | **Use for existing project operations** (already configured). Use CLI for project creation. |

## Environment Management Principles

### Supabase Free Tier (2 active project slots)

The free tier allows 2 active projects. Paused projects don't count. Data is preserved when paused (90-day restore window). This is the only resource constraint The Rouge needs to actively manage.

**Slot management:**
- The launcher tracks which Supabase projects are active vs paused
- 2 slots = 2 products being actively worked on in parallel (both by The Rouge, or one by Rouge + one under human review)
- When The Rouge needs a slot for a new/returning product:
  1. Check active count via Management API
  2. If at limit: pause the least-recently-active project (`POST /v1/projects/{ref}/pause`)
  3. Unpause the needed project or create a new one
  4. Log the swap in the journey log
- Products under human review hold their slot until feedback arrives. This is fine — it naturally throttles The Rouge to 2 concurrent products.
- When iterating on a previously-paused product: unpause it (data intact), pause another if needed.
- Free tier auto-pauses after 7 days of inactivity — this HELPS by auto-cleaning forgotten staging environments.

**No local Docker needed.** The pause/unpause pattern means there's always a real Supabase instance available. No need for local Docker + frontend integration complexity.

**Upgrade path:** Move to Pro ($25/mo per org) only when products generate revenue. Pro removes auto-pause and adds capacity, but each additional project costs ~$10/mo compute.

**Not every product needs Supabase.** Static sites, CLI tools, and MCP servers don't need a database. The Rouge should detect from the project type/stack whether database provisioning is required.

### Cloudflare (unlimited free, no constraint)

- Unlimited sites, unlimited bandwidth on free tier
- Only limit: 500 builds/month (plenty for The Rouge's cycle rate)
- No slot management needed
- Staging deployments are free and can stay up indefinitely

### General Principle

**Build → Test → Ship → Pause staging.** Don't leave Supabase projects running indefinitely. The Rouge tracks environment lifecycle and rotates slots automatically. Cloudflare has no such constraint.

## V1 → V2 Migration Path

| Aspect | V1 (now) | V2 (later) |
|--------|----------|------------|
| **Machine** | Your Mac or Linux thin client | Docker on cloud VM (Oracle free tier / EC2) |
| **Auth** | Subscription (OAuth, cached) | API key (`ANTHROPIC_API_KEY`) |
| **Browser** | GStack browse (macOS ARM binary) | Playwright CLI in Docker image |
| **Cost** | €100/month subscription | API costs (~$50-200/day depending on volume) |
| **Autonomy** | Semi (leave machine running, restart if session dies) | Full (Docker restart policy, runs indefinitely) |
| **Same code?** | Yes — same launcher, same skills, same state files | Yes — only auth method and browser tool change |

## Design Influences

The Rouge's phase prompts evolved from prior tooling and workflows:

- **Engineering execution:** TDD, subagent-driven development, systematic debugging.
- **Spec generation:** Rewritten for production depth. "Comprehensive" replaces "concise 1-2 pages."
- **Brainstorming:** Rewritten with depth mode — explores without premature narrowing.
- **Design Mode:** Produces structured/parseable artifacts (YAML/JSON, not prose).
- **Product Taste:** Multi-invocation premise challenge, adapted for seeding swarm.
- **QA:** Extended with code quality baselines, architecture integrity, test integrity gate.
- **New phases:** PO Review, Seeding Swarm, Runner Loop, Vision Check, Evaluation Orchestrator.

The full phase prompt audit is in `openspec/changes/autonomous-product-loop/tasks.md` (task group 0a).

## Swarming vs. Tight Loops

**Swarming (back-and-forth between disciplines):** Kept for seeding only. Interactive, human present. Brainstorming ↔ taste ↔ spec ↔ design challenge each other.

**Autonomous phases:** Use tight Karpathy loops instead of swarming. If QA finds something → state transition → fix → QA again. Each iteration is a clean pass, not a negotiation. More loops, less deliberation per loop. Converges anyway.

## The Library's Relationship to LLM-as-Judge Evals

The LLM-as-judge eval pattern (testable assertions scored against a standard) is the same pattern as The Library's heuristic evaluation. The Library is the evolution of that concept, applied to products:

- Skill evals: "Did this skill produce the right output?" → Score 0-10
- The Library: "Does this product meet production quality?" → Heuristic pass/fail with evidence

The eval infrastructure (test runners, scoring persistence, comparison tools) informs The Library's implementation.

## Decomposition Innovation

The loop uses composable capabilities that activate based on product complexity measurements, not product categories. Six capabilities:

1. **Foundation cycle** — horizontal infrastructure before vertical features
2. **Dependency ordering** — DAG-resolved build order for feature areas
3. **Parallel building** — independent modules via worktrees (deferred)
4. **Integration pass** — cross-cutting concerns after features
5. **Integration escalation** — hard-block on missing patterns, never silently degrade
6. **Foundation evaluation** — structural review, not user journeys

The complexity profile is derived from spec analysis (entities, integrations, dependency graph density, cross-cutting concerns). The building phase detects the profile and activates capabilities. The analyzing phase can insert foundation cycles mid-flight when it discovers the decomposition was wrong (Scale 2 pivots).

### Foundation Cycle in the State Machine

When a product's complexity profile warrants it, the launcher sets `state.foundation.status = 'pending'` and the cycle follows a modified flow with distinct `foundation-building` and `foundation-evaluating` states:

```
seeding → [complexity profile detected] → foundation-building → foundation-evaluating → analyzing
                                              ↑                                            |
                                              └────── insert-foundation (if needed) ───────┘
                                                                                           |
                                                                                           ↓
                                                                          building (feature) → normal flow...
```

State machine states for foundation cycles:
- `foundation-building` — builds horizontal infrastructure (schema, integrations, auth, UI shell)
- `foundation-evaluating` — structural review of foundation (not user journeys)

These are distinct from the feature-cycle states (`building`, `evaluation`). The `state.foundation` object tracks:
- `status`: `'pending'` | `'in-progress'` | `'complete'`
- `scope`: array of infrastructure items to build

Foundation cycles use `rouge-foundation-build` (horizontal infrastructure) and `rouge-foundation-evaluate` (structural review) instead of the standard building and QA phases. The analyzing phase can insert additional foundation cycles via `insert-foundation` factory decisions when it discovers missing infrastructure mid-flight.

See `docs/design/decomposition-complete-vision.md` for the full design.

## Open Questions for Future Sessions

1. **GStack browse on Linux:** Need to verify if a Linux build exists or if V1 needs Playwright CLI from the start.
2. **Cloudflare Workers vs Pages:** Pages is deprecated. Architecture assumes Workers with Static Assets. Need to validate the `wrangler deploy` flow for static sites.
3. **OAuth credential longevity on thin client:** How long do cached Claude Code credentials last? Need to test on the actual machine.
4. **Stripe integration depth:** CLI confirmed autonomous, but test flow (create product, create checkout, complete with test card) needs a spike.
5. **Morning briefing scheduling:** Cron job on the thin client, or time-check in the launcher?
6. **Feedback queue format:** How does the Slack bot write feedback for the launcher to pick up? Simple JSON file? Directory of files?
</content>
</invoke>