/**
 * Dashboard-side reimplementation of the small launcher-facade surface
 * the dashboard actually uses: emit + lock + withLock.
 *
 * Why a reimplementation rather than `require()`-ing the launcher module:
 * the dashboard's standalone bundle pins `outputFileTracingRoot` to the
 * dashboard package (so the published tarball doesn't bake in absolute
 * build paths), and Turbopack respects that root at dev time too. A
 * `require('../../../src/launcher/facade.js')` reaches outside the root
 * and the build refuses it.
 *
 * The unification Phase 5b shipped is on-disk, not in-process: launcher
 * and dashboard are two separate Node processes that coordinate through
 * `<projectDir>/.rouge/state.lock` and `<projectDir>/.rouge/events.jsonl`.
 * As long as both implementations agree on those file formats, the
 * dashboard's writes land in the same audit channel the launcher does.
 *
 * The shape contract (FacadeEvent, FacadeEmitOpts, FacadeLockOpts, etc.)
 * still comes from the auto-generated `dashboard/src/types/facade.d.ts`
 * snapshot of the launcher's JSDoc, so drift between the two
 * implementations surfaces at compile time.
 *
 * If the launcher changes the events.jsonl line shape or the state.lock
 * file format, the snapshot CI gate (`npm run check:facade-types`) catches
 * the drift; this file then moves to match.
 */

import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

import type {
  Facade,
  FacadeEmitOpts,
  FacadeEvent,
  FacadeLock,
  FacadeLockOpts,
  FacadeWithLockOpts,
  FacadeWriteStateOpts,
  FacadeWriteStateResult,
} from '../types/facade'

// ---------------------------------------------------------------------------
// Events — append-only .rouge/events.jsonl
// ---------------------------------------------------------------------------

const EVENTS_FILENAME = 'events.jsonl'

function eventsPath(projectDir: string): string {
  return join(projectDir, '.rouge', EVENTS_FILENAME)
}

function ensureEventsDir(file: string): void {
  mkdirSync(dirname(file), { recursive: true })
}

function emit(opts: FacadeEmitOpts): FacadeEvent {
  const { projectDir, source, event, detail } = opts
  if (!projectDir) throw new Error('events.emit: projectDir required')
  if (!source) throw new Error('events.emit: source required')
  if (!event) throw new Error('events.emit: event required')

  const file = eventsPath(projectDir)
  ensureEventsDir(file)

  const entry: FacadeEvent = {
    ts: new Date().toISOString(),
    source,
    event,
    project: dirname(file).split('/').slice(-2, -1)[0] ?? '',
    detail: (detail ?? {}) as Record<string, unknown>,
  }
  const line = JSON.stringify(entry) + '\n'
  appendFileSync(file, line, { encoding: 'utf8' })
  return entry
}

// ---------------------------------------------------------------------------
// Lock — per-project advisory lock at .rouge/state.lock
// ---------------------------------------------------------------------------

const LOCK_FILENAME = 'state.lock'
const RETRY_MS = 50
const DEFAULT_TIMEOUT_MS = 5_000
const STALE_LOCK_MS = 30_000
const SLOW_MUTATOR_MS = 100

function lockPath(projectDir: string): string {
  return join(projectDir, '.rouge', LOCK_FILENAME)
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function tryAcquire(file: string): boolean {
  try {
    const fd = openSync(file, 'wx')
    try {
      writeSync(fd, JSON.stringify({ pid: process.pid, acquiredAt: Date.now() }))
    } finally {
      closeSync(fd)
    }
    return true
  } catch {
    return false
  }
}

function breakIfStale(file: string): boolean {
  if (!existsSync(file)) return false
  let deadOwner = false
  let tooOld = false
  try {
    const raw = readFileSync(file, 'utf-8')
    const info = JSON.parse(raw) as { pid?: number; acquiredAt?: number }
    const ageMs = Date.now() - (info.acquiredAt ?? 0)
    deadOwner = typeof info.pid === 'number' && !isPidAlive(info.pid)
    tooOld = ageMs > STALE_LOCK_MS
  } catch {
    deadOwner = true
  }
  if (deadOwner || tooOld) {
    try { unlinkSync(file) } catch { /* already gone */ }
    return true
  }
  return false
}

async function acquireLock(
  projectDir: string,
  opts: FacadeLockOpts = {},
): Promise<() => void> {
  const file = lockPath(projectDir)
  ensureEventsDir(file) // shares .rouge/ dir

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (tryAcquire(file)) {
      let released = false
      return () => {
        if (released) return
        released = true
        try { unlinkSync(file) } catch { /* already gone */ }
      }
    }
    breakIfStale(file)
    await new Promise((r) => setTimeout(r, RETRY_MS))
  }
  throw new Error(`facade.lock: timed out acquiring ${file} after ${timeoutMs}ms`)
}

async function withLock<T>(
  projectDir: string,
  fn: () => Promise<T> | T,
  opts: FacadeWithLockOpts = {},
): Promise<T> {
  const release = await acquireLock(projectDir, opts)
  const start = Date.now()
  try {
    return await fn()
  } finally {
    const dur = Date.now() - start
    release()
    if (!opts.allowSlow && dur > SLOW_MUTATOR_MS) {
      const msg = `facade.lock: mutator held lock ${dur}ms (>${SLOW_MUTATOR_MS}ms) for ${projectDir} — I/O inside the mutator?`
      if (process.env.NODE_ENV === 'production') {
        if (typeof console !== 'undefined' && console.warn) console.warn(`[lock] ${msg}`)
      } else {
        throw new Error(msg)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public surface — typed shape matches the launcher's facade.js
// ---------------------------------------------------------------------------

export const facade: Pick<Facade, 'emit'> = {
  emit,
}

export const lock: Pick<FacadeLock, 'acquireLock' | 'withLock' | 'lockPath'> = {
  acquireLock,
  withLock,
  lockPath,
}

/**
 * Source-pinned writeState shim.
 *
 * Phase 5b's actual mutation discipline lives in
 * `dashboard/src/bridge/state-path.ts` (atomic byte-level write inside
 * a caller-held `withStateLock`). This shim is kept as a stub for
 * symmetry with the launcher's API; calling it routes through
 * state-path's writeStateJson.
 */
export async function writeStateFromDashboard(
  opts: Omit<FacadeWriteStateOpts, 'source'>,
): Promise<FacadeWriteStateResult> {
  // The dashboard never uses facade.writeState directly — its mutation
  // sites all go through `withStateLock` + `writeStateJson` in
  // state-path.ts (Phase 5b note: routing through the launcher's
  // facade.writeState produced reentrant-deadlock with withStateLock).
  // Throw if anyone tries to call this; the call sites in the dashboard
  // were migrated to writeStateJson already.
  throw new Error(
    'writeStateFromDashboard is not implemented — dashboard mutations use ' +
    'state-path.ts writeStateJson under withStateLock. See the comment in ' +
    'dashboard/src/bridge/facade.ts for the rationale.',
  )
}

export type {
  FacadeEvent,
  FacadeMode,
  FacadeReadEventsResult,
  FacadeRunPhaseOpts,
  FacadeRunPhaseResult,
  FacadeSource,
  FacadeWriteStateOpts,
  FacadeWriteStateResult,
} from '../types/facade'
