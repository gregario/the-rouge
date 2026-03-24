# Rouge Demo Video Script

**Target length:** 2 minutes
**Format:** Screen recording with voiceover
**Tone:** Calm, factual, confident. Not salesy. Let the system speak for itself.

---

## Scene 1: The Hook (0:00 – 0:12)

**Screen:** The finished Epoch timer app, running, beautiful. Full screen. Let it breathe for 3 seconds.

**Voiceover:**
"This is Epoch. A focus timer with a 82/100 health score, perfect Lighthouse accessibility, and 90 passing tests. No human wrote a line of code. It was built by Rouge — an open source system that turns product ideas into deployed applications. Here's how."

---

## Scene 2: The Idea (0:12 – 0:30)

**Screen:** Slack conversation. Show the @Rouge mention in a channel, the seeding swarm responding in a thread. Scroll through a few messages — the brainstormer expanding the idea, the product taster challenging scope, the designer proposing the aesthetic.

**Voiceover:**
"It starts with a Slack conversation. You describe what you want to build. Eight AI personas — brainstormer, competition analyst, product taster, spec writer, designer, legal, marketing, and architect — take turns refining the idea. You answer questions and make taste decisions. They produce the specs."

---

## Scene 3: The Loop (0:30 – 1:00)

**Screen:** Terminal showing the launcher running. Log lines scrolling: "Running phase: building", "89 tests passing", "Deployed to staging", "Running phase: code-review", "audit 87/100", "Running phase: product-walk", "Walking screen 3/8", "Running phase: evaluation", "Health: 82/100", "State transition: evaluation → analyzing".

**Voiceover:**
"Rouge then runs an autonomous loop. It builds the product, deploys it to staging, reviews the code, opens a headless browser to test every screen, and evaluates what it sees through three lenses — quality assurance, design, and product. If it finds issues, it generates fixes and loops again. Each cycle, the product gets better."

---

## Scene 4: What It Sees (1:00 – 1:20)

**Screen:** Split view. Left: the Epoch app in browser. Right: the structured evaluation data — criteria pass/fail, health score breakdown, journey quality table. Show the accessibility score going from 89 to 100 across cycles.

**Voiceover:**
"Every judgment is structured data with evidence. 67 acceptance criteria checked. Lighthouse audits tracked across cycles. Six user journeys scored for clarity, feedback, efficiency, and delight. Accessibility went from 89 to 100 because the system found a missing focus trap in the settings modal — by tabbing through the UI 11 times."

---

## Scene 5: The Stack (1:20 – 1:35)

**Screen:** Quick montage of the deployed stack — Cloudflare Workers dashboard showing the deploy, Supabase dashboard showing the database, Sentry showing zero errors, PostHog showing session recordings, GitHub Actions showing green CI.

**Voiceover:**
"Every product ships with a full production stack. Cloudflare Workers, Supabase, Sentry, PostHog, GitHub Actions CI, security headers, i18n — all provisioned automatically. Deploy breaks? Automatic rollback. Destructive database migration? Blocked until a human approves."

---

## Scene 6: The Cost (1:35 – 1:45)

**Screen:** The cost estimation output in terminal. "$8.53 total. 108 minutes of compute." Then a comparison: "$8.53 vs $4,000–12,000 human equivalent."

**Voiceover:**
"Total cost: eight dollars and fifty-three cents. 108 minutes of compute across five cycles. A human developer would spend one to two weeks on the same scope."

---

## Scene 7: The Close (1:45 – 2:00)

**Screen:** The Rouge GitHub repo. Star count. The README with the Epoch screenshot. Then the terminal: `npx rouge init`.

**Voiceover:**
"Rouge is open source. Install it. Describe a product. Let it build. The goal: you describe a product over coffee, approve a cost estimate, and come back to a deployed application. Rouge handles everything between the idea and the first user."

**End card:** GitHub URL. Star the repo.

---

## Production Notes

- Record each scene separately, edit together
- Terminal scenes: use a clean terminal with large font, dark theme
- Slack scenes: if real Slack isn't available, mock it with screenshots from the actual seeding sessions (they're in the countdowntimer project locally, just not in the repo)
- Keep transitions simple — hard cuts, no fancy effects
- Background music: subtle, ambient, not distracting (or none)
- Voiceover can be recorded separately and laid over the screen recordings
