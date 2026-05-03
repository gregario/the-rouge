# Hook Project Brief: Testimonial Wall (Open Source)

**Purpose:** Showcase project for Rouge's open source launch. Built entirely by Rouge, published as a separate open source repo.

---

## Product

**One-liner:** Beautiful, self-hostable testimonial walls. Open source.

**Positioning:** Positive framing — what it IS, not what it's against. Like PostHog for analytics, this is the open source testimonial tool.

**Name:** TBD (decide during Rouge Spec seeding)

## Scope (V1)

### In scope
- **Collection**: shareable form link where customers submit text testimonials
- **Curation**: dashboard where the owner reviews, approves/rejects, tags testimonials
- **Display**: embeddable "Wall of Love" widget + standalone public page
- **Auth**: owner login via Supabase Auth
- **Database**: Supabase (testimonials, tags, settings)
- **Self-hostable**: deploy to own Cloudflare Workers, own your data
- **Beautiful by default**: the output should look magazine-quality without configuration

### Out of scope (V1)
- Video testimonials (complex, save for later)
- Stripe/payments (self-hosted = free, no paywall needed)
- AI features (sentiment analysis, auto-import — not for launch)
- Social media import (paste tweet URL → testimonial — nice-to-have, not V1)

### Getting started (self-host)
- Guided setup wizard: `npx [project-name] init` — interactive prompts, not a wall of docs
- **Required steps** (can't skip): Supabase project (connection + anon key), Cloudflare account (deploy target)
- **Optional steps** (skip with Enter): PostHog token, Sentry DSN, custom domain
- Each optional step is one prompt, one paste. App works without them.
- Wizard validates credentials and tests connections before proceeding
- Target: idea to deployed testimonial wall in under 10 minutes
- Fallback: traditional README with step-by-step instructions for those who prefer it

## Stack

Same as all Rouge-built products:
- Next.js (static + API routes)
- Supabase (Postgres + Auth)
- Cloudflare Workers (deploy)
- PostHog (analytics, product-tagged)
- Sentry (error monitoring)
- GitHub Actions (CI)

## Why This Project

- Uses auth, database, multiple screens, real user flows
- Visually impressive (testimonial walls look great in screenshots)
- Every indie hacker understands and needs it
- Self-hostable angle aligns with Rouge being open source
- Not forced — the product makes sense on its own
- Separate open source repo → two projects launched together

## Launch Narrative

"We built Rouge, an open source system that builds products autonomously. To prove it works, we had it build [Name] — a self-hostable testimonial wall. Here's what it built for $X, with no human writing a line of code."

Two repos launched together:
1. **the-rouge** — the factory (open source)
2. **[testimonial-project]** — the product the factory built (open source)

## Marketing Landing Pages

Both projects need a landing page:
- Rouge landing page: what it is, how it works, the Epoch story, the testimonial story
- Testimonial project landing page: what it does, screenshots, self-host instructions

Options: GitHub Pages, Cloudflare Pages, or Rouge builds them too (meta).

## Next Steps

1. Seed this through Rouge Spec (when user gives the go-ahead)
2. Build through Rouge Build (new observe-once architecture)
3. Record metrics (cost, cycles, quality scores)
4. Publish as separate repo
5. Continue with launch plan (audit, npm, README, demo, distribution)
