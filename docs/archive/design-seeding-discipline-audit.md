# Seeding discipline audit

**Status**: proposed (2026-04-18). Per-discipline review against `seeding-interaction-principles.md`. Recommendations are for discussion before any prompt rewrites land.

Source evidence: `~/.rouge/projects/colour-contrast/seeding-chat.jsonl` (tagged, recent, complete through seeding), cross-referenced with `testimonial/` where useful. Message counts are from colour-contrast.

## Summary table

| Discipline | Msgs | Hard gates declared | Hard gates observed | Status |
|---|---|---|---|---|
| brainstorming | 11 | 2 (+ H3 recurring) | 2 | Acceptable — recurring H3 is a risk |
| competition | 7 | 0 | 0 | ✓ Target pattern |
| taste | 1* | 2 | 1* | Two gates for one decision |
| **spec** | **33** | **2** | **4** | **Biggest problem** |
| **design** | **13** | **3** | **4** | **Too many sign-offs** |
| legal-privacy | 3 | 1 | 1 | ✓ Good |
| marketing | 4 | 0 | 0 | ✓ Good |
| infrastructure | 7 | 0 | 1 | ✓ Good |

*Taste in colour-contrast only registered 1 message due to the pre-G4 tag-attribution bug, not because taste actually ran quietly. Taste behaviour is inferred from the prompt.

---

## Per-discipline review

### Brainstorming (01)

**Prompt declares:**
- H1 — premise + persona (who hits this, what do they do today)
- H2 — one-sentence feeling shift
- H3 — scope baseline-or-expanded — **fires once per feature area surfaced**
- S1 — scope bounds (if ambiguous)
- S2 — opinionation level

**Observed:** 11 messages, 2 gate questions. Reasonable for a short product like colour-contrast.

**Problems:**
- **H3 is recurring.** In a complex product with 8 feature areas, this is 8 extra gates stacked on top of H1 + H2 + any softs. In colour-contrast it fired once; in a full SaaS it would dominate the conversation.
- All the H3s are really the same kind of decision ("baseline or expanded") just over different areas — batching them into one sign-off would collapse 8 interruptions into 1.

**Recommended re-shape:**
- Batch H3 into a single gate at the end: "Here are the 8 areas. For each, baseline / expanded." One decision, one round-trip. Reduces interrupts from up to 8+ to a constant 3.
- Keep H1 and H2 as individual gates — they're genuinely load-bearing.

---

### Competition (02)

**Prompt declares:**
- S1 — domain classification (only if ambiguous)
- Otherwise fully autonomous

**Observed:** 7 messages, 0 gate questions.

**Status:** ✓ **This is the target pattern.** Short, autonomous, produces `seed_spec/competition.md`, narrates via `[DECISION:]` markers, no human interruption. Other disciplines should aim to be this quiet when they can.

**Nothing to change.**

---

### Taste (03)

**Prompt declares:**
- H1 — mode selection (EXPANSION / HOLD / REDUCTION), auto-recommend then gate
- H2 — analysis confirm (after running the mode-specific analysis)
- S1 — kill ack (if verdict is KILL)
- S2 — premise challenge (if not already answered by brainstorming)

**Observed:** Only 1 message tagged `taste` in colour-contrast due to pre-G4 tagging bug (taste content bled into `brainstorming` and `?`). Testimonial shows taste bleeding into brainstorming too. **Data is poor**, but the prompt structure is audit-able.

**Problems:**
- **H1 and H2 are really the same decision.** H1 asks "which mode?"; H2 asks "does the analysis in that mode resonate?" If the user is going to reject the analysis, they're effectively picking a different mode. Two gates, one fork.

**Recommended re-shape:**
- Collapse H1 + H2 into one gate. Rouge auto-picks a mode, runs the analysis in that mode, presents both together: "Here's why I picked EXPANSION and what the analysis says. Sign off, or tell me to try REDUCTION / HOLD." If the user redirects, Rouge re-runs the analysis in the new mode. Cheaper and matches the actual decision shape.
- S1 (kill) and S2 (premise-challenge) stay as-is — they're conditional and rare.

---

### Spec (04)

**Prompt declares:**
- H1 — decomposition (after writing `milestones.json`)
- H2 — complexity profile (single-page / multi-route / ...)
- S1 — paid integration flag (if any)
- `[WROTE: faN-spec-written]` per FA (up to 8)
- `[WROTE: decomposition-written]`

**Observed: 33 messages, 4 gate questions.** The worst offender.

**Problems:**
1. **Deep work happens before the decomposition gate.** Rouge writes all 8 per-FA specs (with full ACs, journeys, sad paths), then asks "is this decomposition right?" If the user wanted different areas, all the deep work is wasted.
2. **Per-FA `[WROTE:]` cards read as engineering telemetry.** "FA3 spec: 23 ACs" isn't actionable signal for a human at that moment.
3. **Two hard gates for one fork.** Decomposition and complexity profile are both answering "what shape is this product?" — today asked separately.
4. **Auto-continuation prompts break flow.** "Budget reached (5 chunks). Send any message to continue" reads as a system hiccup.
5. **Heartbeats like "Ending turn — next turn writes FA7"** are ceremonial, not informational.

**Recommended re-shape — four beats:**
1. **Decomposition first.** Rouge proposes milestones + one-line intents, writes the `milestones.json` stub. Gate on decomposition. Cheap to adjust.
2. **Shape (optional, see Q1).** Complexity profile with reasoning. Gate or autonomous depending on Q1 resolution.
3. **Deep work, quiet.** Write per-FA specs. No per-FA chat bubble. Progress indicator every ~3 FAs ("4 of 8 done"). No auto-continuation prompts — handler loops through chunks invisibly when mid-discipline.
4. **Rollup sign-off.** One message: "Spec complete — [counts]. Ready to move on?" Spec tab has the full detail.

Reduces from 33 messages to ~6-8. Moves the decisive human call to the front.

---

### Design (05)

**Prompt declares:**
- H1 — Pass 1 sign-off (UX architecture)
- H2 — Pass 2 sign-off (component design)
- H3 — Pass 3 sign-off (visual design)

**Observed:** 13 messages, 4 gate questions (3 passes + intro).

**Problems:**
- **Three sequential sign-offs for three passes of the same discipline.** The human is asked to bless design 3 times. Each pass takes 5-10 minutes to write. If Pass 1 needs revision, Passes 2-3 may not be sunk cost yet — but the interruption cadence is punishing.
- **The passes aren't independently decidable.** Pass 3 (visual) builds on Pass 2 (components) builds on Pass 1 (architecture). Sign-offs at 1 and 2 are really "is the direction so far OK?" which collapses with the final Pass 3 sign-off.

**Recommended re-shape — two options:**
- **Option A (minimal):** One combined sign-off after all three passes. Rouge writes all three YAMLs quietly with heartbeats. Presents the full design package at the end: "Architecture → components → visuals. Sign off or tell me what to redirect." If the user wants Pass 1 redirected, Rouge redoes — cheaper than 3 gates.
- **Option B (bolder):** Collapse the three passes into one integrated design doc. The three-pass structure is artifice; the outputs inter-depend anyway. Make DESIGN one artifact with architecture + components + visual tokens, one sign-off.

Either option drops 2-3 gates.

---

### Legal-privacy (06)

**Prompt declares:**
- H1 — jurisdiction (GDPR / CCPA / minimal)
- S1 — regulated domain flag

**Observed:** 3 messages, 1 gate question.

**Status:** ✓ Good. H1 is genuinely load-bearing (what license, what privacy doc, what jurisdiction). S1 is conditional. Rest is autonomous (license file, terms, privacy policy).

**Nothing to change.**

---

### Marketing (07)

**Prompt declares:**
- Zero hard gates, zero soft gates. Fully autonomous.

**Observed:** 4 messages, 0 gate questions.

**Status:** ✓ Good. Inherits positioning from TASTE, persona from BRAINSTORMING, tokens from DESIGN. Writes four artifacts (landing-page copy, positioning, hook, scaffold). Loops back to upstream if inputs are missing, rather than gating the user.

**Nothing to change.**

---

### Infrastructure (08)

**Prompt declares:**
- S1 — deploy target (only when genuinely ambiguous)
- S2 — project dependency (only if can share with existing project)
- Otherwise autonomous

**Observed:** 7 messages, 1 gate question.

**Status:** ✓ Good. But Q1 affects this — if complexity-profile / shape gets moved from spec into infrastructure, this grows.

---

## Answers to the open questions (proposed)

### Q1 — where does "shape" (complexity profile) live?

**Recommendation: Option C, drop the explicit gate.**

The complexity profile is usually unambiguous once the vision + decomposition are in place. Colour-contrast is obviously `single-page`; a full multi-tenant SaaS is obviously `full-stack`. The profile becomes a `[DECISION:]` marker (quiet, auditable, reversible) rather than a `[GATE:]` question (interruption). If Rouge is genuinely unsure between two profiles, promote to a one-time soft gate (`spec/S2-shape-ambiguous`).

This drops one guaranteed gate from spec. Infrastructure stays as-is (reads the profile from cycle_context / vision).

### Q2 — visibility during quiet deep work

**Recommendation: Option B — chat goes quiet, dashboard shows progress.**

Add a progress indicator in the seeding chat panel (or spec-tab) that reads from the `[WROTE:]` / `[HEARTBEAT:]` marker stream and renders a subtle "Writing specs — 4 of 8 done" pill above the input box. Chat bubbles are reserved for narrative + gates. This gets the best of both: full visibility (progress bar) + quiet chat (no per-file noise).

This is a dashboard change, not a prompt change. The prompt still emits markers; the dashboard just renders them differently.

### Q3 — discipline shape

**Deep re-shape (prompt rewrite required):**
- spec
- design
- taste
- brainstorming (H3 batching)

**Tidy only (no structural change):**
- competition, legal-privacy, marketing, infrastructure — already follow the principles.

---

## Proposed execution order

1. **This doc + principles** — alignment.
2. **Dashboard progress indicator** (answers Q2). Backend work to read marker stream; frontend pill. Standalone, low risk.
3. **Spec prompt rewrite** — four-beat shape.
4. **Design prompt rewrite** — collapse or merge passes.
5. **Taste prompt rewrite** — one gate not two.
6. **Brainstorming H3 batching** — minor tidy.

Each is its own PR. Each should be testable against a fresh seeding run (G22) before the next lands.

## What this doc does NOT decide

- Exact gate wording for the rewritten prompts.
- Whether the principle-document itself needs iteration after the first prompt rewrite lands (it probably will).
- Dashboard progress-indicator visual design.
