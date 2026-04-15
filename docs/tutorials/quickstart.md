# Quick Start

> ⚠️ **Onboarding is being refactored.** The canonical path is now: run `rouge setup`, open the dashboard, click **New Project**. The CLI and Slack steps below still work but are no longer the recommended path for new users. See `docs/plans/2026-04-15-onboarding-refactor.md` for the full plan.

Get from zero to your first Rouge-built product in 5 minutes.

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

   The dashboard is your primary control plane: real-time project visibility, escalation responses, build logs, and milestone progress. Open [http://localhost:3001](http://localhost:3001) after starting.

5. (Optional) Set up Slack:

   ```bash
   rouge setup slack       # Interactive — stores tokens in OS keychain
   rouge slack start       # Start the Slack bot
   ```

   Slack is an alternative control plane for teams that already live there. The dashboard provides richer visibility and doesn't require external tokens.

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
- [Slack setup](../how-to/slack-setup.md) — detailed Slack app configuration
- [Seeding example](seeding-example.md) — what a real seeding session looks like
- [How Rouge works](../explanation/how-rouge-works-v3.md) — architecture overview
