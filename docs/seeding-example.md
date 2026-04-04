# Seeding example: OpenFleet

This is a stylised walkthrough of what a real seeding session looks like for a complex product. OpenFleet is a fleet management SaaS — the kind of product that exercises every Rouge capability: foundation cycles, dependency ordering, infrastructure resolution, and the full evaluation pipeline.

The actual session takes about 15-20 minutes over Slack. What follows is condensed, but the shape of the conversation is real.

## What you start with

A one-liner. That's it. You don't need a spec, a wireframe, or a business plan. You need an idea.

```
"A fleet management dashboard for small delivery companies. Live vehicle tracking
on a map, trip recording, driver management, and a vehicle maintenance log.
Real-time GPS, 5-50 vehicles."
```

You type this into Slack (or pass it to `rouge seed`). Rouge takes it from there.

## What happens next

Rouge runs eight discipline-specific personas through your idea, one at a time. Each one interrogates the idea from a different angle. You're in the conversation the whole time, answering questions and making decisions.

### 1. Brainstorming

The brainstormer expands the idea. It asks questions you hadn't thought of:

> **Rouge:** You said "live vehicle tracking." What does live mean — 1-second GPS updates, 30-second polling, or event-driven (ignition on, arrived at stop)? The architecture is completely different for each.
>
> **You:** 30-second polling is fine. This isn't Uber. It's delivery vans doing planned routes.
>
> **Rouge:** What's the emotional hook for the dispatcher? A map with dots moving is a screensaver. What makes this useful at 7am when 12 vans leave the depot?
>
> **You:** The dispatcher needs to know: who's running late, who's done, and which vehicle is closest to a new pickup. Status at a glance.
>
> **Rouge:** That's three features hiding in one: trip progress tracking, completion status, and proximity search. The map is the view layer, not the product.

By the end, the idea has gone from "GPS dots on a map" to a product with trip lifecycle management, status dashboards, and proximity-based dispatch.

### 2. Competition review

Rouge searches for competing products and maps the landscape:

> **Rouge:** I found 8 direct competitors. Samsara ($800/vehicle/year, enterprise), Verizon Connect (telecom bundle, complex onboarding), Fleet Complete (hardware-dependent), and 5 smaller players. All target 50+ vehicle fleets with hardware requirements.
>
> The gap: no lightweight, software-only fleet manager for 5-50 vehicles. Every competitor requires hardware (OBD-II dongles, dash cams) or enterprise sales calls. A browser-based dashboard using phone GPS has zero hardware cost and instant onboarding.

### 3. Product taste

This is where the idea gets challenged:

> **Rouge:** Push-back: phone GPS in a delivery van is unreliable. Tunnels, urban canyons, phone battery. Your positioning is "software-only, no hardware" but phone GPS is genuinely less reliable than OBD-II. How do you handle gaps?
>
> **You:** Acknowledge it. Show last-known position with a timestamp. "Last seen: 2 minutes ago." Don't fake precision.
>
> **Rouge:** Good. That's honest UX. Second push-back: 5-50 vehicles is a weird range. At 5 you don't need software — a WhatsApp group works. Where does the pain actually start?
>
> **You:** 10+. Below that, you're right, it's overkill. Target 10-50.
>
> **Rouge:** Scope verdict: HOLD. The product is well-scoped. Five feature areas, clear differentiation, viable market. Proceed.

### 4. Spec generation

Rouge writes formal specifications for each feature area:

> **Rouge:** I've broken this into 5 feature areas across 2 milestones:
>
> **Milestone 1: Dashboard & Vehicle Registry**
> 1. **Dashboard** — live map, vehicle status cards, at-a-glance metrics (12 acceptance criteria)
> 2. **Vehicle registry** — CRUD for vehicles, driver assignment, maintenance log (9 criteria)
>
> **Milestone 2: Trip Management & GPS**
> 3. **Trip recording** — start/stop trips, GPS track, waypoints, ETA (14 criteria)
> 4. **Trip history** — past trips with replay, distance/duration stats, export (8 criteria)
> 5. **Driver management** — driver profiles, assignment history, availability (7 criteria)
>
> Each criterion is testable. For example: "Map centres on the depot location on first load. Vehicles appear within 3 seconds of page load. Vehicles older than 5 minutes show a 'stale' indicator."
>
> **You:** Looks right. Put maintenance log in a future milestone, not milestone 1.
>
> **Rouge:** Done. Vehicle registry simplified. Maintenance deferred.

### 5. Infrastructure

This is the V3 discipline that prevents mid-build surprises:

> **Rouge:** Infrastructure analysis complete. Three decisions resolved:
>
> 1. **Database + deploy compatibility:** You're deploying to Cloudflare Workers. Prisma ORM is incompatible with the Workers edge runtime. Resolved: use `@supabase/supabase-js` for all database access. No ORM.
>
> 2. **Map integration:** Leaflet.js with OpenStreetMap tiles (free, no API key). Mapbox is overkill for this scale. Note: Leaflet's SSR story is weak — the map component must be client-only with dynamic import.
>
> 3. **Real-time GPS:** Supabase Realtime (Postgres changes channel) for vehicle position updates. No WebSocket server needed — Supabase handles it on the free tier up to 200 concurrent connections.
>
> No incompatibilities remaining. `infrastructure_manifest.json` written.

Without this discipline, the builder would have chosen Prisma (most popular ORM), hit the Cloudflare Workers incompatibility during foundation, and spent 30 minutes diagnosing and switching — mid-loop, with partial migrations already applied.

### 6. Design

The design persona produces UX architecture:

> **Rouge:** Dashboard: map takes 60% of viewport (left), vehicle status cards stack on the right (40%). Cards show: vehicle name, driver, current status (en route / idle / offline), last updated timestamp. Clicking a card centres the map on that vehicle.
>
> Core flow: dispatcher opens dashboard → sees all vehicles → clicks one → sees current trip → sees ETA. Three clicks to the information they need.
>
> Mobile: cards collapse to a bottom sheet. Map goes full-screen. Swipe up to see vehicle list.

### 7. Legal and privacy

> **Rouge:** GPS tracking of employees has specific requirements. GDPR Article 6: legitimate interest or consent. Drivers must be informed that their location is tracked during work hours. Recommendation: show a clear "tracking active" indicator in the driver's phone app. Privacy policy must disclose GPS data collection, retention period, and who can access it.
>
> No COPPA concerns (adult users). Standard terms of service for a B2B SaaS.

### 8. Marketing

Rouge drafts a landing page and README:

> **Rouge:** Headline: "Fleet management without the hardware." Sub: "Track your delivery vehicles from any browser. No dongles, no contracts, no enterprise sales calls. Works with the phones your drivers already carry."

## What you end up with

After 20 minutes, Rouge has produced:

- **vision.json** — the North Star document. Persona (delivery fleet dispatcher, 10-50 vehicles), problem, feature areas, quality bar.
- **task_ledger.json** — 2 milestones, 5 stories, 50 acceptance criteria. This is what the build loop executes against.
- **infrastructure_manifest.json** — database (Supabase, `@supabase/supabase-js`), deploy (Cloudflare Workers), auth (Supabase Auth), resolved incompatibilities.
- **Seed specs** — one per feature area, with acceptance criteria, user journeys, edge cases, data models.
- **Design artifacts** — sitemap, journey maps, component mapping, style tokens.
- **Legal review** — GPS tracking compliance, privacy policy requirements.

The project directory:

```
projects/openfleet/
  vision.json
  task_ledger.json
  infrastructure_manifest.json
  seed_spec/
    brainstorming-design-doc.md
    competition-analysis.md
    spec-01-dashboard.md
    spec-02-vehicle-registry.md
    spec-03-trip-recording.md
    spec-04-trip-history.md
    spec-05-driver-management.md
    design-artifact.yaml
    legal-privacy-review.md
    taste-verdict.md
```

## Then what?

You run `rouge build openfleet` and walk away. The loop takes over:

1. **Foundation** reads `infrastructure_manifest.json` and sets up the database schema, auth, Supabase Realtime channels, and deploys to staging. No decisions to make — infrastructure already resolved them.
2. **Story building** works through milestone 1 (dashboard + vehicle registry) with TDD. Single branch, bisectable commits.
3. **Milestone evaluation** deploys to staging, opens a real browser, navigates every screen, runs Lighthouse, checks accessibility, evaluates against the 21 acceptance criteria.
4. **Analyse** promotes milestone 1 (locks it — can't regress), starts milestone 2.
5. Repeat until all milestones are promoted. Ship to production. Ping you on Slack.

If it gets stuck — a map library that doesn't SSR, a Supabase Realtime edge case, a design that doesn't work on mobile — it escalates to Slack with context, screenshots, and options. You respond, it continues.

See [Your first product](your-first-product.md) for what the build loop looks like in practice.
