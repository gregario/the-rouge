import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'fs'
import { join } from 'path'
import { DISCIPLINE_SEQUENCE, type SeedingSessionState } from './types'
import { statePath, writeStateJson } from './state-path'

const STATE_FILE = 'seeding-state.json'

const DEFAULT_STATE: SeedingSessionState = {
  session_id: null,
  status: 'not-started',
  current_discipline: DISCIPLINE_SEQUENCE[0],
}

export function readSeedingState(projectDir: string): SeedingSessionState {
  const path = join(projectDir, STATE_FILE)
  if (!existsSync(path)) return { ...DEFAULT_STATE }
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return { ...DEFAULT_STATE }
  }
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
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
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

export function markDisciplineComplete(projectDir: string, discipline: string): void {
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
  updateStateJsonDiscipline(projectDir, discipline)
}

function nextDiscipline(complete: string[]): string {
  // Find the first discipline in the standard sequence that isn't complete
  for (const d of DISCIPLINE_SEQUENCE) {
    if (!complete.includes(d)) return d
  }
  // All complete — return the last one
  return DISCIPLINE_SEQUENCE[DISCIPLINE_SEQUENCE.length - 1]
}

function updateStateJsonDiscipline(projectDir: string, discipline: string): void {
  const stateFile = statePath(projectDir)
  if (!existsSync(stateFile)) return
  try {
    const rawState = JSON.parse(readFileSync(stateFile, 'utf-8'))
    if (!rawState.seedingProgress?.disciplines) return

    const disciplines = rawState.seedingProgress.disciplines as Array<{ discipline: string; status: string }>
    const entry = disciplines.find(d => d.discipline === discipline)
    if (entry && entry.status !== 'complete') {
      entry.status = 'complete'
    }
    rawState.seedingProgress.completedCount = disciplines.filter(d => d.status === 'complete').length

    // Also update currentDiscipline to the next one in sequence
    const complete = disciplines.filter(d => d.status === 'complete').map(d => d.discipline)
    const current = DISCIPLINE_SEQUENCE.find(d => !complete.includes(d)) ?? DISCIPLINE_SEQUENCE[DISCIPLINE_SEQUENCE.length - 1]
    rawState.seedingProgress.currentDiscipline = current

    writeStateJson(projectDir, rawState)
  } catch {
    // If state.json is malformed, skip
  }
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
 */
export function markDisciplinePrompted(projectDir: string, discipline: string): void {
  const state = readSeedingState(projectDir)
  const prompted = state.disciplines_prompted ?? []
  if (!prompted.includes(discipline)) {
    prompted.push(discipline)
    state.disciplines_prompted = prompted
    state.last_activity = new Date().toISOString()
    writeSeedingState(projectDir, state)
  }
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
