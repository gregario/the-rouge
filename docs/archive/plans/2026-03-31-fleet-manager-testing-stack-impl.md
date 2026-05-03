# Fleet-Manager Testing Stack Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire fleet-manager to a real Supabase database, build a GPS simulator that runs forever on CF Workers cron, fix #72 so the Rouge loop stops chasing infrastructure-blocked phantom bugs, and add a seed script for clean demo resets.

**Architecture:** Supabase (Postgres) as the database, Cloudflare Workers secrets for DATABASE_URL, CF Workers cron trigger (every 1 min) as the GPS simulator, seed script for demo resets, data rotation deleting GPS points older than 4 days. Evaluation prompt gains `infrastructure_blocked` verdict type.

**Tech Stack:** Supabase (Postgres), Prisma 7, Cloudflare Workers (cron triggers), pg driver, Node.js

**Design doc:** `docs/plans/2026-03-31-fleet-manager-testing-stack.md`

---

## Task 1: Provision Supabase and Wire DATABASE_URL

**Context:** `provision-infrastructure.js` already has Supabase provisioning (slot rotation, API key retrieval). Fleet-manager's `cycle_context.json` shows `infrastructure.readiness.supabase: false`. The Prisma schema exists but has never been pushed to a real database.

**Files:**
- Read: `src/launcher/provision-infrastructure.js` (understand existing provisioning)
- Read: `projects/fleet-manager/app/prisma/schema.prisma` (existing schema)
- Read: `projects/fleet-manager/app/src/lib/db.ts` (connection logic)
- Modify: `projects/fleet-manager/cycle_context.json` (update infrastructure section)

**Step 1: Check Supabase CLI and auth**

Run:
```bash
cd /Users/gregario/Projects/ClaudeCode/The-Rouge
supabase --version
supabase projects list 2>/dev/null | head -5
```
Expected: CLI installed, authenticated, shows existing projects (may have 2 active — slot rotation needed).

**Step 2: Create Supabase project for fleet-manager**

Run:
```bash
cd /Users/gregario/Projects/ClaudeCode/The-Rouge/projects/fleet-manager/app
supabase init 2>/dev/null || true
supabase projects create openfleet --region eu-west-1 --db-password "$(openssl rand -hex 16)"
```

If slot rotation needed (2 active projects), identify which to pause:
```bash
supabase projects list
# Pause the least-active non-fleet-manager project
supabase projects pause --project-ref <ref>
```

Record the project ref, connection string, anon key, service role key from output.

**Step 3: Push Prisma schema to Supabase**

Run:
```bash
cd /Users/gregario/Projects/ClaudeCode/The-Rouge/projects/fleet-manager/app
# Set DATABASE_URL to Supabase connection pooler URL (transaction mode for Prisma)
export DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
npx prisma db push
```
Expected: Schema pushed successfully — Vehicle, GpsPosition, Alert tables created.

**Step 4: Set DATABASE_URL as Cloudflare Workers secret**

Run:
```bash
cd /Users/gregario/Projects/ClaudeCode/The-Rouge/projects/fleet-manager/app
echo "$DATABASE_URL" | npx wrangler secret put DATABASE_URL --env staging
```
Expected: Secret uploaded for fleet-manager-staging worker.

**Step 5: Verify the app works with real DB**

Run:
```bash
cd /Users/gregario/Projects/ClaudeCode/The-Rouge/projects/fleet-manager/app
npm run build && npx @opennextjs/cloudflare build && npx wrangler deploy --env staging
```

Then verify:
```bash
curl -s https://fleet-manager-staging.gregj64.workers.dev/api/fleet/status | head -20
```
Expected: Response shows real data (likely zeros since DB is empty), NOT mock data with 50 vehicles.

**Step 6: Update cycle_context.json infrastructure section**

Update `projects/fleet-manager/cycle_context.json` — set `infrastructure.readiness.supabase: true` and add Supabase connection details (without passwords — those go in secrets only).

**Step 7: Commit**

```bash
git add projects/fleet-manager/cycle_context.json projects/fleet-manager/app/supabase/
git commit -m "infra: provision Supabase for fleet-manager, push Prisma schema"
```

---

## Task 2: Build the Seed Script

**Context:** The app currently has `mock-data.ts` with 50 vehicles and 18 alerts using deterministic PRNG. We need a script that writes this data to Supabase so the app has demo data. This also serves as a reset script — run it to get back to a clean demo state.

**Files:**
- Read: `projects/fleet-manager/app/src/lib/mock-data.ts` (source of demo data)
- Create: `projects/fleet-manager/simulator/seed.ts`
- Create: `projects/fleet-manager/simulator/package.json`
- Create: `projects/fleet-manager/simulator/tsconfig.json`

**Step 1: Create simulator directory and package.json**

```bash
mkdir -p /Users/gregario/Projects/ClaudeCode/The-Rouge/projects/fleet-manager/simulator
```

Create `projects/fleet-manager/simulator/package.json`:
```json
{
  "name": "fleet-manager-simulator",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "seed": "tsx seed.ts",
    "dev": "tsx watch simulator.ts"
  },
  "dependencies": {
    "pg": "^8.20.0"
  },
  "devDependencies": {
    "tsx": "^4.21.0",
    "typescript": "^5",
    "@types/pg": "^8.20.0"
  }
}
```

Create `projects/fleet-manager/simulator/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist"
  },
  "include": ["*.ts", "routes/*.ts"]
}
```

**Step 2: Write the seed script**

Create `projects/fleet-manager/simulator/seed.ts`:

The script must:
1. Connect to Supabase via `DATABASE_URL` env var
2. Truncate all tables (CASCADE) — `gps_positions`, `alerts`, `vehicles`
3. Insert the 50 vehicles from mock-data.ts logic (replicate the deterministic PRNG and vehicle generation)
4. Insert the 18 alerts from mock-data.ts logic
5. Log counts and exit

Key implementation detail: **Don't import from the app's mock-data.ts** (different module system, Next.js deps). Instead, replicate the Mulberry32 PRNG and data generation inline. The mock-data.ts uses seed=42 for vehicles, seed=99 for alerts — keep those seeds so the data is identical.

Structure:
```typescript
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL required');

// Mulberry32 PRNG (copy from mock-data.ts)
function mulberry32(seed: number) { /* ... */ }

// Vehicle generation (copy logic from mock-data.ts)
// Alert generation (copy logic from mock-data.ts)

async function seed() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    await pool.query('TRUNCATE vehicles, gps_positions, alerts CASCADE');
    // Batch insert vehicles
    // Batch insert alerts
    console.log('Seeded: 50 vehicles, 18 alerts');
  } finally {
    await pool.end();
  }
}

seed();
```

**Step 3: Install deps and test locally**

```bash
cd /Users/gregario/Projects/ClaudeCode/The-Rouge/projects/fleet-manager/simulator
npm install
DATABASE_URL="<supabase-url>" npm run seed
```

Expected: `Seeded: 50 vehicles, 18 alerts`

**Step 4: Verify via API**

```bash
curl -s https://fleet-manager-staging.gregj64.workers.dev/api/fleet/status
```
Expected: Shows 50 total vehicles, 44 active, etc. (matching mock-data.ts numbers).

**Step 5: Redeploy app (the secrets are already set, just need fresh deploy)**

```bash
cd /Users/gregario/Projects/ClaudeCode/The-Rouge/projects/fleet-manager/app
npm run build && npx @opennextjs/cloudflare build && npx wrangler deploy --env staging
```

**Step 6: Commit**

```bash
git add projects/fleet-manager/simulator/
git commit -m "feat(fleet-manager): add seed script for demo data reset"
```

---

## Task 3: Build the GPS Simulator (CF Workers Cron)

**Context:** The simulator runs as a separate Cloudflare Worker with a cron trigger. Every minute it generates 6 GPS points per vehicle (10-second intervals) and batch-inserts them. Vehicles follow pre-defined London routes on hour-long loops.

**Files:**
- Create: `projects/fleet-manager/simulator/routes/london.ts` (route coordinate data)
- Create: `projects/fleet-manager/simulator/src/worker.ts` (CF Worker entry point)
- Create: `projects/fleet-manager/simulator/wrangler.toml` (with cron trigger)

**Step 1: Create London route data**

Create `projects/fleet-manager/simulator/routes/london.ts`:

Define 5-6 routes as arrays of `[lat, lng, speedLimitMph]` waypoints:

1. **Depot → East London delivery loop** (~25 waypoints): Bermondsey depot → Tower Bridge → Whitechapel → Mile End → Stratford → back. Speed: 20-30 mph.
2. **Depot → South London service run** (~20 waypoints): Bermondsey → Peckham → Brixton → Clapham → back. Speed: 20-35 mph.
3. **Depot → North via A1** (~15 waypoints): Bermondsey → City → Islington → Finsbury Park → back. Speed: 25-40 mph on A-roads.
4. **Depot → West via Embankment** (~18 waypoints): Bermondsey → Southwark → Westminster → Chelsea → back. Speed: 20-30 mph.
5. **Short local loop** (~10 waypoints): Bermondsey → Rotherhithe → Canada Water → back. Speed: 15-25 mph.

Each route includes waypoints at ~200-500m intervals. The simulator interpolates between them.

Depot location: approximately `51.4975, -0.0803` (Bermondsey, SE London — industrial area with lots of trade businesses).

Export:
```typescript
export interface Waypoint { lat: number; lng: number; speedMph: number; }
export interface Route { name: string; waypoints: Waypoint[]; pauseMinutes: number; }
export const routes: Route[];
```

`pauseMinutes` = how long the vehicle stops at the destination before returning (e.g., 5 min for delivery, 30 min for service call).

**Step 2: Write the vehicle assignment logic**

In the worker, assign the 15 active vehicles to routes:

```typescript
// Vehicle assignments (by index in the seeded vehicle list)
// 8 delivery vans: routes 1,2,3,4 (2 per route), staggered departure
// 3 service trucks: route 2,3,4 (1 each), 30-min pause
// 2 idle at depot: no route, stationary at depot coords
// 1 in-shop: stationary at garage (51.4892, -0.0567)
// 1 decommissioned: no GPS generated
```

Each vehicle has a `phaseOffset` (0-59 minutes) so they start at different points in their route when the simulator begins.

**Step 3: Write the GPS point interpolation logic**

The core algorithm:
1. Given current time and vehicle's route + phaseOffset, calculate where in the hour-long loop the vehicle is
2. Determine which segment of the route (outbound, paused at destination, return, paused at depot)
3. Interpolate position between waypoints based on speed
4. Add slight randomization (±0.0001 degrees, ±2 mph speed jitter)
5. Return `{ lat, lng, speed, heading }` for the current moment

For heading: calculate bearing between current position and next waypoint.

**Step 4: Write the CF Worker**

Create `projects/fleet-manager/simulator/src/worker.ts`:

```typescript
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const now = Date.now();
    const points: GpsPoint[] = [];

    // Generate 6 points per vehicle (last 60 seconds at 10s intervals)
    for (let t = 0; t < 6; t++) {
      const timestamp = new Date(now - (5 - t) * 10_000);
      for (const vehicle of activeVehicles) {
        const pos = interpolatePosition(vehicle, timestamp);
        if (pos) points.push({ vehicleId: vehicle.dbId, ...pos, timestamp });
      }
    }

    // Batch insert GPS points
    await batchInsertPositions(env.DATABASE_URL, points);

    // Update vehicle last-known positions
    await updateVehiclePositions(env.DATABASE_URL, activeVehicles, now);

    // Data rotation: delete positions older than 4 days
    await deleteOldPositions(env.DATABASE_URL, now);
  }
};
```

The worker needs:
- `batchInsertPositions()` — single INSERT with VALUES list (not individual inserts)
- `updateVehiclePositions()` — UPDATE vehicles SET lastLatitude, lastLongitude, lastSpeed, lastHeading, lastPositionAt, motionState for each active vehicle
- `deleteOldPositions()` — `DELETE FROM gps_positions WHERE timestamp < NOW() - INTERVAL '4 days'`

Use raw pg queries (not Prisma — the worker is lightweight and doesn't need the ORM).

**Step 5: Create wrangler.toml for the simulator worker**

Create `projects/fleet-manager/simulator/wrangler.toml`:

```toml
name = "fleet-manager-simulator"
main = "src/worker.ts"
compatibility_date = "2025-12-01"
compatibility_flags = ["nodejs_compat"]

[triggers]
crons = ["* * * * *"]

[vars]
ENVIRONMENT = "production"
```

**Step 6: Set DATABASE_URL secret for the simulator worker**

```bash
cd /Users/gregario/Projects/ClaudeCode/The-Rouge/projects/fleet-manager/simulator
echo "$DATABASE_URL" | npx wrangler secret put DATABASE_URL
```

**Step 7: Deploy the simulator**

```bash
cd /Users/gregario/Projects/ClaudeCode/The-Rouge/projects/fleet-manager/simulator
npm install
npx wrangler deploy
```

**Step 8: Verify GPS data is flowing**

Wait 2 minutes, then:
```bash
curl -s https://fleet-manager-staging.gregj64.workers.dev/api/vehicles/positions | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d)} vehicles with positions')"
```
Expected: `13 vehicles with positions` (15 minus 2: 1 decommissioned + 1 in-shop don't move, but in-shop still has a static position, so likely 14).

Also verify GPS history:
```bash
curl -s "https://fleet-manager-staging.gregj64.workers.dev/api/vehicles/<vehicle-id>" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d.get(\"positions\",[]))} positions')"
```
Expected: Shows recent GPS positions (up to 10, as the API limits to last 10).

**Step 9: Commit**

```bash
git add projects/fleet-manager/simulator/
git commit -m "feat(fleet-manager): add GPS simulator on CF Workers cron (1-min interval, 15 vehicles, London routes)"
```

---

## Task 4: Fix #72 — Infrastructure Constraints in Evaluation

**Context:** The evaluation prompt (`src/prompts/loop/02e-evaluation.md`) has `env_limited` for test environment limitations (WebGL, hardware). We need a parallel concept: `infrastructure_blocked` for when infrastructure isn't provisioned. This is read from `cycle_context.json.infrastructure`.

**Files:**
- Modify: `src/prompts/loop/02e-evaluation.md` (add infrastructure_blocked handling)
- Modify: `src/prompts/loop/02d-product-walk.md` (skip CRUD journeys for blocked infrastructure)
- Modify: `src/launcher/rouge-loop.js` (foundation writes infrastructure manifest)

**Step 1: Add infrastructure_blocked to evaluation prompt**

In `src/prompts/loop/02e-evaluation.md`, after the `env_limited` section (after line 43), add:

```markdown
**Infrastructure limitations:** Some criteria cannot pass because required infrastructure is not provisioned (e.g., no database means persistence fails, no auth service means login fails). Read `infrastructure` from `cycle_context.json`:

1. If `infrastructure.database.available === false`, criteria requiring data persistence are `infrastructure_blocked`
2. If `infrastructure.auth.available === false`, criteria requiring authentication are `infrastructure_blocked`
3. If `infrastructure.file_storage.available === false`, criteria requiring file uploads are `infrastructure_blocked`
4. `infrastructure_blocked` criteria count as **passed** for criteria pass rate (same as `env_limited`)
5. Log clearly: what criterion, what infrastructure is missing, what `infrastructure.*.reason` says

`infrastructure_blocked` is NOT an escape hatch for bugs. It applies ONLY when:
- The infrastructure section explicitly declares the service unavailable
- The criterion directly requires that infrastructure (not just tangentially related)
- The code correctly falls back (no crashes, shows appropriate empty/unavailable state)

If `infrastructure` key is absent from cycle_context.json, assume all infrastructure is available — do not infer limitations.
```

Also update the verdict output format (around line 54) to include `infrastructure_blocked_count`:

```markdown
Emit: `QA lens: <passed>/<total> criteria pass (<env_limited> env-limited, <infra_blocked> infrastructure-blocked)`
```

And update the output fields to include `infrastructure_blocked_count` alongside `env_limited_count`.

**Step 2: Update product-walk to note infrastructure state**

In `src/prompts/loop/02d-product-walk.md`, add instruction to read infrastructure from cycle_context.json at the start of the walk:

```markdown
**Infrastructure awareness:** Read `infrastructure` from `cycle_context.json` before walking. If `database.available === false`, do not test CRUD journeys (create/update/delete operations) — they will fail due to missing infrastructure, not due to bugs. Note in the walk report which journeys were skipped and why.
```

**Step 3: Ensure foundation writes infrastructure manifest**

In `src/launcher/provision-infrastructure.js`, after provisioning completes, verify it writes to cycle_context.json:

```json
{
  "infrastructure": {
    "database": {
      "available": true/false,
      "provider": "supabase|docker-compose|none",
      "reason": "why unavailable (if false)"
    },
    "auth": { "available": true/false },
    "file_storage": { "available": true/false },
    "staging_url": "https://..."
  }
}
```

Check the existing `provision-infrastructure.js` code — it already writes `infrastructure.readiness.supabase`. Extend it to write the structured `database.available` format that evaluation expects.

**Step 4: Commit**

```bash
git add src/prompts/loop/02e-evaluation.md src/prompts/loop/02d-product-walk.md src/launcher/provision-infrastructure.js
git commit -m "fix(#72): add infrastructure_blocked verdict to evaluation and product-walk

Evaluation now reads infrastructure manifest from cycle_context.json.
Missing infrastructure (no DB, no auth) is marked infrastructure_blocked,
not fail. Prevents the loop from wasting cycles on phantom bugs."
```

---

## Task 5: Integrate Seed Script into Rouge Loop

**Context:** The Rouge loop's QA-fixing phase creates test data (new vehicles, alerts) that pollutes the database. The seed script should run at the start of each build cycle to reset to a known state.

**Files:**
- Modify: `src/launcher/rouge-loop.js` (add seed call before product-walk or at cycle start)
- Read: `projects/fleet-manager/simulator/seed.ts` (the seed script from Task 2)

**Step 1: Add seed invocation to the launcher**

In `rouge-loop.js`, in the `building` state handler (before the build phase runs), or better: before the `product-walk` state, add:

```javascript
// Reset demo data before product walk so evaluation sees clean state
if (state.current_state === 'product-walk') {
  const seedScript = path.join(projectDir, 'simulator', 'seed.ts');
  if (fs.existsSync(seedScript)) {
    log(projectName, 'Resetting database to demo state (seed.ts)');
    try {
      execSync(`cd ${path.join(projectDir, 'simulator')} && npx tsx seed.ts`, {
        timeout: 30_000,
        env: { ...process.env, DATABASE_URL: ctx.infrastructure?.supabase?.connection_string }
      });
    } catch (e) {
      log(projectName, `Seed failed: ${e.message} — continuing with existing data`);
    }
  }
}
```

This ensures every product-walk evaluates against clean demo data, not QA leftovers.

**Step 2: Test by running a manual seed + walk cycle**

```bash
cd /Users/gregario/Projects/ClaudeCode/The-Rouge/projects/fleet-manager/simulator
DATABASE_URL="<url>" npm run seed
# Then verify the staging site shows clean data
curl -s https://fleet-manager-staging.gregj64.workers.dev/api/fleet/status
```

**Step 3: Commit**

```bash
git add src/launcher/rouge-loop.js
git commit -m "feat: run seed script before product-walk to prevent QA data pollution"
```

---

## Task 6: Update Foundation Defaults for Web Products

**Context:** The foundation phase should always provision a database when a Prisma schema exists. Currently it checks `vision.infrastructure.needs_database` which fleet-manager didn't set.

**Files:**
- Modify: `src/launcher/provision-infrastructure.js` (auto-detect Prisma schema)
- Modify: `src/prompts/loop/00-foundation-building.md` (update foundation checklist)

**Step 1: Add Prisma schema detection to provisioning**

In `provision-infrastructure.js`, before the Supabase provisioning check, add:

```javascript
// Auto-detect database need from Prisma schema
const appDir = detectAppDir(projectDir);
const prismaSchema = path.join(appDir, 'prisma', 'schema.prisma');
if (fs.existsSync(prismaSchema) && !vision?.infrastructure?.needs_database) {
  log(projectName, 'Prisma schema detected — database required (auto-detected)');
  // Treat as needs_database = true
  needsDatabase = true;
}
```

This way, even if the vision doesn't explicitly say `needs_database: true`, the presence of a Prisma schema triggers Supabase provisioning.

**Step 2: Update foundation building prompt**

In `src/prompts/loop/00-foundation-building.md`, in the mandatory checklist section, add:

```markdown
**Infrastructure verification (before exiting foundation):**
- [ ] If Prisma schema exists → database provisioned and connectable
- [ ] Deployment target configured and deployable
- [ ] All infrastructure from vision accounted for
- [ ] `infrastructure` section in cycle_context.json accurately reflects what's available
If any item fails → write to `factory_questions` with severity: blocking. Do NOT silently skip.
```

**Step 3: Commit**

```bash
git add src/launcher/provision-infrastructure.js src/prompts/loop/00-foundation-building.md
git commit -m "feat: foundation auto-detects Prisma schema and provisions database

Prevents the fleet-manager failure mode where foundation skipped DB
provisioning because vision.infrastructure.needs_database wasn't set."
```

---

## Task 7: Verify End-to-End and Restart the Loop

**Context:** After all changes are in place, verify the full stack works and restart the Rouge loop.

**Step 1: Run the seed script**

```bash
cd /Users/gregario/Projects/ClaudeCode/The-Rouge/projects/fleet-manager/simulator
DATABASE_URL="<url>" npm run seed
```

**Step 2: Verify the simulator is running**

```bash
npx wrangler tail fleet-manager-simulator --format pretty 2>&1 | head -20
```
Expected: See cron invocations every minute with batch insert logs.

**Step 3: Verify the app shows real data**

```bash
curl -s https://fleet-manager-staging.gregj64.workers.dev/api/fleet/status | python3 -m json.tool
curl -s https://fleet-manager-staging.gregj64.workers.dev/api/vehicles/positions | python3 -c "import sys,json; d=json.load(sys.stdin); [print(f'{v[\"name\"]}: {v[\"latitude\"]:.4f},{v[\"longitude\"]:.4f} ({v[\"motionState\"]})') for v in d[:5]]"
```
Expected: Real fleet status with 50 vehicles. Positions showing London coordinates with moving/idle/parked states.

**Step 4: Update state.json for the new cycle**

Reset state.json to prepare for a fresh evaluation cycle with real data:
- Set `current_state` to `building` (or wherever appropriate to re-enter the loop)
- Increment cycle number
- Clear stale evaluation data from the previous mock-data cycles

**Step 5: Restart the Rouge loop**

```bash
cd /Users/gregario/Projects/ClaudeCode/The-Rouge
node src/launcher/rouge-cli.js start fleet-manager
```

**Step 6: Monitor first cycle**

```bash
tail -f logs/rouge.log
```

Watch for:
- Seed script runs before product-walk
- Evaluation doesn't flag persistence as infrastructure_blocked (because DB is now available)
- Product-walk sees real vehicle movement on the map
- Health score should improve significantly (no more phantom bugs)

---

## Summary of Changes

| Task | What | Where | Commits |
|------|------|-------|---------|
| 1 | Provision Supabase, push schema, set secrets | infra + cycle_context.json | 1 |
| 2 | Seed script for demo data reset | simulator/seed.ts | 1 |
| 3 | GPS simulator on CF Workers cron | simulator/src/worker.ts + routes | 1 |
| 4 | #72 fix: infrastructure_blocked verdict | evaluation + product-walk prompts | 1 |
| 5 | Seed integration in Rouge loop | rouge-loop.js | 1 |
| 6 | Foundation auto-detects Prisma → provisions DB | provision-infrastructure.js + foundation prompt | 1 |
| 7 | E2E verification and loop restart | state.json + manual verification | 0 |

**Total: 6 commits, 7 tasks.**

**Dependencies:** Task 1 must complete first (DB exists). Tasks 2 and 3 can run in parallel after Task 1. Task 4 is independent. Task 5 depends on Task 2. Task 6 is independent. Task 7 depends on all others.

```
Task 1 (Supabase) ──→ Task 2 (Seed) ──→ Task 5 (Loop integration)
                  ──→ Task 3 (Simulator)
Task 4 (#72 fix) ─────────────────────→ Task 7 (E2E + restart)
Task 6 (Foundation defaults) ──────────→
```
