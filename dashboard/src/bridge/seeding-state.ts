import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'fs'
import { randomUUID } from 'node:crypto'
import { join } from 'path'
import { DISCIPLINE_SEQUENCE, type SeedingSessionState } from './types'
import { statePath, writeStateJson } from './state-path'
import { withStateLock } from './state-lock'
import { safeReadJson } from '@/lib/safe-read-json'

const STATE_FILE = 'seeding-state.json'

const DEFAULT_STATE: SeedingSessionState = {
  session_id: null,
  status: 'not-started',
  current_discipline: DISCIPLINE_SEQUENCE[0],
}

export function readSeedingState(projectDir: string): SeedingSessionState {
  const path = join(projectDir, STATE_FILE)
  return safeReadJson<SeedingSessionState>(path, { ...DEFAULT_STATE }, {
    context: `seeding-state:${projectDir.split('/').pop()}`,
  })
}

/**
 * Atomic write via tmp + rename. `rename(2)` is atomic on POSIX for
 * paths on the same filesystem, so a concurrent reader never sees a
 * torn write. Two concurrent *writers* still race (last finished
 * renames wins) — that's a read-modify-write concern at the caller
 * level — but at least neither leaves a half-written JSON on disk.
 * Matches the launcher's existing `writeJson` helper pattern.
 */
export function writeSeedingState(projectDir: string, state: SeedingSessionState): void {
  const path = join(projectDir, STATE_FILE)
  const tmp = `${path}.${randomUUID()}.tmp`
  try {
    writeFileSync(tmp, JSON.stringify(state, null, 2))
    renameSync(tmp, path)
  } catch (err) {
    // If tmp exists but rename failed, clean it up so we don't leak
    // per-turn .tmp files on every failure.
    try { if (existsSync(tmp)) unlinkSync(tmp) } catch { /* ignore */ }
    throw err
  }
}

export function updateSessionId(projectDir: string, sessionId: string): void {
  const state = readSeedingState(projectDir)
  state.session_id = sessionId
  state.last_activity = new Date().toISOString()
  writeSeedingState(projectDir, state)
}

export async function markDisciplineComplete(projectDir: string, discipline: string): Promise<void> {
  // Update seeding-state.json (internal tracking)
  const state = readSeedingState(projectDir)
  const complete = state.disciplines_complete ?? []
  if (!complete.includes(discipline)) {
    complete.push(discipline)
    state.disciplines_complete = complete
  }
  // Advance current_discipline to the next one in the standard sequence
  state.current_discipline = nextDiscipline(complete)
  state.last_activity = new Date().toISOString()
  writeSeedingState(projectDir, state)

  // Also update state.json.seedingProgress so the dashboard sees progress
  await updateDisciplineStatusInState(projectDir, discipline, 'complete')
}

function nextDiscipline(complete: string[]): string {
  // Find the first discipline in the standard sequence that isn't complete
  for (const d of DISCIPLINE_SEQUENCE) {
    if (!complete.includes(d)) return d
  }
  // All complete — return the last one
  return DISCIPLINE_SEQUENCE[DISCIPLINE_SEQUENCE.length - 1]
}

/**
 * Update a discipline's status in state.json.seedingProgress.disciplines[].
 *
 * Only promotes forward: pending → in-progress → complete. Will not
 * downgrade a complete entry back to in-progress, or an in-progress
 * entry back to pending. This keeps the UI's sense of progress
 * monotonic even if the seed-handler calls get interleaved (e.g. a
 * discipline is both prompted and completed within the same turn).
 *
 * Advancing `currentDiscipline` to the next unfinished item happens
 * ONLY when a discipline becomes complete — an in-progress transition
 * leaves `currentDiscipline` pointing at this discipline (because it
 * IS the one being worked on).
 */
async function updateDisciplineStatusInState(
  projectDir: string,
  discipline: string,
  targetStatus: 'in-progress' | 'complete',
): Promise<void> {
  const stateFile = statePath(projectDir)
  if (!existsSync(stateFile)) return
  await withStateLock(projectDir, () => {
    try {
      const rawState = JSON.parse(readFileSync(stateFile, 'utf-8'))
      if (!rawState.seedingProgress?.disciplines) return

      const disciplines = rawState.seedingProgress.disciplines as Array<{ discipline: string; status: string }>
      const entry = disciplines.find(d => d.discipline === discipline)
      if (!entry) return

      // Monotonic forward-only promotion. Rank: pending < in-progress < complete.
      const rank = (s: string) => (s === 'complete' ? 2 : s === 'in-progress' ? 1 : 0)
      if (rank(targetStatus) > rank(entry.status)) {
        entry.status = targetStatus
      } else {
        // No-op — already at or past the target status. Skip the write
        // to avoid thrashing the mtime (and the watcher) for idempotent
        // calls.
        return
      }

      rawState.seedingProgress.completedCount = disciplines.filter(d => d.status === 'complete').length

      // Advance `currentDiscipline` only when something newly completed.
      // Promoting pending → in-progress means THIS discipline is the
      // current one, and any other disciplines' currentDiscipline
      // pointer would be stale — but the handler's prompt logic sets
      // currentDiscipline explicitly on handoff, so we leave it alone
      // here for the in-progress case.
      if (targetStatus === 'complete') {
        const complete = disciplines.filter(d => d.status === 'complete').map(d => d.discipline)
        const current = DISCIPLINE_SEQUENCE.find(d => !complete.includes(d)) ?? DISCIPLINE_SEQUENCE[DISCIPLINE_SEQUENCE.length - 1]
        rawState.seedingProgress.currentDiscipline = current
      }

      writeStateJson(projectDir, rawState)
    } catch {
      // If state.json is malformed, skip
    }
  })
}

export function markSeedingComplete(projectDir: string): void {
  const state = readSeedingState(projectDir)
  state.seeding_complete = true
  state.status = 'complete'
  state.last_activity = new Date().toISOString()
  writeSeedingState(projectDir, state)
}

export function setStatus(projectDir: string, status: SeedingSessionState['status']): void {
  const state = readSeedingState(projectDir)
  state.status = status
  state.last_activity = new Date().toISOString()
  writeSeedingState(projectDir, state)
}

/**
 * Mark a discipline's detailed sub-prompt as having been injected into
 * the current session at least once. Used by the seed handler to decide
 * whether to re-inject on the next turn (#147).
 *
 * ALSO flips the matching `state.json.seedingProgress.disciplines[]`
 * entry to `'in-progress'` (Phase 0 of the seed-loop architecture plan,
 * see docs/plans/2026-04-19-seed-loop-architecture.md). Previously
 * nothing ever wrote `in-progress` — the only status writer was
 * `markDisciplineComplete`, so entries stayed `pending` the whole run
 * and the dashboard stepper had to synthesise in-progress from
 * `currentDiscipline`. That synthesis masked a real data gap and broke
 * whenever the UI's copy of the project was stale (stackrank symptom:
 * competition prompted, status still pending, UI shows nothing).
 */
export async function markDisciplinePrompted(projectDir: string, discipline: string): Promise<void> {
  const state = readSeedingState(projectDir)
  const prompted = state.disciplines_prompted ?? []
  if (!prompted.includes(discipline)) {
    prompted.push(discipline)
    state.disciplines_prompted = prompted
    state.last_activity = new Date().toISOString()
    writeSeedingState(projectDir, state)
  }
  await updateDisciplineStatusInState(projectDir, discipline, 'in-progress')
}

/**
 * Stash a correction note (e.g. "your DISCIPLINE_COMPLETE was rejected —
 * write the artifact first") for delivery on the next turn. Multiple
 * corrections in a single turn stack. See #148.
 */
export function appendPendingCorrection(projectDir: string, note: string): void {
  const state = readSeedingState(projectDir)
  const existing = state.pending_correction
  state.pending_correction = existing ? `${existing}\n${note}` : note
  state.last_activity = new Date().toISOString()
  writeSeedingState(projectDir, state)
}

/**
 * Read any pending correction without clearing it. Use this before
 * runClaude so that if the turn times out or errors we don't silently
 * drop the rejection context — the next turn can still deliver it.
 */
export function peekPendingCorrection(projectDir: string): string | null {
  const state = readSeedingState(projectDir)
  return state.pending_correction ?? null
}

/**
 * Clear any pending correction. Call AFTER the correction has been
 * successfully delivered to Claude (i.e., after runClaude returned
 * without timeout or error).
 */
export function clearPendingCorrection(projectDir: string): void {
  const state = readSeedingState(projectDir)
  if (!state.pending_correction) return
  delete state.pending_correction
  state.last_activity = new Date().toISOString()
  writeSeedingState(projectDir, state)
}

/**
 * Read and clear any pending correction in one step. Deprecated for
 * handleSeedMessage (use peek + clear to survive Claude failures), but
 * retained for paths that atomically need the text now.
 */
export function consumePendingCorrection(projectDir: string): string | null {
  const pending = peekPendingCorrection(projectDir)
  if (pending) clearPendingCorrection(projectDir)
  return pending
}

// ─── Gated autonomy (PR 1) ─────────────────────────────────────────

/**
 * Flip the session into `awaiting_gate` for a specific discipline/gate.
 * Call this right before surfacing a [GATE:] message to the chat.
 *
 * The reconciliation path in seed-handler uses `mode === 'awaiting_gate'`
 * to refuse to advance the discipline sequence while a question is
 * pending — that's how we fix the "user answers Q1, Rouge silently
 * moves to competition" regression.
 */
export function setAwaitingGate(projectDir: string, discipline: string, gateId: string): void {
  const state = readSeedingState(projectDir)
  state.mode = 'awaiting_gate'
  state.pending_gate = {
    discipline,
    gate_id: gateId,
    asked_at: new Date().toISOString(),
  }
  state.last_activity = new Date().toISOString()
  writeSeedingState(projectDir, state)
}

/**
 * Clear the awaiting-gate state. Called when the human's next message
 * arrives and is routed to the pending gate as its answer.
 */
export function clearPendingGate(projectDir: string): void {
  const state = readSeedingState(projectDir)
  if (!state.pending_gate && state.mode !== 'awaiting_gate') return
  state.mode = 'running_autonomous'
  delete state.pending_gate
  state.last_activity = new Date().toISOString()
  writeSeedingState(projectDir, state)
}

/**
 * Bump `last_heartbeat_at` to "now". Called on every [DECISION:] or
 * [HEARTBEAT:] marker so the UI traffic-light can decay from the
 * latest signal. See types.ts for the threshold ladder.
 */
export function updateHeartbeat(projectDir: string): void {
  const state = readSeedingState(projectDir)
  state.last_heartbeat_at = new Date().toISOString()
  state.last_activity = state.last_heartbeat_at
  writeSeedingState(projectDir, state)
}

/**
 * Effective mode for legacy state files. Undefined `mode` on disk is
 * treated as `running_autonomous` — matches pre-gated-autonomy behaviour
 * and keeps old projects reconciling the way they used to.
 */
export function effectiveMode(state: SeedingSessionState): 'awaiting_gate' | 'running_autonomous' {
  return state.mode ?? 'running_autonomous'
}

/**
 * True iff Rouge is waiting on the user for the given discipline.
 * Used by the reconciliation guard: if we're awaiting a gate in the
 * current discipline, the next turn must not be allowed to skip it.
 */
export function isAwaitingGateFor(state: SeedingSessionState, discipline: string): boolean {
  return effectiveMode(state) === 'awaiting_gate' && state.pending_gate?.discipline === discipline
}
