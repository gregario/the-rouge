# Integration Catalogue Design (Library Tier 2 + Tier 3)

> GitHub Issue: #13. Extends the library's heuristic storage with structured integration knowledge.

## Problem

Rouge needs to know HOW to integrate with external services when building products. Currently this knowledge is scattered across phase prompts and hardcoded into seed specs. When the building phase needs to add Stripe or Supabase, it improvises — leading to inconsistent setup, missing env vars, and no reuse across products.

The library already stores quality heuristics (Tier 1: global, domain, personal). Integration knowledge requires two new tiers with different schemas: services (setup/teardown lifecycle) and patterns (reusable code recipes).

## Tier Definitions

**Tier 1 — Stacks** (existing, via `vision.json` stack detection):
Language + framework + build tool + deploy target. E.g., "Next.js 15 on Cloudflare Workers." Defines project structure, build commands, dev server, deploy pipeline. Already handled by vision document and CLAUDE.md generation during seeding.

**Tier 2 — Services** (new):
External services with a setup/teardown lifecycle. Each entry captures everything needed to add or remove the service from a project: packages, env vars, setup steps, teardown steps, cost tier. Examples: Supabase (database + auth + storage), Stripe (payments), Sentry (error monitoring), Counterscale (analytics), Resend (email).

**Tier 3 — Integrations** (new):
Specific API patterns within a service. Reusable code recipes with context on when to apply them. These are the building blocks the building phase assembles. Examples: Stripe checkout session flow, Supabase RLS policy pattern, Sentry React error boundary, Resend transactional email template.

## Catalogue Structure

```
library/
  integrations/
    tier-2/
      supabase.yaml
      stripe.yaml
      sentry.yaml
      counterscale.yaml
      resend.yaml
    tier-3/
      stripe-checkout-session.yaml
      stripe-webhook-handler.yaml
      supabase-rls-pattern.yaml
      supabase-auth-nextjs.yaml
      sentry-react-boundary.yaml
      counterscale-script-tag.yaml
```

## Entry Schema

### Tier 2 (Service)

```yaml
id: supabase
name: Supabase
tier: 2
category: database-auth
description: Postgres database with auth, storage, and realtime subscriptions.
cost_tier: free-to-start  # free-to-start | paid | usage-based
requires:
  env_vars:
    - NEXT_PUBLIC_SUPABASE_URL
    - NEXT_PUBLIC_SUPABASE_ANON_KEY
    - SUPABASE_SERVICE_ROLE_KEY
  packages:
    - "@supabase/supabase-js"
    - "@supabase/ssr"
setup_steps:
  - Create Supabase project at supabase.com/dashboard
  - Copy project URL and anon key to .env.local
  - Run `npx supabase init` in project root
  - Run `npx supabase db push` to apply migrations
teardown_steps:
  - Pause project in Supabase dashboard (preserves data)
  - Remove env vars from deployment
tested_with:
  - next-cloudflare
  - next-vercel
```

### Tier 3 (Integration)

```yaml
id: stripe-checkout-session
name: Stripe Checkout Session Flow
tier: 3
service: stripe  # links to Tier 2 entry
category: payments
tags: [checkout, server-side, redirect]
description: Server-side checkout session creation with success/cancel redirect.
applies_when: Product needs one-time or subscription payments with hosted checkout.
requires:
  packages:
    - stripe
  env_vars:
    - STRIPE_SECRET_KEY
    - STRIPE_WEBHOOK_SECRET
code_patterns:
  - file: src/app/api/checkout/route.ts
    pattern: |
      // Server action: create Stripe checkout session
      // Redirect to session.url on success
      // Handle cancel URL for abandoned checkouts
  - file: src/app/api/webhooks/stripe/route.ts
    pattern: |
      // Verify webhook signature
      // Handle checkout.session.completed event
      // Provision access / fulfill order
tested_with:
  - next-cloudflare
  - next-vercel
```

## Discovery

The building phase finds relevant integrations through a three-step match:

1. **Read `vision.json`** for declared services (e.g., `"services": ["supabase", "stripe"]`).
2. **Load Tier 2 entries** for each declared service. Extract env vars, packages, and setup steps.
3. **Search Tier 3 entries** by `service` field and `tags` for implementation patterns matching the current feature area.

Phase prompts include a discovery preamble:

```bash
# Load integration context for this product
for svc in $(jq -r '.services[]' vision.json); do
  cat library/integrations/tier-2/${svc}.yaml
  cat library/integrations/tier-3/${svc}-*.yaml 2>/dev/null
done
```

## Self-Growing Mechanism

The catalogue grows as Rouge builds products. Three stages:

**1. Draft creation (building phase):**
When the building phase implements a new integration pattern not in the catalogue, it writes a draft entry to `library/integrations/drafts/`. Drafts follow the same schema but have `status: draft`.

**2. Validation (retrospective phase):**
During the cycle retrospective, draft entries are checked:
- Has setup steps (Tier 2) or code patterns (Tier 3).
- Has at least one `tested_with` entry matching the current product's stack.
- Has required env vars and packages listed.
Drafts that pass validation are promoted: moved from `drafts/` to `tier-2/` or `tier-3/`.

**3. PR back to Rouge (cross-product):**
When Rouge builds multiple products, validated entries from one product are available to all others. The library is shared, not per-project. New entries are committed to the Rouge repo, not the product repo.

## Implementation Plan

1. Create `library/integrations/` directory structure with `tier-2/`, `tier-3/`, `drafts/`.
2. Add YAML schema validation to `src/launcher/validate-library.sh` (extend existing JSON validation).
3. Seed initial entries for: Supabase, Stripe, Sentry, Counterscale (Tier 2) and 2-3 patterns each (Tier 3).
4. Add discovery preamble to the building phase prompt.
5. Add draft-writing instruction to the building phase prompt.
6. Add draft-validation step to the retrospective phase prompt.
