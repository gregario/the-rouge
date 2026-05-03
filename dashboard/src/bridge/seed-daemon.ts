/**
 * Seeding daemon entry point.
 *
 * Launched as:
 *   tsx dashboard/src/bridge/seed-daemon.ts <projectDir>
 *
 * Owns the seeding subprocess chain for one project. Reads pending
 * user messages from `<projectDir>/seed-queue.jsonl`, invokes the
 * existing `handleSeedMessage` for each (which already knows how to
 * spawn claude, parse markers, write state, and auto-continue), and
 * writes a heartbeat file so the dashboard can surface liveness.
 *
 * Exits cleanly when the queue is empty AND seeding isn't awaiting
 * further input. Removes its own `.seed-pid` on exit. A future user
 * message will re-spawn the daemon via the HTTP handler.
 *
 * Phase 1 of the seed-loop architecture plan
 * (docs/plans/2026-04-19-seed-loop-architecture.md). The core
 * architectural win is NOT new orchestration logic — it's moving the
 * existing 10-minute subprocess chain OUT of an HTTP request
 * handler's lifecycle, so tab switches, dashboard restarts, and HMR
 * stop interrupting in-flight seeding work.
 *
 * This file is run directly (tsx entry point) and has no exports.
 */

import { join } from 'path'
import { mkdirSync, writeFileSync, renameSync, existsSync } from 'fs'
import { randomUUID } from 'crypto'
import { handleSeedMessage } from './seed-handler'
import { drainQueue, hasQueuedMessages, requeueFront, type QueueEntry } from './seed-queue'
import { writeSeedPid, clearSeedPid, stillOwned, readSeedPid } from './seed-daemon-pid'
import { readSeedingState, effectiveMode } from './seeding-state'
import { readChatLog, appendChatMessage } from './chat-reader'
import { recoveryPromptFor } from './recovery-prompts'

const HEARTBEAT_FILENAME = 'seed-heartbeat.json'
const POLL_INTERVAL_MS = 1000
// P3-004 fix: Reduce idle exit delay from 5s to 2s. A 5s grace period
// added noticeable latency when the user sent a follow-up message — the
// daemon sat idle for up to 5s before processing the new message. 2s
// still prevents thrashing (spawn overhead is ~100ms) but cuts the
// worst-case user-visible lag by 60%.
const IDLE_EXIT_MS = 2000  // how long queue must be empty before we shut down

// Phase 3 self-heal bounds. A turn that returns bare prose (no gate,
// no discipline-complete, no autonomous markers) is a "stall" — Rouge
// ended the turn without telling us what's next, and no code path
// automatically re-fires it. Without self-heal this is the colourcontrast
// symptom: session sits for 1h 40m with no progress, user has no idea
// what's happening.
//
// Recovery fires `[SYSTEM] Continue the current discipline with markers.`
// and lets handleSeedMessage run the turn again. Bounded so a
// persistently misbehaving discipline can't consume infinite tokens.
const MAX_RECOVERIES_PER_HOUR = 3
const RECOVERY_WINDOW_MS = 60 * 60 * 1000

// In-memory recovery bookkeeping. Keyed by projectDir. Resets on
// daemon restart, which is fine — daemons idle-exit in ~5s of
// inactivity, and a restart is the right moment to reset the counter
// (operator intervention or a fresh user message implies the
// prior "stuck" state is resolved).
const recoveryLog: Array<{ projectDir: string; at: number }> = []

// Shared heartbeat state. `main()` creates a setInterval that writes
// the current snapshot every 5s; processBatch + maybeFireRecovery
// mutate it as they transition between 'processing' and 'idle'. This
// keeps the heartbeat fresh during long `await runClaude` blocks
// without requiring explicit checkpointing inside the main loop.
//
// P2-005: Track the last successfully-written heartbeat so a write
// failure can fall back to that value instead of leaving the heartbeat
// file missing (which would trigger false stall detection in the UI).
const heartbeatSnapshot = {
  lastTurnId: null as string | null,
  status: 'idle' as 'idle' | 'processing',
  lastSuccessfulWrite: null as HeartbeatPayload | null,
}

// P1-010: Track the currently-processing message so we can re-queue it
// on ownership loss. Set by processBatch when starting a turn, cleared
// when done. Accessed by the ownership-loss check in main().
let currentMessage: QueueEntry | null = null

interface HeartbeatPayload {
  lastTickAt: string
  lastTurnId: string | null
  status: 'idle' | 'processing'
  sessionId: string
  pid: number
}

function heartbeatPath(projectDir: string): string {
  return join(projectDir, '.rouge', HEARTBEAT_FILENAME)
}

function writeHeartbeat(
  projectDir: string,
  payload: Omit<HeartbeatPayload, 'lastTickAt'>,
): void {
  const target = heartbeatPath(projectDir)
  const dir = join(projectDir, '.rouge')
  try {
    mkdirSync(dir, { recursive: true })
  } catch { /* ignore */ }
  const full: HeartbeatPayload = {
    ...payload,
    lastTickAt: new Date().toISOString(),
  }
  const tmp = `${target}.${randomUUID()}.tmp`
  try {
    writeFileSync(tmp, JSON.stringify(full, null, 2) + '\n', 'utf-8')
    renameSync(tmp, target)
    // P2-005 fix: Track successful write so a future failure can fall
    // back to this value instead of leaving the file missing.
    heartbeatSnapshot.lastSuccessfulWrite = full
  } catch (err) {
    // P2-005 fix: On write failure, log the error and attempt to write
    // the last successful heartbeat value. This prevents the UI from
    // seeing a missing heartbeat file and triggering false stall
    // detection. If we have no previous value, the write failure is
    // unrecoverable — log and continue (daemon stays alive, next tick
    // may succeed).
    console.warn('[seed-daemon] heartbeat write failed:', err instanceof Error ? err.message : err)
    if (heartbeatSnapshot.lastSuccessfulWrite) {
      console.log('[seed-daemon] falling back to last successful heartbeat value')
      try {
        const fallbackTmp = `${target}.${randomUUID()}.fallback`
        writeFileSync(fallbackTmp, JSON.stringify(heartbeatSnapshot.lastSuccessfulWrite, null, 2) + '\n', 'utf-8')
        renameSync(fallbackTmp, target)
      } catch (fallbackErr) {
        console.error('[seed-daemon] fallback heartbeat write also failed:', fallbackErr instanceof Error ? fallbackErr.message : fallbackErr)
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function main(): Promise<void> {
  const projectDir = process.argv[2]
  if (!projectDir) {
    console.error('[seed-daemon] usage: seed-daemon.ts <projectDir>')
    process.exit(1)
  }
  if (!existsSync(projectDir)) {
    console.error(`[seed-daemon] project directory does not exist: ${projectDir}`)
    process.exit(1)
  }

  // Claim ownership by writing our PID. If another daemon was spawned
  // concurrently (HTTP handler race on two messages), last-write wins;
  // our sessionId in the PID file is how we'll later detect that we
  // lost the race and exit cleanly.
  const info = writeSeedPid(projectDir, process.pid)
  const sessionId = info.sessionId
  console.log(`[seed-daemon] started pid=${process.pid} session=${sessionId} dir=${projectDir}`)
  writeHeartbeat(projectDir, {
    lastTurnId: null,
    status: 'idle',
    sessionId,
    pid: process.pid,
  })

  // Background heartbeat ticker. Without this the daemon only writes
  // heartbeats between messages — inside `await handleSeedMessage →
  // await runClaude`, the main loop is blocked on the claude subprocess
  // for the full turn (30s–several min). The UI's stall-detection fires
  // a false "Rouge hasn't ticked in 246s" warning during long turns
  // because it can't distinguish "blocked on subprocess I/O" from
  // "crashed". Solution: a setInterval that fires from the Node event
  // loop during subprocess I/O idle moments, keeping the heartbeat
  // fresh regardless of where the main loop is. Module-level
  // `heartbeatSnapshot` above is mutated by the main loop / recovery
  // as they transition between 'processing' and 'idle'.
  const backgroundTicker = setInterval(() => {
    writeHeartbeat(projectDir, {
      lastTurnId: heartbeatSnapshot.lastTurnId,
      status: heartbeatSnapshot.status,
      sessionId,
      pid: process.pid,
    })
  }, 5000)
  backgroundTicker.unref()

  // P3-001 fix: Background pruning timer for recoveryLog. Without this
  // the in-memory log grows unbounded during long daemon sessions (a
  // single daemon can survive multiple seeding runs if the user
  // restarts one product after another without closing the dashboard).
  // Prune expired entries every 5 minutes so the array stays bounded.
  const recoveryPruner = setInterval(() => {
    const now = Date.now()
    while (recoveryLog.length > 0 && now - recoveryLog[0].at > RECOVERY_WINDOW_MS) {
      recoveryLog.shift()
    }
  }, 5 * 60 * 1000)
  recoveryPruner.unref()

  let idleSince: number | null = null
  let terminalSignalReceived = false

  const cleanExit = (reason: string, code = 0) => {
    console.log(`[seed-daemon] exiting (${reason})`)
    clearInterval(backgroundTicker)
    clearInterval(recoveryPruner)
    // Only remove the PID file if WE still own it. If another daemon
    // took over, its PID file is theirs to manage.
    if (stillOwned(projectDir, sessionId)) {
      clearSeedPid(projectDir)
    }
    process.exit(code)
  }

  // Graceful shutdown on signals. SIGINT/SIGTERM let in-flight
  // handleSeedMessage finish (we just stop accepting new loop
  // iterations). Without this handler, a Stop from the dashboard
  // would leave a half-written heartbeat and a stale PID file.
  process.on('SIGINT', () => {
    terminalSignalReceived = true
    console.log('[seed-daemon] SIGINT received — finishing current turn then exiting')
  })
  process.on('SIGTERM', () => {
    terminalSignalReceived = true
    console.log('[seed-daemon] SIGTERM received — finishing current turn then exiting')
  })

  try {
    while (true) {
      // P1-005 fix: Grace period on ownership loss. A PID write race can
      // cause a transient mismatch where the winner's write hasn't flushed
      // yet. Check 3 times over 1s (300ms intervals) before exiting.
      let ownershipLost = false
      for (let i = 0; i < 3; i++) {
        if (stillOwned(projectDir, sessionId)) {
          ownershipLost = false
          break
        }
        ownershipLost = true
        if (i < 2) await sleep(300)
      }
      if (ownershipLost) {
        console.log('[seed-daemon] session ownership lost after grace period — exiting without touching PID file')
        // P1-010 fix: Re-queue the current message on ownership loss so
        // the winning daemon picks it up. If no message in-flight, this
        // is a no-op (batch is already drained by the time we check
        // ownership, so nothing to re-queue on idle ticks).
        if (currentMessage) {
          console.log(`[seed-daemon] re-queueing message ${currentMessage.id} due to ownership loss`)
          requeueFront(projectDir, [
            {
              ...currentMessage,
              // Annotate for operator debugging: this message was
              // in-flight when the daemon lost ownership.
              text: `${currentMessage.text}\n\n[Note: Re-queued after daemon ownership loss]`,
            },
          ])
        }
        process.exit(0)
      }

      if (terminalSignalReceived) {
        cleanExit('signal')
      }

      // P0-009: drainQueue is now async (holds lock during drain)
      const batch = await drainQueue(projectDir)
      if (batch.length === 0) {
        // Idle tick — check if we should shut down.
        heartbeatSnapshot.lastTurnId = null
        heartbeatSnapshot.status = 'idle'
        writeHeartbeat(projectDir, {
          lastTurnId: null,
          status: 'idle',
          sessionId,
          pid: process.pid,
        })

        // Also exit if seeding is complete — nothing more for us to do.
        const state = readSeedingState(projectDir)
        if (state.seeding_complete || state.status === 'complete') {
          cleanExit('seeding-complete')
        }

        // Grace period: when the queue first empties, start an idle
        // timer. The daemon stays alive for IDLE_EXIT_MS so a
        // rapidly-typed follow-up message avoids a spawn round-trip.
        if (idleSince === null) idleSince = Date.now()
        if (Date.now() - idleSince >= IDLE_EXIT_MS) {
          // Before exiting, one last check: did a message arrive during
          // the grace period?
          if (hasQueuedMessages(projectDir)) {
            idleSince = null
            continue
          }
          cleanExit('idle')
        }

        // P3-004 fix: Check queue immediately before sleep. Without this,
        // a message that arrives right before the sleep() call sits
        // unprocessed for up to POLL_INTERVAL_MS (1s), even though we
        // could process it now. The check is cheap (existsSync + statSync)
        // and cuts the worst-case latency from 1s to ~0ms.
        if (hasQueuedMessages(projectDir)) {
          idleSince = null
          continue
        }

        await sleep(POLL_INTERVAL_MS)
        continue
      }

      // Queue has work. Reset idle timer.
      idleSince = null
      await processBatch(projectDir, batch, sessionId)
    }
  } catch (err) {
    console.error('[seed-daemon] fatal error:', err)
    cleanExit('crash', 1)
  }
}

async function processBatch(
  projectDir: string,
  batch: QueueEntry[],
  sessionId: string,
): Promise<void> {
  for (let i = 0; i < batch.length; i++) {
    const entry = batch[i]
    // P1-010: Track in-flight message so ownership-loss check can re-queue it.
    currentMessage = entry
    heartbeatSnapshot.lastTurnId = entry.id
    heartbeatSnapshot.status = 'processing'
    writeHeartbeat(projectDir, {
      lastTurnId: entry.id,
      status: 'processing',
      sessionId,
      pid: process.pid,
    })
    try {
      // handleSeedMessage already handles: prompt assembly, runClaude,
      // marker parsing, state mutations, auto-continuation (up to
      // MAX_CHUNK_DEPTH internally). All we add is the process
      // lifecycle around it.
      //
      // `humanMessageAlreadyPersisted` is forwarded from the queue
      // entry (Fix B). When the HTTP handler wrote the human chat
      // message at enqueue time, this flag is true and the turn
      // suppresses its own human-append. Legacy entries (pre-Fix-B,
      // shouldn't exist after deploy) fall back to false → daemon
      // appends.
      await handleSeedMessage(projectDir, entry.text, {
        humanMessageAlreadyPersisted: entry.humanAlreadyPersisted === true,
      })
      // Phase 3 self-heal. Check if the turn stalled (bare prose
      // return, no markers, no gate, not complete). If so and we're
      // under the hourly cap, fire a recovery turn — the same
      // `[SYSTEM] continue` pattern the inline path's autonomous-chunk
      // continuation uses, but triggered when Claude returns
      // without ANY markers (a case the handler's own continuation
      // logic doesn't cover).
      await maybeFireRecovery(projectDir, sessionId)
    } catch (err) {
      console.error(`[seed-daemon] handleSeedMessage failed for ${entry.id}:`, err)
      // The message was already dequeued. Only re-queue if it was
      // an infrastructure failure (not a logic error inside the
      // handler, which will recur). For Phase 1 we log and move
      // on — Phase 3 will add smarter retry + dead-letter on this
      // path.
      const remaining = batch.slice(i + 1)
      if (remaining.length > 0) {
        requeueFront(projectDir, remaining)
      }
      // P1-010: Clear currentMessage on error path too.
      currentMessage = null
      return
    } finally {
      // P1-010: Clear currentMessage after each turn completes (success or error).
      currentMessage = null
    }
  }
}

/**
 * Phase 3 — stall detection + recovery.
 *
 * After a turn completes, inspect whether Rouge left the session in
 * a stalled state. Stalled = all of:
 *   - seeding isn't complete
 *   - session is still in `running_autonomous` mode (NOT awaiting a
 *     human gate — that's the user's problem to answer)
 *   - the most recent rouge chat message has kind='prose' (or no
 *     kind at all). Bare prose means no [GATE:], no [DECISION:],
 *     no [HEARTBEAT:], no [WROTE:], no [DISCIPLINE_COMPLETE:]. The
 *     handler's own auto-continuation logic skips turns like this
 *     because it can't tell if the user was about to speak — but
 *     under the daemon path we CAN tell: if the turn sat idle for
 *     its whole duration (no queue action from the user), it's a
 *     genuine stall.
 *
 * If detected, append a chat system note ("Detected stall, firing
 * recovery") and run a new turn with a [SYSTEM] prompt asking Rouge
 * to continue the current discipline. Bounded by recoveryLog to
 * MAX_RECOVERIES_PER_HOUR so a persistently misbehaving discipline
 * can't burn infinite tokens.
 */
async function maybeFireRecovery(projectDir: string, sessionId: string): Promise<void> {
  const state = readSeedingState(projectDir)
  if (state.seeding_complete) return
  if (state.status === 'complete') return
  if (state.status === 'paused') return // rate-limited — don't pile on
  if (effectiveMode(state) === 'awaiting_gate') return // user's turn

  const messages = readChatLog(projectDir)
  if (messages.length === 0) return
  const last = messages[messages.length - 1]
  if (last.role !== 'rouge') return
  // Stall shape: prose (or undefined kind = legacy prose). Any of
  // the structured kinds means the turn actually did something
  // actionable.
  const kind = last.kind
  if (kind && kind !== 'prose') return

  const now = Date.now()
  // Trim expired entries from the recovery log.
  while (recoveryLog.length > 0 && now - recoveryLog[0].at > RECOVERY_WINDOW_MS) {
    recoveryLog.shift()
  }
  const recentForProject = recoveryLog.filter((r) => r.projectDir === projectDir).length
  if (recentForProject >= MAX_RECOVERIES_PER_HOUR) {
    console.log(
      `[seed-daemon] recovery cap reached for ${projectDir} (${recentForProject}/${MAX_RECOVERIES_PER_HOUR} per hour) — manual intervention needed`,
    )
    appendChatMessage(projectDir, {
      id: `recovery-cap-${randomUUID().slice(0, 8)}`,
      role: 'rouge',
      content:
        `Rouge has returned without progress markers ${recentForProject} times in the last hour. ` +
        `Auto-recovery is capped to avoid burning tokens on a misbehaving turn. ` +
        `Send a message to continue — describe what you expected Rouge to do next.`,
      timestamp: new Date().toISOString(),
      kind: 'system_note',
    })
    return
  }

  console.log(`[seed-daemon] stall detected in ${projectDir} — firing recovery turn`)
  recoveryLog.push({ projectDir, at: now })

  // Fire the recovery turn. Use humanMessageAlreadyPersisted:true so
  // the handler doesn't try to append our [SYSTEM] text as a human
  // chat entry.
  heartbeatSnapshot.lastTurnId = `recovery-${recoveryLog.length}`
  heartbeatSnapshot.status = 'processing'
  writeHeartbeat(projectDir, {
    lastTurnId: `recovery-${recoveryLog.length}`,
    status: 'processing',
    sessionId,
    pid: process.pid,
  })
  // Pull a discipline-specific recovery prompt so the turn isn't
  // just told "continue" — it's told what markers are expected at
  // this point in the discipline's flow. Falls back to generic for
  // unknown / null disciplines.
  const recoveryPrompt = recoveryPromptFor(state.current_discipline)
  try {
    await handleSeedMessage(projectDir, recoveryPrompt.text, {
      humanMessageAlreadyPersisted: true,
    })
    // P3-002 fix: Append the "automatically continuing" note AFTER the
    // recovery turn completes successfully. Appending before (as the
    // old code did) meant the note appeared in chat but if the turn
    // failed or was slow, the user saw a promise with no delivery.
    appendChatMessage(projectDir, {
      id: `recovery-${randomUUID().slice(0, 8)}`,
      role: 'rouge',
      content:
        'Rouge returned without a gate, decision, or completion marker. Automatically continuing the current discipline…',
      timestamp: new Date().toISOString(),
      kind: 'system_note',
    })
  } catch (err) {
    console.error(`[seed-daemon] recovery turn failed:`, err)
    appendChatMessage(projectDir, {
      id: `recovery-err-${randomUUID().slice(0, 8)}`,
      role: 'rouge',
      content: `Recovery turn failed: ${err instanceof Error ? err.message : String(err)}. Please send a message to continue.`,
      timestamp: new Date().toISOString(),
      kind: 'system_note',
    })
  }
}

// Invoke main() at module load — this file is tsx's entry point, not
// imported as a library. If anything needs to import pieces (tests),
// they should import from the non-default exports above.
main().catch((err) => {
  console.error('[seed-daemon] unhandled:', err)
  process.exit(1)
})
