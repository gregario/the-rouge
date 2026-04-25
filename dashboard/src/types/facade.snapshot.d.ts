/**
 * AUTO-GENERATED snapshot of the JSDoc-derived facade shape.
 *
 * Source: src/launcher/facade.js + facade/lock.js + facade/events.js.
 * Generator: scripts/gen-facade-types.mjs.
 *
 * DO NOT EDIT BY HAND. Run `bun run gen:facade-types` to refresh.
 * CI runs `bun run gen:facade-types -- --check` to detect drift.
 *
 * This file is the drift-detector. The dashboard imports from
 * facade.d.ts (hand-authored named interfaces); when this snapshot
 * disagrees with the JSDoc on the launcher facade, CI fails and a
 * reviewer decides whether to update facade.d.ts to match.
 */

// ----- from src/launcher/facade.d.ts -----
/**
 * Atomic read-modify-write of state.json with event emission.
 *
 * @param {object} opts
 *   - projectDir: required, absolute path
 *   - mutator: (state) => state | void — applied in-place or returns new state
 *   - source: required, one of VALID_SOURCES
 *   - eventDetail: optional payload for the emitted 'state.write' event
 *   - timeoutMs: lock timeout (default 5000)
 *   - allowSlow: skip the slow-mutator guard
 *   - validate: set to false to bypass strict schema validation (tests / migrations)
 * @returns {Promise<{state: object, event: object}>}
 */
export function writeState(opts: object): Promise<{
    state: object;
    event: object;
}>;
/**
 * Read the current state without locking (atomic byte-level write
 * already protects readers).
 */
export function readState(projectDir: any): any;
/**
 * Dispatch an AI phase invocation. Long-running — does NOT hold the
 * state lock. Emits phase.start / phase.end events.
 *
 * @param {object} opts
 *   - projectDir: required
 *   - phase: required, the phase id (e.g. 'loop.building')
 *   - mode: 'subprocess' | 'sdk' (required)
 *   - prompt: text passed to the dispatch strategy
 *   - source: required
 *   - dispatchOpts: forwarded to the chosen strategy
 *   - signal: AbortSignal forwarded to the strategy
 * @returns {Promise<{ result, startEvent, endEvent }>}
 */
export function runPhase(opts: object): Promise<{
    result: any;
    startEvent: any;
    endEvent: any;
}>;
import { emit } from "./facade/events.js";
import { readEvents } from "./facade/events.js";
import { subscribeEvents } from "./facade/events.js";
import { eventsPath } from "./facade/events.js";
export const VALID_SOURCES: Set<string>;
export const VALID_MODES: Set<string>;
export { emit, readEvents, subscribeEvents, eventsPath };

// ----- from src/launcher/facade/lock.d.ts -----
/**
 * Acquire the per-project state lock.
 *
 * @param {string} projectDir
 * @param {object} [opts]
 *   - timeoutMs: max time to wait (default 5000)
 * @returns {Promise<() => void>} release function. Always release in finally.
 */
export function acquireLock(projectDir: string, opts?: object): Promise<() => void>;
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
export function withLock(projectDir: string, fn: Function, opts?: object): Promise<any>;
export function lockPath(projectDir: any): string;
export const DEFAULT_TIMEOUT_MS: 5000;
export const STALE_LOCK_MS: 30000;
export const SLOW_MUTATOR_MS: 100;

// ----- from src/launcher/facade/events.d.ts -----
/**
 * Emit one event to the project's event log.
 *
 * Atomic at the byte level (single write call). The file is opened in
 * append mode so concurrent emitters from different processes
 * interleave without overwriting each other (POSIX guarantees writes
 * <= PIPE_BUF / 4096 bytes are atomic in append mode on local fs).
 * Event payloads stay well under that.
 *
 * @param {object} opts
 *   - projectDir: required
 *   - source: 'loop' | 'cli' | 'dashboard' | 'slack' | 'self-improve' | 'test'
 *   - event: short stable name like 'state.write', 'phase.start'
 *   - detail: free-form object (must JSON-serialize)
 */
export function emit(opts: object): {
    ts: string;
    source: any;
    event: any;
    project: string;
    detail: any;
};
/**
 * Read the events file from a given byte offset onward.
 *
 * Returns { entries, nextOffset }. `nextOffset` is the byte position
 * after the last fully-read entry — pass it back on the next call to
 * avoid re-reading.
 *
 * Partial trailing line (writer in flight) is not returned in
 * `entries`; the caller will pick it up on the next poll.
 */
export function readEvents(projectDir: any, fromOffset?: number): {
    entries: any[];
    nextOffset: number;
};
/**
 * Async iterator that yields events as they arrive.
 *
 * Polls the file at `intervalMs` (default 250ms). The iterator never
 * terminates on its own — caller breaks out with `return` or by
 * passing an AbortSignal.
 *
 * @param {object} opts
 *   - projectDir: required
 *   - fromOffset: byte offset to start from (default 0)
 *   - intervalMs: poll interval (default 250)
 *   - signal: AbortSignal to terminate the iterator
 */
export function subscribeEvents(opts: object): AsyncGenerator<any, void, unknown>;
export function eventsPath(projectDir: any): string;
