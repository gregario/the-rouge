/**
 * Typed facade shim for the dashboard.
 *
 * Phase 5b of the grand unified reconciliation. Every dashboard
 * mutation site that previously called writeJson(stateFile, …) now
 * imports from this module instead. The shim:
 *
 *   1. Loads the launcher's CommonJS facade via require() — single
 *      shared implementation across launcher, CLI, Slack, dashboard.
 *   2. Casts the export through the hand-authored Facade type from
 *      ../types/facade.d.ts so the dashboard gets compile-time drift
 *      detection if the facade shape changes.
 *   3. Pins the source tag to 'dashboard' on the helper writeState()
 *      so callers don't need to remember it.
 */

import type {
  Facade,
  FacadeLock,
  FacadeWriteStateOpts,
  FacadeWriteStateResult,
} from '../types/facade'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const launcherFacade = require('../../../src/launcher/facade.js') as Facade
// eslint-disable-next-line @typescript-eslint/no-var-requires
const launcherLock = require('../../../src/launcher/facade/lock.js') as FacadeLock

export const facade: Facade = launcherFacade
export const lock: FacadeLock = launcherLock

/**
 * Source-pinned helper for dashboard handlers.
 *
 * Equivalent to facade.writeState({ source: 'dashboard', ... }) but
 * the source can't be omitted (which would throw at runtime) and
 * can't be set to a wrong value (e.g. 'loop' from a dashboard handler
 * — would distort the audit trail).
 */
export async function writeStateFromDashboard(
  opts: Omit<FacadeWriteStateOpts, 'source'>,
): Promise<FacadeWriteStateResult> {
  return facade.writeState({ ...opts, source: 'dashboard' })
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
