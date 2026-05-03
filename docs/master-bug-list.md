# Rouge Master Bug List

**Date:** 2026-05-03  
**Sources:** 
- Build loop state machine audit (6 bugs)
- Evaluation flow audit (8 bugs)
- Adversarial agent 1: Dashboard SSE layer (14 bugs)
- Adversarial agent 2: Seeding state machine (14 bugs)
- Adversarial agent 3: Task ledger sync (8 bugs)

**Total:** 50 bugs identified  
**After deduplication:** 43 unique bugs

---

## Priority 0 (P0) - Data Loss / Token Burn / Silent Corruption

### P0-001: PID file race on concurrent Start clicks creates zombie processes
- **File:** `dashboard/src/bridge/build-runner.ts:18-84`
- **Status:** ✅ FIXED
- **Fix:** Add distributed lock or CAS retry on PID write
- **Implementation:** Read-after-write verification with 3 retries, exponential backoff (50ms base), kills loser subprocess

### P0-002: State rollback race leaves UI in deadlock
- **File:** `dashboard/src/bridge/build-runner.ts:145-158`
- **Status:** ✅ FIXED
- **Fix:** Emit watcher event after rollback completes
- **Implementation:** writeStateJson now includes event detail `{ what: 'rollback-on-spawn-failure' }` so watcher emits event immediately

### P0-003: task_ledger.json written without lock
- **File:** `src/launcher/task-ledger.js:23`
- **Status:** ✅ FIXED
- **Fix:** Wrap task-ledger writes in withStateLock
- **Implementation:** Created `task-ledger-lock.js` wrapper with `updateTaskLedger`, updated `task-ledger.js` to use lock wrapper, updated `05-change-spec-generation.md` to use `addFixStories` helper

### P0-004: state.milestones loaded once, never re-read
- **File:** `src/launcher/rouge-loop.js:869-871`
- **Status:** ✅ FIXED
- **Fix:** Re-read task_ledger at generating-change-spec entry
- **Implementation:** At generating-change-spec entry (line 1609), re-read task_ledger.json and merge stories from ledger into state.milestones, preserving in-memory status fields for existing stories

### P0-005: cycle_context.json written without lock
- **File:** `src/launcher/rouge-loop.js:1272,1390,1651,1818`
- **Status:** ✅ FIXED
- **Fix:** Add cycle_context lock helper, wrap all writes
- **Implementation:** Fixed `cycle-context-lock.js` to use correct `withLock` signature from `facade/lock.js`, replaced all 8 `writeJson(contextFile, ...)` calls in rouge-loop.js with `await updateCycleContext(projectDir, ctx => ...)`

### P0-006: Daemon spawn race spawns multiple daemons
- **File:** `dashboard/src/bridge/seed-daemon-spawn.ts:119-179`
- **Status:** ✅ FIXED
- **Fix:** Check PID existence immediately after spawn, exit if lost
- **Implementation:** 100ms post-spawn wait, read .seed-pid, verify sessionId matches, kill loser subprocess, return winner's PID

### P0-007: DISCIPLINE_SKIPPED parser rejects valid markers (no .trim())
- **File:** `dashboard/src/bridge/seed-handler.ts:662`
- **Status:** ✅ FIXED
- **Fix:** Add .trim() after split to strip whitespace
- **Implementation:** `.trim()` the raw marker string before split

### P0-008: Directory rename + concurrent state write causes split-brain
- **File:** `dashboard/src/app/api/projects/[name]/route.ts:145-242`
- **Status:** ✅ FIXED
- **Fix:** Hold lock across rename, or block writes during rename
- **Implementation:** Execute filesystem rename BEFORE acquiring lock, then hold lock only for state mutations. Prevents watcher from emitting stale events during rename window. Three-phase approach: validate, rename, then lock for state updates.

### P0-009: Queue drain race loses messages
- **File:** `dashboard/src/bridge/seed-queue.ts:100-118`
- **Status:** ✅ FIXED
- **Fix:** Acquire exclusive lock before drain, or use atomic mv
- **Implementation:** drainQueue is now async, holds withStateLock across entire drain operation (rename + unlink). Updated seed-daemon.ts to await drainQueue, updated all 15 test cases to async/await.

### P0-010: Lock file survives directory rename
- **File:** `dashboard/src/app/api/projects/[name]/route.ts:184-197`
- **Status:** ✅ FIXED
- **Fix:** Release lock before rename, or update lock path after
- **Implementation:** Same fix as P0-008 — rename happens BEFORE lock acquisition, so lock file never moves with directory.

---

## Priority 1 (P1) - User-Visible Errors / Data Corruption (Recoverable)

### P1-001: Heartbeat write race corrupts seed-heartbeat.json
- **File:** `dashboard/src/bridge/seed-daemon.ts:83-103`
- **Status:** ⬜ TODO
- **Fix:** Mutex or atomic counter for heartbeat writes

### P1-002: Stale PID detection fails when PID reused
- **File:** `src/launcher/facade/lock.js:74-92`
- **Status:** ⬜ TODO
- **Fix:** Check start_time or add process fingerprint

### P1-003: Recovery fires when gate pending (race with clearPendingGate)
- **File:** `dashboard/src/bridge/seed-daemon.ts:324`
- **Status:** ⬜ TODO
- **Fix:** Check gate status AFTER applyMarkerStateEffects

### P1-004: Completion vs seeding_complete race
- **File:** `dashboard/src/bridge/seed-handler.ts:746-754`
- **Status:** ⬜ TODO
- **Fix:** Single lock wrapping both operations

### P1-005: Session ownership check races with PID write
- **File:** `dashboard/src/bridge/seed-daemon.ts:186-190`
- **Status:** ✅ FIXED
- **Fix:** Grace period on ownership loss (3 checks over 1s)
- **Implementation:** 3 ownership checks at 300ms intervals before exit

### P1-006: checkpoints.jsonl append interrupted creates malformed JSONL
- **File:** `src/launcher/checkpoint.js:18`
- **Status:** ✅ FIXED
- **Fix:** Write-temp-rename pattern
- **Implementation:** Updated `writeCheckpoint` to read existing content, append new line, write via temp file + rename (atomic), handles read failure gracefully

### P1-007: events.jsonl append interrupted breaks dashboard
- **File:** `src/launcher/facade/events.js:77`
- **Status:** ✅ FIXED
- **Fix:** Write-temp-rename pattern
- **Implementation:** Updated `emit` to read existing content, append new line, write via temp file + rename (atomic), handles read failure gracefully

### P1-008: Dashboard escalation write clobbered by rouge-loop
- **File:** `dashboard/src/app/api/projects/[name]/resolve-escalation/route.ts:59-82`
- **Status:** ✅ FIXED
- **Fix:** Merge strategy or optimistic locking with version field
- **Implementation:** Added `_version` field to state.json schema (incremented on every write in `facade.writeState`), dashboard checks `expected_version` before commit and returns 409 on mismatch

### P1-009: Stale lock after crash hangs next build 5-30s
- **File:** `src/launcher/facade/lock.js:74-92`
- **Status:** ⬜ TODO
- **Fix:** Reduce stale threshold to 10s

### P1-010: Daemon ownership lost but message half-processed
- **File:** `dashboard/src/bridge/seed-daemon.ts:186-190`
- **Status:** ✅ FIXED
- **Fix:** Re-queue message on ownership loss
- **Implementation:** Track currentMessage in processBatch, re-queue to front with note on ownership loss exit

---

## Priority 2 (P2) - UX Confusion / Performance Issues

### P2-001: Watcher stateCache desync on rapid writes
- **File:** `dashboard/src/bridge/watcher.ts:266-305`
- **Status:** ✅ FIXED
- **Fix:** Added sequence numbers to all state events; client can ignore out-of-order events
- **Implementation:** Added `stateCacheSeq` map, increment seq on each state change, include seq in all state/progress events

### P2-002: Chat size cache race creates duplicate events
- **File:** `dashboard/src/bridge/watcher.ts:235-264`
- **Status:** ✅ FIXED
- **Fix:** Atomic cache update - set cache before emit
- **Implementation:** Moved `chatSizeCache.set()` before emit to prevent race where second rapid write sees stale cache and emits duplicate

### P2-003: SSE client leak when send() throws
- **File:** `dashboard/src/lib/watcher-singleton.ts:84-104`
- **Status:** ✅ FIXED
- **Fix:** Update lastActiveAt BEFORE send(), not after
- **Implementation:** Move `client.lastActiveAt = Date.now()` before try-catch so throwing clients get timestamp updated and are reaped by idle timeout

### P2-004: Queue corruption on malformed JSONL silently drops message
- **File:** `dashboard/src/bridge/seed-queue.ts:140`
- **Status:** ✅ FIXED
- **Fix:** Collect parse errors, append user-visible system_note if any lines failed
- **Implementation:** drainQueue accumulates parse errors and appends a system_note to chat if any messages failed validation or JSONL parse, preventing silent message loss

### P2-005: Daemon heartbeat write failure causes false stall
- **File:** `dashboard/src/bridge/seed-daemon.ts:100-102`
- **Status:** ✅ FIXED
- **Fix:** Track last successful heartbeat, fall back on write failure
- **Implementation:** heartbeatSnapshot tracks lastSuccessfulWrite, writeHeartbeat falls back to that value on write failure to prevent missing heartbeat file

### P2-006: Recovery prompt for unknown discipline loses context
- **File:** `dashboard/src/bridge/recovery-prompts.ts:96-99`
- **Status:** ✅ FIXED
- **Fix:** Generic recovery includes explicit discipline name when unknown
- **Implementation:** recoveryPromptFor returns generic prompt with discipline name interpolated when not in RECOVERY_BY_DISCIPLINE table

### P2-007: DISCIPLINE_SKIPPED with malformed reason fails parse
- **File:** `dashboard/src/bridge/seed-handler.ts:662`
- **Status:** ✅ FIXED
- **Fix:** Accept full rawSkip as name if split produces single element
- **Implementation:** Parser extracts first element from split, falls back to full trimmed rawSkip if no separator found (handles bare `[DISCIPLINE_SKIPPED: Marketing]`)

### P2-008: Gate cleared but new gate set mid-turn causes double-prompt
- **File:** `dashboard/src/bridge/seed-handler.ts:419,702`
- **Status:** ✅ FIXED
- **Fix:** Re-check gate status immediately before auto-continuation kickoff
- **Implementation:** Read finalGateCheck before both shouldContinueForAdvance and shouldContinueForAutonomous paths, skip continuation if mode is awaiting_gate

### P2-009: State transition races on Stop + watcher rollback
- **File:** `dashboard/src/bridge/build-runner.ts:301-368`
- **Status:** ✅ FIXED
- **Fix:** Hold state lock during PID cleanup
- **Implementation:** Wrap `cleanupPidFile()` calls in `withStateLock()` to prevent watcher from seeing intermediate states during Stop

### P2-010: Discovery polling creates duplicate project-discovered events
- **File:** `dashboard/src/bridge/watcher.ts:138-169`
- **Status:** ✅ FIXED
- **Fix:** Check watchers.has() after async poll returns
- **Implementation:** Added early return `if (this.watchers.has(projectDir)) return` at top of checkForState to prevent duplicate discovery

### P2-011: Slow mutator guard false-positive on cold schema
- **File:** `src/launcher/facade/lock.js:153-159`
- **Status:** ✅ FIXED
- **Fix:** Add allowSlow: true to dashboard escalation writes
- **Implementation:** Added `{ allowSlow: true }` option to withStateLock call in resolve-escalation route (line 105), skipping the 100ms guard for legitimate schema validation work

---

## Priority 3 (P3) - Cosmetic / Minor Issues

### P3-001: Recovery log memory leak on long daemon sessions
- **File:** `dashboard/src/bridge/seed-daemon.ts:59-60,338-340`
- **Status:** ✅ FIXED
- **Fix:** Add background pruning timer
- **Implementation:** Added recoveryPruner setInterval that runs every 5 minutes, prunes expired entries from recoveryLog based on RECOVERY_WINDOW_MS. Cleared in cleanExit alongside backgroundTicker.

### P3-002: Recovery cap note appears out-of-order in chat
- **File:** `dashboard/src/bridge/seed-daemon.ts:345-356`
- **Status:** ✅ FIXED
- **Fix:** Append note AFTER recovery turn completes
- **Implementation:** Moved "Automatically continuing..." appendChatMessage call from before handleSeedMessage (line 438-445) to after successful completion (inside try block after line 466). Note now only appears if recovery actually ran.

### P3-003: markDisciplineComplete consistency race
- **File:** `dashboard/src/bridge/seeding-state.ts:53-68`
- **Status:** ✅ FIXED
- **Fix:** Wrap both file writes in single lock
- **Implementation:** Wrapped markDisciplineComplete in withStateLock, created updateDisciplineStatusInStateUnlocked helper to avoid nested lock acquisition. Both seeding-state.json and state.json.seedingProgress now update atomically.

### P3-004: Daemon idle exit adds 0-5s latency
- **File:** `dashboard/src/bridge/seed-daemon.ts:217-229`
- **Status:** ✅ FIXED
- **Fix:** Reduce IDLE_EXIT_MS to 2s, check queue before sleep
- **Implementation:** Reduced IDLE_EXIT_MS from 5000 to 2000 (60% latency reduction). Added hasQueuedMessages check immediately before sleep() to process arriving messages without waiting for next poll.

### P3-005: DISCIPLINE_COMPLETE + GATE ordering not checked
- **File:** `dashboard/src/bridge/seed-handler.ts:626-632`
- **Status:** ✅ FIXED
- **Fix:** Verify complete comes BEFORE gate in segment array
- **Implementation:** Added orderViolation flag that checks segment array ordering (line 618-625). Enhanced rejection reason to explicitly mention ordering violation when DISCIPLINE_COMPLETE appears AFTER GATE.

### P3-006: Watcher debounce map unbounded growth
- **File:** `dashboard/src/bridge/watcher.ts:27`
- **Status:** ✅ FIXED
- **Fix:** Prune stale entries periodically
- **Implementation:** Added debounceLastAccess Map to track access times (1h stale threshold). Prune check fires every ~100 debounce calls (modulo check). Clears both timer and access time on expiry. Prevents unbounded growth over long dashboard sessions.

---

## Previously Fixed (earlier in session)

- ✅ EVAL-004: Escalation feedback delayed (fixed: check at tick start)
- ✅ EVAL-001: PO NEEDS_IMPROVEMENT wrong routing (fixed: removed from lensFail)
- ✅ BUILD-002: Paused state not skipped (fixed: added to SKIP_STATES)
- ✅ EVAL-003: Re-evaluation not detected (fixed: write previous_phase)
- ✅ BUILD-006: Budget cap retries (fixed: check budgetExceeded)
- ✅ EVAL-008: human_resolution invisible (fixed: added to 02e)
- ✅ BUILD-003: Malformed escalation duplication (fixed: mark blocked)
- ✅ EVAL-005: Re-walk infinite loop (fixed: counter cap)
- ✅ EVAL-006: Story-level fingerprint missing (fixed: add recordEvalFingerprint)
- ✅ EVAL-007: Deepen cap missing (fixed: 5-cycle hard cap)
- ✅ BUILD-005: Hand-off dangling pointer (fixed: clear current_story)
- ✅ BUILD-004: Pre-dispatch checkpoint timing (fixed: explicit write)
- ✅ DISCIPLINE_SKIPPED marker recognition (fixed in earlier session)

---

## Fix Order (by dependency + blast radius)

**Phase 1: Lock infrastructure (blocks everything else)**
1. P0-005: cycle_context.json lock helper
2. P0-003: task_ledger.json lock wrapper
3. P1-008: Dashboard escalation merge strategy

**Phase 2: Critical data loss**
4. P0-007: DISCIPLINE_SKIPPED .trim()
5. P0-009: Queue drain exclusive lock
6. P0-004: Re-read task_ledger at generating-change-spec
7. P1-006: checkpoints.jsonl temp-rename
8. P1-007: events.jsonl temp-rename

**Phase 3: Process lifecycle**
9. P0-001: PID race CAS
10. P0-006: Daemon spawn race detection
11. P1-005: Session ownership grace period
12. P1-010: Re-queue on ownership loss

**Phase 4: Directory operations**
13. P0-008: Rename + write split-brain
14. P0-010: Lock survive rename
15. P0-002: Rollback UI deadlock

**Phase 5: Polish**
16-27. All P2/P3 bugs

---

**Current status: 35/50 fixed (28 earlier + 1 P2 + 6 P3), 15 remaining**
