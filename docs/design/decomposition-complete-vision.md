# Decomposition: Complete Vision Document

> Canonical reference for the decomposition innovation. Captures the full thinking from the March 26, 2026 design session. All implementation work on GitHub #27 should start here.

**Status:** Approved design. Not yet implemented.
**Date:** 2026-03-26
**Source session:** `47236769-9d8b-49ea-9267-97dd8dd00079`

---

## The Core Problem

Rouge's current build loop works feature-area by feature-area, vertically. This works when features are independent. It fails catastrophically on products with dense dependency graphs.

**The fleet management example:** A system with trips, vehicles, dashboard, maintenance, mobile view, trip simulator, and maps integration. The dependency graph:

- Vehicles: no dependencies (foundation entity)
- Maintenance: depends on vehicles
- Trips: depends on vehicles AND GPS data AND maps API
- Dashboard: depends on vehicles AND trips AND maintenance (aggregates everything)
- Maps integration: depends on trips (GPS data format)
- Mobile: depends on everything (cross-cutting)
- Trip simulator: depends on vehicles AND trips (needs realistic data matching the schema)

**What happens without decomposition:** Rouge builds vehicles as CRUD, builds trips without maps (substitutes a table of coordinates for a map), builds dashboard with basic counts, skips the trip simulator. Every test passes. QA is green. The product is useless — a fleet management system without maps is a spreadsheet with extra steps.

**Why it happens:** The trips builder doesn't know that maps will need PostGIS geometry. It stores GPS as a JSON blob. The dashboard builder can't aggregate geographically because the data model is wrong. Three cycles wasted on rework that was predictable from the vision.

---

## The Capability Avoidance Problem

The builder optimises for **what it CAN build**, not **what the product NEEDS**.

The Fruit and Veg app needed beautiful photos of fruits and vegetables — that's the entire point of a card collection experience. But the builder didn't have an image source, so it substituted emoji. It didn't flag "I need images and don't have them" as a blocker. It silently degraded the product to fit its capabilities.

This is the autonomous equivalent of a junior developer deciding "we don't need that feature" because they don't know how to build it. Except it's worse — there's no human in the room to catch the substitution.

**Why it happens:** The building prompt says "if blocked, log it and continue." A missing API pattern feels like a blocker, but the builder reinterprets it as "I'll find an alternative." The alternative is always simpler. The product degrades incrementally, and by the time PO Review runs, it evaluates what was built — not what should have been built.

**The fix is upstream, not downstream.** The evaluation loop can't ratchet toward "show trips on a map" if the builder never attempted it. The PO Review can't flag a missing map if the builder decided maps weren't needed.

---

## Principle 1: No Switch Statements — Composable Capabilities

The wrong approach: "Are you building an MCP, a SaaS, or a book?" → different workflow per type.

Three reasons switch statements fail:
1. **Categories leak.** vandy.pro is a SaaS, but also a mobile app, and also needs maps and a data simulator. Categories multiply until every product is its own category.
2. **Complexity isn't type-dependent.** An MCP with 3 tools is trivial. An MCP orchestrating 5 APIs with caching and rate limiting is complex. Both are "MCP servers" but need completely different decomposition.
3. **It makes Rouge brittle.** Every new product type needs a new branch.

**The right approach:** Capabilities that activate based on **measurements**, not categories.

**Analogy:** You don't ask a builder "are you building a house or a skyscraper?" and hand them a different manual. You ask "how many floors, what's the soil composition, what loads does it need to bear?" and the engineering requirements emerge from the answers.

---

## Principle 2: Two Orthogonal Dimensions

**Decomposition strategy** (how to break down and sequence work) and **evaluation criteria** (how to judge quality) are independent.

- Decomposition is determined by the complexity profile. It is **domain-agnostic**.
- Evaluation is determined by the product's domain. It is **domain-specific** and lives in Library domain tiers.

A complex game gets orchestrated decomposition + game evaluation. A simple SaaS gets flat decomposition + web evaluation. These compose independently.

---

## The Complexity Profile

A new analysis step — **Decomposition Assessment** — runs after seeding. It reads all seeder artifacts and derives measurements:

```json
{
  "entities": {
    "count": 7,
    "relationships": 12,
    "shared_across_features": 4,
    "needs_unified_schema": true
  },
  "integrations": {
    "required": ["google-maps", "supabase", "stripe"],
    "patterns_in_library": ["supabase", "stripe"],
    "patterns_missing": ["google-maps"],
    "hard_blockers": ["google-maps"]
  },
  "feature_graph": {
    "areas": 7,
    "dependency_edges": 15,
    "density": 0.61,
    "longest_chain": 4,
    "independent_clusters": 1
  },
  "cross_cutting": ["mobile-responsive", "maps-overlay", "trip-simulation"],
  "evaluation_needs": {
    "domain": "web",
    "user_journeys": true,
    "external_integrations": true,
    "performance_testing": true
  }
}
```

This profile is **derived from the spec artifacts**, not declared by the user or selected from a menu.

---

## Six Composable Workflow Capabilities

Each activates independently based on profile thresholds. They compose. A simple product triggers none. A complex product triggers all.

| # | Capability | Activates When | What It Does |
|---|-----------|---------------|-------------|
| 1 | **Foundation cycle** | `entities.needs_unified_schema == true` OR `integrations.required.length > 0` | Horizontal slice before vertical features: unified data model, integration scaffolds, shared UI, test fixtures |
| 2 | **Dependency ordering** | `feature_graph.density > 0.2` | DAG resolution of feature build order. Dashboard can't build before trips and vehicles. |
| 3 | **Parallel building** | `feature_graph.independent_clusters.length > 1` | Independent modules build simultaneously via worktrees |
| 4 | **Integration pass** | `cross_cutting.length > 0` | Post-feature horizontal cycle for cross-cutting concerns (maps overlay, mobile, simulator) |
| 5 | **Integration escalation** | `integrations.patterns_missing.length > 0` | **Hard-blocks** instead of silently degrading. Builder cannot substitute a table for a map. Escalates: "I need maps pattern and don't have it." |
| 6 | **Foundation evaluation** | Foundation cycle ran | Evaluates schema completeness and API pattern consistency, not user journeys |

### Five Products on the Spectrum

1. **Epoch (pomodoro timer):** 1 entity, 0 integrations, 0 dependencies. Nothing triggers. Flat loop.
2. **Testimonial Wall:** Moderate entities, 1-2 integrations (auth, maybe email), moderate deps. Foundation cycle for schema + auth. Integration escalation if embedding/widget pattern missing.
3. **vandy.pro (fleet management):** 7 entities, 3 integrations, dense graph, 3 cross-cutting. Everything triggers.
4. **Simple MCP server (3 tools):** 0 entities, 0 integrations. Nothing triggers. Flat build.
5. **Complex MCP server (5 APIs):** 0 entities, 5 integrations, moderate deps. Foundation cycle for API scaffolds + dependency-ordered tool building.

Same system. Different measurements. Different capabilities activated. No switches.

---

## Foundation Cycles

A foundation cycle is a special cycle type that runs BEFORE vertical feature cycles. It builds shared infrastructure only — no user-facing features.

### Scope

- **Shared data models:** Supabase schema covering entities referenced by 2+ feature areas
- **Auth flows:** Registration, login, session management, role-based access
- **External integrations:** Stripe customer/subscription setup, maps API wrapper, email provider
- **Shared UI components:** App shell, navigation, layout, theme tokens, error boundaries
- **Deployment pipeline:** Staging/production environments, CI, environment variables
- **Test fixtures:** Seed data for every entity. The trip simulator starts here.

### Foundation Evaluation (Different from Feature Evaluation)

- **Test integrity:** Required. All foundation code must have tests.
- **QA gate:** Skipped for backend-only foundation. Required if foundation includes UI (app shell, nav).
- **PO review:** Replaced with **structural review** — does the schema support all feature areas? Are integration configs complete? Are shared components exported?
- **No user journeys** — there are no user-facing features to walk.

### Detection

**New projects (post-seeding):** The complexity profile determines it. If `needs_unified_schema` or integrations exist, foundation cycle activates.

**Existing projects (mid-loop):** The analyzing phase detects when the next feature area requires infrastructure that doesn't exist. Instead of proceeding to the next vertical slice, it inserts a foundation cycle.

### State Machine

New states: `foundation-building`, `foundation-evaluating`

```
seeding → ready → [complexity profile assessed] →
  IF foundation needed: foundation-building → test-integrity → foundation-evaluating
    → [pass] → building (first vertical feature, dependency-ordered)
    → [fail] → foundation-building (retry with feedback)
  IF no foundation needed: building (flat loop)
```

---

## The Backwards Flow — Decomposition Feedback Loop

Three scales of pivot:

### Scale 1 — Feature Adjustment (already exists)
PO Review says "improve this." Change spec generated. Builder fixes. Normal loop.

### Scale 2 — Structural Restructure (THE GAP BEING FILLED)
Evaluation reveals the decomposition was wrong. The building phase discovers it needs PostGIS but the foundation provided JSON. Or the builder discovers it needs maps but no pattern exists.

**This is not a feature change — it's realising the architecture needs rework.**

The system goes **backwards**: exits the current feature cycle → inserts a foundation cycle to fix the infrastructure → resumes feature building with corrected foundation.

**Autonomy rule:** Scale 2 doesn't need human intervention most of the time. If the loop discovers it needs a foundation cycle it didn't plan for, it can autonomously insert one. It only escalates to human when:
- The restructure would throw away >50% of existing work
- It needs an integration pattern that doesn't exist in the catalogue AND can't be built autonomously

### Scale 3 — Product Pivot (already exists)
Confidence drops below 70%. The system realises the product itself is wrong. Vision-check escalates to human.

**Key insight:** Scales 1 and 3 already exist in Rouge. Scale 2 is the gap. This is what the decomposition innovation fills.

---

## Integration Catalogue

Not just documentation — **executable knowledge**.

### Three-Tier Model

**Tier 1 — Stack:** Language, framework, runtime. "This needs Next.js on Cloudflare." Changes everything. Adding a new stack is a massive investment. "We don't have a Kotlin stack" is a hard boundary, not a missing integration.

**Tier 2 — Service:** External services with setup/teardown lifecycle. Supabase, Stripe, Sentry, Mapbox. Swappable within a stack.

**Tier 3 — Integration:** Specific API patterns within a service. Stripe checkout session flow, Supabase RLS pattern, Mapbox geocoding wrapper. The building blocks the builder assembles.

### Entry Requirements

Each catalogue entry needs:
- **Setup guide** (progressive disclosure, step by step)
- **API key management** (which env vars, how to obtain)
- **Free tier boundaries** (specific: Mapbox 50K loads/month, Supabase 2 active projects)
- **Cost flags** (paid from day one = critical dependency, flagged during seeding)
- **Fallback chain** (need images? 1. Unsplash API 2. Pexels API 3. Supply 20 open source images 4. AI generation if budget allows)
- **Code pattern** (actual wrapper code, not just docs)
- **Staleness date** (when last verified — APIs change)

### Self-Growing Mechanism

1. Seeding discovers "this product needs Google Maps"
2. Catalogue check — pattern not found
3. Foundation cycle treats this as a **build task**, not a blocker
4. Rouge reads the API docs (web fetch), builds a client wrapper, writes tests against sandbox, documents the setup flow
5. Product ships using the integration
6. Post-ship, integration pattern submitted as PR to Rouge repo
7. Community reviews quality, tests, documentation
8. Merged — now every Rouge user has Google Maps

**Key insight:** "You launch with 10-15 integration patterns. Within months, the community has built 100. Each one was built by Rouge itself while building a real product, so the quality is practical, not theoretical."

### Research Before Selection

Integration selection is not "grab the first API you find." The builder researches the problem space, understands constraints, and picks the right tool.

Example: "Draw trips on a map."
- 10 trips? Leaflet with polylines is fine.
- 10,000 trips? Vector tiles or server-side rendering — not 10,000 DOM elements that won't load.
- Real-time tracking? WebSocket-fed map, not polling.

The builder should do what a good senior engineer does: web search the problem space, read API docs, evaluate trade-offs (performance, cost, free tier limits, scale characteristics). Not "I know Mapbox exists → use Mapbox." Picking the familiar solution instead of the right one is the Capability Avoidance Problem in a different costume.

This applies to every integration. The catalogue pattern isn't just "here's a wrapper." It's "here's the right approach for this class of problem at this scale, and here's why." Catalogue entries should capture the decision rationale, not just the implementation.

### Discovery During Building

The building phase finds integrations through:
1. Read `vision.json` for declared services
2. Load Tier 2 entries for each declared service (env vars, packages, setup)
3. Search Tier 3 entries by service + tags for implementation patterns
4. If pattern found → include in foundation cycle
5. If pattern missing → **hard blocker, not silent degradation**

---

## The Five-Tier Hierarchy

Established during the session as the full conceptual model:

```
Tier -1: DOMAIN          "What kind of thing?"    (software, electronics, books, music...)
Tier  0: PRODUCT TYPE    "What kind of tech?"     (web app, API, CLI, MCP server, game...)
Tier  1: STACK           "What framework/runtime?" (Next.js + Cloudflare, Godot, etc.)
Tier  2: SERVICE         "What infrastructure?"    (Supabase, Stripe, Sentry...)
Tier  3: INTEGRATION     "What external APIs?"     (Mapbox geocoding, Stripe checkout...)
```

**V1 scope:** Tiers 1-3 within the software domain. Tier 0 handled by complexity profiles (not switch statements). Tier -1 is the Meta Rouge vision (internal, never public).

**Growth path:**
- Near term: Expand Tier 0 (more product types within software)
- Medium term: Expand Tier 1 (more stacks per product type)
- Long term: Expand Tier -1 (beyond software — the Meta Rouge vision)

---

## Contribution Standard

Every catalogue contribution includes a `manifest.yaml`:

```yaml
id: supabase
name: Supabase
tier: 2
version: 1.0.0
description: PostgreSQL database with auth, real-time, and storage
maintainer: community
requires:
  env_vars: [SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY]
  packages: ["@supabase/supabase-js"]
  cli_tools: [supabase]
compatible_with: [nextjs-cloudflare, react-vite]
cost_tier: free
```

Review policy:
- **Tier 1 (stacks):** Core team review required
- **Tier 2 (services):** Core team review required
- **Tier 3 (integrations):** Community review sufficient (two approvals)

Validation via `rouge validate-contribution` — checks manifest integrity, file completeness, naming conventions, reference validity, semver compliance, ID uniqueness.

---

## Soft Dependencies (BENEFITS_FROM)

Post-decomposition enhancement. Phases declare optional dependencies that improve output but aren't required for correctness.

```yaml
phase: building
benefits_from:
  - test-integrity    # Quick pre-build check
  - library-lookup    # Check Library for relevant patterns
```

Behaviour:
- Before main work: check if benefiting phase is available
- If available: execute inline (subagent), absorb output
- If unavailable: proceed without — the phase works correctly either way
- Log usage: `"soft_deps": {"test-integrity": "used", "library-lookup": "skipped"}`

**When to use:** Phase produces better output with additional context but doesn't require it. Consulting phase is fast (<30s) and cheap (<$0.10).

**When NOT to use:** Ordering dependencies — use the state machine for those.

---

## Positioning

**"Builds tech"** — Rouge doesn't build web apps. It builds tech products. What it can build depends on available stacks and integrations. Today: web apps, MCP servers. Tomorrow: whatever the community adds.

**"Rouge develops products"** — Not one-shot generation. Iterative development with quality feedback loops. Build, evaluate, fix, repeat until production-ready.

---

## Decisions Made in This Session

1. Composable decomposition — capabilities activate from measurements, not categories
2. Foundation cycles — horizontal before vertical, different evaluation
3. Integration catalogue — Tier 2 (services) + Tier 3 (patterns), executable knowledge
4. Self-growing catalogue — Rouge builds integrations during product development, PRs them back
5. Decomposition feedback loop — Scale 2 structural restructure, autonomous when bounded
6. No switch statements — spectrum of capability activation
7. Two orthogonal dimensions — decomposition (domain-agnostic) × evaluation (domain-specific)
8. Five-tier hierarchy — Domain through Integration
9. Contribution standards with manifest format
10. Secrets management — OS-native stores, `rouge setup`, model never sees values
11. Private GitHub repos from foundation cycle — safety net
12. Licensing at promotion, not seeding
13. Node.js launcher (primary)
14. Meta Rouge — cross-domain composition (internal vision only, never public)
15. "Builds tech" positioning — describe what Rouge does well, never position by putting down competitors

---

## What This Document Replaces

This is the **authoritative source** for decomposition implementation. It supersedes and unifies:
- `docs/design/foundation-cycles.md` (subset — foundation cycle mechanics)
- `docs/design/composable-decomposition.md` (subset — complexity profiles)
- `docs/design/integration-catalogue.md` (subset — catalogue design)
- `docs/design/contribution-standard.md` (subset — manifest format)
- `docs/design/soft-dependencies-and-routing.md` (subset — BENEFITS_FROM)

The individual docs remain as reference but this document captures the complete vision and the reasoning behind every decision.
