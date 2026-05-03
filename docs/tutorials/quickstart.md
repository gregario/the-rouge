# Quick Start

> ⚠️ **Open source, experimental, runs with `--dangerously-skip-permissions`.** Rouge gives Claude Code full filesystem access and burns real Anthropic API credits. Misconfiguration can cost thousands of dollars. Set `budget_cap_usd` in `rouge.config.json` before any real build. Run on a dedicated machine or VM, not your daily-driver. Read the [README's safety section](../../README.md#safety) before starting.

Get from zero to your first Rouge-built product in about 5 minutes (plus an interactive seeding session).

## Prerequisites

- Node.js 18+ ([nodejs.org](https://nodejs.org/))
- Claude Code CLI (`npm install -g @anthropic-ai/claude-code`, then `claude login`)
- GitHub CLI (`gh auth login`) — [cli.github.com](https://cli.github.com/)

## Setup

1. Clone and install:

   ```bash
   git clone https://github.com/gregario/the-rouge.git
   cd the-rouge
   npm install
   ```

2. Check prerequisites:

   ```bash
   rouge doctor
   ```

   Fix any items marked with a red cross before continuing. Warnings (yellow) are optional.

3. Run first-time setup:

   ```bash
   rouge setup             # Installs dashboard, verifies prereqs
   ```

4. Start the dashboard (recommended):

   ```bash
   rouge dashboard start   # Background mode — survives terminal close
   ```

   The dashboard is your control plane: real-time project visibility, escalation responses, build logs, seeding chat, milestone progress, and aggregate spend. It auto-opens in your browser at the URL Rouge prints (default port 3001; override via `ROUGE_DASHBOARD_PORT`). Pass `--no-open` to skip the auto-open.

5. (Optional, legacy) Slack bot setup is retired — `src/slack/` remains for pre-existing installs as a notification-only sidecar. New installs should use the dashboard.

## Your First Product

```bash
rouge init my-product       # Create the project directory
rouge seed my-product       # Interactive co-design session
rouge build my-product      # Start the autonomous build loop
rouge status my-product     # Check progress
```

Rouge will iterate: build, evaluate, fix, repeat — until the quality bar is met.

For a detailed walkthrough of what happens at each step, see [your-first-product.md](your-first-product.md).

## Next Steps

- [Setup guide](../how-to/setup.md) — full setup including optional integrations (Stripe, Supabase, Cloudflare, Sentry)
- [Slack setup](../how-to/slack-setup.md) — notifications-only sidecar (legacy, opt-in)
- [Seeding example](seeding-example.md) — what a real seeding session looks like
- [How Rouge works](../explanation/how-rouge-works.md) — the user-facing story
- [Architecture](../explanation/architecture.md) — the contributor-facing story
