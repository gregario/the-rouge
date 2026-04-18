import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Per-project advisory lock for state.json read-modify-write.
 *
 * `writeStateJson` (state-path.ts) is atomic at the byte level — a
 * reader never sees a half-written file. But two concurrent HTTP
 * mutations (PATCH, pause, resolve-escalation, build-runner's state
 * transition, state-repair, seeding-finalize, derive-title) each do
 * `read → mutate → write`, and without a lock the second writer's
 * prior-read is stale by the time it writes, so the first writer's
 * mutation silently disappears. That's the "lost update" class of bug.
 *
 * This helper gives every mutation site a shared critical section keyed
 * on the project directory. Lock is an exclusive-create on
 * `<projectDir>/.rouge/state.lock`; stale locks (dead owner PID or
 * lockfile older than `STALE_LOCK_MS`) are broken on retry.
 *
 * Scope: dashboard-only for this PR. The launcher (`rouge-loop.js`)
 * also reads/writes state.json; cross-process coordination with the
 * launcher is a follow-up and would need careful thought about long
 * phase runs holding the lock.
 */

const LOCK_FILENAME = 'state.lock'
const RETRY_MS = 50
const DEFAULT_TIMEOUT_MS = 5_000
const STALE_LOCK_MS = 30_000

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function lockPath(projectDir: string): string {
  return join(projectDir, '.rouge', LOCK_FILENAME)
}

function ensureLockDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true })
}

function tryAcquire(path: string): boolean {
  try {
    const fd = openSync(path, 'wx')
    try {
      writeSync(
        fd,
        JSON.stringify({ pid: process.pid, acquiredAt: Date.now() }),
      )
    } finally {
      closeSync(fd)
    }
    return true
  } catch {
    return false
  }
}

function breakIfStale(path: string): boolean {
  if (!existsSync(path)) return false
  let deadOwner = false
  let tooOld = false
  try {
    const raw = readFileSync(path, 'utf-8')
    const info = JSON.parse(raw) as { pid?: number; acquiredAt?: number }
    const ageMs = Date.now() - (info.acquiredAt ?? 0)
    deadOwner = typeof info.pid === 'number' && !isPidAlive(info.pid)
    tooOld = ageMs > STALE_LOCK_MS
  } catch {
    // Malformed lockfile is itself a break-worthy signal.
    deadOwner = true
  }
  if (deadOwner || tooOld) {
    try {
      unlinkSync(path)
    } catch {
      /* someone else may have cleared it — fine */
    }
    return true
  }
  return false
}

export async function acquireStateLock(
  projectDir: string,
  opts: { timeoutMs?: number } = {},
): Promise<() => void> {
  const path = lockPath(projectDir)
  ensureLockDir(path)

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (tryAcquire(path)) {
      return () => {
        try {
          unlinkSync(path)
        } catch {
          /* already gone — still released */
        }
      }
    }
    breakIfStale(path)
    await new Promise((r) => setTimeout(r, RETRY_MS))
  }
  throw new Error(`state-lock: timed out acquiring ${path}`)
}

export async function withStateLock<T>(
  projectDir: string,
  fn: () => Promise<T> | T,
  opts: { timeoutMs?: number } = {},
): Promise<T> {
  const release = await acquireStateLock(projectDir, opts)
  try {
    return await fn()
  } finally {
    release()
  }
}
