# Your first product

You've installed Rouge, run `rouge doctor`, and read the [seeding example](seeding-example.md). Now you want to actually build something. Here's what happens end to end.

## Before you start

Run `rouge doctor` and make sure everything is green. If anything is red, fix it first. The build loop will not compensate for missing prerequisites.

**What to expect:**
- A simple product (1-3 features) takes 2-4 hours of session time across 3-5 cycles.
- If you're on a Claude Max subscription, that's comfortably within a day's session budget. On Pro, you might need two days.
- API key users: budget $5-20 for a simple product. Run `rouge cost my-first-app --estimate` after seeding for a more precise number.

**Start simple.** Your first Rouge product should not be a fleet management SaaS with 10 feature areas and a map integration. Pick something with 2-3 features. A recipe organiser. A habit tracker. A reading list. You want to learn the loop, not stress-test it.

**Set up Slack.** Seriously. The whole point of autonomous building is that you walk away and check your phone. If Slack isn't set up, you're staring at a terminal. See [slack-setup.md](slack-setup.md).

## Initialise

```bash
rouge init my-first-app
rouge doctor
```

After init, your project directory looks like:

```
projects/my-first-app/
  .rouge/
    config.json
  CLAUDE.md
```

That's it. Nothing to build yet. `rouge doctor` should still show all green — init doesn't add new dependencies.

## Seed

```bash
rouge seed my-first-app
```

This is the interactive bit. Eight personas walk through your idea: brainstorming, competition, taste, spec, design, legal, marketing. About 10-20 minutes of your time. The [seeding example](seeding-example.md) covers this in detail.

The key output is `vision.json`. This is the North Star for every autonomous phase that follows. Every build cycle reads it. Every evaluation grades against it.

**Tip:** Be specific in your product description. "A task manager" gives Rouge almost nothing to work with. "A task manager for freelancers who track billable hours across multiple clients with weekly invoicing" gives it a persona, a problem, and enough constraints to make real decisions.

## Build

```bash
rouge build my-first-app
```

The terminal shows the launcher ticking through phases:

```
[rouge] Starting build for my-first-app
[rouge] Reading vision.json and seed specs...
[rouge] Complexity profile: simple (no foundation cycle needed)
[rouge] Beginning feature area 1/3: catalogue
[rouge] Invoking claude -p for build phase...
```

In Slack, you'll see:

> **Rouge:** Building my-first-app — catalogue feature area (cycle 1)

You can walk away now. Check `rouge status` whenever you're curious. Or watch the Slack channel from your phone. The loop runs until it's done or it needs you.

How long? For a simple 3-feature product, expect 3-5 cycles over 2-4 hours of session time. Most cycles take 20-40 minutes. Some are quick (evaluation passes first time), some take longer (quality gaps need fixing).

## What happens during the loop

Here's a typical lifecycle for a simple product with three feature areas.

**Cycle 1 — First feature area.** Rouge reads the spec, builds with TDD, deploys to staging. Then the five-lens evaluation runs: test integrity, code review, browser QA, product evaluation, design review. One browser session, three evaluation lenses reading the same observation data.

Common result: the first attempt has quality gaps. Missing empty states. Accessibility score below the bar. Form validation that shows errors on page load instead of on submit. The evaluation catches these and generates a change spec.

Slack:

> **Rouge:** Evaluation complete for catalogue: 3 gaps found (empty state missing, Lighthouse a11y 82/100, form validation not inline). Looping back.

**Cycle 2 — First feature area, fixes.** Rouge reads the change spec, fixes the gaps, redeploys. Evaluation runs again. For simple features, this usually passes.

Slack:

> **Rouge:** Quality bar met for catalogue. Moving to card-experience.

**Cycle 3 — Second feature area.** Same rhythm. Build, deploy, evaluate, fix if needed.

**Cycles 4-5 — Third feature area and final pass.** After all feature areas pass individually, Rouge does a final integration check. Then it promotes.

Slack:

> **Rouge:** All feature areas complete. Promoting my-first-app to production.

The number of cycles varies. A dead-simple product might finish in 3 cycles. Something with trickier interactions might take 6-7. Rouge loops as many times as it needs to. There's no fixed limit.

## Common situations

**"Evaluation keeps failing on the same thing."** After 3 retries on the same gap, Rouge transitions to `waiting-for-human` and pings you on Slack. Check the message — it'll tell you exactly what's failing and what it's tried. Give feedback, and it resumes.

**"I need to stop and come back tomorrow."** Ctrl+C the loop. State is saved to disk after every phase. Run `rouge build my-first-app` again tomorrow. It picks up where it left off.

**"My session time ran out."** Same as stopping. State is on disk. Resume when you have session time. Rouge doesn't lose progress.

**"Rouge built something I don't like."** Give feedback via Slack: `/rouge feedback my-first-app "the colour scheme is too dark, I want warm pastels"`. Rouge incorporates it in the next cycle. This is the outer loop — human taste refining what the inner loop built.

**"Rouge is stuck on foundation."** Check `rouge status my-first-app`. If foundation keeps failing, it usually means an integration you haven't set up (Supabase, Stripe, etc.). The Slack message will say what's missing. Run `rouge setup <integration>` and resume.

**"I want to see what it deployed."** `rouge status my-first-app` shows the staging URL. Open it in your browser. You can poke around while Rouge is still building other features — staging updates after each successful phase.

## It shipped

When the final evaluation passes and promotion succeeds:

- Slack: "my-first-app promoted to production."
- The staging deploy becomes production (or a new production deploy happens, depending on your infrastructure setup).
- Git history has a clean trail of every phase's work — specs, builds, evaluations, fixes, all committed.
- Run `rouge cost my-first-app --actual` to see what it actually cost in session time and tokens.

That's it. You described a product, answered some questions for 15 minutes, and walked away. Rouge built, evaluated, fixed, and shipped it.

## What's next

- **Build another one.** The best way to learn Rouge is to build 2-3 small products. Each one teaches you something about how the loop works and what kinds of products it handles well.
- **Check your costs.** Run `rouge cost` to understand your session usage patterns. This helps you plan bigger projects.
- **Read the git history.** `git log --oneline` in your product's repo shows every phase's work. It's the best way to understand what Rouge actually did.
- **Contribute patterns back.** If Rouge built an integration pattern that doesn't exist in the catalogue yet (it does this automatically when it encounters a missing pattern), consider contributing it. That's how the catalogue grows.
