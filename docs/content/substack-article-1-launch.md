# I Built a Factory That Builds Products

*Substack Article 1 — publish on launch day*

---

Last month I described a product idea in a Slack message. This week, I have a deployed web application with 90 passing tests, perfect accessibility scores, and a codebase that a senior engineer would recognise as competently built.

No human wrote a line of code.

The application is called Epoch — a focus timer for people who care about what's on their screen. The system that built it is called Rouge. And I'm open-sourcing both of them today.

## The name

In 1928, Ford opened the River Rouge Complex. Iron ore went in one end. Finished cars came out the other. It was the first truly vertically integrated factory — raw materials to finished product under one roof.

Rouge is the software version. A product idea goes in. A deployed, tested, monitored application comes out.

## What it actually does

You describe a product in a Slack conversation. Eight AI personas take turns refining the idea — a brainstormer, a competition analyst, someone who challenges whether the idea is worth building at all, a spec writer, a designer, and so on. You answer questions and make decisions. They produce the blueprint.

Then an autonomous loop takes over. It writes code, runs tests, deploys to staging, opens a headless browser to test every screen, and evaluates what it built through three lenses: does it match the spec? Does it look like a real product? Would a customer be delighted by it?

If it finds issues — and it always does, on the first cycle — it generates fixes and loops again. Each cycle, the product gets measurably better.

## What it built

Epoch is a Pomodoro timer. Frosted glass aesthetic, phase-colored transitions, keyboard shortcuts, synthesised audio chime. The kind of app you'd leave on your second monitor all day because it's pleasant to look at.

The system built the entire thing in five cycles:

- **Cycle 1**: Built all six feature areas. 89 tests. Deployed.
- **Cycle 2**: Found a missing error boundary, a settings modal using a div overlay instead of a native `<dialog>` element, and four contrast violations. Fixed all of them. Accessibility went from 89 to 100.
- **Cycles 3–5**: Polished interactions, improved architecture, converged on the vision.

Total cost: **$8.53** of compute time. 108 minutes of active execution.

For context, a human developer would spend one to two weeks on this scope. At contractor rates, that's $4,000 to $12,000.

## How it judges quality

This is the part that surprised me most. The system doesn't just build and hope for the best. It runs real tools against real deployed code:

- **Lighthouse** for performance, accessibility, and SEO
- **ESLint, madge, knip** for code quality
- **A headless browser** that clicks every button, tabs through every element, fills every form
- **A seven-dimension code audit** covering architecture, security, robustness, and tech debt

It found the missing focus trap in the settings modal by tabbing through the UI eleven times and observing the focus escaping to the background. That's not vibes-based evaluation. That's structured testing with evidence.

## What ships with every product

Every product Rouge builds comes with a full production stack, provisioned automatically:

- Cloudflare Workers for hosting (with automatic rollback if a deploy breaks)
- Supabase for database and auth
- Sentry for error monitoring
- PostHog for analytics and session recording
- GitHub Actions for CI
- Security headers, i18n support, legal page scaffolds

You don't configure any of this. The system provisions it during the first build cycle.

## What I learned

Building the factory taught me more about software quality than building software ever did.

The first version was wasteful — 41% of execution time was retries, timeouts, and redundant reviews. The system opened a browser six times per cycle because each evaluation phase did its own walk. I redesigned it to observe once and judge through multiple lenses. Browser time dropped from 26 minutes to 8 minutes per cycle.

The system found issues I wouldn't have caught manually. Not because it's smarter — because it's thorough. It checks every acceptance criterion, every cycle, with evidence. No human QA engineer checks 67 criteria across six user journeys every time a button moves three pixels.

## What's next

Rouge is open source today. You can install it, connect it to Slack, and build your own products.

I'm also publishing the first product it builds for its launch — a self-hostable testimonial wall — as a separate open source project. Beautiful by default, own your data, deploy to your own infrastructure.

The vision is two products: Rouge Spec (co-design with AI) and Rouge Build (the autonomous loop), both available today. The post-build lifecycle (growth, maintenance, operations) is moving to a new project called The Works.

The goal: describe a product over coffee, approve a cost estimate, and come back to a deployed application. We're not there yet. But we're closer than I expected.

**[Star Rouge on GitHub →](https://github.com/gregario/the-rouge)**

---

*Next week: How Rouge Works — a technical deep dive into the Karpathy Loop, the observe-once architecture, and the evaluation system.*
