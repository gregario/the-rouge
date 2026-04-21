import { existsSync, readFileSync, writeFileSync, unlinkSync, renameSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

/**
 * PID tracking for the seeding daemon. Mirrors build-runner's
 * `.build-pid` pattern so operators have one mental model for
 * "what's running for this project."
 *
 * File format: JSON at `<projectDir>/.seed-pid`:
 *   { "pid": 12345, "startedAt": "<ISO>", "sessionId": "<uuid>" }
 *
 * sessionId disambiguates between two daemons that raced at startup:
 * the loser's PID file is overwritten, but its sessionId mismatch
 * lets the loser detect the race on its next heartbeat and exit
 * cleanly rather than fighting the winner.
 */

export const SEED_PID_FILE = '.seed-pid'

export interface SeedPidInfo {
  pid: number
  startedAt: string
  sessionId: string
}

function pidPath(projectDir: string): string {
  return join(projectDir, SEED_PID_FILE)
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Read the PID file and return its contents iff the tracked PID is
 * still alive. Stale file (PID dead) is cleaned up and null returned.
 */
export function readSeedPid(projectDir: string): SeedPidInfo | null {
  const path = pidPath(projectDir)
  if (!existsSync(path)) return null
  let info: SeedPidInfo
  try {
    info = JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
  if (typeof info.pid !== 'number' || !isPidAlive(info.pid)) {
    try { unlinkSync(path) } catch { /* ignore */ }
    return null
  }
  return info
}

/**
 * Write the daemon's PID file atomically (tmp + rename) so a reader
 * never observes a half-written file. Returns the sessionId so the
 * daemon can track its own identity for race-loss detection.
 */
export function writeSeedPid(projectDir: string, pid: number): SeedPidInfo {
  const info: SeedPidInfo = {
    pid,
    startedAt: new Date().toISOString(),
    sessionId: randomUUID(),
  }
  const target = pidPath(projectDir)
  const tmp = `${target}.${randomUUID()}.tmp`
  writeFileSync(tmp, JSON.stringify(info, null, 2) + '\n', 'utf-8')
  renameSync(tmp, target)
  return info
}

/**
 * Remove the PID file. Daemon calls this on clean exit; callers can
 * call it to reap a stale file whose PID is dead.
 */
export function clearSeedPid(projectDir: string): void {
  const path = pidPath(projectDir)
  if (existsSync(path)) {
    try { unlinkSync(path) } catch { /* ignore */ }
  }
}

/**
 * Returns true iff the PID file's sessionId still matches ours. A
 * mismatch means another daemon claimed ownership — the caller (us,
 * the losing daemon) should exit to avoid two processes fighting
 * over the same project.
 */
export function stillOwned(projectDir: string, ourSessionId: string): boolean {
  const path = pidPath(projectDir)
  if (!existsSync(path)) return false
  try {
    const info = JSON.parse(readFileSync(path, 'utf-8')) as SeedPidInfo
    return info.sessionId === ourSessionId
  } catch {
    return false
  }
}
