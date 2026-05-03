# Rouge Open Source Launch Plan

**Goal:** Launch Rouge as an open source project that people actually want to use. The launch needs a compelling hook project (not Epoch — too simple), polished packaging, and coordinated distribution.

---

## Action Items

### Step 0: Hook Project — Testimonial Wall (Open Source)
- [x] Brainstorm the ideal showcase project
- [ ] Brief written: `docs/plans/2026-03-24-hook-project-brief.md`
- [ ] Seed through Rouge Spec (waiting for user go-ahead — Rouge being updated separately)
- [ ] Build through Rouge Build (new observe-once architecture)
- [ ] Record cost and quality metrics for the launch narrative
- [ ] Publish as separate open source repo
- [ ] Deploy to production

### Step 0b: Marketing Landing Pages
- [ ] Rouge landing page (what it is, how it works, Epoch + testimonial stories)
- [ ] Testimonial project landing page (what it does, screenshots, self-host instructions)
- [ ] Decide hosting: GitHub Pages, Cloudflare Pages, or Rouge builds them

### Step 1: Open Source Audit
- [ ] Scan for leaked tokens, API keys, DSNs in all committed files
- [ ] Check .gitignore covers all sensitive files (.env, .calibration.json, personal library data)
- [ ] Remove hardcoded paths (grep for /Users/gregario)
- [ ] Remove personal Slack tokens, webhook URLs, org IDs from committed code
- [ ] Review provision-infrastructure.js for hardcoded org slugs (greg-j, etc.)
- [ ] Check that PostHog key in template is acceptable as public (client-side key — should be fine)
- [ ] Verify projects/ directory is gitignored (contains real product code)
- [ ] Verify library/personal/ is gitignored (contains user-specific learnings)
- [ ] Review all prompts for anything user-specific vs generic
- [ ] Add LICENSE file (MIT)
- [ ] Add CONTRIBUTING.md
- [ ] Clean git history if needed (check for secrets in old commits)

### Step 2: npm Packaging
- [ ] Create package.json with name, version, bin entries
- [ ] CLI entry point: `rouge init`, `rouge seed`, `rouge build`, `rouge status`, `rouge cost`
- [ ] Setup wizard: prompt for Anthropic API key, Slack tokens, Cloudflare auth
- [ ] Bundle prompts, schemas, templates, library/global
- [ ] Test: `npx rouge init` creates a working Rouge installation
- [ ] Publish to npm

### Step 3: README & Documentation
- [ ] Rewrite README.md for open source audience (not internal factory notes)
- [ ] Hero: hook project screenshot + "Built autonomously for $X"
- [ ] Quick start: install → configure → first product in 5 minutes
- [ ] Architecture overview (from how-rouge-works-v3.md)
- [ ] Badge pills (npm, license, Node.js version)
- [ ] GIF or video embed of the loop running

### Step 4: Demo Video
- [ ] Write scene-by-scene script with timing
- [ ] Scenes: Slack seeding → loop running in terminal → QA screenshots appearing → deployed product → cost
- [ ] Target: 2 minutes
- [ ] Record and edit
- [ ] Upload to YouTube, embed in README

### Step 5: Launch Day
- [ ] **Hacker News (Show HN)**: technical angle, architecture focus, cost number
- [ ] **Product Hunt**: maker profile, tagline, screenshots, launch day scheduled
- [ ] **Reddit**: r/programming, r/SideProject, r/ClaudeAI — different angle per sub
- [ ] **Dev.to**: technical blog version of the launch post
- [ ] **GitHub**: ensure README is polished, pin the repo

### Step 6: Substack
- [ ] Article 1: "I built a factory that builds products" (launch narrative)
- [ ] Article 2: "How Rouge Works" (technical deep dive, adapted from v3 doc)
- [ ] Article 3: "What I learned building an autonomous product system" (lessons, philosophy)
- [ ] Schedule: Article 1 on launch day, Article 2 one week later, Article 3 two weeks later

---

## Launch Narrative

**The hook:** "This [product] was built autonomously for $[X]. No human wrote a line of code."

**The proof:** Deployed product with real users, real payments, real data. Not a toy.

**The system:** Rouge — open source, install it yourself, build your own products.

**The cost:** Three orders of magnitude cheaper than a human developer.

---

## Timeline

| Week | Focus |
|------|-------|
| This week | Hook project brainstorm → seed → build |
| Next week | Open source audit + npm packaging |
| Week 3 | README polish + demo video |
| Week 4 | Launch (HN + Product Hunt + Reddit + Substack Article 1) |

---

## Licensing

| Repo | License | Rationale |
|------|---------|-----------|
| **the-rouge** (Spec + Build) | MIT | Fully open, do whatever you want |
| **[testimonial-project]** | MIT | Hook project, fully open |
| **rouge-grow** (future) | BSL (Business Source License) | Source available, free for non-commercial, sponsors get commercial license |
| **rouge-maintain** (future) | BSL | Same as Grow |

Sponsor tiers:
- Free: Spec + Build (MIT)
- $10/month sponsor: early access to Grow + Maintain when they ship
- $X/month commercial: BSL commercial license for Grow + Maintain

Grow and Maintain are NOT built before launch. Announced in README roadmap, delivered after traction.

## Open Questions

- ~~What's the hook project?~~ Testimonial wall (decided)
- Custom domain for the hook project?
- Landing pages for Rouge and testimonial project — hosting decision
- Product Hunt: schedule launch for a Tuesday (best day for PH)?
- Testimonial project name (decide during Rouge Spec seeding)
