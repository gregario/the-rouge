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

const HEARTBEAT_FILENAME = 'seed-heartbeat.json'
const POLL_INTERVAL_MS = 1000
const IDLE_EXIT_MS = 5000  // how long queue must be empty before we shut down

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
  } catch (err) {
    console.warn('[seed-daemon] heartbeat write failed:', err instanceof Error ? err.message : err)
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

  let idleSince: number | null = null
  let terminalSignalReceived = false

  const cleanExit = (reason: string, code = 0) => {
    console.log(`[seed-daemon] exiting (${reason})`)
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
      // Race-loss check: another daemon may have been spawned while we
      // were mid-turn (a user message arriving during a long
      // runClaude). If our session lost, stop ASAP.
      if (!stillOwned(projectDir, sessionId)) {
        console.log('[seed-daemon] session ownership lost to another daemon — exiting without touching PID file')
        process.exit(0)
      }

      if (terminalSignalReceived) {
        cleanExit('signal')
      }

      const batch = drainQueue(projectDir)
      if (batch.length === 0) {
        // Idle tick — check if we should shut down.
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
      return
    }
  }
}

// Invoke main() at module load — this file is tsx's entry point, not
// imported as a library. If anything needs to import pieces (tests),
// they should import from the non-default exports above.
main().catch((err) => {
  console.error('[seed-daemon] unhandled:', err)
  process.exit(1)
})
