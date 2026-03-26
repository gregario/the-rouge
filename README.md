# The Rouge

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <a href="https://github.com/sponsors/gregario"><img src="https://img.shields.io/badge/sponsor-♥-ea4aaa.svg" alt="Sponsor"></a>
</p>

> **Experimental** — Rouge is a research project exploring autonomous product development. It is token-intensive (each phase invokes Claude Code via `claude -p`), not production-hardened, and should not be used for critical systems. Use at your own risk and monitor token usage.

An autonomous product development system that builds production-quality products through iterative self-evaluation. Rouge starts from a high baseline standard of "good" and develops design taste that improves across every project it ships.

The core idea: a tight Karpathy Loop of Claude Code invocations with state on disk — not a traditional long-running application. Each phase starts fresh, reads state from the filesystem, does one thing, saves, and exits. The filesystem is the memory. Git is the audit trail. The launcher is a small script.

---

## Three Layers

Rouge is organized into three layers that separate concerns cleanly:

**The Rouge (Runner)** — The outer loop. Manages state across sessions, evaluates product quality against vision and standards, decides what to build next, and refuses to ship until the bar is met. This is the orchestrator that drives the entire system.

**The Factory (Studio)** — The worker. Receives scoped briefs from the Runner and builds products using an established pipeline: brainstorm, design, implement, test, QA. The Factory does not decide what to build — it executes what the Runner specifies.

**The Library (Accumulated Mind)** — Persistent knowledge store. Global product standards, domain-specific taste entries (web, games, artifacts), and learned judgment from human feedback. The Library grows with every project shipped and feeds context into every phase.

---

## How It Works

Rouge follows a Karpathy Loop — tight feedback loops with external evaluation, inspired by [Karpathy's AutoResearch](https://github.com/karpathy/autoresearch). A product goes through two stages:

### Seeding (Interactive)

Seeding is the only interactive stage. A human provides the product idea, and Rouge runs through a series of one-time phases to produce everything needed before autonomous building begins:

1. **Brainstorming** — Expansive exploration of the product space
2. **Competition Review** — Maps the competitive landscape
3. **Taste Evaluation** — Challenges the idea on premise, persona, and scope
4. **Spec Generation** — Formal product specification
5. **Design** — UX architecture, component design, visual design
6. **Legal and Privacy** — License, terms, privacy policy generation
7. **Marketing** — Landing page, README, positioning

Seeding produces a `vision.json` (the north star for all autonomous decisions) and a product standard that defines the quality bar.

### Autonomous Loop (Unattended)

Once seeded, Rouge enters the autonomous loop. A launcher script iterates through projects, advancing each one phase per iteration:

1. **Building** — Reads specs, writes code, deploys to staging
2. **Evaluation** — Multi-oracle quality assessment:
   - Test integrity verification
   - Browser QA against staging
   - Code review
   - PO (product owner) review against heuristics
   - Product walkthrough with screenshots
3. **Analysis** — Reads evaluation reports, computes quality deltas, decides: continue improving, broaden to next feature, roll back, or notify human
4. **Change Spec Generation** — Translates quality gaps into new specs
5. **Vision Check** — Holistic re-evaluation against the original vision
6. **Ship or Iterate** — Promotes to production when the bar is met, or generates another loop iteration

The loop runs until all feature areas pass evaluation, at which point the product is promoted and the human is notified.

---

## Key Concepts

### Two-Loop Model

The inner loop (AI, autonomous) builds to "good" aiming for "great." The outer loop (human feedback) refines from good to great. Human involvement is reserved for taste refinement, not grunt work.

### External Oracles

Quality evaluation is grounded in measurable signals, not self-assessment. The system uses browser QA, Lighthouse scores, spec-completeness checks, code quality analysis (complexity, duplication, circular dependencies, dead code, coverage), and structured PO reviews.

### Taste as Heuristics

Design taste is encoded as objective, testable signals — not subjective judgment. Each heuristic in the Library has a name, a measurement method, a threshold, and a rationale. Examples: "page load time under 2 seconds," "primary content occupies dominant visual position," "core tasks complete in 3 clicks or fewer."

### Library Tiers

The Library operates in three tiers:

- **Global standards** — Seeded on day one. Universal quality heuristics (accessibility, performance, error handling, responsive design).
- **Domain-specific taste** — Grows per domain. Web apps have different standards than games or CLI tools.
- **Personal taste / learned judgment** — Accumulated from human feedback. Tagged as global or domain-specific so learnings transfer across projects.

---

## Project Structure

```
the-rouge/
  src/
    launcher/              # Loop runner and supporting scripts
      rouge-loop.sh        # Main loop (bash)
      rouge-loop.js        # Main loop (Node.js alternative)
      state-to-prompt.sh   # Maps state to phase prompt
      model-for-state.sh   # Selects model per phase (Opus vs Sonnet)
      notify-slack.js      # Slack notifications
      rouge-safety-check.sh # Pre-execution safety validation
      deploy-to-staging.js # Staging deployment
      estimate-cost.js     # Token cost estimation
      validate-library.sh  # Library entry validation
      ...
    prompts/
      seeding/             # One-time interactive phases
        00-swarm-orchestrator.md
        01-brainstorming.md
        02-competition.md
        03-taste.md
        04-spec.md
        05-design.md
        06-legal-privacy.md
        07-marketing.md
      loop/                # Repeating autonomous phases
        01-building.md
        02-evaluation-orchestrator.md
        02a-test-integrity.md
        02b-qa-gate.md
        02c-code-review.md
        02c-po-review.md
        02d-product-walk.md
        02e-evaluation.md
        02f-re-walk.md
        03-qa-fixing.md
        04-analyzing.md
        05-change-spec-generation.md
        06-vision-check.md
        07-ship-promote.md
        08-document-release.md
        09-cycle-retrospective.md
        10-final-review.md
  library/                 # Accumulated design intelligence
    global/                # Universal quality heuristics (15 entries)
    domain/                # Domain-specific taste
      web/                 # Web app heuristics
      game/                # Game heuristics
      artifact/            # Artifact heuristics
    personal/              # Learned judgment from feedback
    templates/             # Reusable heuristic patterns (12 entries)
  schemas/                 # JSON schemas for all state files
    state.json
    cycle-context.json
    vision.json
    library-entry.json
    taste-fingerprint.json
    feedback-classification.json
    po-check-template.json
  projects/                # Product workspaces (one dir per product)
  tests/                   # Test suite
  docs/                    # Architecture docs and plans
  rouge.config.json        # Safety hooks and deploy configuration
```

---

## Prerequisites

- **Claude Code CLI** — `claude -p` must be available. This is the execution engine for every phase.
- **Node.js 18+** — For the launcher scripts, Slack bot, and supporting tooling.
- **Git** — Every phase commits its work. Git is the audit trail.
- **Slack App** (recommended) — For notifications and control plane. Free workspace, one custom app with Socket Mode enabled. Allows starting, pausing, and monitoring projects from your phone.
- **GStack browse** (recommended for web products) — Browser automation for QA phases. Provides navigation, screenshots, DOM analysis, and console error capture.
- **Wrangler CLI** (for deployment) — Cloudflare Workers deployment for staging and production.
- **Supabase CLI** (if products need a database) — Project creation, migrations, edge functions.

---

## Getting Started

1. **Clone the repository:**

   ```bash
   git clone https://github.com/gregario/the-rouge.git
   cd the-rouge
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Configure safety hooks** (optional but recommended):

   Edit `rouge.config.json` to set blocked commands, allowed deploy targets, and custom pre-hooks. See [Safety Hooks](#safety-hooks) below.

4. **Seed a product:**

   Seeding is interactive — you provide the product idea and collaborate with Rouge to define the vision, spec, and design.

   ```bash
   # Start a seeding session for a new product
   claude -p --project projects/my-product "seed this product"
   ```

   This runs through the seeding phases (brainstorm, competition, taste, spec, design, legal, marketing) and produces `vision.json`, specs, and all artifacts needed for autonomous building.

5. **Start the autonomous loop:**

   ```bash
   # Run in a tmux/screen session
   bash src/launcher/rouge-loop.sh
   ```

   The launcher iterates through all projects in `projects/`, advancing each one phase per iteration. Projects in `waiting-for-human` state are skipped until feedback arrives.

---

## Configuration

### rouge.config.json

Controls safety boundaries and deployment targets:

```json
{
  "safety": {
    "blocked_commands": [],
    "allowed_deploy_targets": ["staging", "preview"],
    "custom_pre_hooks": []
  }
}
```

- `blocked_commands` — Shell commands that Rouge is never allowed to execute.
- `allowed_deploy_targets` — Where Rouge can deploy autonomously. Production deployment requires explicit promotion.
- `custom_pre_hooks` — Scripts to run before each phase for custom validation.

### vision.json (per project)

The north star for all autonomous decisions. Produced during seeding. Contains the product name, persona, problem statement, feature areas with user journeys, product standard (which Library tiers to inherit, overrides, additions), and infrastructure requirements.

---

## Safety Hooks

Rouge includes a safety layer that runs before every phase execution. The safety check (`rouge-safety-check.sh`) validates:

- The phase prompt exists and is well-formed
- No blocked commands are present in the execution context
- Deploy targets are within the allowed set
- Custom pre-hooks pass

The system defaults to conservative settings: only staging and preview deploys are allowed. Production promotion requires passing through the full evaluation pipeline (test integrity, QA gate, code review, PO review, product walkthrough, and vision check).

---

## The Library

The Library is Rouge's accumulated design intelligence. It is not documentation — it is machine-readable context that feeds into every phase prompt.

Each Library entry is a JSON file with a consistent schema:

- **Name** — Human-readable identifier
- **Signal** — What to measure
- **Threshold** — What "passing" looks like
- **Rationale** — Why this matters
- **Domain** — Where it applies (global, web, game, etc.)

The Library ships with 15 global heuristics (covering performance, accessibility, error recovery, visual consistency, responsive design, and more), 3 web-domain entries, and 12 reusable templates for common patterns (loading indicators, error specificity, microinteractions, etc.).

The Library grows in two ways:

1. **Cycle retrospectives** — After each autonomous loop, Rouge evaluates which heuristics were useful, which missed problems, and what new patterns were observed. New entries are proposed automatically.
2. **Human feedback** — When a human reviews a shipped product and provides feedback, Rouge classifies it and creates or updates Library entries. Feedback is tagged as global or domain-specific so learnings transfer across projects.

---

## Model Selection

Rouge selects models per phase to balance quality and cost:

- **Opus** for thinking phases: building, PO reviewing, analyzing, change-spec generation, vision checking
- **Sonnet** for commodity phases: test integrity, QA gate, promoting, rolling back

The launcher's `model-for-state.sh` script handles this mapping. You can override it per project.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to contribute. The most valuable contribution areas are:

- **Library heuristics** — New global standards or domain-specific taste entries
- **Phase prompt improvements** — Better evaluation criteria, edge case handling, prompt clarity
- **Integration patterns** — New deployment targets, monitoring hooks, quality oracles

---

## License

[MIT](LICENSE)
