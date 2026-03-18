# 0b Battle Test: Cloudflare Deployment Findings

**Date:** 2026-03-18
**Tested with:** wrangler 4.75.0, @opennextjs/cloudflare 1.17.1, Next.js 16.1.7

## Verdict: Workers + Static Assets is the correct path. Pages deploy is broken for OpenNext.

---

## Finding 1: Pages Deploy Returns 404 — Use Workers Instead

**CRITICAL.** The SaaS stack docs (`stacks/saas/deployment.md`) recommend Cloudflare Pages with `pages_build_output_dir = ".worker"`. This does NOT work with current OpenNext.

**What happened:**
- `wrangler pages deploy .open-next --project-name=rouge-testbed --branch=staging` → uploaded 124 files, returned 200 in CLI
- Actual URL returned 404 with empty body
- Pages treated `.open-next/` as flat static files, ignoring `worker.js`

**What works:**
```toml
# wrangler.toml (correct)
name = "my-app"
compatibility_date = "2025-12-01"
compatibility_flags = ["nodejs_compat"]
main = ".open-next/worker.js"

[assets]
directory = ".open-next/assets"
```

Then: `npx wrangler deploy` (NOT `wrangler pages deploy`)

**Why:** OpenNext 1.17.1 builds to `.open-next/` (not `.worker/`), producing a Worker entry point (`worker.js`) + static assets (`assets/`). This requires Workers + Static Assets, not Pages.

**Bonus:** `wrangler deploy` auto-detects OpenNext and calls `opennextjs-cloudflare deploy` internally.

**Action:** Update `stacks/saas/deployment.md` and `stacks/saas/first-deploy.md` for Workers path. Update all phase prompts that reference Pages.

---

## Finding 2: OpenNext Config Requires Full Schema

The SaaS stack docs show a minimal `open-next.config.ts`:
```typescript
// BROKEN — missing required fields
{ default: { override: { wrapper: 'cloudflare-node', converter: 'edge' } } }
```

**Correct config (OpenNext 1.17.1):**
```typescript
import type { OpenNextConfig } from '@opennextjs/cloudflare';

const config: OpenNextConfig = {
  default: {
    override: {
      wrapper: 'cloudflare-node',
      converter: 'edge',
      proxyExternalRequest: 'fetch',
      incrementalCache: 'dummy',
      tagCache: 'dummy',
      queue: 'dummy',
    },
  },
  edgeExternals: ['node:crypto'],
  middleware: {
    external: true,
    override: {
      wrapper: 'cloudflare-edge',
      converter: 'edge',
      proxyExternalRequest: 'fetch',
      incrementalCache: 'dummy',
      tagCache: 'dummy',
      queue: 'dummy',
    },
  },
};

export default config;
```

**Action:** Update SaaS stack docs and web-product template with full config.

---

## Finding 3: Staging via `--env` Works Perfectly

Workers doesn't have Pages' branch-based preview deploys. Instead, use wrangler environments:

```toml
[env.staging]
name = "my-app-staging"
```

Deploy: `npx wrangler deploy --env staging`
URL: `https://my-app-staging.<account>.workers.dev`

Production: `npx wrangler deploy` (no --env)
URL: `https://my-app.<account>.workers.dev`

**Staging and production are completely isolated Workers.** Deploying to staging never affects production.

**Action:** Phase prompts should use `--env staging` for staging deploys, bare `wrangler deploy` for production.

---

## Finding 4: Project Creation is Implicit

Workers auto-create on first `wrangler deploy`. No `wrangler pages project create` needed.

Pages required explicit `wrangler pages project create` first, then deploy.

**Winner: Workers.** One command does both create + deploy.

**Note:** Pages project create IS fully CLI-automated (`npx wrangler pages project create <name> --production-branch=main`), but it's unnecessary with the Workers path.

---

## Finding 5: Rollback via Version Deploy

Workers has first-class version management:

```bash
# List versions
npx wrangler versions list --name <worker-name>

# Rollback to specific version
npx wrangler versions deploy <version-id>@100% --name <worker-name> --yes
```

Tested: deployed broken version to staging → rolled back to previous version → confirmed original content restored. Production was unaffected throughout.

**Key detail:** `--yes` flag only works on `versions deploy`, not on `delete`. The `delete` command uses `--force`.

---

## Finding 6: SSL Provisioning Delay

New `.pages.dev` domains take 60-120 seconds for SSL. During this window, `curl` gets `sslv3 alert handshake failure`. Workers `.workers.dev` domains had no such delay.

**Action:** Phase prompts should include a retry loop after first deploy (wait up to 2 min for SSL).

---

## Finding 7: Asset Caching is Smart

Second deploy of identical assets: "0 files (124 already uploaded) (0.12 sec)". Wrangler fingerprints assets and only uploads changed ones. This makes redeploy of the same build to a different environment very fast.

---

## Finding 8: Build Command

The build command is `npx @opennextjs/cloudflare build`, NOT `npx opennext build` (404 on npm). The README also shows `npx opennextjs-cloudflare build` as equivalent.

---

## Finding 9: Non-Interactive Mode

Wrangler works fully non-interactively in `claude -p` context:
- `wrangler whoami` — works
- `wrangler deploy` — works (telemetry prompt auto-accepts)
- `wrangler pages project create` — works
- `wrangler pages project delete` — works (auto-accepts confirmation)
- `wrangler delete` — uses `--force` flag (no `--yes`)

---

## Finding 10: Delete Commands

```bash
# Delete a Worker
npx wrangler delete --name <worker-name> --force

# Delete a Pages project
npx wrangler pages project delete <project-name>
# Auto-accepts in non-interactive mode
```

---

## Promotion Flow (Staging → Production)

The correct autonomous promotion flow for Rouge:

1. `npx @opennextjs/cloudflare build` — build once
2. `npx wrangler deploy --env staging` — deploy to staging
3. Run QA/Lighthouse/browse against staging URL
4. If pass: `npx wrangler deploy` — deploy same build to production (assets already cached)
5. If fail: fix → rebuild → redeploy staging → re-test

**Rollback:** `npx wrangler versions list --name <name>` → `npx wrangler versions deploy <good-version>@100% --name <name> --yes`

---

## Updated Wrangler.toml Template for Rouge Projects

```toml
name = "project-name"
compatibility_date = "2025-12-01"
compatibility_flags = ["nodejs_compat"]
main = ".open-next/worker.js"

[assets]
directory = ".open-next/assets"

[env.staging]
name = "project-name-staging"

[vars]
ENVIRONMENT = "production"

[env.staging.vars]
ENVIRONMENT = "staging"
```

---

## Tasks to Complete Based on Findings

- [ ] Update `stacks/saas/deployment.md` — Workers path, not Pages
- [ ] Update `stacks/saas/first-deploy.md` — Workers path, correct OpenNext config
- [ ] Update `open-next.config.ts` in web-product template — full schema
- [ ] Update `wrangler.toml` in web-product template — Workers + Static Assets
- [ ] Update building phase prompt (`src/prompts/loop/01-building.md`) — correct deploy commands
- [ ] Update ship/promote phase prompt (`src/prompts/loop/07-ship-promote.md`) — Workers promotion flow, version rollback
- [ ] Update QA gate prompt (`src/prompts/loop/02b-qa-gate.md`) — staging URL pattern
- [ ] Add SSL wait/retry to building and QA prompts
