---
id: product-quality
name: Product Quality Rubric
version: 1
status: active
applies_to: product-builds
authored: human
authored_date: 2026-04-23
origin: Rouge
---

# Product Quality Rubric v1

Rouge's evaluation rubric for shipped products. Used by the PO lens of `02e-evaluation.md` to judge whether what Rouge built is **a product you'd actually put in front of a user**, not just something that compiled and deployed.

Six dimensions, each scored 0–3 with anchors. A great product scores 3 across the board; a shippable product scores ≥ 2 everywhere with no zeros. Zeros are disqualifying — fix before ship.

This rubric is a **measurement instrument**. Per `rouge.config.json` → `self_improvement.blocklist`, the Rouge self-improvement pipeline does NOT edit this file. Changes are human-authored, deliberate, and PR-reviewed.

## How to use this rubric

1. For every dimension below, find the anchor that best fits the observed product.
2. Score 0, 1, 2, or 3. Abstain only if the product_walk genuinely lacks evidence for this dimension — then trigger a re_walk_request.
3. Write the score into `evaluation_report.po.rubric_scores[<dimension>]` with a one-sentence rationale citing specific product_walk evidence.
4. Score = 3 findings are as important as score = 0 findings. Future retrospectives need to know what worked, not just what broke.

## Discipline notes

- **Anchors are visceral, not checklisty.** A 3 is what a great product feels like, not a count of checkboxes hit. A 0 is what makes you close the tab, not an RFP-style gap table.
- **Score against the product as a real user would see it.** The question is always "would a user notice this" — not "does it pass an automated test."
- **Preserve strong opinions.** The rubric is opinionated by design. Rouge's job is to ship things that feel good, not things that are merely defensible. Don't soften scores to be polite.
- **Expand / contract / hold.** If during scoring you notice the product's scope has drifted (bigger or smaller than the spec committed), flag under Vision fit — don't relitigate the scope call, just record the drift for the retrospective.

---

## Dimension 1 — Journey completeness

**Question:** Could a real user complete every journey the spec promised, end-to-end, from the product_walk evidence alone?

**Evidence source:** `product_walk.journeys[]`, `active_spec` acceptance criteria.

| Score | Anchor |
|---|---|
| **3** | Every journey in the spec is complete in product_walk: the user starts, progresses through each step, reaches a visible success state (navigation, confirmation, state change). No dead ends. No "I think this worked" steps. |
| **2** | Almost every journey complete. One or two steps are env_limited (see P1.20 escape hatch) with code-path verified, or one journey needs a re-walk. Nothing is broken — you just can't see it all from here. |
| **1** | Multiple journeys have gaps — the walk reached a step and couldn't proceed (dead button, missing page, blocked by a required integration that isn't there). A real user would hit these and be stuck. |
| **0** | A core journey doesn't work. The thing the product exists to do — you can't actually do it. |

**What a 3 feels like:** Watching the product_walk, you'd hand this to a user without hedging. You can describe, in one sentence per journey, the complete arc from open to done.

---

## Dimension 2 — Interaction fidelity

**Question:** Does every button, form, link, and interactive element do what a user would expect, visibly?

**Evidence source:** `product_walk.screens[].interactive_elements[]`, `dead_elements`, `broken_links`, `console_errors`.

| Score | Anchor |
|---|---|
| **3** | Every interactive element observed produced the outcome a user would expect. Buttons do the thing. Forms validate before submitting and show useful errors. Links go where they say. State changes are visible (loading indicators, success toasts, updated UI). |
| **2** | Mostly fidelity. One or two polish misses — hover state missing on a button, a form lacks a loading indicator during submit, an element feels slightly unresponsive but eventually does its job. |
| **1** | Multiple silent failures. A button that fires no visible response. A form that submits but doesn't acknowledge. A click that does nothing but show no error. Users will lose trust. |
| **0** | Core interaction doesn't work. Save doesn't save. Submit doesn't submit. Click does nothing. This is the "looks like a product, isn't one" failure. |

**What a 3 feels like:** Every click matters, every click produces a visible, correct result. No element feels vestigial. The product responds when a user talks to it.

---

## Dimension 3 — Visual coherence

**Question:** Does this look like one product someone built on purpose, not a stitched-together demo?

**Evidence source:** `product_walk.screens[]` screenshots, `design_review.category_scores` (typography, color, spacing, layout, components), `ai_slop_score`.

| Score | Anchor |
|---|---|
| **3** | Typography, spacing, color, and component variants are consistent across every screen. Visual hierarchy is clear — the eye knows where to go. The product has an identity — you could describe its look in one sentence without defaulting to "clean" or "modern." |
| **2** | Coherent overall, with one or two inconsistencies: different button styles in two places, an off-brand modal, mixed font weights on one screen. A user wouldn't bail, but a designer would point. |
| **1** | Visible patchwork. Different screens feel like different products. Button styles vary, padding is ad hoc, the color system drifts. Something is generic-gradient-y in a way that signals "AI built this." |
| **0** | AI-slop aesthetic dominates. Generic gradients, stock-photo empty states, no identity, Lorem-Ipsum-adjacent copy holes. The product looks like a template someone forgot to finish. |

**What a 3 feels like:** The product has taste. Every screen was decided, not defaulted. If you showed it to a stranger and said "who made this," they wouldn't guess AI.

---

## Dimension 4 — Content grounding

**Question:** Does the copy sound like a human wrote it for a real use-case, or like an LLM filled in labels?

**Evidence source:** `product_walk.screens[]` copy observations, `design_review.copy_quality`, `copy_findings[]`.

| Score | Anchor |
|---|---|
| **3** | Labels are specific to what the button does. Error messages name what went wrong and what the user can do next. Empty states explain what'll appear here and how to make that happen. Tone is consistent. Copy feels like a human thought about the user. |
| **2** | Mostly grounded. One or two generic phrases slipped in ("Welcome to our platform," "Something went wrong"), but the majority of copy is specific and actionable. |
| **1** | Multiple generic/marketing-speak phrases. Error messages are "Error occurred" without context. Empty states are blank or say "No items" without a path forward. Copy feels inherited, not written. |
| **0** | LLM-generic throughout: "Next-generation", "unlock value", "seamlessly integrated", "holistic approach", or long stretches of placeholder Lorem Ipsum. No product personality. Could be anyone's SaaS. |

**What a 3 feels like:** You could quote any label, error, or empty state out of context and a human would recognize it as written for this specific product's users. The copy does work, not decoration.

---

## Dimension 5 — Edge resilience

**Question:** What happens when a user hits an empty state, an error, a timeout, an overflow, or something the happy path didn't anticipate?

**Evidence source:** `product_walk.screens[]` edge-state observations, `functional_correctness`, `console_errors`, `a11y_review`.

| Score | Anchor |
|---|---|
| **3** | Every observed edge state has explicit handling with user guidance. Empty state tells you how to add the first item. Errors surface to the user (not hidden in console) with clear recovery. Slow network shows loading. Long text overflows gracefully. Zero and one-item states look designed, not just "no results." |
| **2** | Most edges handled. One or two edge cases missing — a specific empty state is blank, a form doesn't show loading during slow submits, one error path drops the user on a blank screen. |
| **1** | Multiple edges crash or show raw technical errors. Users can reach a state they can't escape from. Loading states are missing so the UI feels frozen. Empty states are just empty. |
| **0** | Happy path only. Off-path anything breaks: 404 shows a stack trace, empty state is a blank div, errors never surface, one wrong click dumps the user in an uncrossable void. |

**What a 3 feels like:** You couldn't break the product by being a pessimistic user. Every state — including the awkward ones — was considered and handled on purpose.

---

## Dimension 6 — Vision fit

**Question:** Does the observed product match the stated north star, or has it drifted?

**Evidence source:** `active_spec`, `vision` (product_vision.json), `product_walk` overall impression.

| Score | Anchor |
|---|---|
| **3** | The observed product delivers the stated value proposition. No scope drift. A user reading the vision and then using the product would say "yes, that's the thing." |
| **2** | On-vision with minor scope movement. Maybe slightly expanded (one feature beyond the spec that serves the core), maybe slightly contracted (one corner deferred but announced). The product's soul is intact. |
| **1** | Drift. The product feels like a cousin of the vision, not the thing. Key intent is recognizable but muddied. Scope expanded in directions that don't serve the core, or contracted so far that it's missing what makes the vision compelling. |
| **0** | Off-vision. What shipped isn't what was specced. A user reading the vision would be surprised by the product — "that's not what you said you'd make." |

**What a 3 feels like:** You could write a one-sentence description of what the product does, and it would be the same sentence the vision document used. The thing is the thing.

---

## Aggregating to PO verdict + confidence

**`evaluation_report.po.verdict`:**

- **PRODUCTION_READY** — every dimension ≥ 2, at least one dimension at 3, zero dimensions at 0, and no blocking findings from other lenses (QA verdict PASS, security PASS, a11y PASS).
- **NEEDS_IMPROVEMENT** — any dimension at 1, no dimensions at 0. Product is recognizable but rough. Route to milestone-fix.
- **NOT_READY** — any dimension at 0. Product has a structural hole. Route to milestone-fix OR escalate via capability-check gate (P1.21) if the hole is outside Rouge's capability surface.

**`evaluation_report.po.confidence`** (raw): weighted mean of dimension scores normalized to 0.0–1.0:
  - `confidence = (sum of dimension scores) / (6 dimensions × 3 max) ` → range 0.0 to 1.0
  - Equal weights by default. A product-shape-specific profile may override weights in `library/rubrics/product-quality-v1.weights.<profile>.json` (not required for v1).

**`evaluation_report.po.confidence_adjusted`:** same calculation but exclude dimensions that are entirely env_limited (WebGL-heavy product in headless, etc.). Denominator shrinks accordingly.

**Abstain rule:** a dimension MAY abstain if product_walk lacks the evidence needed to score it — but only after emitting a `re_walk_request`. Abstain is not a way around hard scoring; it's a signal that the walk didn't capture what the rubric needs.

## Output shape

In `evaluation_report.po`:

```json
{
  "rubric_scores": {
    "journey_completeness": {
      "score": 2,
      "rationale": "Three journeys complete; checkout step 4 (payment confirmation) env_limited — code path verified via 02c review.",
      "evidence_ref": { "type": "cycle_context", "path": "product_walk.journeys[2].steps[3].result", "quote": "..." }
    },
    "interaction_fidelity": { "score": 3, "rationale": "...", "evidence_ref": {...} },
    "visual_coherence": { "score": 2, "rationale": "...", "evidence_ref": {...} },
    "content_grounding": { "score": 3, "rationale": "...", "evidence_ref": {...} },
    "edge_resilience": { "score": 1, "rationale": "...", "evidence_ref": {...} },
    "vision_fit": { "score": 3, "rationale": "...", "evidence_ref": {...} }
  },
  "confidence": 0.78,
  "confidence_adjusted": 0.83,
  "verdict": "NEEDS_IMPROVEMENT"
}
```

Per P1.15 + P1.16b: each dimension's `evidence_ref` must be a structured reference pointing to the specific product_walk / code_review / screenshot location that grounds the score. Scores with resolve-able evidence refs keep their value; scores without valid refs are treated as abstain.

## When to revise this rubric

Don't quietly. A revision is a v2 file (`product-quality-v2.md`) with a migration note, a visible version bump in the ID, and a parallel shadow-eval period against recent products to compare v1 vs v2 scoring drift before making v2 active. That's the only way to spot if a "small tightening" actually shifts what Rouge considers shippable.

## Why this rubric, not a generic one

Rouge builds products. Most published LLM-as-judge rubrics score documents, responses, or code snippets — different domains, different discriminators. A user doesn't interact with a code review; they interact with the shipped product. The six dimensions here map to what a user would actually notice in the first five minutes of using the thing: can they get their job done, does it work when they click, does it look like someone built it on purpose, does the copy speak to them, does it handle when things go sideways, and is it actually the product that was promised.

That's what great means, in one sentence per axis.
