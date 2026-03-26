# The Hard Part: Building Products That Aren't Simple

*Substack Article 4 — publish two weeks after launch*

---

Epoch was a timer app. One screen. One data model. No external integrations. The Karpathy Loop built it in five cycles because there was nothing to decompose — the entire product fit in one builder's head.

Then I tried to build something real.

## The fleet management problem

I wanted to test Rouge against a product with actual complexity: a fleet management system for light commercial vehicles. Trips, vehicles, a dashboard, maintenance records, a mobile view, a maps integration to show routes, and a trip simulator for testing.

Here's the dependency graph for that product:

- Vehicles and maintenance are semi-independent — maintenance needs vehicles, but nothing else needs maintenance.
- Trips need vehicles AND GPS data AND a maps API.
- Dashboard needs vehicles AND trips AND maintenance — it aggregates everything.
- Maps needs trip GPS data in a specific format.
- Mobile needs all of the above, responsive.
- The trip simulator needs realistic data that matches the schema everything else uses.

When I pointed Rouge at this, the first build cycle produced a working vehicles CRUD page and a trips page — without maps. It stored GPS coordinates as a JSON blob instead of PostGIS geometry, because it didn't have a maps integration pattern. The dashboard showed counts of things. The mobile view was a media query applied to the desktop layout.

Technically, it worked. Every test passed. The QA gate was green.

But the product was useless. A fleet management system without maps showing where the vehicles are is a spreadsheet with extra steps.

## Why it went wrong

The problem wasn't the builder. The code was fine. The tests were real. The issue was upstream — in how the product was decomposed.

Rouge was building feature-by-feature, vertically. "Build vehicles first, then trips, then dashboard." Each feature created its own data model as it went. The trips builder didn't know that the maps integration would need PostGIS geometry. The dashboard builder didn't know that trips would store GPS as JSON blobs that can't be aggregated geographically.

This is the same failure mode that happens in real engineering teams. The developer building the trips API doesn't talk to the developer building the maps frontend, and three sprints later someone discovers the data model is wrong.

For a simple product like Epoch, decomposition doesn't matter. There's nothing to decompose. For anything with shared data models, external integrations, or dense feature dependencies — decomposition is the whole game.

## Complexity profiles

The fix wasn't to add a special "fleet management mode" to Rouge. That's a switch statement, and switch statements don't scale. The next product might be a marketplace, or an API gateway, or a developer tool — each with different complexity characteristics.

Instead, the seeding phase now runs a decomposition assessment after producing the spec. It reads everything the spec contains and derives a complexity profile:

**How many entities share relationships?** If the vehicle table, trips table, maintenance table, and GPS data all reference each other — the product needs a unified data model designed upfront, not built piecemeal.

**How many external integrations does it need?** Maps, payments, email, auth providers — each one requires a working scaffold before any feature can use it.

**How dense is the feature dependency graph?** If dashboard depends on everything and everything depends on vehicles, the build order matters. You can't build dashboard first.

**Are there cross-cutting concerns?** Mobile responsiveness, maps overlays, real-time updates — these span multiple features and need their own pass.

The profile isn't a category. It's a set of measurements that determine which capabilities activate.

## Foundation cycles

When the complexity profile shows shared data models or external integrations, Rouge now runs a foundation cycle before building any features.

A foundation cycle is a horizontal slice. It doesn't produce any user-visible features. It produces:

- The unified data model — all entities, all relationships, all migrations. Designed once, used by every feature.
- Integration scaffolds — a Maps API wrapper, a Supabase client with proper RLS, auth middleware. Ready for features to plug into.
- Shared components — the design system tokens, the layout primitives, the loading states.
- Test fixtures — seed data for every entity. The trip simulator starts here.

The evaluation pipeline judges foundation cycles differently. There are no user journeys to test — instead, it checks schema completeness, integration scaffold quality, and API pattern consistency.

For the fleet management system, the foundation cycle took one build iteration. It produced a PostGIS-enabled schema, a Mapbox wrapper with geocoding and route rendering, Supabase RLS policies scoped per organisation, and test fixtures with realistic GPS waypoints across Dublin.

Every subsequent feature cycle built on top of this foundation. The trips builder used PostGIS geometry because that's what the schema provided. The maps integration worked because the Mapbox wrapper already existed. The dashboard could aggregate geographically because the data model was designed for it.

## Not every product needs this

This is the important part: the complexity profile is a spectrum, not a switch.

Epoch's profile: one entity, no integrations, no shared data model, no dependencies. Nothing activates. Rouge builds it flat — one cycle, straight through.

A medium-complexity product (say, a task management app with teams, projects, and notifications): shared data model, one integration (email), moderate dependencies. Foundation cycle activates for the schema and email scaffold. Features build in dependency order. No integration pass needed.

The fleet management system: dense entity graph, three integrations, dense dependencies, three cross-cutting concerns. Everything activates — foundation cycle, dependency ordering, parallel building where possible, integration pass for maps overlay and mobile.

Same system, different profiles, different workflows. No switch statements.

## The integration catalogue

The fleet management failure exposed a second problem: Rouge avoided solutions it didn't have patterns for.

When the spec said "show trips on a map," the builder should have integrated Mapbox or Google Maps. Instead, it substituted a table of coordinates — because it didn't have a maps integration pattern, and the autonomous builder optimised for "things I can build" rather than "things the product needs."

This is a dangerous failure mode. The product degrades silently. The QA gate passes because the table of coordinates technically works. The PO Review says "this isn't great" but can't fix a missing integration.

The fix: Rouge now maintains an integration catalogue in its Library. Each entry contains a setup guide, API key management, free tier limits, fallback chains (if the primary is expensive, here are alternatives), and most importantly — a working code pattern the builder can copy.

When the seeder identifies "this product needs maps," the decomposition phase checks the catalogue. If the pattern exists, it's included in the foundation cycle. If it doesn't exist, it's flagged as a hard blocker — not a silent degradation. The builder can't substitute a table for a map. It escalates: "I need a maps integration pattern and one doesn't exist."

For open source users, the integration catalogue is the onboarding experience. You seed a product, Rouge tells you what integrations you need, walks you through setup one at a time, and only starts building once everything is in place.

## The community growth model

Here's where it gets interesting.

When Rouge builds a product that needs a new integration — say, Mapbox — and the pattern doesn't exist in the catalogue, Rouge builds the integration pattern as part of the foundation cycle. It reads the API docs, creates a client wrapper, writes tests against the sandbox, documents the setup flow and free tier limits.

After the product ships, that integration pattern can be submitted back to the catalogue as a PR. The community reviews it, merges it, and now every Rouge user has Mapbox.

Each product Rouge builds potentially contributes back to the catalogue. The system grows by using itself. A year from now, the catalogue could have hundreds of integration patterns — not because someone sat down and wrote them all, but because real products needed them and Rouge built them along the way.

## What this means for what Rouge can build

Rouge doesn't build "web apps." Rouge builds tech products — whatever the appropriate type is for the problem. A SaaS platform, an API service, an MCP server, a CLI tool, a marketplace.

What it can build at any given moment depends on what stacks and integrations are available in the catalogue. Today, that's primarily web applications on Next.js with Cloudflare and Supabase. But the architecture is stack-agnostic. The decomposition assessment, the foundation cycles, the evaluation pipeline — none of it is web-specific. It's product-development infrastructure.

As the community adds more stacks and integration patterns, the palette of products Rouge can build expands. The decomposition phase discovers what's available and picks the best fit.

The hard part was never the building. It was knowing what to build in what order, with what tools, against what quality bar. That's the decomposition problem. And for products more complex than a timer, it's the whole game.

---

*Rouge is open source at github.com/gregario/the-rouge. The integration catalogue is empty-ish and waiting for contributions.*
