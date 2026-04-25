import { lock } from './facade'

/**
 * Per-project advisory lock for state.json read-modify-write.
 *
 * Phase 5b of the grand unified reconciliation: the dashboard's lock
 * implementation now delegates to the launcher's shared
 * `src/launcher/facade/lock.js`. That gives launcher + dashboard a
 * single implementation across the GC.4 boundary, so cross-process
 * coordination "just works" — the lockfile path and stale-lock
 * recovery rules are identical for both.
 *
 * Public surface stays the same so existing imports
 * (acquireStateLock, withStateLock) keep working without touch:
 *
 *   - acquireStateLock(projectDir, opts?) — Promise<release fn>
 *   - withStateLock(projectDir, fn, opts?) — Promise<T>
 *
 * The launcher module also enforces FORK E (slow-mutator throws in
 * dev/test). Dashboard handlers that need to do legitimate slow work
 * inside the lock can pass `{ allowSlow: true }`.
 */

export async function acquireStateLock(
  projectDir: string,
  opts: { timeoutMs?: number } = {},
): Promise<() => void> {
  return lock.acquireLock(projectDir, opts)
}

export async function withStateLock<T>(
  projectDir: string,
  fn: () => Promise<T> | T,
  opts: { timeoutMs?: number; allowSlow?: boolean } = {},
): Promise<T> {
  return lock.withLock<T>(projectDir, fn, opts)
}
