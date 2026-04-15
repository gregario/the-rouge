# Software Development Anthology

Rouge's capability backlog. A prioritised list of everything Rouge should be able to build with. The unattended self-improvement loop (#53) uses this as its exploration backlog when there are no issues to work on.

Based on industry research (Stack Overflow 2025, State of JS, npm download data, market share analysis). Prioritised by: feasibility (can Rouge deliver it today?) > breadth (how many products benefit?) > strategic value (does it unlock a new product category?).

Items marked with a checkbox are done. Items without are the backlog.

Users set their preferred stack via composable preferences (#56) — Rouge serves the right patterns for their choices.

---

## Tier 1 — Stacks

What frameworks and runtimes can Rouge build with?

### Done
- [x] Next.js on Cloudflare Workers (with Supabase, Tailwind, shadcn/ui)

### Priority 1 (high feasibility, broad value)
- [ ] React + Vite — static SPA, no server, client-only apps
- [ ] Node.js CLI tools (Commander.js) — command-line utilities
- [ ] MCP servers — Model Context Protocol, tool definitions
- [ ] Express/Fastify API servers — REST/GraphQL backends
- [ ] Hono — edge-native backend (fastest growing backend framework, 340% YoY)
- [ ] Astro — content sites, marketing pages, documentation

### Priority 2 (moderate feasibility, strategic value)
- [ ] Next.js on Vercel — alternative deployment, largest hosting platform (32.5% share)
- [ ] SvelteKit — alternative full-stack, highest developer satisfaction (62.4%)
- [ ] Nuxt (Vue) — Vue ecosystem full-stack
- [ ] Tauri — lightweight desktop apps (10MB vs Electron's 100MB+)

### Priority 3 (lower feasibility, future)
- [ ] React Native / Expo — mobile apps
- [ ] Electron — desktop apps (powers VS Code, Slack)
- [ ] Python FastAPI — Python APIs (fastest growing backend, +5pt YoY in SO survey)
- [ ] Django — Python full-stack
- [ ] Go services — lightweight, high-performance backends
- [ ] ASP.NET Core — enterprise web (19.7% SO survey)
- [ ] Spring Boot — Java enterprise (most GitHub repos of any backend)
- [ ] Laravel — PHP (8.9% SO survey, strong indie presence)
- [ ] Rust CLI tools — systems-level utilities
- [ ] Godot — game engine (MIT, strong 2D, exploding growth)

### ORMs (cross-cutting, paired with stacks)
- [ ] Drizzle ORM — surpassed Prisma in weekly downloads 2025, TypeScript-native
- [ ] Prisma — largest total user base, strong ecosystem

---

## Tier 2 — Services

What infrastructure can Rouge provision and manage?

### Done
- [x] Supabase (database, auth, storage, realtime)
- [x] Stripe (payments)
- [x] Sentry (error monitoring)
- [x] Counterscale (analytics, self-hosted on Cloudflare)

### Priority 1 (commonly needed, good free tiers)
- [ ] Resend — transactional email (dev-first, React templates, 100/day free)
- [ ] Upstash — serverless Redis + message queue (rate limiting, caching, pay-per-request)
- [ ] PostHog — product analytics + session replay + feature flags (1M events/month free)
- [ ] Clerk — managed auth (dev-first, React components, 10K MAU free)
- [ ] Cloudflare R2 — object storage (S3-compatible, zero egress, 10GB free)
- [ ] Meilisearch — search (open source, <50ms, self-host free)

### Priority 2 (valuable alternatives and additions)
- [ ] Auth.js / Better Auth — open source auth libraries (no vendor lock-in)
- [ ] Neon — serverless Postgres (acquired by Databricks, branching model)
- [ ] Vercel — deployment platform (32.5% market share)
- [ ] Firebase — BaaS (5.7% SO survey, decade-long market leader, huge ecosystem)
- [ ] Inngest — managed workflow/queue engine (code-first, serverless)
- [ ] Trigger.dev — background jobs + long-running compute
- [ ] Sanity — headless CMS (developer-first, content-as-data)
- [ ] Strapi — open source headless CMS (self-hostable)

### Priority 3 (niche or enterprise)
- [ ] PlanetScale — managed MySQL/Postgres with branching
- [ ] Turso — edge SQLite (libSQL)
- [ ] AWS S3 — object storage (market leader)
- [ ] AWS Lambda — serverless functions
- [ ] Algolia — search-as-a-service (enterprise, 1.75T searches/year)
- [ ] Typesense — search (open source alternative to Algolia)
- [ ] Twilio — SMS and voice
- [ ] Paddle / Lemon Squeezy — merchant of record (handles tax/VAT)
- [ ] Railway — developer-friendly PaaS
- [ ] Fly.io — edge app hosting

---

## Tier 3 — Integration patterns

What code patterns can Rouge use when building features?

### Done
- [x] Stripe checkout session (server-side, redirect)
- [x] Stripe webhook handler (signature verification, idempotent)
- [x] Supabase RLS policies (row-level security)
- [x] Supabase auth with Next.js SSR (middleware, server components)
- [x] Sentry React error boundary (fallback UI, breadcrumbs)

### Priority 1 — near-universal (needed by 80%+ of web products)
- [ ] OAuth social login (Google, GitHub, Apple) — via Clerk, Auth.js, or Supabase
- [ ] File upload to cloud storage (R2, S3, Supabase Storage)
- [ ] Transactional email (welcome, password reset, notifications) — via Resend or SendGrid
- [ ] Webhook receiving pattern (verify signature, parse, dispatch)
- [ ] Rate limiting middleware (Upstash Ratelimit or in-memory)
- [ ] Background job dispatch (Inngest or Trigger.dev)
- [ ] CI/CD with GitHub Actions (test, build, deploy on push/PR)

### Priority 2 — very common (needed by 50-80%)
- [ ] Stripe subscription management (upgrade, downgrade, cancel, billing portal)
- [ ] Search integration (Meilisearch or Typesense setup + query pattern)
- [ ] Caching layer (Redis via Upstash, or edge caching)
- [ ] Feature flags (PostHog bundled, or simple custom)
- [ ] CMS integration (Sanity or Strapi content fetching)
- [ ] CSV/Excel export from data tables
- [ ] PDF generation (invoices, reports)

### Priority 3 — common for specific product types
- [ ] Maps — Mapbox (route rendering, geocoding) and OpenStreetMap (free, basic)
- [ ] Real-time subscriptions (Supabase Realtime, WebSockets, Pusher)
- [ ] Image optimisation (Cloudflare Images, Sharp, next/image)
- [ ] Markdown rendering with syntax highlighting
- [ ] Cron jobs / scheduled tasks (Cloudflare Cron Triggers, Inngest schedules)
- [ ] Full-text search (Supabase pg_trgm for simple cases)
- [ ] Multi-tenant data isolation patterns
- [ ] API key authentication (for building APIs others consume)
- [ ] Audit logging
- [ ] Data export / GDPR compliance (user data download)
- [ ] AI/LLM integration (OpenAI, Anthropic API patterns)
- [ ] i18n / internationalisation (next-intl, i18next)

---

## How to use this

**For the unattended loop (#53):** When there are no issues to work on and budget remains, pick the next unchecked item from the highest-priority tier. Run the feasibility gate. If it passes, build it and create a PR. If it defers, move to the next item.

**For contributors:** Pick an item, check feasibility, build it, submit a PR following the contribution standard in CONTRIBUTING.md.

**For prioritisation decisions:** Items move up when multiple products need them. Items move down when the feasibility gate defers them.

This list evolves. Items get added as new product types reveal gaps. Items get checked off as Rouge or the community builds them.

---

## Sources

Prioritisation informed by Stack Overflow Developer Survey 2025, State of JavaScript 2025, npm download data, and market share analysis across deployment platforms, BaaS providers, auth services, and payment processors.
