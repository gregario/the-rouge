# Fleet-Manager Testing Stack: Supabase + GPS Simulator

**Date:** 2026-03-31
**Status:** Design
**Addresses:** #72 (foundation constraints), #67 (foundation redesign), #70 (wire API to real DB)

## Problem

The Rouge loop is stuck. Fleet-manager deploys to Cloudflare Workers with no database. API routes fall back to mock data. Evaluation flags persistence failures as bugs. QA-fixing can't fix them. Health score drops every cycle (73 → 58). The loop wastes cycles on infrastructure-blocked phantom bugs.

The root cause: Rouge needs a real deployed web stack to test against, even for products whose final delivery is Docker Compose self-hosted.

## Decision

**Rouge tests against a real web stack. Docker Compose migration is the final step, not the testing environment.**

For fleet-manager:
- Database: Supabase (Postgres + PostGIS)
- Frontend: Cloudflare Pages (already deployed)
- API: Next.js API routes via Prisma → Supabase connection pooler
- Simulator: Cloudflare Workers cron trigger

This becomes the default foundation pattern for web products in Rouge.

## Architecture

```
┌──────────────────┐     every 1 min      ┌──────────────────┐
│  CF Worker Cron   │ ──────────────────→  │    Supabase      │
│  (GPS Simulator)  │   batch INSERT       │  (Postgres +     │
└──────────────────┘   6 pts/vehicle       │   PostGIS)       │
                                           │                  │
┌──────────────────┐     Prisma + pg       │  - vehicles      │
│  CF Pages         │ ←──────────────────→ │  - gps_positions │
│  (Next.js app)    │   API routes         │  - alerts        │
│                   │                      │  - (future FA4-6)│
└──────────────────┘                       └──────────────────┘
        ↑                                          ↑
        │ browser                                  │
┌──────────────────┐                       ┌──────────────────┐
│  Rouge QA Loop    │                      │  seed.js          │
│  (headless browser│                      │  (reset to demo   │
│   via GStack)     │                      │   state)          │
└──────────────────┘                       └──────────────────┘
```

## Component 1: Supabase Database

**Provisioning:**
- The Rouge already has Supabase provisioning in `provision-infrastructure.js`
- Fleet-manager needs PostGIS extension enabled (`CREATE EXTENSION IF NOT EXISTS postgis`)
- Connection: via Supabase connection pooler (pgBouncer), compatible with Prisma + pg adapter
- `DATABASE_URL` set as Cloudflare Workers secret

**Schema:** Existing Prisma schema works as-is. Three models: Vehicle, GpsPosition, Alert. PostGIS can be added later for spatial queries (trip detection, geofencing) but isn't needed for basic GPS point storage — the existing lat/lng float columns work for V1.

**Free tier limits:**
- 500 MB database storage
- 2 active projects (Rouge slot rotation handles this)
- Unlimited API requests

## Component 2: GPS Simulator (CF Workers Cron)

**Location:** `projects/fleet-manager/simulator/`

**How it works:**
- Cloudflare Workers cron trigger fires every 1 minute
- Generates 6 GPS points per vehicle (10-second intervals covering the last minute)
- Batch-inserts to Supabase via direct pg connection
- Each vehicle follows a pre-defined London route on an hour-long loop

**Vehicle behaviors (15 vehicles):**
- 8 delivery vans: depart depot at staggered times, drive a route, stop at 3-4 delivery points (2-5 min each), return to depot
- 3 service trucks: depot → single job site (30 min on-site) → return
- 2 idle at depot: parked, no movement (engine off)
- 1 in-shop: stationary at garage location
- 1 decommissioned: no GPS points generated

**Organic movement:**
- Routes follow real London roads (pre-defined coordinate arrays, not random)
- Speed varies: 20-30 mph in town, 40-50 mph on A-roads
- Brief stops at intersections (simulating traffic)
- Different departure times so vehicles aren't synchronized
- Slight randomization in stop durations (±30 seconds)

**Route data:** Static coordinate arrays in `simulator/routes/`. Each route is an array of `[lat, lng, speedLimit]` waypoints. The simulator interpolates between waypoints at the appropriate speed, generating points every 10 seconds.

**Deployment:** `wrangler.toml` in `simulator/` with cron trigger config. Deployed separately from the main app.

## Component 3: Data Rotation

**Strategy:** Delete GPS positions older than 4 days. Keeps storage at ~78 MB steady state (well within 500 MB free tier).

**Implementation:** Either:
- (a) The cron worker deletes old positions at the start of each run (1 extra query/minute, trivial)
- (b) Supabase pg_cron extension runs `DELETE FROM gps_positions WHERE timestamp < NOW() - INTERVAL '4 days'` daily

Option (a) is simpler and doesn't require pg_cron setup.

**Storage math:**
- 15 vehicles × 6 points/min × 60 min × 24 hours × 4 days = 518,400 rows
- ~150 bytes/row = ~78 MB steady state

## Component 4: Seed/Reset Script

**Location:** `projects/fleet-manager/simulator/seed.js`

**What it does:**
1. Truncates all tables (vehicles, gps_positions, alerts)
2. Inserts the 50 vehicles from the existing mock-data.ts definitions
3. Inserts the 18 alerts from mock-data.ts
4. Does NOT insert GPS positions (the simulator handles those)

**When to run:**
- Before a demo (clean slate)
- At the start of each Rouge build cycle (so evaluation starts from known state)
- After QA testing pollutes the database

**Integration with Rouge:** The launcher should call `seed.js` at the start of each cycle (or at least before the product-walk phase) so evaluation always sees a clean database, not leftover test artifacts from QA-fixing.

## Component 5: Fix for #72 (Infrastructure Constraints)

With Supabase provisioned, the `database.available: false` constraint goes away for fleet-manager. But the pattern still needs to exist for products where infrastructure genuinely can't be provisioned.

**Changes to cycle_context.json:**

```json
{
  "infrastructure": {
    "database": {
      "available": true,
      "provider": "supabase",
      "connection_pooler": true
    },
    "staging_url": "https://fleet-manager-staging.gregj64.workers.dev",
    "simulator": {
      "active": true,
      "type": "cf-worker-cron",
      "interval": "1m",
      "vehicles": 15
    }
  }
}
```

**Changes to evaluation prompt:** When `infrastructure.database.available === false`, evaluation must:
- Mark persistence-related criteria as `infrastructure_blocked` (not `fail`)
- `infrastructure_blocked` counts like `env_limited` — not a failure, but noted
- Product-walk skips CRUD journey testing for blocked infrastructure

**Changes to foundation:** Foundation must populate the `infrastructure` section of `cycle_context.json` accurately after provisioning. If provisioning fails, it writes `available: false` with a reason, and the loop can still run without wasting cycles.

## Impact on Rouge Foundation Defaults

This design establishes a new default for web products:

**Before:** Foundation provisions Cloudflare Workers. Database is optional. If no DATABASE_URL, mock data.

**After:** Foundation provisions Cloudflare Pages + Supabase (Postgres). Database is the default for any product with a data model. Mock fallback remains for local dev only, not for the QA loop.

This should be reflected in #67 (foundation redesign) — the foundation phase should always provision a database when the Prisma schema exists.

## What This Does NOT Cover

- Docker Compose migration (final shipping step, separate task)
- PostGIS spatial queries (future FA3 work — trip detection, geofencing)
- WebSocket/real-time updates (deferred to FA3+)
- Auth/driver management (FA5)
- The simulator only handles GPS telemetry, not alerts or maintenance events
