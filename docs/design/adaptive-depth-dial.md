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
- Budget cap: $15 default.

### S — small app

**Profile:** maybe multi-user, one or two journeys, one or two integrations or local persistence. ~2-4 screens.

**Signals (any of, not all):** 2-3 entities OR 1-2 integrations OR auth required OR multi-session state.

**Examples:** todo app, habit tracker, recipe book, single-channel chat.

**Pipeline shape:**
- Seeding: + infrastructure (because data persists). Still skip competition + marketing unless the owner flags GTM intent.
- Spec: 2-3 FAs, 3-5 ACs each.
- Loop: 2-3 cycles. Foundation only if auth is involved.
- Budget cap: $30.

### M — standard SaaS

**Profile:** multi-user, multiple journeys, several integrations, typical CRUD with auth + roles.

**Signals:** 4-6 entities, 3-5 integrations, 2-3 user roles, 4-6 journeys, 5-10 screens.

**Examples:** a booking tool, an invoicing app, a team knowledge base.

**Pipeline shape:** current Rouge default. Full swarm. 3-5 FAs. 3-5 cycles. $50 default cap.

### L — complex SaaS

**Profile:** multi-tenant, role-based access, background jobs, complex state transitions.

**Signals:** 7-12 entities, 6+ integrations, 3+ user roles, 7+ journeys, 10+ screens, async workflows.

**Examples:** planning windows, support desk, project management tool.

**Pipeline shape:**
- Seeding: full swarm + optional domain-specialist lenses (legal-privacy mandatory; marketing conditional).
- Spec: 6-8 FAs. This is where the original P1.5 ("iterate FAs with per-FA retrieval") kicks in — the cross-cut happens in an explicit pass after per-FA drafts land.
- Loop: 5-8 cycles. Foundation required.
- Budget cap: $100.

### XL — platform / multi-product

**Profile:** federated data, multi-portfolio, SSO across products, cross-product workflows.

**Signals:** 13+ entities, SSO/federation, 5+ user roles, 3+ integrating products.

**Examples:** The Works itself, an agency ops platform, a marketplace.

**Pipeline shape:**
- Seeding: full swarm + explicit architecture discipline (doesn't exist yet — flag for future spec).
- Spec: 8+ FAs with mandatory cross-cut pass.
- Loop: 8+ cycles. Foundation cycle + checkpoint every 2-3 feature milestones.
- Budget cap: $250.

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

## Open questions

1. Should TASTE or a dedicated pre-SPEC "sizing" sub-phase set the dial? TASTE is the natural extension but adds a decision to an already-busy discipline. A dedicated phase is cleaner but adds a new artifact.

2. Can the dial move mid-project? A project starts S, discovers 4 more entities during spec, should it re-classify to M? Proposal: yes, but only via an explicit `[DECISION: project-size-upgrade]` marker with reasoning, and never downward during the loop (you can't un-spend on disciplines already run).

3. How do domain-specific profiles interact? A game at XS tier has different shape than a SaaS at XS tier. Profiles (from P0.3) orthogonal to size? Combine into a single `(profile, size)` pair or keep them as independent dials? Lean: independent; profile picks the WHAT (game / saas-webapp / static-site / artifact), size picks the HOW-DEEP.

4. Classification signal collection — the classifier needs entity count / integration count / role count BEFORE SPEC runs. Does BRAINSTORM reliably produce those signals? If not, a lightweight signal-collection pass before TASTE.

5. XL tier mentions "explicit architecture discipline (doesn't exist yet)". Scope that as a separate roadmap item or bundle into this initiative?

## Implementation plan (~4-6 PRs)

1. **This doc lands + reviewed.**
2. `schemas/seed_spec.json` adds `project_size: "XS"|"S"|"M"|"L"|"XL"` with default "M"; classifier spec added to `docs/design/`.
3. TASTE prompt extended to emit the `[DECISION: project-size]` marker; classifier implemented as a pure module `src/launcher/project-sizer.js` with tests.
4. Seeding swarm orchestrator reads `project_size` and skips disciplines below their `applicable_at` threshold. Every seeding discipline's prompt header declares its applicability.
5. SPEC prompt reads `project_size`, emits tier-appropriate FA count + AC depth. Original P1.5 "iterative per-FA" path triggers only at L/XL.
6. Budget cap + cycle-budget defaults read `project_size` unless `rouge.config.json` overrides.

Test strategy: run Rouge (or a mock thereof) against two fixture projects — "calculator" (XS) and "planning-windows" (L) — and verify classification lands correctly, disciplines are correctly skipped/run, spec shape differs, budget differs.

## Risks

- **Mis-classification at the boundary** — a borderline S/M project gets classified S and ends up under-specced. Mitigation: the `project-size-upgrade` escape hatch (open question 2) lets the pipeline catch the mistake mid-project. Cost: one restart of the seeding phase that was skipped.

- **Dial becomes a "just say M" coping mechanism** — if the classifier errs toward M too often, the dial adds ceremony without effect. Mitigation: log classifier decisions to governance; after N projects, review the distribution. If >70% land in M, tighten the rules.

- **TASTE bloat** — extending TASTE to also do sizing risks making it a many-responsibilities prompt. Mitigation: the classification itself is a JS module call, not prompt content. TASTE just surfaces the classifier's output + lets the human override.

- **Cross-cutting at L/XL** — if the iterative per-FA path loses the cross-cut pass, L-tier projects get the same "conflicting features" bug the original P1.5 feared. Mitigation: the cross-cut pass is mandatory at L+ and has its own spec step.
