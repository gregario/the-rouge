/**
 * Type surface for src/launcher/facade.js.
 *
 * Phase 3 + 5 of the grand unified reconciliation. Hand-authored
 * mirror of the facade's JSDoc shape — `bun run gen:facade-types`
 * (Phase 6+ deliverable) will eventually emit this from JSDoc, but
 * for now we keep both in sync manually. If a facade method gains a
 * field, it MUST be added here too — the dashboard relies on these
 * types for compile-time drift detection.
 *
 * Usage:
 *   // @ts-expect-error — CommonJS module, no native ESM types
 *   const facade = require('../../../src/launcher/facade.js') as Facade;
 *
 * The typed import gives the dashboard the same compile-time check
 * the launcher has at runtime: a wrong field name = compile error,
 * not runtime corruption.
 */

export type FacadeSource =
  | 'loop'
  | 'cli'
  | 'dashboard'
  | 'slack'
  | 'self-improve'
  | 'test';

export type FacadeMode = 'subprocess' | 'sdk';

export interface FacadeEvent {
  ts: string;
  source: FacadeSource;
  event: string;
  project: string;
  detail: Record<string, unknown>;
}

export interface FacadeWriteStateOpts {
  projectDir: string;
  mutator: (state: any) => any | void;
  source: FacadeSource;
  eventDetail?: Record<string, unknown>;
  timeoutMs?: number;
  allowSlow?: boolean;
  validate?: boolean;
}

export interface FacadeWriteStateResult {
  state: any;
  event: FacadeEvent;
}

export interface FacadeRunPhaseOpts {
  projectDir: string;
  phase: string;
  mode: FacadeMode;
  prompt?: string;
  source: FacadeSource;
  dispatchOpts?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface FacadeRunPhaseResult {
  result: unknown;
  startEvent: FacadeEvent;
  endEvent: FacadeEvent;
}

export interface FacadeEmitOpts {
  projectDir: string;
  source: FacadeSource;
  event: string;
  detail?: Record<string, unknown>;
}

export interface FacadeReadEventsResult {
  entries: FacadeEvent[];
  nextOffset: number;
}

export interface FacadeSubscribeOpts {
  projectDir: string;
  fromOffset?: number;
  intervalMs?: number;
  signal?: AbortSignal;
}

export interface Facade {
  writeState(opts: FacadeWriteStateOpts): Promise<FacadeWriteStateResult>;
  readState(projectDir: string): any | null;
  runPhase(opts: FacadeRunPhaseOpts): Promise<FacadeRunPhaseResult>;
  emit(opts: FacadeEmitOpts): FacadeEvent;
  readEvents(projectDir: string, fromOffset?: number): FacadeReadEventsResult;
  subscribeEvents(opts: FacadeSubscribeOpts): AsyncIterable<FacadeEvent>;
  VALID_SOURCES: Set<FacadeSource>;
  VALID_MODES: Set<FacadeMode>;
}

export interface FacadeLockOpts {
  timeoutMs?: number;
}

export interface FacadeWithLockOpts extends FacadeLockOpts {
  allowSlow?: boolean;
}

export interface FacadeLock {
  acquireLock(projectDir: string, opts?: FacadeLockOpts): Promise<() => void>;
  withLock<T>(
    projectDir: string,
    fn: () => Promise<T> | T,
    opts?: FacadeWithLockOpts,
  ): Promise<T>;
  lockPath(projectDir: string): string;
  DEFAULT_TIMEOUT_MS: number;
  STALE_LOCK_MS: number;
  SLOW_MUTATOR_MS: number;
}
