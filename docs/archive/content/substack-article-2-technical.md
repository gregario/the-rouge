# How Rouge Works: The Technical Story

*Substack Article 2 — publish one week after launch*

---

Last week I published Rouge — an open source system that autonomously builds web products. The response raised a lot of questions about how the internals work. This is the technical deep dive.

## The Karpathy Loop

The name comes from Andrej Karpathy's description of how neural networks improve: build, evaluate, adjust, repeat. Rouge does the same thing with products.

Each cycle runs through these phases:

**Building** → **Test integrity** → **Code review** → **Product walk** → **Evaluation** → **Analyzing** → **Vision checking** → **Promoting**

If the analyzer says "improve," it generates change specs and loops back to building. If it says "ship," the product advances to a final human review.

The system tracks confidence across cycles. When metrics stabilise — health score stops climbing, acceptance criteria are all green, journey quality scores plateau — it knows to stop.

## Observe once, judge through lenses

This is the architectural decision I'm most proud of, and it came from a mistake.

The first version opened a browser six times per cycle. The QA phase walked the app. The accessibility check walked the app. The design review walked the app. Three PO review sub-phases each walked the app. Six walks, same product, each taking 5-8 minutes. That's 26 minutes of browser time per cycle.

The redesign separates observation from judgment.

**Code review** runs first — ESLint, dependency audit, code duplication, dead code analysis, plus a seven-dimension AI audit. No browser. This is the engineering lens.

**Product walk** opens the browser once. It navigates every screen, clicks every interactive element, tests keyboard navigation, captures screenshots, records the accessibility tree, runs Lighthouse. Then the browser closes. This phase does not judge anything. It only records what it sees.

**Evaluation** reads the walk data through three lenses:
- **QA lens**: does each acceptance criterion match what was observed?
- **Design lens**: typography, color, spacing, layout, interaction, polish — scored from screenshots
- **PO lens**: journey quality, screen quality, vision alignment — would a customer be delighted?

Each lens references specific observations as evidence. "Contrast ratio on the session counter label is 3.2:1 (screenshot: home.png), below the 4.5:1 WCAG AA threshold."

The result: one browser session instead of six, consistent state across all evaluations, and observations that persist as artifacts for trend comparison across cycles.

## The watchdog

Early runs had a problem: hard timeouts. The building phase had a 20-minute timeout. The QA gate had 25 minutes. These were arbitrary — sometimes opus needs 30 minutes for a complex build, and sometimes it's stuck after 5.

The replacement: a progress-based watchdog. The launcher monitors two signals:

1. **Is the log file growing?** If the agent is writing output, it's probably working.
2. **Are there progress events?** Tests passing, deploys completing, screenshots captured — these are structured milestones.

A phase only gets killed when BOTH signals go dark — no output AND no progress events for an extended period. A 60-minute hard ceiling remains as a safety net, but in practice the watchdog catches stuck sessions in 10-15 minutes while never killing a productive one.

## Cross-product learning

When a product reaches "complete," the system extracts lessons into a personal library: phase timing data (how long each phase actually takes vs estimates), quality patterns (what findings recur), heuristic performance (which evaluation rules pass and fail).

Product number one uses default calibration. Product number eleven uses calibration refined by ten completed builds. The cost estimator gets more accurate, the watchdog thresholds better tuned, the evaluation lenses sharper.

This is the moat for the system — and it's personal to each user. Your Rouge learns your taste.

## The economics

Epoch (a 6-screen Pomodoro timer) cost $8.53 across 108 minutes of Opus compute. The cost estimator projects:

| Project size | Estimated cost |
|-------------|---------------|
| Small (6 screens) | $5–20 |
| Medium SaaS (15 feature areas) | $50–150 |
| Large SaaS (30+ feature areas) | $150–400 |

These estimates improve as the system builds more projects and calibrates from actual data.

The human equivalent for the small project is $4,000–12,000 at contractor rates. The medium SaaS would be $20,000–50,000. Even at the high end of Rouge's estimates, it's two orders of magnitude cheaper.

## What's not solved yet

I want to be honest about the limits:

**Large projects are untested.** The module hierarchy (dependency-aware build ordering across modules) is implemented but hasn't been through a 50-screen SaaS. I expect new failure modes.

**Parallel builds aren't implemented.** The design exists (git worktrees per feature area, concurrent claude sessions), but it's not built. Right now, everything is sequential.

**The seeding prompts need more users.** The eight-persona swarm works for me because I know how to push back on bad ideas. I don't know how it performs with someone who accepts every suggestion.

**Taste is hard to encode.** The evaluation system checks measurable things — contrast ratios, test coverage, click counts. The subjective stuff — "does this feel right?" — relies on the PO lens and the final review, which are fundamentally LLM judgment calls.

## Try it

Rouge is open source. The repo has setup instructions, the evaluation system is documented, and the prompts are readable.

If you build something with it, I'd genuinely like to know how it goes — especially the failure modes I haven't seen yet.

**[GitHub →](https://github.com/gregario/the-rouge)**

---

*Next week: What I got wrong — the design decisions that didn't survive contact with reality, and how the system improved itself.*
