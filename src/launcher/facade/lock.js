/**
 * Per-project advisory lock for short-transaction state mutations.
 *
 * Phase 3 of the grand unified reconciliation. Ports
 * `dashboard/src/bridge/state-lock.ts` to JS and generalizes it for
 * cross-process use — the launcher and dashboard now share one lock
 * implementation through this module (Phase 5 deletes the dashboard's
 * inline TS copy).
 *
 * Design (per docs/design/entry-vs-core.md):
 *
 *   - Held only for the duration of a single read-modify-write
 *     transaction (milliseconds). NEVER held for a phase run
 *     (5–30 minutes) — facade.runPhase decomposes orchestration into
 *     many short transactions instead.
 *
 *   - Default timeout 5s. If the lock can't be acquired in 5s,
 *     something is wrong (deadlock, runaway long mutator) and we
 *     surface it as an error rather than stall.
 *
 *   - Stale-lock recovery: if the lockfile's owner PID is dead, OR
 *     the lockfile is older than 30s, the next acquirer breaks it.
 *     Covers the case where a process crashed mid-mutation.
 *
 *   - Mutator-duration guard (FORK E — runtime guard): in dev/test,
 *     `withLock` wraps the function in a 100ms timer; throws if
 *     exceeded. In production it logs a warning. Catches the "I/O
 *     inside the mutator" anti-pattern at first introduction.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const LOCK_FILENAME = 'state.lock';
const RETRY_MS = 50;
const DEFAULT_TIMEOUT_MS = 5_000;
const STALE_LOCK_MS = 30_000;
const SLOW_MUTATOR_MS = 100;

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (_e) {
    return false;
  }
}

function lockPath(projectDir) {
  return path.join(projectDir, '.rouge', LOCK_FILENAME);
}

function ensureLockDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function tryAcquire(file) {
  try {
    const fd = fs.openSync(file, 'wx');
    try {
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, acquiredAt: Date.now() }));
    } finally {
      fs.closeSync(fd);
    }
    return true;
  } catch (_e) {
    return false;
  }
}

function breakIfStale(file) {
  if (!fs.existsSync(file)) return false;
  let deadOwner = false;
  let tooOld = false;
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const info = JSON.parse(raw);
    const ageMs = Date.now() - (info.acquiredAt || 0);
    deadOwner = typeof info.pid === 'number' && !isPidAlive(info.pid);
    tooOld = ageMs > STALE_LOCK_MS;
  } catch (_e) {
    // Malformed lockfile is itself a break-worthy signal.
    deadOwner = true;
  }
  if (deadOwner || tooOld) {
    try { fs.unlinkSync(file); } catch (_e) { /* someone else cleared it */ }
    return true;
  }
  return false;
}

/**
 * Acquire the per-project state lock.
 *
 * @param {string} projectDir
 * @param {object} [opts]
 *   - timeoutMs: max time to wait (default 5000)
 * @returns {Promise<() => void>} release function. Always release in finally.
 */
async function acquireLock(projectDir, opts = {}) {
  const file = lockPath(projectDir);
  ensureLockDir(file);

  const timeoutMs = opts.timeoutMs != null ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (tryAcquire(file)) {
      let released = false;
      return () => {
        if (released) return;
        released = true;
        try { fs.unlinkSync(file); } catch (_e) { /* already gone — still released */ }
      };
    }
    breakIfStale(file);
    await new Promise((r) => setTimeout(r, RETRY_MS));
  }
  throw new Error(`facade.lock: timed out acquiring ${file} after ${timeoutMs}ms`);
}

/**
 * Run `fn` while holding the lock. Releases on normal return AND on throw.
 *
 * Mutator-duration guard (FORK E):
 *   - In dev/test (NODE_ENV !== 'production'), throws if `fn` takes
 *     longer than 100ms. The intended discipline is "mutator is a
 *     synchronous in-memory transform" — anything slower means I/O
 *     leaked into the critical section, which is the bug pattern this
 *     guard catches.
 *   - In production, logs a warning instead of throwing — a real edge
 *     case at 3 AM oncall is worse than a slow mutator.
 *   - Caller can opt out via `opts.allowSlow: true` for legitimate
 *     long-running uses (e.g. one-shot migration scripts).
 *
 * @param {string} projectDir
 * @param {Function} fn — the mutator. May be sync or async.
 * @param {object} [opts]
 *   - timeoutMs: lock acquire timeout
 *   - allowSlow: skip the slow-mutator guard (default false)
 * @returns {Promise<*>} fn's return value
 */
async function withLock(projectDir, fn, opts = {}) {
  const release = await acquireLock(projectDir, opts);
  const start = Date.now();
  try {
    return await fn();
  } finally {
    const dur = Date.now() - start;
    release();
    if (!opts.allowSlow && dur > SLOW_MUTATOR_MS) {
      const msg = `facade.lock: mutator held lock ${dur}ms (>${SLOW_MUTATOR_MS}ms) for ${projectDir} — I/O inside the mutator?`;
      if (process.env.NODE_ENV === 'production') {
        if (typeof console !== 'undefined' && console.warn) console.warn(`[lock] ${msg}`);
      } else {
        throw new Error(msg);
      }
    }
  }
}

module.exports = {
  acquireLock,
  withLock,
  lockPath,
  // Exported for tests + advanced callers.
  DEFAULT_TIMEOUT_MS,
  STALE_LOCK_MS,
  SLOW_MUTATOR_MS,
};
