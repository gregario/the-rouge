/**
 * SDK dispatch strategy — Anthropic SDK invocation.
 *
 * Phase 3 of the grand unified reconciliation. Wraps the existing
 * harness adapter (`src/launcher/harness/sdk-adapter.js`) as a
 * facade-callable strategy. Used when `mode === 'sdk'` is passed to
 * facade.runPhase.
 *
 * Today the harness adapter is the strategy used by judge / non-tool
 * phases (10-final-review, 06-vision-check, 09-cycle-retrospective,
 * 02e-evaluation per `docs/design/harness-poc.md`). Phase 4 migrates
 * those phase callers to facade.runPhase({ mode: 'sdk' }) which
 * delegates here.
 */

'use strict';

const { runPhaseViaSdk } = require('../../harness/sdk-adapter.js');

/**
 * Run a phase via the SDK harness.
 *
 * Forward-pass to runPhaseViaSdk — the facade adds source-tagging and
 * lock-discipline elsewhere; this strategy is just the dispatch
 * mechanism.
 *
 * Accepts the same opts as runPhaseViaSdk: prompt, system, schema,
 * toolName, model, maxTokens, signal, etc. See sdk-adapter.js for the
 * full surface.
 */
async function runSdk(opts = {}) {
  return runPhaseViaSdk(opts);
}

module.exports = { runSdk };
