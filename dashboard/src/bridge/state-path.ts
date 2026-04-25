import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { facade } from './facade'

export const ROUGE_DIR = '.rouge'
export const STATE_FILE = 'state.json'

export function statePath(projectDir: string): string {
  const newPath = join(projectDir, ROUGE_DIR, STATE_FILE)
  if (existsSync(newPath)) return newPath
  const oldPath = join(projectDir, STATE_FILE)
  if (existsSync(oldPath)) return oldPath
  return newPath
}

export function statePathForWrite(projectDir: string): string {
  const dir = join(projectDir, ROUGE_DIR)
  mkdirSync(dir, { recursive: true })
  return join(dir, STATE_FILE)
}

export function hasStateFile(projectDir: string): boolean {
  return (
    existsSync(join(projectDir, ROUGE_DIR, STATE_FILE)) ||
    existsSync(join(projectDir, STATE_FILE))
  )
}

/**
 * Atomic write of a project's state.json + facade event emission.
 *
 * Phase 5b of the grand unified reconciliation. The dashboard's lock
 * discipline is "caller acquires withStateLock, then writes inside the
 * critical section" — see state-repair.ts, build-runner.ts,
 * seeding-state.ts, the API route handlers. Routing the write through
 * facade.writeState (which itself acquires a lock) caused reentrant
 * deadlock; the facade lock is not reentrant.
 *
 * Compromise:
 *   - The atomic byte-level write stays here, sync-equivalent (the
 *     async wrapper is for API symmetry with the launcher).
 *   - After commit, a 'state.write' event is emitted to the project's
 *     events.jsonl so dashboard / Slack subscribers see the mutation.
 *   - The lock is the caller's responsibility; the existing
 *     withStateLock blocks across mutation sites guarantee
 *     serialization.
 *
 * eventDetail is forwarded to the facade event so subscribers can
 * identify what changed (e.g. { route: 'pause' }).
 */
export async function writeStateJson(
  projectDir: string,
  state: unknown,
  eventDetail?: Record<string, unknown>,
): Promise<void> {
  const target = statePathForWrite(projectDir)
  // UUID suffix eliminates collision risk that the prior pid+Date.now()
  // pattern had in clustered dashboards or fast test loops where the
  // millisecond clock doesn't tick between two writes from the same pid.
  const tmp = `${target}.${randomUUID()}.tmp`
  try {
    writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n')
    renameSync(tmp, target)
  } catch (err) {
    try { if (existsSync(tmp)) unlinkSync(tmp) } catch { /* ignore */ }
    throw err
  }
  // GC.4 (Phase 5b): every dashboard state mutation emits a facade
  // event so the boundary is observable even though the lock-and-write
  // mechanics live here. Wrapping in try/catch — event emission must
  // never block a successful state write.
  try {
    facade.emit({
      projectDir,
      source: 'dashboard',
      event: 'state.write',
      detail: eventDetail ?? {},
    })
  } catch { /* never block on event emission */ }
}
