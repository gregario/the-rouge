# What I Got Wrong Building an Autonomous Product Factory

*Substack Article 3 — publish two weeks after launch*

---

Two weeks ago I open-sourced Rouge, a system that autonomously builds web products. The technical architecture works. But the path to getting here was a series of wrong assumptions corrected by real data.

Here's what I got wrong, in order of how embarrassing each one was.

## Wrong: "Hard timeouts are fine"

My first launcher had a map of timeouts per phase. Building: 20 minutes. QA: 25 minutes. Analyzing: 10 minutes. Simple, predictable, wrong.

Opus thinks in bursts. A building phase might write nothing for 12 minutes while it plans an architecture, then produce 400 lines in 90 seconds. The 20-minute timeout would kill it during the planning silence.

Meanwhile, a stuck phase would burn the full timeout before anyone noticed.

The fix: a progress-based watchdog that monitors two signals — is the output log growing, and are structured progress events appearing? A phase only gets killed when both signals go dark. Active phases that are thinking silently are left alone. Stuck phases get caught in 10 minutes instead of 25.

The lesson: don't timebox creative work. Monitor the work instead.

## Wrong: "Each evaluation phase should walk the app independently"

The original QA system opened a headless browser six times per cycle. QA walked the app. Accessibility walked the app. Design review walked the app. Three PO review sub-phases each walked the app.

This was spectacularly wasteful. Each walk took 5-8 minutes. Six walks: 26 minutes of browser time per cycle. And each walk saw slightly different state — if the app changed between walks, the evaluations could disagree about what they saw.

The redesign separates observation from judgment. One walk, captured as structured data. Three evaluation lenses read the same data. Browser time dropped from 26 minutes to 8 minutes. Evaluations became consistent.

The lesson: separate data collection from data analysis. It's obvious in retrospect — it's how every real QA team works. The tester records the session. The QA lead, the PM, and the designer all watch the same recording.

## Wrong: "Feature areas should drive the review cycle"

The countdown timer had six feature areas. The loop built all six in cycle one. Then the promoting phase advanced to "feature area: timer-display" and ran a full QA/PO review cycle. Then "timer-controls" with another full cycle. Then "pomodoro-cycle." Six review cycles for an app that was already fully built.

312 minutes of redundant evaluation. Each cycle finding the same scores because nothing had changed.

The fix: if the building phase produces no changes (zero file delta), skip the review pipeline entirely and mark the feature area as done. What was 6×52 minutes of waste became 6×30 seconds of no-op detection.

The lesson: build decomposition and review decomposition are different problems. Feature areas tell you what to build. They don't tell you what to review. Review the whole product, not individual features.

## Wrong: "Retry on rate limit, try again in 60 seconds"

During the first real run, the launcher hit API rate limits. It backed off for 60 seconds and tried again. Still rate limited. Backed off 120 seconds. Still limited. It did this 95 times over three hours.

The rate limit message said "resets 5pm." The fix was humiliatingly simple: parse the reset time, calculate the milliseconds until then, and sleep. One sleep call replaced 95 wasted retries.

41% of the first run's execution time was waste. Most of it was this one bug.

The lesson: read the error message. It usually tells you exactly what to do.

## Wrong: "The system will ship everything I need"

Early on I assumed Rouge would deploy products with just code and hosting. No monitoring, no analytics, no error tracking, no security headers.

I was building products naked. No way to know if they worked in production, no way to know if anyone used them, no way to know if they broke.

Now every product ships with Sentry, PostHog, security headers, CI, legal pages, and i18n — all provisioned automatically. The template includes everything because every product needs everything.

The lesson: the scaffold IS the product standard. If it's not in the template, it won't be in any product.

## What I'd do differently

If I started over:

1. **Start with the evaluation system, not the builder.** The quality of what you build is determined by how well you evaluate it. I built the builder first and bolted on evaluation. The evaluation architecture should have come first.

2. **Run a real retrospective after the first build, before the second.** I waited too long to measure. The retro after the countdown timer run revealed massive waste that had been accumulating for cycles.

3. **Design for cross-product learning from day one.** The personal library — where each completed project enriches the next — should have been the first feature, not a late addition. Every build without it is calibration data you're throwing away.

## The factory is the product

The most counterintuitive thing about building Rouge: the factory is harder than any product it builds. The countdown timer took five cycles and $8.53. The factory took months.

But the factory builds forever. Every product after the first is cheaper, faster, and higher quality because the system learns.

That's the bet: invest in the machine that makes machines.

**[GitHub →](https://github.com/gregario/the-rouge)**
