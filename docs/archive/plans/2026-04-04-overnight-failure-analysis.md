# Overnight Failure Analysis: 2026-04-03 20:00 -- 2026-04-04 08:00 UTC

**Project:** openfleet-v2
**Duration:** ~12 hours
**Outcome:** Loop burned ~12 hours of Opus compute cycling between vehicle-registry and gps-trips milestones, repeatedly re-running the same fix stories, and ended exactly where it started -- still on vehicle-registry, building loop-3 fix stories.

---

## Timeline Summary

| Phase | Time (UTC) | Milestone | What Happened |
|-------|------------|-----------|---------------|
| A | 20:00-22:32 | vehicle-registry | Original 3 stories + 12 fix stories (loop-1), eval, promote |
| B | 22:32-23:17 | gps-trips | 4 original stories built, deploy FAILED |
| C | 23:17-23:30 | gps-trips | Milestone-check found branch integration issues, SIGINT |
| D | 23:39-01:46 | vehicle-registry (regressed!) | Re-ran vehicle-registry fix stories AGAIN (post-restart confusion) |
| E | 01:46-03:45 | gps-trips (second attempt) | 4 original stories rebuilt + 13 fix stories generated |
| F | 03:45-05:06 | gps-trips eval, then vehicle-registry (regressed AGAIN) | GPS deploy + health check FAILED + auto-rollback |
| G | 05:06-07:48 | vehicle-registry (third time) | 14 MORE fix stories, zero-delta builds, wild file swings |

---

## Phase A: 20:00-22:32 — Vehicle Registry Build + First Eval + Promote

### What milestone/story was being worked on
Vehicle-registry milestone. Original stories: `vehicle-list`, `add-vehicle`, `vehicle-detail`. Then 12 fix stories from loop-1 evaluation.

### What the builder actually did

**Original stories (19:35-20:14):**
- `vehicle-list` at 19:49 (files 755->614, delta -141 -- switched to a story branch)
- `add-vehicle` at 20:04 (files 614->624, delta +10 -- new form, photo upload, tests)
- `vehicle-detail` at 20:14 (files 620->626, delta +6 -- tabbed detail, mini-map)

Staging deploy at 20:14 -- **PASSED**, health check OK.

**Milestone-check at 20:30** found 7 quality gaps:
- CRITICAL: No vehicle edit UI (FA2-J4 completely unimplemented)
- HIGH: Vehicle photos uploaded but never displayed
- MEDIUM: No success toast, silent upload failure, color-only traffic light, no fleet summary
- LOW: Required vs optional fields not distinguished

PO confidence: 0.676 (NEEDS_IMPROVEMENT).

**Analyzing phase at 20:42** produced 7 change spec briefs. Generating-change-spec at 20:52 created 3 fix specs mapped to 12 fix stories.

**Fix stories built (20:52-22:13):**

Commit evidence from git log:
- `683e739` feat(vehicle-edit): add edit mode with status dropdown, success toast, cancel
- `0fd0410` feat(vehicle-edit): add PUT /api/vehicles/[id] with Zod validation
- `e7a7f52` feat(vehicle-registry): add vehicle photo avatar
- `2754d4a` feat(vehicle-registry): add accessible traffic light indicators
- `e97aafa` feat(vehicle-registry): add fleet health summary bar
- `0ebaa84` feat(add-vehicle): add field markers, photo upload warning, success toast

Then 6 more "REUSE" stories (loop-1 dashboard/branch/filter/map-polish/xss/test-type) that reported `delta: +0` -- no code changes needed.

**Staging deploy at 22:13 -- PASSED**, health check OK.

**Milestone-check at 22:23** -- All 7 gates PASSED. PO confidence 0.92. `PRODUCTION_READY`.

**Analyzing at 22:32** -- **PROMOTE**. Advance to gps-trips.

This phase was clean and productive.

### Why file counts swung
- `755->614` (-141): Switched from integration branch to a fresh story branch off main. Story branches don't have other milestones' files.
- `821->821` (zero deltas): Many REUSE stories that just verified existing code and wrote context.

---

## Phase B: 22:32-23:17 — GPS Trips Original 4 Stories + Deploy Failure

### What milestone/story was being worked on
GPS-trips milestone. Stories: `gps-api`, `trip-detection`, `trip-display`, `simulator`.

### What the builder actually did

**gps-api** (22:32-22:42): Built GPS ingestion endpoint. 16 tests added, 508 total passing. delta +3.

**trip-detection** (22:42-22:51): Built movement-based trip detection. **delta: -96** (switched branch).

**trip-display** (22:51-23:07): Built trip route visualization. **delta: -56** (switched branch again).

**simulator** (23:07-23:17): Built fleet simulator. **delta: -10** (switched branch again).

### Deploy failure
```
[2026-04-03T23:17:08Z] [deploy] Cloudflare deploy failed: Command failed: npm run build
 Warning: Next.js inferred your workspace root, but it may not be correct.
 We detected multiple lockfiles and selected the directory of /Users/gregario/package-lock.js
```

The build failed because it picked up a parent directory's `package-lock.json` instead of the project's. This was a **pre-existing infrastructure issue** -- the same error occurred on every GPS-trips deploy attempt.

### Why file counts swung wildly
Each story was built on a **separate branch** forked from a different state. When the builder checked out `rouge/story-gps-trips-trip-detection`, it lost the files from `rouge/story-gps-trips-gps-api`. The file count tracked the working directory, not any single branch. Each branch switch caused a large negative delta as unrelated story files disappeared.

---

## Phase C: 23:17-23:30 — GPS Trips Milestone-Check Finds Branch Issues, SIGINT

### What the evaluation found

Milestone-check log (run at 23:17):

```
| Gate | Status | Detail |
| Test Integrity | **FAIL** | 1/161 tests failing; 3 of 4 story branches not integrated |
| QA Gate | SKIPPED | Blocked by test integrity failure |
| All other gates | SKIPPED | Blocked |
```

**Root cause identified:** The 4 stories were built on separate branches that were never merged:
- `rouge/story-gps-trips-gps-api` (3 commits)
- `rouge/story-gps-trips-trip-detection` (3 commits)
- `rouge/story-gps-trips-trip-display` (4 commits)
- `rouge/story-gps-trips-simulator` (3 commits)

The evaluation ran against the last story's branch (simulator) which didn't contain the other stories' code.

### Fix routing
State set to `milestone-fix` with fix task: `fix-gps-trips-branch-integration` -- merge all branches in order.

**At 23:30, SIGINT was received** (user stopped the loop).

---

## Phase D: 23:39-01:46 — Post-Restart Confusion, Vehicle-Registry Redux

### Critical failure: Loop fell back to vehicle-registry

When the loop restarted at 23:38, it ran `generating-change-spec` which produced:

```
[2026-04-03T23:39:44Z] Output: **Next step:** The launcher should skip change-spec generation and proceed
to **milestone promotion** for `vehicle-registry`. The milestone is ready to be marked complete so
the project can advance to...
```

The generating-change-spec phase correctly identified that vehicle-registry was ready for promotion. But then the launcher read `fix-vehicle-edit` as the first pending story and routed to `story-building` for vehicle-registry stories:

```
[2026-04-03T23:39:44Z] Starting fix story: fix-vehicle-edit
[2026-04-03T23:39:44Z] generating-change-spec -> story-building
```

**This is the critical state management bug.** The SIGINT interrupted the GPS-trips milestone-fix, and on restart the launcher's state resolution logic fell back to an earlier milestone's pending stories instead of resuming GPS-trips work.

### What the builder actually did (wasted work)

From 23:40 to 23:56, it rebuilt **vehicle-registry fix stories that were already done**:
- `fix-vehicle-edit` (23:40-23:49): 491 tests passing, delta -4
- `fix-photo-and-list-polish` (23:49-23:52): **delta: -268** (massive branch switch)
- `fix-add-vehicle-form-ux` (23:52-23:56): delta +2

Staging deploy at 23:56 -- **PASSED**, health check OK.

### Why the -268 delta
The builder was on a branch with all vehicle-registry + gps-trips code, then switched to a fresh story branch that only had main + vehicle-registry. All GPS-trips files disappeared from the working directory.

### Milestone-check at 00:18
Found 2 remaining quality gaps:
- HIGH: Edit save failure is silent (no error toast)
- MEDIUM: Add-vehicle form grid-cols-2 without sm: breakpoint

These were real issues that the **first pass had missed** because the loop had already promoted vehicle-registry. Now it was re-evaluating and finding new problems.

### More fix stories generated (00:32-01:08)
- Analyzing at 00:32 recommended `deepen:vehicle-edit-error-and-form-mobile`
- Generated 2 more specs at 00:39: `openfleet-loop-2-vehicle-edit-error-feedback` and `openfleet-loop-2-add-vehicle-form-responsive`

Git commits confirm real work:
- `a7a4c80` feat(vehicle-edit): add error toast and form state preservation on save failure
- `d120e2d` fix(add-vehicle-form): use responsive sm:grid-cols-2 for field grid layout

Staging deploy at 00:51 -- **PASSED**, health check OK.

### Second promote at 01:08
Analyzing phase found vehicle-registry at confidence 0.92, recommended **promote** to gps-trips.

**Net result of Phase D:** ~2 hours spent re-doing vehicle-registry work. Some of it was new (error feedback, responsive form), but most was re-running stories that were already complete.

---

## Phase E: 01:46-03:45 — GPS Trips Second Attempt + 13 Fix Stories

### What the builder did

Rebuilt all 4 GPS-trips stories from scratch:
- `gps-api` (01:09-01:12): delta +76 (full GPS endpoint build)
- `trip-detection` (01:13-01:22): **delta: -100** (branch switch)
- `trip-display` (01:22-01:35): **delta: -273** (branch switch -- this is the big one)
- `simulator` (01:35-01:46): delta +3

### Deploy failure (second time)
```
[2026-04-04T01:46:47Z] [deploy] Cloudflare deploy failed: Command failed: npm run build
 Warning: Next.js inferred your workspace root, but it may not be correct.
```
Same infrastructure issue as Phase B.

### Milestone-check at 01:47
```
Sub-Phase 1 (QA Gate) and Sub-Phase 2 (PO Review) were skipped --
they'll run on the next evaluation cycle after tests are restored.
```

Routed to analyzing, which found the **same branch fragmentation problem**:
```
gps-trips had **zero factory questions** -- the spec's concrete thresholds
(speed >5km/h, stationary >3min, 200m minimum) eliminated ambiguity.
```

### 13 fix stories generated at 02:03

The generating-change-spec phase produced **13 fix stories** for a 4-story milestone:
```
[2026-04-04T02:03:59Z] Added 13 fix stories to milestone "gps-trips"
```

These included:
1. `fix-gps-branch-integration` -- the real problem
2. `openfleet-loop-1-dashboard-ux-states` -- re-run from dashboard-features
3. `openfleet-loop-1-branch-integration` -- re-run
4. `openfleet-loop-1-focus-trap` -- re-run
5. `openfleet-loop-1-sidebar-reactivity` -- re-run
6. `openfleet-loop-1-route-completeness` -- re-run
7. `openfleet-loop-1-filter-ux` -- re-run
8. `openfleet-loop-1-map-polish` -- re-run
9. `openfleet-loop-1-xss-and-cleanup` -- re-run
10. `openfleet-loop-1-test-type-fix` -- re-run
11. `openfleet-loop-1-vehicle-edit` -- re-run
12. `openfleet-loop-1-photo-and-list-polish` -- re-run
13. `openfleet-loop-1-add-vehicle-form-ux` -- re-run

**Items 2-13 were ALL from previous milestones.** The change-spec generator was including dashboard-features and vehicle-registry fix stories in the GPS-trips milestone because the evaluation context carried forward unresolved global items.

### Builder executed all 13 stories (02:04-03:45)

Most completed with `delta: +0` (REUSE -- no work needed):
- `fix-gps-branch-integration` (02:04-02:06): delta +3 -- cherry-picked 2 test files + migration
- `openfleet-loop-1-dashboard-ux-states` (02:06-02:11): **delta: -22** -- branch switch
- `openfleet-loop-1-branch-integration` (02:11-02:18): **delta: +66** -- merged branches
- `openfleet-loop-1-focus-trap` through `openfleet-loop-1-sidebar-reactivity`: delta +0 each (REUSE)
- `openfleet-loop-1-route-completeness` (02:26-02:35): delta +6
- `openfleet-loop-1-filter-ux` (02:35-02:43): **delta: -65** (branch switch)
- `openfleet-loop-1-map-polish` (02:44-02:53): delta +2, 19 new tests
- `openfleet-loop-1-xss-and-cleanup` through `openfleet-loop-1-test-type-fix`: delta +0 to +2 each
- `openfleet-loop-1-vehicle-edit` (03:01-03:12): delta +13
- `openfleet-loop-1-photo-and-list-polish` (03:12-03:23): **delta: -17** (branch switch)
- `openfleet-loop-1-add-vehicle-form-ux` (03:24-03:40): **delta: +273** -- deployed to staging!

The +273 delta on the last story is the key evidence: the builder was on a minimal branch, then switched to the full integration branch and counted ALL the accumulated files.

### GPS branch integration (03:40-03:45)
`openfleet-loop-1-gps-branch-integration` completed with delta +3, confirming cherry-picks.

### Staging deploy at 03:46 -- **PASSED**
```
[2026-04-04T03:47:07Z] [deploy] Deployed to https://openfleet-v2-staging.gregj64.workers.dev
[2026-04-04T03:47:08Z] [deploy] Health check PASSED
```

This was the first successful GPS-trips deployment.

---

## Phase F: 03:45-05:06 — GPS Trips Eval, Then Vehicle-Registry AGAIN + Failed Deploy

### GPS-trips milestone-check at 03:47

Found 6 quality gaps. Routed to analyzing, which recommended `deepen:branch-integration` AGAIN:
```
[2026-04-04T04:00:24Z] Output: **`milestone-check` -> `analyzing`** with 6 quality gaps.
The analyzing phase will convert these into spec changes -- primarily a branch
integration story to merge trip-detection, trip-display, and simu...
```

### Analyzing at 04:00-04:10
Key findings:
- Branch fragmentation still the #1 issue
- File storage deferred repeatedly
- 3 systemic patterns flagged

### One more fix story generated (04:18): `change`
This was a massive integration merge story:

From the story-building log:
```
Merged 12 story branches (10 gps-trips + 2 vehicle-registry) into a single
integration branch from main. Resolved ~60 merge conflicts. Fixed 22 post-merge
test failures. 122 source files changed vs main. 60 test files, 659 tests, 0 failures.
```

This ran from 04:18 to 05:02 -- **44 minutes** for a single mega-merge. delta: +124.

### Then vehicle-registry AGAIN

After the integration merge, the next story was `openfleet-loop-2-add-vehicle-form-responsive` -- a **vehicle-registry story**:
```
[2026-04-04T05:02:06Z] Next story: openfleet-loop-2-add-vehicle-form-responsive
```

This deployed at 05:06:
```
[2026-04-04T05:08:02Z] [deploy] Health check FAILED -- site not responding
[2026-04-04T05:08:02Z] [deploy] ROLLING BACK to da24046c-8775-426c-9875-57583222f653
[2026-04-04T05:08:11Z] [deploy] Rollback successful
```

**The deploy crashed.** Auto-rollback worked correctly.

### Why the deploy failed
The integration merge (`change` story) introduced conflicting code that built locally but failed at runtime on Cloudflare Workers. The health check correctly caught it and rolled back.

---

## Phase G: 05:06-07:48 — Stuck on Vehicle-Registry with Zero-Delta Builds

### Milestone-check at 05:08-05:19
Found vehicle-registry in `milestone-fix` state with 2 critical fix tasks from the health check failure.

### Analyzing at 05:20-05:28
Produced 5 global improvement items. Found 2 CRITICALs:
1. **Authorization bypass**: Duplicate vehicle routes (`[id]` and `[vehicleId]`) with different auth checks
2. **Trip state machine race condition**: `__pending__` guard missing on `trip_end`

### Generated 14 MORE fix stories at 05:37
```
[2026-04-04T05:37:53Z] Added 14 fix stories to milestone "vehicle-registry"
```

This included ALL the loop-1 stories AGAIN for the third time, plus the 2 new critical fixes.

### Wild file swings in Phase G

| Story | Files Before | Files After | Delta |
|-------|-------------|-------------|-------|
| dashboard-ux-states | 954 | 365 | **-589** |
| branch-integration | 362 | 832 | **+470** |
| focus-trap | 831 | 831 | 0 |
| sidebar-reactivity | 831 | 743 | **-88** |
| route-completeness | 743 | 743 | 0 |
| filter-ux | 743 | 835 | **+92** |

The -589 delta at 05:42 is the most extreme: the builder switched from the full integration branch (954 files) to a minimal story branch (365 files).

### What was actually accomplished
Git log shows real commits in this period:
- `f260355` feat(vehicle-api): add ADMIN role check on PUT /api/vehicles/[id] -- **real fix for CRIT-1**
- `0e28a52` chore(context): write story result for vehicle-route-consolidation
- Various context writeback commits

But most stories were REUSE with no code changes:
```
[2026-04-04T06:19:01Z] 485 tests passing, 0 new code needed.
[2026-04-04T06:22:16Z] 485 tests passing. No new code needed -- REUSE.
[2026-04-04T06:25:01Z] no code changes needed
```

### Final deploy at 06:47 -- PASSED
Health check OK this time. The ADMIN role check fix resolved the authorization bypass.

### ANOTHER milestone-check at 06:49-06:58
Found 9 more fix tasks. QA FAIL. Entered milestone-fix.

### Milestone-fix at 06:59-07:16
Executed all 9 fixes. delta +11. Real commits:
- `1be6e10` fix: add loading.tsx skeleton files for vehicles routes
- `6e40510` fix: add close button to vehicle-created toast
- `dafdd09` fix: add aria-describedby and aria-required
- `e34ff21` fix: add ADMIN role check to POST /api/vehicles
- `c454b5a` fix: add magic-byte MIME validation
- `02243d2` fix: show human-readable status in vehicle detail
- `b43f429` fix: add aria-label to search input
- `012529f` fix: add label prop to TrafficLight
- `348f67b` fix: add sort-by-next-service column
- `729a5f4` refactor: make nextService optional

These were **legitimate quality improvements** but were for vehicle-registry, not gps-trips.

### Re-evaluation at 07:17-07:31
Milestone-check passed to analyzing, which recommended `deepen:improvements` with 4 more improvement items.

### Generated 2 more fix stories at 07:48
- `openfleet-loop-3-vehicle-detail-robustness`
- `openfleet-loop-3-decommissioned-filter`

**At 07:50, SIGINT received.** Loop stopped mid-build.

---

## Current State at End of Overnight

```json
{
  "current_state": "story-building",
  "current_milestone": "vehicle-registry",
  "current_story": "openfleet-loop-3-vehicle-detail-robustness"
}
```

**Vehicle-registry has been "promoted" and then regressed to THREE TIMES overnight.** The loop never successfully advanced past it for more than a few hours.

---

## Whether Fix Stories Addressed Real Problems or Phantom Problems

### Real problems addressed:
1. **Vehicle edit mode** -- genuinely missing (CRIT, fixed in Phase A)
2. **Photo display** -- genuinely missing (HIGH, fixed in Phase A)
3. **Error toast** -- genuinely missing (HIGH, fixed in Phase D)
4. **Responsive form** -- genuinely wrong CSS (MEDIUM, fixed in Phase D)
5. **Authorization bypass** -- genuinely dangerous duplicate routes (CRIT, fixed in Phase G)
6. **Loading skeletons, toast dismiss, a11y, etc.** -- genuine polish items (Phase G milestone-fix)

### Phantom/wasted work:
1. **All loop-1 stories re-run in GPS-trips context** (Phase E): Stories like `openfleet-loop-1-dashboard-ux-states`, `openfleet-loop-1-focus-trap`, etc. were from dashboard-features. They completed with REUSE (no code) but consumed ~2-3 min of Opus compute each, times 10+ stories = ~30 min of API calls doing nothing.
2. **Vehicle-registry re-evaluation cycles** (Phases D, F, G): The same milestone was evaluated 3 additional times overnight, each time finding minor new quality gaps. The evaluation was running against a moving target because branch integration kept changing what code was present.
3. **Branch fragmentation "fix" stories that recreated the same problem**: Each fix story was built on its own branch, creating the very fragmentation the fix was supposed to solve.

---

## Structural Problems Identified

### 1. No Milestone Lock After Promote
**The most critical bug.** When vehicle-registry was promoted at 22:32 and again at 01:08, nothing prevented the loop from falling back to it. After SIGINT + restart, or after GPS-trips evaluation found issues, the state machine could regress to the previous milestone. There is no "promoted and locked" state.

### 2. Branch-Per-Story Architecture Creates Systemic Fragmentation
Every story creates its own branch from the current story branch point. The milestone-check then evaluates whatever branch happens to be checked out, which only has that story's code. The "branch-integration" fix story is a recurring band-aid (identified 3 times: dashboard-features, GPS-trips first attempt, GPS-trips second attempt). The analyzing phase even logged: "Story branch fragmentation recurring every milestone -- need automated consolidation step."

### 3. Fix Stories Inherit Cross-Milestone Baggage
When `generating-change-spec` ran for GPS-trips at 02:03, it produced 13 fix stories -- but 12 of them were from dashboard-features and vehicle-registry. The change-spec generator doesn't scope fix stories to the current milestone. It pulls in every unresolved global item and prior-milestone story, creating massive busywork queues.

### 4. Evaluation Runs Against Wrong Branch State
The milestone-check progress line always showed the same stale metrics:
```
Progress: 93 files changed | Verdict: FAIL | Health: 76/100 | Criteria: 79/100 | Confidence: 75%
```
This was cached/stale context from an earlier evaluation. The actual code quality was much higher (492 tests passing, health 90+), but the progress tracker didn't update when branches changed.

### 5. Deploy Failure Doesn't Block Story Generation
When Cloudflare deploy failed at 23:17 and 01:46 (same `package-lock.json` workspace inference bug), the loop continued to milestone-check and then generated more stories. A deploy failure should be treated as a blocking issue that needs resolution before more code is written.

### 6. SIGINT Recovery Is Stateless
When the user sent SIGINT at 23:30 and restarted at 23:38, the loop didn't resume GPS-trips milestone-fix. Instead it ran `generating-change-spec` which concluded vehicle-registry needed promotion and started re-running vehicle-registry stories. The state recovery after interruption doesn't preserve the intended milestone focus.

### 7. No Story Deduplication
The same stories (`openfleet-loop-1-dashboard-ux-states`, `openfleet-loop-1-branch-integration`, `openfleet-loop-1-focus-trap`, etc.) were executed **three times overnight** -- once for dashboard-features (Phase A period), once for GPS-trips (Phase E), and once for vehicle-registry again (Phase G). Each time they reported REUSE/PASS with zero code changes. There's no mechanism to skip stories that have already passed on a prior milestone.

### 8. File Count Tracking Is Misleading
The "files: X -> Y, delta: +/-Z" metric tracks the working directory file count, not the git diff. Branch switches cause massive swings (e.g., -589, +470) that look like the builder is creating/deleting hundreds of files. In reality, it's just `git checkout` changing the working tree. This metric is noise, not signal.

### 9. Evaluation Confidence Is Undermined by Re-Evaluation
Vehicle-registry hit PO confidence 0.92 (PRODUCTION_READY) at 22:23 and was promoted. But when it was re-evaluated in Phase D (after regression), new quality gaps appeared (error toast, responsive form). Then in Phase G, 9 more fix tasks appeared. The confidence score doesn't carry forward -- each new evaluation can find new things to complain about, creating an infinite improvement loop.

### 10. The `change` Mega-Merge Is a Structural Smell
At 04:18, a single story merged 12 branches, resolved 60 conflicts, and fixed 22 test failures. This took 44 minutes and produced a deployment that immediately crashed. If branches were integrated incrementally (e.g., merge after each story), the conflict surface would be minimal and deploy failures would be caught early.

### 11. The `db.ts` Supabase Export Was a Recurring Blast Radius Bug
The story-building log shows this fix appearing multiple times:
```
fix(db): add missing supabase client export and fix VehicleMarker type mismatch
fix(db): add supabase client export alongside prisma
```
Commit `b4b44e0` (fix db supabase export) and `d6242f6` (same fix again) show this was fixed, forgotten, and fixed again because each story branch forked from a state that didn't have the fix.

### 12. No Cost Awareness or Circuit Breaker
The loop ran for 12 hours of Opus-tier API calls overnight. There's no mechanism to:
- Count total API spend and pause at a threshold
- Detect that the same stories are being re-executed and break the cycle
- Recognize that 3 evaluation-fix-evaluation cycles on the same milestone without meaningful progress indicates a systemic problem, not a "one more fix" situation
