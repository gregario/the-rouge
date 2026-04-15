# The Rouge — Setup Guide

> ⚠️ **Onboarding is being refactored.** The canonical path is now: run `rouge setup`, open the dashboard, click **New Project**. The Slack and CLI steps below still work but are no longer the recommended path for new users. See `docs/plans/2026-04-15-onboarding-refactor.md` for the full plan.

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

## 4. Secrets Management

Rouge stores secrets in the OS credential store (macOS Keychain, Linux secret-service, Windows Credential Manager) — **not** in `.env` files.

Use the interactive setup command for each integration:

```bash
rouge setup slack       # Stores SLACK_BOT_TOKEN, SLACK_APP_TOKEN, ROUGE_SLACK_WEBHOOK
rouge setup stripe      # Stores STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY
rouge setup supabase    # Stores SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY
rouge setup cloudflare  # Stores CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
```

Verify what's stored:
```bash
rouge secrets list
rouge doctor           # Shows which integrations are configured
```

## 5. Start The Rouge

```bash
# Start the Slack bot (loads tokens from secrets store)
rouge slack start

# In another terminal: start the build loop
rouge build <project-name>
```

> **Important:** Do NOT run `cd src/slack && node bot.js` directly — it will crash with `AppInitializationError` because tokens are not loaded. Always use `rouge slack start`, which loads tokens from the secrets store before starting the bot.

## 6. Dashboard (Optional)

The dashboard is integrated into the repo at `dashboard/`. To set it up:

```bash
npm run dashboard:install   # Install dashboard dependencies
rouge dashboard             # Start the dashboard dev server
```

## 7. Morning Briefing (Optional)

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
