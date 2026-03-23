# Rouge Fix Priority List

Issues discovered during the fruit-and-veg E2E test. Ordered by impact.

---

## Tier 1: Blocking — Must fix before next E2E run

### FIX-1: execFileSync timeout doesn't kill Claude processes
**Impact:** Phases run for hours, burn tokens, never complete.
**Root cause:** Node.js `execFileSync` timeout doesn't reliably SIGKILL child processes that spawn their own children (claude spawns node/bun).
**Fix:** Switch to async `execFile` with manual `setTimeout` + `process.kill(pid, 'SIGKILL')`. Stream stdout/stderr to log file in real-time (also fixes FIX-2).
**References:** FW.35, FW.45

### FIX-2: Phase output lost on timeout (execFileSync buffers all-or-nothing)
**Impact:** Hours of PO review work produced zero captured output.
**Root cause:** `execFileSync` buffers stdout in memory until process exits. If it times out or is killed, buffer is lost.
**Fix:** Use async `execFile` with `child.stdout.pipe(logStream)` for real-time streaming to log file. Partial output always saved.
**References:** FW.45

### FIX-3: Rate limits count toward 3-retry limit
**Impact:** Rate limit at midnight → 3 retries exhausted → waiting-for-human → wasted hours.
**Root cause:** `isRateLimited()` check happens AFTER retry counter increments. Rate limits should pause the loop, not count as failures.
**Fix:** Detect rate limit before incrementing retry counter. On rate limit: sleep until reset time (parse from Claude output), don't increment retries.
**References:** FW.29, FW.30, FW.31, FW.32

### FIX-4: PO review too heavy for single invocation
**Impact:** Never completes within rate limits. Tried 3x, each ran 7+ hours.
**Root cause:** One prompt does journey walks + screen analysis + interaction testing + heuristics + reference comparison. Too many API calls for one session.
**Fix:** Split into sub-phases: po-review-journeys → po-review-screens → po-review-heuristics. Each writes partial results, next reads them.
**References:** FW.43, FW.44

---

## Tier 2: Important — Improves reliability significantly

### FIX-5: Seeding doesn't produce cycle_context.json
**Impact:** Manual backfill required after every seed. Building phase can't start without it.
**Root cause:** Seeding swarm prompt writes spec files but not the structured context file.
**Fix:** Already partially fixed in bot.js `generateCycleContext()`. Needs: vision document parsing from seed artifacts, not just feature area extraction.
**References:** Bot completion handler

### FIX-6: Phase prompts write state.json (should be launcher-only)
**Impact:** Phases set custom states like `test-integrity-complete` that break the state machine.
**Root cause:** Autonomous-mode partial says "don't modify state.json" but prompts do it anyway.
**Fix:** Launcher saves/restores state.json before/after each phase invocation. Phase writes are overridden.
**References:** FW.37

### FIX-7: Field name mismatches between prompts and schemas
**Impact:** Eval found 4 fields named differently than schemas specify.
**Root cause:** Prompts authored independently of schemas.
**Fix:** Normalize: either update prompts to use schema field names, or update schemas to match what prompts actually produce. Document canonical names.
**References:** Eval findings (recommended_action vs recommendation, alignment vs vision_alignment)

### FIX-8: Redeploy should use the provisioning module
**Impact:** Redeploy in advanceState duplicates logic from provision-infrastructure.js.
**Root cause:** Redeploy was added directly to the launcher as inline execSync calls.
**Fix:** Extract deploy logic into a shared `deploy-to-staging.js` module used by both provisioning and the launcher's redeploy step.

---

## Tier 3: Improvements — Better UX and efficiency

### FIX-9: Slack notifications show wrong context
**Impact:** "Build complete → QA gate starting" shown when test-integrity→qa-gate.
**Root cause:** Notifications keyed on target state, not source state.
**Fix:** Include source state in notification messages. Will be superseded by FW.16-19 (Block Kit notifications).

### FIX-10: Rate limit detection via stderr, not just stdout
**Impact:** False positives when phase output mentions "rate limit" in text.
**Root cause:** `isRateLimited()` greps stdout. Already partially fixed (removed stdout check on success path) but catch block still checks stdout.
**Fix:** Only check stderr and Claude exit code for rate limits. Never grep stdout.
**References:** FW.30

### FIX-11: Heartbeat-based progress detection instead of timeouts
**Impact:** Fixed timeouts are too short (phases time out) or too long (wasted wait).
**Root cause:** No way to know if Claude is making progress vs stuck.
**Fix:** Monitor file changes, log growth, or process CPU. If no progress for N minutes → timeout. Active progress → extend timeout.
**References:** FW.35, FW.36

### FIX-12: Supabase should redeploy migrations between QA cycles
**Impact:** Database changes from qa-fixing not applied to staging.
**Root cause:** Redeploy only does Cloudflare, Supabase push is try/catch with silent failure.
**Fix:** Make Supabase migration push a first-class step in the redeploy flow. Log success/failure explicitly.

---

## Execution Order

1. **FIX-1 + FIX-2** together (async execFile with streaming) — unlocks everything
2. **FIX-3** (rate limit handling) — prevents wasted retries
3. **FIX-4** (PO review split) — unlocks real PO review
4. **FIX-5** (seeding context) — smooth seed-to-build handoff
5. **FIX-6** (state.json guard) — prevents state corruption
6. **FIX-7** (field names) — schema consistency
7. **FIX-8 through FIX-12** — reliability and UX
