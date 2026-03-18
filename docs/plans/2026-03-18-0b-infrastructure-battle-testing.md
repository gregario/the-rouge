# 0b: Infrastructure Battle-Testing — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Validate that every CLI tool the Rouge phase prompts assume works autonomously, end-to-end, from empty repo to staging + production.

**Architecture:** Create a minimal "rouge-testbed" app (Next.js + Supabase + Stripe) inside a temporary directory. Deploy it through the exact CLI pipeline Rouge will use. Document every failure and workaround. The testbed is disposable — the findings document is the deliverable.

**Tech Stack:** Next.js 15, Supabase, Cloudflare Workers (wrangler), Stripe CLI, Sentry CLI, Lighthouse, GStack browse

---

## Prerequisites

Before starting, install missing CLI tools:

```bash
# Wrangler (Cloudflare) — use npx, no global install needed
npx wrangler --version

# Stripe CLI
brew install stripe/stripe-cli/stripe

# Sentry CLI
brew install getsentry/tools/sentry-cli

# Lighthouse
npm install -g @lhci/cli
```

---

### Task 1: Scaffold testbed app (0b.1 part 1)

**Files:**
- Create: `/tmp/rouge-testbed/` (temporary, disposable)

**Step 1: Create minimal Next.js app**

```bash
cd /tmp
npx create-next-app@latest rouge-testbed --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
cd rouge-testbed
git init && git add -A && git commit -m "init: scaffold"
```

**Step 2: Add Supabase + OpenNext + Wrangler deps**

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install -D @opennextjs/cloudflare wrangler
```

**Step 3: Create wrangler.toml (Workers + Static Assets path)**

```toml
# wrangler.toml
name = "rouge-testbed"
compatibility_date = "2025-12-01"
compatibility_flags = ["nodejs_compat"]
pages_build_output_dir = ".worker"
```

**Step 4: Create open-next.config.ts**

```typescript
import type { OpenNextConfig } from '@opennextjs/cloudflare';

const config: OpenNextConfig = {
  default: {
    override: {
      wrapper: 'cloudflare-node',
      converter: 'edge',
    },
  },
};

export default config;
```

**Step 5: Add a simple landing page with health check**

Replace `src/app/page.tsx`:
```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold">Rouge Testbed</h1>
      <p className="mt-4 text-lg text-gray-600">Infrastructure battle-testing</p>
      <div id="health" data-status="ok">Status: OK</div>
    </main>
  );
}
```

**Step 6: Verify local build works**

```bash
npx opennext build
```
Expected: `.worker/` directory created, no errors.

**Step 7: Commit**

```bash
git add -A && git commit -m "feat: add wrangler + opennext config"
```

---

### Task 2: Deploy to Cloudflare via CLI (0b.1 part 2, 0b.3, 0b.10)

**Goal:** Validate `wrangler deploy` creates project + deploys WITHOUT dashboard interaction.

**Step 1: Check Cloudflare auth**

```bash
npx wrangler whoami
```
If not authenticated:
```bash
npx wrangler login
```
(One-time browser OAuth — same pattern as Supabase. Document if this works headless.)

**Step 2: Deploy to staging (non-production branch)**

```bash
# wrangler pages deploy is the current CLI command for Pages projects
npx wrangler pages deploy .worker --project-name=rouge-testbed --branch=staging
```

Expected output: Deployment URL like `staging.rouge-testbed.pages.dev`.

**IMPORTANT DECISION POINT:** The tooling report says Pages is deprecated and Workers + Static Assets is the way. But the SaaS stack docs use Pages with `pages_build_output_dir`. Test BOTH paths and document which works for autonomous deployment:

Path A — Pages CLI:
```bash
npx wrangler pages deploy .worker --project-name=rouge-testbed --branch=staging
```

Path B — Workers with Assets:
```toml
# wrangler.toml alternative
name = "rouge-testbed"
compatibility_date = "2025-12-01"
main = ".worker/index.js"
[assets]
directory = ".worker/assets"
```
```bash
npx wrangler deploy
```

**Step 3: Verify deployment**

```bash
curl -s -o /dev/null -w "%{http_code}" https://staging.rouge-testbed.pages.dev/
```
Expected: 200.

**Step 4: Document findings**

Create `/Users/gregario/Projects/ClaudeCode/The-Rouge/docs/research/2026-03-18-0b-cloudflare-findings.md`:
- Which path works (Pages CLI vs Workers+Assets)?
- Does `wrangler pages project create` exist, or does first deploy auto-create?
- What's the exact staging/production URL pattern?
- Any manual steps that couldn't be avoided?

**Step 5: Commit findings**

---

### Task 3: Deploy to production + promotion flow (0b.5)

**Step 1: Deploy to production**

```bash
npx wrangler pages deploy .worker --project-name=rouge-testbed --branch=main
```
Expected: `rouge-testbed.pages.dev` live.

**Step 2: Verify production**

```bash
curl -s -o /dev/null -w "%{http_code}" https://rouge-testbed.pages.dev/
```

**Step 3: Document staging → production promotion**

The tooling report says "No promote command. Redeploy same assets with production branch." Confirm this is the exact flow:
1. Build once
2. Deploy to staging branch
3. QA passes
4. Deploy same `.worker/` dir to main branch

**Step 4: Update findings doc**

---

### Task 4: Test rollback flow (0b.6)

**Step 1: Deploy a broken version to staging**

Modify page to show "BROKEN" and deploy to staging.

**Step 2: Verify broken staging**

```bash
$B goto https://staging.rouge-testbed.pages.dev
$B snapshot
```

**Step 3: Rollback staging**

```bash
# Option A: Redeploy previous build
git stash
npx opennext build
npx wrangler pages deploy .worker --project-name=rouge-testbed --branch=staging

# Option B: Wrangler rollback command (if exists)
npx wrangler pages deployment rollback --project-name=rouge-testbed
```

**Step 4: Verify rollback worked**

**Step 5: Document which rollback method works and update findings**

---

### Task 5: Supabase project creation + migration via CLI (0b.2, 0b.11)

**IMPORTANT:** 2 Supabase projects already active (both colourbookpub). Need to pause one first, or test with existing project.

**Step 1: Test project creation (or skip if slot unavailable)**

```bash
# Check current projects
supabase projects list

# If a slot is available:
supabase projects create "rouge-testbed" \
  --org-id <org-slug> \
  --db-password "$(openssl rand -base64 24)" \
  --region eu-west-1 --yes
```

If no slot available, document: "Supabase 2-slot limit reached. Rouge launcher must implement slot rotation (pause least-recent → create new → run → pause when done)."

**Step 2: Create a test migration**

```bash
mkdir -p supabase/migrations
cat > supabase/migrations/20260318000000_create_health.sql << 'SQL'
create table if not exists health_check (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'ok',
  checked_at timestamptz not null default now()
);

-- Enable RLS
alter table health_check enable row level security;

-- Allow anon read
create policy "anon_read_health" on health_check for select to anon using (true);
SQL
```

**Step 3: Link + push migration**

```bash
supabase link --project-ref <ref>
supabase db push
supabase migration list
```

**Step 4: Test pause/unpause via Management API (0b.11)**

```bash
# Get access token
SUPABASE_TOKEN=$(supabase projects api-keys --project-ref <ref> -o json | jq -r '.[0].api_key')

# Actually, use the personal access token for Management API
# Pause
curl -X POST "https://api.supabase.com/v1/projects/<ref>/pause" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"

# Check status
curl "https://api.supabase.com/v1/projects/<ref>/health" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"

# Unpause/Restore
curl -X POST "https://api.supabase.com/v1/projects/<ref>/restore" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"
```

**Step 5: Document findings in `docs/research/2026-03-18-0b-supabase-findings.md`**

---

### Task 6: Stripe CLI test flow (0b.12)

**Step 1: Install + authenticate Stripe CLI**

```bash
brew install stripe/stripe-cli/stripe
stripe login
```

**Step 2: Create test product**

```bash
stripe products create --name="Rouge Test Product" --description="Battle test"
stripe prices create \
  --product=<product-id> \
  --unit-amount=999 \
  --currency=usd \
  --recurring[interval]=month
```

**Step 3: Start webhook listener**

```bash
stripe listen --forward-to http://localhost:3000/api/webhooks/stripe
# Note the webhook signing secret (whsec_...)
```

**Step 4: Trigger test events**

```bash
stripe trigger checkout.session.completed
stripe trigger customer.subscription.created
stripe trigger invoice.payment_succeeded
```

**Step 5: Verify events received + document findings**

Create `docs/research/2026-03-18-0b-stripe-findings.md`.

---

### Task 7: Lighthouse against deployed staging (0b.7)

**Step 1: Run Lighthouse**

```bash
npx @lhci/cli autorun --collect.url=https://staging.rouge-testbed.pages.dev \
  --collect.numberOfRuns=3 \
  --output=json
```

Or direct:
```bash
npx lighthouse https://staging.rouge-testbed.pages.dev \
  --output=json --output-path=./lighthouse-report.json \
  --chrome-flags="--headless=new"
```

**Step 2: Parse scores**

```bash
cat lighthouse-report.json | jq '{
  performance: .categories.performance.score,
  accessibility: .categories.accessibility.score,
  bestPractices: .categories["best-practices"].score,
  seo: .categories.seo.score
}'
```

**Step 3: Document findings in `docs/research/2026-03-18-0b-lighthouse-findings.md`**

Key questions to answer:
- Does headless Chrome work on this Mac?
- What's the JSON output format for automated parsing?
- What's the baseline score for a minimal Next.js app?
- Does `--chrome-flags="--headless=new"` work in `claude -p` mode?

---

### Task 8: Browser QA against deployed staging (0b.8)

**Step 1: Test GStack browse against staging**

```bash
$B goto https://staging.rouge-testbed.pages.dev
$B screenshot /tmp/rouge-testbed-staging.png
$B snapshot
$B snapshot -i
$B console --errors
$B perf
$B js "document.querySelector('#health')?.dataset.status"
```

**Step 2: Test interaction flow**

```bash
$B click @e1  # Click first interactive element
$B snapshot -i  # Verify state changed
```

**Step 3: Document findings in `docs/research/2026-03-18-0b-browse-findings.md`**

Key questions:
- Does $B work in `claude -p` mode? (should — it's a standalone binary)
- Latency per command against a deployed URL?
- Any CORS or CSP issues with browse commands?

---

### Task 9: Sentry setup via CLI (related to 0a.27)

**Step 1: Install + authenticate**

```bash
brew install getsentry/tools/sentry-cli
sentry-cli login
```

**Step 2: Create project**

```bash
sentry-cli projects create "rouge-testbed" --org=<org-slug> --platform=javascript-nextjs
```

**Step 3: Get DSN**

```bash
sentry-cli projects list --org=<org-slug>
# DSN format: https://<key>@o<org-id>.ingest.sentry.io/<project-id>
```

**Step 4: Document findings in `docs/research/2026-03-18-0b-sentry-findings.md`**

Key questions:
- Can sentry-cli create projects non-interactively?
- Is DSN retrievable via CLI or only dashboard?
- What's the minimal @sentry/cloudflare setup?

---

### Task 10: Code quality tools validation (part of 0b.1)

**Step 1: Install all code quality tools in testbed**

```bash
cd /tmp/rouge-testbed
npm install -D eslint @eslint/js typescript-eslint jscpd madge knip c8
```

**Step 2: Run each tool and verify JSON output**

```bash
# ESLint
npx eslint . --format json -o eslint-report.json

# jscpd
npx jscpd src/ --min-lines 6 --reporters json --threshold 5 --output ./reports

# madge (circular deps)
npx madge --circular --ts-config tsconfig.json src/

# knip (dead code)
npx knip --reporter json

# c8 coverage (with vitest)
npm install -D vitest
npx c8 --reporter=json-summary npx vitest run
```

**Step 3: Document findings**

For each tool: does it produce parseable JSON? Does it exit non-zero on failure? Any gotchas?

Create `docs/research/2026-03-18-0b-code-quality-findings.md`.

---

### Task 11: Compile all findings (0b.9)

**Step 1: Create master findings document**

Create `docs/research/2026-03-18-0b-battle-test-report.md` summarizing:
- Every tool tested: PASS / FAIL / WORKAROUND NEEDED
- Every manual step that must be automated
- Every CLI behavior that differs from what the phase prompts assume
- Specific phase prompts that need updating based on findings

**Step 2: Create issue list**

For each finding that requires a code change, add to a checklist:
- [ ] Update phase prompt X to use correct CLI syntax
- [ ] Update SaaS stack deployment.md for Workers+Assets path
- [ ] Add slot rotation logic to runner spec
- etc.

---

### Task 12: Clean up testbed (0b.9)

**Step 1: Tear down Cloudflare project**

```bash
npx wrangler pages project delete rouge-testbed
```

**Step 2: Tear down Supabase project (if created)**

```bash
# Pause (preserve for potential re-test)
curl -X POST "https://api.supabase.com/v1/projects/<ref>/pause" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"
```

**Step 3: Remove local testbed**

```bash
rm -rf /tmp/rouge-testbed
```

**Step 4: Commit all findings to The-Rouge repo**

```bash
cd /Users/gregario/Projects/ClaudeCode/The-Rouge
git add docs/research/2026-03-18-0b-*
git commit -m "docs: 0b infrastructure battle-test findings"
```

**Step 5: Mark 0b tasks complete in tasks.md**

---

## Execution Notes

- Tasks 1-4 are sequential (deploy depends on scaffold, production depends on staging, rollback depends on production).
- Tasks 5 (Supabase), 6 (Stripe), 9 (Sentry) are independent and can run in parallel after Task 1.
- Tasks 7 (Lighthouse) and 8 (Browse QA) depend on Task 2 (need a deployed staging URL).
- Task 10 (code quality) only needs the local testbed from Task 1.
- Tasks 11-12 run after everything else.

**Parallelization opportunity:** After Task 2 succeeds, dispatch:
- Agent A: Tasks 5 + 6 + 9 (external services)
- Agent B: Tasks 7 + 8 (testing against staging URL)
- Agent C: Task 10 (code quality tools, local only)

## Critical Success Criteria

After 0b, we must be able to answer YES to all of these:
1. Can `wrangler` deploy a Next.js app without touching a dashboard?
2. Can `supabase` CLI create + migrate a project without a dashboard?
3. Can `stripe` CLI run a full test flow without a dashboard?
4. Can Lighthouse run headless and produce parseable JSON?
5. Can GStack browse navigate and test a deployed URL?
6. Can `sentry-cli` create a project and retrieve a DSN?
7. Can all code quality tools produce parseable JSON with correct exit codes?
8. Is there a CLI-only staging → production promotion path?
9. Is there a CLI-only rollback path?

Any "NO" becomes a blocker that must be resolved before 0c (launcher implementation).
