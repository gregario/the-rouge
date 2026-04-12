# Quick Start

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

3. (Optional) Set up Slack control plane:

   ```bash
   rouge setup slack      # Interactive — stores tokens in OS keychain
   rouge slack start      # Start the Slack bot
   ```

   Slack lets you monitor builds from your phone and receive notifications when Rouge needs your input.

4. (Optional) Set up the dashboard:

   ```bash
   npm run dashboard:install
   rouge dashboard
   ```

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

- [Setup guide](setup.md) — full setup including optional integrations (Stripe, Supabase, Cloudflare, Sentry)
- [Slack setup](slack-setup.md) — detailed Slack app configuration
- [Seeding example](seeding-example.md) — what a real seeding session looks like
- [How Rouge works](how-rouge-works-v3.md) — architecture overview
