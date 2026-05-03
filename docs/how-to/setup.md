# The Rouge — Setup Guide

> ⚠️ **Open source, experimental, runs with `--dangerously-skip-permissions`.** Rouge gives Claude Code full filesystem access and burns real Anthropic API credits. Misconfiguration can cost thousands of dollars. Set `budget_cap_usd` in `rouge.config.json` before any real build. Run on a dedicated machine or VM. Read the [README's safety section](../../README.md#safety) first.

> **Dashboard-first.** The fast path for new users is `rouge setup` → `rouge dashboard start` → open the URL Rouge prints → **New Project**. The CLI steps below cover the per-integration configuration (OS keychain, Cloudflare, Supabase, Sentry, GitHub). Slack remains as a notification-only sidecar for pre-existing setups; new installs should use the dashboard.

One-time setup for running The Rouge on your machine.

## Prerequisites

- macOS or Linux (Windows via WSL2)
- Claude Code CLI installed and authenticated (`claude login`)
- Node.js 18+
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
# The launcher checks expiry on startup and raises an escalation in the dashboard if expired.
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

## 3. Slack App (retired — skip for new installs)

The Slack bot control plane is retired. If you already have a working Slack setup and want to keep it, see [slack-setup.md](./slack-setup.md). Otherwise skip this section — the dashboard covers everything Slack did and more.

## 4. Secrets Management

Rouge stores secrets in the OS credential store (macOS Keychain, Linux secret-service, Windows Credential Manager) — **not** in `.env` files.

Use the interactive setup command for each integration:

```bash
rouge setup stripe      # Stores STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY
rouge setup supabase    # Stores SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY
rouge setup cloudflare  # Stores CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
# rouge setup slack     # Retired — only run if migrating a pre-existing setup
```

Verify what's stored:
```bash
rouge secrets list
rouge doctor           # Shows which integrations are configured
```

## 5. Start The Rouge

```bash
# Start the dashboard (your control plane — auto-opens the URL Rouge prints)
rouge dashboard start       # Background mode, survives terminal close
# or: rouge dashboard       # Foreground (for debugging)

# From the dashboard: click New Project → spec → build.
# Or from the CLI:
rouge init <project-name>
rouge seed <project-name>   # Interactive seeding
rouge build <project-name>  # Kick off the autonomous loop
```

Global installs ship a prebuilt Next.js standalone server — no dev toolchain needed. Pass `--no-open` to skip the auto-open on `rouge dashboard start`.

### Dashboard from source (dev-only)

Only needed if you're developing Rouge itself:

```bash
npm run dashboard:install   # Install dashboard dependencies once
npm run dashboard           # Dev server with HMR
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
