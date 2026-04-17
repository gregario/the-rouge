import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { DISCIPLINE_SEQUENCE, type SeedingSessionState } from './types'
import { statePath } from './state-path'

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

export function writeSeedingState(projectDir: string, state: SeedingSessionState): void {
  const path = join(projectDir, STATE_FILE)
  writeFileSync(path, JSON.stringify(state, null, 2))
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

    writeFileSync(stateFile, JSON.stringify(rawState, null, 2))
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
 * Read and clear any pending correction. Returns null if there was none.
 */
export function consumePendingCorrection(projectDir: string): string | null {
  const state = readSeedingState(projectDir)
  const pending = state.pending_correction
  if (!pending) return null
  delete state.pending_correction
  state.last_activity = new Date().toISOString()
  writeSeedingState(projectDir, state)
  return pending
}
