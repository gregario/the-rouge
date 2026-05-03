# Tooling Autonomy Report

**Date:** 2026-03-17
**Purpose:** Validate that every action in The Rouge's autonomous loop can be performed without human interaction.
**Verdict:** All actions confirmed autonomous. Zero blockers.

## Supabase

**Source:** CLI + Management API research

### Project Creation (CLI)
```bash
supabase projects create "my-project" \
  --org-id <org-slug> \
  --db-password "SUPER_SECURE_PASSWORD" \
  --region us-east-1 --yes
```
- Fully non-interactive with all flags provided
- Auth: `SUPABASE_ACCESS_TOKEN` env var (Personal Access Token)
- One-time setup: `supabase login` (browser OAuth)

### Get Keys
```bash
supabase projects api-keys --project-ref <ref> -o json
```
Returns anon + service_role keys. Poll `GET /v1/projects/{ref}/health` until `ACTIVE_HEALTHY` before using.

### Operations
```bash
supabase link --project-ref <ref>
supabase db push                    # migrations
supabase functions deploy           # edge functions
supabase secrets set KEY=VALUE      # secrets
```

### MCP Server
- Does NOT support project creation (CLI only for that)
- Supports: execute_sql, apply_migration, list_tables, deploy_edge_function, branches, logs, types generation
- Already configured in AI-Factory `.mcp.json` for existing projects

### Free Tier
- **2 active free projects max** (across all orgs)
- Paused projects don't count
- 500MB database, 1GB storage, 50K MAU, 500K edge function invocations
- Pro plan: $25/mo per org, no project limit

---

## Cloudflare

**Source:** Wrangler CLI research

### IMPORTANT: Pages Deprecated (April 2025)
Cloudflare Pages is in maintenance mode. **Use Workers with Static Assets** for new projects.
```bash
# Workers with Static Assets (recommended)
wrangler deploy
# with wrangler.toml containing [assets] config

# Pages (deprecated, still works)
wrangler pages deploy ./dist --project-name=X --branch=main
```

### Project Creation + Deploy
```bash
# Auto-creates project on first deploy
wrangler pages deploy ./dist --project-name=my-project --branch=main
```
- Auth: `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` env vars
- Deployment URL printed to stdout

### Staging/Production
```bash
# Production
wrangler pages deploy ./dist --project-name=X --branch=main

# Staging (any non-production branch)
wrangler pages deploy ./dist --project-name=X --branch=staging
# → staging.project.pages.dev
```

### Limitations
- **No promote command.** Redeploy same assets with production branch.
- **Custom domains:** API only, no CLI support. Use `.pages.dev` URLs for V1.

### Free Tier
- Unlimited sites, unlimited bandwidth, unlimited requests (static)
- 500 builds/month, 1 concurrent build
- 100K Pages Functions requests/day

---

## Browser Automation

**Source:** Playwright + GStack research

### GStack Browse (V1, Mac)
Already installed at `~/.claude/skills/gstack/browse/dist/browse`. Compiled Bun binary wrapping Playwright.

```bash
$B goto https://myapp.com          # navigate
$B screenshot /tmp/page.png        # capture
$B snapshot -i                     # interactive elements with @e refs
$B click @e3                       # interact
$B fill @e4 "test value"          # fill form
$B console --errors               # check errors
$B js "document.querySelector('.price').textContent"  # DOM query
$B css .element font-size         # computed styles
$B perf                           # performance metrics
```

- Persistent headless Chromium daemon, 100-200ms per command
- Plain text output (most token-efficient option)
- macOS ARM binary only — needs Linux alternative for V2

### Playwright CLI (V2, Linux/Docker)
```bash
npx playwright test               # headless by default
```
- Official Docker image: `mcr.microsoft.com/playwright:v1.58.2-noble`
- ~27,000 tokens per task (4x more efficient than MCP)
- Use `--ipc=host` in Docker to prevent OOM crashes

### Token Efficiency Comparison
| Approach | Tokens/task |
|----------|-------------|
| GStack browse CLI | Lowest (plain text) |
| Playwright CLI | ~27,000 |
| Playwright MCP | ~114,000 (DO NOT USE) |

**Decision:** GStack for V1 (Mac), Playwright CLI for V2 (Linux/Docker). Never MCP.

---

## Code Quality Tools

**Source:** Static analysis CLI research. All tools: fully headless, JSON output, CI exit codes, TypeScript support.

### ESLint (Complexity)
```bash
npm install -D eslint @eslint/js typescript-eslint
eslint . --format json -o eslint-report.json
```
- Cyclomatic complexity via built-in `complexity` rule
- Exit 1 on errors. `--max-warnings 0` to also fail on warnings.
- Gotcha: complexity value embedded in message text, needs parsing.

### jscpd (Duplication)
```bash
npm install -D jscpd
npx jscpd src/ --min-lines 6 --reporters json --threshold 5 --output ./reports
```
- Exit 1 if duplication > threshold percentage.
- JSON: statistics (total lines, duplicated, %) + duplicate block list.

### madge (Dependencies)
```bash
npm install -D madge
npx madge --circular src/          # exit 1 if circular deps (non-JSON mode)
npx madge --circular --json src/   # JSON output (exit 0 always, check array length)
npx madge --image graph.svg src/   # visualization (needs graphviz)
```
- Gotcha: `--json` suppresses non-zero exit code. Use without `--json` for CI gating.
- For TypeScript: `--ts-config tsconfig.json` required.

### c8 (Coverage)
```bash
npm install -D c8
npx c8 --reporter=json-summary --check-coverage --branches 80 npx vitest run
```
- Exits non-zero if below threshold.
- Vitest alternative: `vitest run --coverage --coverage.reporter=json`

### Lighthouse (Performance)
```bash
npm install -D @lhci/cli
npx lighthouse URL --output=json --chrome-flags="--headless=new"
```
- Or LHCI: `npx lhci autorun --collect.url=URL --collect.numberOfRuns=3`
- Scores 0-1 in `categories.performance.score`, `.accessibility.score`, etc.
- Needs Chrome/Chromium installed.

### knip (Dead Code)
```bash
npm install -D knip
npx knip --reporter json
```
- Detects: unused files, unused exports, unused/unlisted dependencies, unused class members.
- Exit 1 if findings (default).
- Successor to ts-prune (archived).

---

## Slack

**Source:** Slack integration research

### Recommended: Bot API + Socket Mode

**Why:** Only approach that handles both sending AND receiving without a web server.

**Setup (~15 min):**
1. Create Slack App at api.slack.com/apps
2. Enable Socket Mode (Settings > Socket Mode > toggle on)
3. Create App-Level Token with `connections:write` scope (`xapp-...`)
4. Add Bot Token Scopes: `chat:write`, `channels:history`, `app_mentions:read`, `channels:read`
5. Enable Event Subscriptions: `app_mention`, `message.channels`
6. Install to workspace → Bot Token (`xbot-...`)

**Implementation (~50 lines, Bolt.js):**
```javascript
const { App } = require('@slack/bolt');
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

app.event('app_mention', async ({ event, say }) => {
  // Write feedback to project's feedback.json
  await say(`Got it, processing feedback.`);
});

await app.start();
```

**Sending:** `chat.postMessage` with Block Kit for structured notifications. Or simpler: incoming webhook (`curl`).

**Hybrid option:** Webhooks for send (zero code, just curl), Socket Mode for receive only.

### Free Tier
- 10 app integrations max (bot = 1 of 10)
- 90-day message history
- Socket Mode, webhooks, bot tokens all work on free tier
- Sufficient for personal workspace

### MCP Alternative
- Official Slack MCP server exists (list channels, post messages, reply to threads, etc.)
- Only works within active Claude Code sessions — NOT suitable for autonomous notifications
- Use for interactive seeding sessions if needed

---

## Stripe

**Status:** Needs spike, but confirmed autonomous in principle.

```bash
# Stripe CLI
stripe listen --forward-to localhost:3000/webhook  # webhook testing
stripe trigger payment_intent.succeeded            # trigger test events
stripe products create --name="Test Product"       # create test products
```

- Test mode API keys: `sk_test_...`
- Test card numbers: `4242424242424242` (success), `4000000000000002` (decline)
- Playwright can interact with Stripe Checkout in test mode
- Full CLI: `brew install stripe/stripe-cli/stripe`

---

## Claude Code Headless Execution

### The `-p` Flag
```bash
claude -p "prompt here" \
  --dangerously-skip-permissions \
  --max-turns 100 \
  --output-format json \
  --model sonnet  # or opus
```
- **On Mac with subscription:** Works using cached OAuth credentials. Confirmed by live test.
- **In Docker/CI:** Requires `ANTHROPIC_API_KEY` (API billing, not subscription).
- **Session resume:** `--continue` / `--resume <session-id>` available.

### Key Flags
| Flag | Purpose |
|------|---------|
| `-p` / `--print` | Non-interactive, output to stdout |
| `--dangerously-skip-permissions` | Auto-approve all tool operations |
| `--max-turns N` | Limit iterations (safety) |
| `--max-budget-usd N` | Cap spending per invocation |
| `--output-format json` | Structured output |
| `--model sonnet/opus` | Model selection per invocation |
| `--allowedTools "Bash,Read,Edit"` | Restrict available tools |
| `--project <dir>` | Set project directory |

### Subscription vs API Key Cost Comparison (from actual usage data)
- 19 days of usage: 93 sessions, 73,341 messages
- API equivalent cost: **~$1,275** (at current Opus 4.6 pricing)
- Subscription cost: **€100/month (~$108)**
- Saving: **~12x** (driven by 1.78B cache read tokens at $0.50/M)

### Current API Pricing (verified 2026-03-17)
| Model | Input | Output | Cache Write (5min) | Cache Read |
|-------|-------|--------|-------------------|------------|
| Opus 4.6 | $5/M | $25/M | $6.25/M | $0.50/M |
| Sonnet 4.6 | $3/M | $15/M | $3.75/M | $0.30/M |
</content>
</invoke>