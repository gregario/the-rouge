# The Rouge — Setup Guide

One-time setup for running The Rouge on your machine.

## Prerequisites

- macOS (V1) or Linux (V2)
- Claude Code CLI installed and authenticated (`claude login`)
- Node.js 22+
- Homebrew (macOS)

## 1. CLI Tools

```bash
# Already available via npx (no install needed)
# wrangler, @opennextjs/cloudflare, lighthouse, eslint, jscpd, madge, knip, c8

# Install via Homebrew
brew install stripe/stripe-cli/stripe
brew install getsentry/tools/sentry-cli
```

## 2. Service Authentication

### Cloudflare (wrangler)
```bash
npx wrangler login
# Opens browser for OAuth. One-time.
npx wrangler whoami  # verify
```

### Supabase
```bash
supabase login
# Opens browser for OAuth. One-time.
# Token stored in macOS keychain.
supabase projects list  # verify
```

### Stripe (SANDBOX ONLY)
```bash
stripe login
# Opens browser for pairing. One-time.
# ⚠️ Key expires every 90 days. Check: grep test_mode_key_expires_at ~/.config/stripe/config.toml
# The launcher checks expiry on startup and notifies via Slack.
```

**IMPORTANT:** Rouge only uses Stripe test/sandbox keys. Never configure production keys.

### Sentry
```bash
sentry-cli login --auth-token <token>
# Get token at: https://sentry.io/settings/auth-tokens/
# Required scopes: org:read, project:read, project:write, project:releases
```

### GitHub
```bash
gh auth login
# One-time. Used for PRs and repo management.
```

## 3. Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app
2. Enable **Socket Mode** (Settings > Socket Mode > toggle on)
3. Create an **App-Level Token** with `connections:write` scope → save as `SLACK_APP_TOKEN`
4. Add **Bot Token Scopes**: `chat:write`, `channels:history`, `app_mentions:read`, `channels:read`
5. Enable **Event Subscriptions**: `app_mention`, `message.channels`
6. Install to workspace → save Bot Token as `SLACK_BOT_TOKEN`
7. Create an **Incoming Webhook** → save URL as `ROUGE_SLACK_WEBHOOK`

## 4. Environment Variables

Create `.env` in The Rouge root (gitignored):

```bash
# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
ROUGE_SLACK_WEBHOOK=https://hooks.slack.com/services/...

# Projects directory (default: ./projects)
ROUGE_PROJECTS_DIR=./projects

# Launcher config
ROUGE_LOOP_DELAY=30  # seconds between loop iterations
```

## 5. Start The Rouge

```bash
# Terminal 1: Start the Slack bot
cd src/slack && node bot.js

# Terminal 2: Start the launcher
src/launcher/rouge-loop.sh
```

Or run both in tmux:
```bash
tmux new-session -d -s rouge 'cd src/slack && node bot.js'
tmux split-window -h 'src/launcher/rouge-loop.sh'
tmux attach -t rouge
```

## 6. Morning Briefing (Optional)

```bash
# Add to crontab for 8am daily briefings
crontab -e
# Add: 0 8 * * * /path/to/The-Rouge/src/launcher/briefing-cron.sh
```

## Auth Token Lifetimes

| Service | Token Lifetime | Renewal |
|---------|---------------|---------|
| Claude Code | ~30 days (OAuth refresh) | Re-run `claude login` |
| Cloudflare | Long-lived OAuth | `npx wrangler login` |
| Supabase | Long-lived PAT | `supabase login` |
| Stripe | 90 days | `stripe login` (launcher warns 7 days before) |
| Sentry | Long-lived PAT | Regenerate at sentry.io |
| GitHub | Long-lived OAuth | `gh auth login` |
