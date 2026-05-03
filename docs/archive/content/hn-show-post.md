# Show HN: Rouge – an open source system that autonomously builds, tests, and ships web products

## Title (for HN submission)

`Show HN: Rouge – Open source system that built a deployed web app for $8.53`

Link: https://github.com/gregario/the-rouge

---

## First Comment (post immediately after submission)

Hey HN — I built Rouge because I wanted to see how far autonomous product development could go. Not "generate a landing page" autonomous — full lifecycle: idea through Slack conversation → specs → code → tests → browser QA → accessibility audit → code review → ship to Cloudflare Workers. All autonomous, all with quality gates.

**What it built:** A Pomodoro timer called Epoch. 90 tests, 67/67 acceptance criteria passing, Lighthouse 91/100/100/100, accessibility score 100. It found and fixed a missing focus trap in a settings modal by literally tabbing through the UI 11 times. Total compute cost: $8.53.

**How it works:**

Rouge is a Node.js orchestrator that calls the Claude API for each phase. The loop:

1. **Building** — Claude writes code, runs tests, deploys to Cloudflare Workers
2. **Code review** — runs ESLint, jscpd, madge, knip, npm audit, plus a 7-dimension AI code audit
3. **Product walk** — opens a headless browser, screenshots every screen state, clicks every element, tests keyboard navigation. Pure observation — no judgment yet.
4. **Evaluation** — three lenses read the walk data: QA (does it match the spec?), Design (does it look real?), PO (will it delight users?). The browser is closed. This is the key architectural choice — observe once, judge through lenses.
5. **Analyzing** — decides: ship, improve, or escalate to human
6. Repeat until quality converges

Each cycle, the product gets better. Accessibility went from 89 to 100 across cycles because the evaluation found WCAG contrast violations and missing semantic landmarks, generated change specs, and the builder fixed them.

**The architecture I'm most proud of:** separating observation from judgment. The original version opened the browser six times per cycle (QA, accessibility, design review, three PO review sub-phases). Wasteful. The redesign opens it once, captures structured observations, then three evaluation lenses read the same data. Cut browser time from ~26 min to ~8 min per cycle.

**What ships with every product:**

Every Rouge-built product gets a production stack automatically: Cloudflare Workers hosting, Supabase (Postgres + Auth), Sentry error monitoring, PostHog analytics, GitHub Actions CI, security headers (CSP/HSTS), i18n support, legal page scaffolds. All provisioned during the first build cycle.

Deploy has automatic rollback — if the health check fails after deploy, it rolls back to the previous Cloudflare version. Database migrations run with dry-run preview and block destructive operations (DROP TABLE, TRUNCATE) from running autonomously.

**What it doesn't do well yet:**

- Only tested on small projects (6 screens). Module hierarchy for larger projects is designed but not battle-tested.
- The seeding phase (Rouge Spec) works through Slack but the prompts need more polish for general use.
- No Stripe integration in the showcase project yet — working on a more complex hook project.
- Parallel builds (multiple feature areas in worktrees simultaneously) is designed but not implemented.

**Stack:** Node.js launcher, Claude API (Opus), GStack headless browser, Cloudflare Workers, Supabase, Next.js.

MIT licensed. The idea is you install it, describe a product in Slack, and come back to a deployed application.

Happy to answer questions about the architecture, the evaluation system, or the economics.

---

## Notes for posting

- Post between 8-10am ET on a weekday (Tuesday-Thursday best)
- Link goes to the GitHub repo (not a blog post)
- Post this first comment IMMEDIATELY after the submission
- Reply to every comment within 10 minutes for the first 2 hours
- Don't share the HN link asking for upvotes — share the GitHub repo link on other channels and let people find the HN post naturally
- Have the demo video ready and linked in the README before posting
