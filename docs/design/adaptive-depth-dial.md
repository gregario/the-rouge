# Adaptive depth dial (P1.5R)

**Status:** proposed (2026-04-24). Draft to align on before implementing. Supersedes P1.5 ("per-FA iterative spec") — the original framing fixed a symptom, not the structural problem.

## What triggered this

Rouge currently runs a fixed-shape pipeline for every project. A calculator and a multi-role planning-windows SaaS pass through the same seeding swarm, produce roughly the same count of feature areas, burn a similar cycle budget, and invoke the same review lenses. Owner, 2026-04-24:

> "The calculator app has almost the same number of specs or user stories as the planning windows. So it ends up sizing all the projects about the same ... if I gave a prompt to make a calculator app, it probably would have done 80% of the features in one code invocation without this system."

The symptom is over-engineering of trivial projects and under-engineering of the implicit "these features conflict" checks that Rouge should still be doing across tiers. Fixed depth is the wrong default. The fix is a single dial that propagates through the pipeline.

## Principles

### 1. One dial, set once, read everywhere

The complexity decision is not per-discipline or per-phase. It's a single categorical value (XS / S / M / L / XL) set during seeding's early beats and written to `seed_spec.project_size`. Every downstream phase — seeding disciplines, the loop's cycle budget, the cost cap, the build prompt's scope expectations — reads that field and branches.

One decision point means one surface to audit, one lever for the human to override, one field to migrate when its shape changes.

### 2. The dial is categorical, not numeric

XS / S / M / L / XL. Not a 0-100 complexity score. Not a float. Categorical values force the pipeline to have discrete branches (a calculator has different SHAPE than a CRUD app, not just less of it). Numeric scores would invite averaging and blur the thresholds.

### 3. Classification rules are observable, not subjective

The classifier doesn't guess at "difficulty." It measures signals that seeding has already captured by the time the dial gets set:
- Entity count (from a quick data-model sketch in brainstorm)
- Integration count (external services touched)
- User-role count (actors in the system)
- Journey count (distinct end-to-end flows)
- Surface area (UI screen count, API endpoint count)

Rules are deterministic. A classifier given the same signals returns the same dial value. Hand-overrides are permitted via a `[DECISION: project-size]` marker but are recorded with reasoning.

### 4. Cross-cutting stays at the pipeline level

The original P1.5 ("iterate FAs one at a time") risked losing the spec-wide "do these features conflict?" check. The dial preserves cross-cutting: at L and XL tiers the spec discipline still writes all FAs together (or iterates with an explicit cross-cut pass), because that's where cross-cutting matters. At XS and S tiers there aren't enough FAs for cross-cutting to matter — 1-2 FAs conflict with themselves trivially.

### 5. Dial value is not taste

Size ≠ ambition. An XS project can still be ambitious within its scope (a beautiful, tastefully-made calculator). The dial controls Rouge's operational depth, not its taste rigor. TASTE discipline runs at every tier with equal rigor (per the `feedback_taste_real_product.md` memory: don't soften product critique for dogfood contexts).

## Dial values

Each tier is defined by observable signals AND by what Rouge does.

### XS — utility / tool

**Profile:** single-user, single-journey, in-memory or trivial persistence. ~1 screen. No auth. No integrations. Build fits in one focused Claude invocation.

**Signals (all of):** ≤ 1 entity, 0 integrations, ≤ 1 user role, ≤ 2 journeys, ≤ 2 screens.

**Examples:** calculator, unit converter, color picker, single-page portfolio.

**Pipeline shape:**
- Seeding: brainstorm + taste + spec only. Skip competition (no GTM), legal-privacy (no user data), marketing (no funnel), infrastructure (trivial), design (implied by spec).
- Spec: 1 FA, 2-4 ACs.
- Loop: 1-2 cycles max. No foundation cycle. Single-lens eval (QA + taste; skip PO/design/security unless data is present).
- Budget cap: $30 default.

### S — small app

**Profile:** maybe multi-user, one or two journeys, one or two integrations or local persistence. ~2-4 screens.

**Signals (any of, not all):** 2-3 entities OR 1-2 integrations OR auth required OR multi-session state.

**Examples:** todo app, habit tracker, recipe book, single-channel chat.

**Pipeline shape:**
- Seeding: + infrastructure (because data persists). Still skip competition + marketing unless the owner flags GTM intent.
- Spec: 2-3 FAs, 3-5 ACs each.
- Loop: 2-3 cycles. Foundation only if auth is involved.
- Budget cap: $60.

### M — standard SaaS

**Profile:** multi-user, multiple journeys, several integrations, typical CRUD with auth + roles.

**Signals:** 4-6 entities, 3-5 integrations, 2-3 user roles, 4-6 journeys, 5-10 screens.

**Examples:** a booking tool, an invoicing app, a team knowledge base.

**Pipeline shape:** current Rouge default. Full swarm. 3-5 FAs. 3-5 cycles. $100 default cap.

### L — complex SaaS

**Profile:** multi-tenant, role-based access, background jobs, complex state transitions.

**Signals:** 7-12 entities, 6+ integrations, 3+ user roles, 7+ journeys, 10+ screens, async workflows.

**Examples:** planning windows, support desk, project management tool.

**Pipeline shape:**
- Seeding: full swarm + optional domain-specialist lenses (legal-privacy mandatory; marketing conditional).
- Spec: 6-8 FAs. This is where the original P1.5 ("iterate FAs with per-FA retrieval") kicks in — the cross-cut happens in an explicit pass after per-FA drafts land.
- Loop: 5-8 cycles. Foundation required.
- Budget cap: $200.

### XL — platform / multi-product

**Profile:** federated data, multi-portfolio, SSO across products, cross-product workflows.

**Signals:** 13+ entities, SSO/federation, 5+ user roles, 3+ integrating products.

**Examples:** The Works itself, an agency ops platform, a marketplace.

**Pipeline shape:**
- Seeding: full swarm + explicit architecture discipline (doesn't exist yet — flag for future spec).
- Spec: 8+ FAs with mandatory cross-cut pass.
- Loop: 8+ cycles. Foundation cycle + checkpoint every 2-3 feature milestones.
- Budget cap: $500.

## Where the dial gets set

In the seeding swarm, after BRAINSTORM has produced enough shape to count entities/integrations/roles and before SPEC starts writing FAs. The natural home is TASTE — it already does scope reasoning (EXPANSION / HOLD / REDUCTION). Extend TASTE's hard gate to include the project-size call:

```
[DECISION: project-size = M]  # or S, L, etc.
  Signals: 5 entities (users, windows, requests, audit, org), 3 integrations (calendar, email, auth),
  2 roles (admin, user), 5 journeys. Lands in M per the classifier.
  Overrides: none.
[GATE: taste/H1-verdict-signoff]
```

The human can override in-gate by typing e.g. "make it S" — the override is recorded with reasoning.

## How phases read it

Each phase reads `seed_spec.project_size` and branches deterministically. Examples:

**Seeding disciplines** — each discipline's prompt header declares its "applicable at" tiers. `seeding/06-legal-privacy.md` header: `applicable_at: ["S+", "M+", "L+", "XL+"]`. The swarm orchestrator skips disciplines not applicable at the current tier.

**Spec discipline** — reads tier, sets expected FA count + AC-per-FA floor/ceiling accordingly. Prompt explicitly tells the model: "This is an M-tier project. Expect 3-5 FAs with 3-5 ACs each. Do not pad."

**Budget cap** — `rouge.config.json → budget_cap_usd` reads `seed_spec.project_size` and applies a tier-default if not set explicitly. Human override still wins.

**Cycle budget** — loop's cost-tracker + spin-detector use tier-appropriate thresholds.

**Cost cap** — already a tier map above.

## Migration / back-compat

Existing projects without `project_size` default to **M** (current Rouge behavior). No retrofit; the dial affects forward projects only. The field appears in state migrations with a default.

## Resolved open questions (2026-04-24)

1. **Dedicated sub-phase, not TASTE extension.** Sizing is its own lightweight sub-phase running between TASTE and SPEC. Flow: BRAINSTORM → TASTE → SIZING → SPEC → INFRASTRUCTURE. Keeps TASTE focused on the product-bet question; keeps sizing decisions surfaceable as their own artifact the human can override.

2. **Dial can grow mid-project, never shrink.** If the loop discovers new stories that implicitly require more scope, Rouge treats that as organic growth — the size field may upgrade (S → M) via a `[DECISION: project-size-upgrade]` marker, but the already-run disciplines from the smaller tier are not re-run. What we monitor: **do S-flagged projects frequently end as M?** If yes, the classifier was missing scope at the start — tighten the rules. This signal gets logged to governance for empirical review.

3. **Independent dials — profile and size are orthogonal.** Profile (from P0.3) is the load-bearing WHAT dial: it drives which rules, skills, MCPs, deploy adapters, and gotchas Rouge knows for this kind of product (static-site knows GitHub Pages must be enabled; saas-webapp knows Vercel hobby needs `--prod`; game knows itch.io deploy, etc.). Size is the HOW-DEEP dial. Phases read whichever they need, independently — not named pairs. **Profile-side intelligence is its own ongoing initiative** (P3.8 deploy adapters, P0.4 language-reviewer dispatch, skill-loading per profile) — tracked separately from this one. Concrete gotcha to capture inside P3.8: the static-site profile must know GitHub Pages requires explicit enablement before first deploy (real bug Rouge has hit).

4. **Add `## Classifier Signals` block to BRAINSTORM.** Sampled two real BRAINSTORMs (construction-coordinator, stack-rank) — signals are *inferable from prose* but not parseable in any consistent shape. Rather than add an LLM extraction pass (fragile, expensive), add a structured block to BRAINSTORM's prompt template: at end of the discipline, output entity_count / integration_count / role_count / journey_count / screen_count. Five lines, zero extra LLM calls, classifier reads it deterministically.

5. **XL-tier architecture discipline deferred.** Issue #202 (https://github.com/gregario/the-rouge/issues/202). Build when the first XL project surfaces, not speculatively.

## Implementation plan (~6 PRs)

1. **This doc lands + reviewed.** ✓ 2026-04-24 (commit 07a1e4c + update).
2. **PR 2 — Schema field + classifier module + BRAINSTORM signals.** `schemas/*` adds `project_size: "XS"|"S"|"M"|"L"|"XL"` with default "M". `src/launcher/project-sizer.js` pure module implements the classification rules from the "Dial values" section above. `src/prompts/seeding/01-brainstorming.md` extended to emit a `## Classifier Signals` block at the end of output. Tests cover classifier edges + signals-parsing.
3. **PR 3 — SIZING sub-phase.** New `src/prompts/seeding/03b-sizing.md` (or equivalent number — slots between TASTE at 03 and SPEC at 04). Lightweight: reads BRAINSTORM signals + TASTE output, calls `project-sizer.js`, emits `[DECISION: project-size]` with reasoning, presents a single hard gate for human override. Contract test updated for the new discipline count.
4. **PR 4 — Swarm orchestrator skip-by-tier.** Each seeding discipline prompt header declares its `applicable_at` (e.g. `applicable_at: ["S+"]`). Orchestrator reads `seed_spec.project_size` and skips disciplines below threshold. Test: XS project runs 4 disciplines; XL project runs all.
5. **PR 5 — SPEC tier-aware depth.** SPEC prompt reads `project_size`, emits tier-appropriate FA count + AC depth. Original P1.5 "iterative per-FA" path activates only at L/XL with a mandatory cross-cut pass.
6. **PR 6 — Budget / cycle defaults by tier.** `rouge.config.json` budget cap + loop cycle budget defaults read `project_size` unless explicit override. Governance logs the (tier, actual-spend) pair per project for later calibration of the default-cap table.

Test strategy (across PRs): run Rouge's test harness against two fixture projects — "calculator" (XS) and "planning-windows" (L) — and verify classification lands correctly, disciplines are correctly skipped/run, spec shape differs, budget differs.

Test strategy: run Rouge (or a mock thereof) against two fixture projects — "calculator" (XS) and "planning-windows" (L) — and verify classification lands correctly, disciplines are correctly skipped/run, spec shape differs, budget differs.

## Risks

- **Mis-classification at the boundary** — a borderline S/M project gets classified S and ends up under-specced. Mitigation: the `project-size-upgrade` escape hatch (open question 2) lets the pipeline catch the mistake mid-project. Cost: one restart of the seeding phase that was skipped.

- **Dial becomes a "just say M" coping mechanism** — if the classifier errs toward M too often, the dial adds ceremony without effect. Mitigation: log classifier decisions to governance; after N projects, review the distribution. If >70% land in M, tighten the rules.

- **TASTE bloat** — extending TASTE to also do sizing risks making it a many-responsibilities prompt. Mitigation: the classification itself is a JS module call, not prompt content. TASTE just surfaces the classifier's output + lets the human override.

- **Cross-cutting at L/XL** — if the iterative per-FA path loses the cross-cut pass, L-tier projects get the same "conflicting features" bug the original P1.5 feared. Mitigation: the cross-cut pass is mandatory at L+ and has its own spec step.
