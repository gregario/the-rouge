import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

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
 * Atomic write of a project's state.json. Writes to a per-pid tmp file
 * first, then rename(2)s into place — POSIX atomic on same-filesystem
 * paths. Trailing newline for consistency with the launcher's existing
 * writeJson helper.
 *
 * Use this instead of `writeFileSync(statePath(dir), ...)` everywhere
 * state.json gets mutated. Multiple endpoints used to do the plain
 * write directly (pause, PATCH, resolve-escalation, build-runner,
 * seeding-state's updateStateJsonDiscipline). Concurrent requests could
 * clobber each other's updates silently. The atomic path prevents torn
 * writes; the concurrent-update-loss at the caller level is a separate
 * concern that needs a lock, but at minimum the file is never
 * half-written and readers don't see partial JSON.
 */
export function writeStateJson(projectDir: string, state: unknown): void {
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
}
