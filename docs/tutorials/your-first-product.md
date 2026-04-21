# Your first product

> ⚠️ **Onboarding is being refactored.** The canonical path is now: run `rouge setup`, open the dashboard, click **New Project**. The CLI steps below still work but are no longer the recommended path for new users. See `docs/plans/2026-04-15-onboarding-refactor.md` for the full plan.

You've installed Rouge, run `rouge doctor`, and read the [seeding example](seeding-example.md). Now you want to actually build something. Here's what happens end to end.

## Before you start

Run `rouge doctor` and make sure everything is green. If anything is red, fix it first. The build loop will not compensate for missing prerequisites.

**What to expect:**
- A simple product (1-3 features) takes 2-4 hours of session time across a handful of cycles.
- If you're on a Claude Max subscription, that's comfortably within a day's session budget. On Pro, you might need two days.
- API key users: budget $5-20 for a simple product. Set `budget_cap_usd` in `rouge.config.json` so you don't get surprised.

**Start simple.** Your first Rouge product should not be a fleet management SaaS with 5 feature areas and a map integration. Pick something with 2-3 features. A recipe organiser. A habit tracker. A reading list. You want to learn the loop, not stress-test it.

**Start the dashboard.** `rouge dashboard start` opens a browser window at `http://localhost:3000`. That's your cockpit: live build logs, escalation responses, seeding chat, and project status. The whole point of autonomous building is that you walk away and check back — the dashboard keeps the state visible without needing you at a terminal.

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
rouge seed my-first-app "I want to build a task manager for freelancers"
```

This kicks off seeding through the detached daemon. The CLI tails the seeding chat to your terminal; Rouge responds inline. When Rouge asks a gate question and needs your answer, re-run with your reply. For a richer interactive experience, open the dashboard at http://localhost:3001 — both paths share the same daemon and queue.

Eight disciplines walk through your idea: brainstorming, competition, taste, spec, infrastructure, design, legal, marketing. About 10-20 minutes of your time. The [seeding example](seeding-example.md) covers this in detail.

The key outputs are `vision.json` (the North Star for every autonomous phase) and `task_ledger.json` (milestones and stories with acceptance criteria). For simple products, the infrastructure discipline resolves database and deploy decisions upfront so the foundation phase doesn't have to.

**Tip:** Be specific in your product description. "A task manager" gives Rouge almost nothing to work with. "A task manager for freelancers who track billable hours across multiple clients with weekly invoicing" gives it a persona, a problem, and enough constraints to make real decisions.

## Build

```bash
rouge build my-first-app
```

The terminal shows the launcher ticking through phases:

```
[rouge] Starting build for my-first-app
[rouge] Reading task_ledger.json and vision.json...
[rouge] Foundation phase — executing infrastructure decisions...
[rouge] Starting milestone "core-features", story "add-task-list"
[rouge] Invoking claude -p for story-building phase (model: opus)...
```

In Slack, you'll see:

> **Rouge:** Building my-first-app — story "add-task-list" (milestone: core-features)

You can walk away now. Check `rouge status` whenever you're curious, or watch the dashboard at `http://localhost:3000`. The loop runs until it's done or it hits an escalation that needs you.

How long? For a simple product, expect 2-4 hours of session time. Most stories take 20-40 minutes. Rouge runs on Opus for every phase by default except `milestone-check` (a boolean "are all stories done?" bookkeeping step, which uses Sonnet).

## What happens during the loop

Here's a typical lifecycle for a simple product with one milestone and three stories.

**Foundation.** Rouge reads `infrastructure_manifest.json` (written during seeding) and sets up the database schema, auth, and staging deploy. No decisions to make — the infrastructure discipline already resolved them. Foundation evaluation checks completeness across 6 dimensions. If it passes, stories begin.

**Story building.** Rouge picks the first story from `task_ledger.json`, builds it with TDD, and commits to a single branch. No branch-per-story — all work lands on `rouge/build-my-first-app` with bisectable commits. After each story, the launcher checks for spin (zero-delta stories, duplicates, time stalls) and skips already-completed stories.

**Milestone evaluation.** When all stories in a milestone are done, Rouge deploys to staging and runs the five-lens evaluation: test integrity, code review, browser QA, product evaluation, design review.

Common result: the first attempt has quality gaps. Missing empty states. Accessibility score below the bar. The evaluation catches these and generates fix stories.

Slack:

> **Rouge:** Milestone evaluation: 3 gaps found (empty state missing, a11y 82/100, form validation). Generating fix stories.

**Fix cycle.** Rouge builds the fix stories, redeploys, re-evaluates. For simple products, this usually passes on the second attempt.

Slack:

> **Rouge:** Milestone "core-features" promoted and locked. Tagging milestone/core-features.

Once promoted, a milestone is locked — the loop cannot regress to re-build it, even after a crash and restart.

**Ship.** After all milestones are promoted, Rouge runs a vision check (does the product still match the original idea?), ships to production, and runs a final review.

Slack:

> **Rouge:** my-first-app shipped to production.

## Common situations

**"Evaluation keeps failing on the same thing."** After 3 consecutive failures, the circuit breaker fires and the analysing phase runs a diagnostic. If it still can't resolve the issue, Rouge escalates to Slack with context, what it tried, and options. Give feedback, and it resumes.

**"I need to stop and come back tomorrow."** Ctrl+C the loop. State is checkpointed after every phase. Run `rouge build my-first-app` again tomorrow. It picks up from the last checkpoint. No progress lost.

**"My session time ran out."** Same as stopping. Checkpoints are on disk. Resume when you have session time.

**"Rouge built something I don't like."** Create a `feedback.json` file in the project directory with your notes. Rouge reads it on the next escalation resolution and incorporates your feedback. This is the outer loop — human taste refining what the inner loop built.

**"Rouge is stuck on foundation."** Check `rouge status my-first-app`. If foundation keeps failing, it usually means the infrastructure manifest has a gap or an integration isn't set up (Supabase, Stripe, etc.). The escalation message will say what's missing. Run `rouge setup <integration>` and resume.

**"I want to see what it deployed."** `rouge status my-first-app` shows the staging URL. Open it in your browser. You can poke around while Rouge is still building other stories — staging updates after each successful deploy.

**"The cost is getting high."** Check `rouge cost my-first-app`. If you set `budget_cap_usd` in `rouge.config.json`, the loop escalates when the cap is hit rather than silently continuing.

## It shipped

When the final review passes and promotion succeeds:

- Slack: "my-first-app shipped to production."
- Git history has a clean trail of every phase's work — specs, builds, evaluations, fixes, all committed with bisectable commits.
- `checkpoints.jsonl` has the full audit trail — every phase transition, cost, and state snapshot.
- `learnings.md` captures what Rouge learned during the build (infrastructure gotchas, quality patterns) — this knowledge persists for future sessions.
- Run `rouge cost my-first-app` to see what it actually cost.

That's it. You described a product, answered some questions for 15 minutes, and walked away. Rouge built, evaluated, fixed, and shipped it.

## What's next

- **Build another one.** The best way to learn Rouge is to build 2-3 small products. Each one teaches you something about how the loop works.
- **Try something complex.** A product with 2 milestones and 5+ stories will exercise foundation cycles, milestone locking, and the analysing phase's backwards flow.
- **Read the git history.** `git log --oneline` in your product's repo shows every phase's work. It's the best way to understand what Rouge actually did.
- **Contribute patterns back.** If Rouge built an integration pattern that doesn't exist in the catalogue, consider contributing it. That's how the catalogue grows.
