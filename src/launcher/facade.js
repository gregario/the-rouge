/**
 * facade.js — single entry point for state mutation, AI dispatch,
 * and event emission.
 *
 * Phase 3 of the grand unified reconciliation. The facade is the
 * core of the GC.4 (entry-vs-core) boundary: dashboard, CLI, Slack,
 * launcher loop — every component that interacts with project state
 * goes through this one module. See docs/design/entry-vs-core.md for
 * the full rationale and lock-discipline rules.
 *
 * Phase 3 status: facade exists and is fully wired internally
 * (lock + events + dispatch strategies). No callers migrated yet
 * — that's Phase 4 (loop) and Phase 5 (entries). Until then, this
 * module is additive.
 *
 * Public API surface:
 *
 *   writeState({ projectDir, mutator, source })
 *     Atomic state mutation. Acquires lock, reads state, applies
 *     mutator, validates, writes, emits 'state.write' event,
 *     releases lock. Mutator must be synchronous in-memory transform
 *     (FORK E enforces this in dev/test).
 *
 *   runPhase({ projectDir, phase, mode, prompt, source, ... })
 *     Dispatches an AI phase invocation. mode: 'subprocess' (claude -p)
 *     or 'sdk' (harness adapter). Emits 'phase.start' / 'phase.end'
 *     events. Long-running — does NOT hold the state lock.
 *
 *   subscribeEvents({ projectDir, fromOffset, signal })
 *     Async iterator over the project's event log. Dashboard, Slack,
 *     and tests use this instead of polling state files.
 *
 *   emit({ projectDir, source, event, detail })
 *     Direct event emission for cases where there's no state mutation
 *     (e.g. 'lock.contended', 'phase.progress' checkpoints).
 *
 * Source tag values (for audit trail):
 *   - 'loop'         — rouge-loop.js
 *   - 'cli'          — rouge-cli.js commands
 *   - 'dashboard'    — dashboard/src/bridge handlers
 *   - 'slack'        — src/slack/bot.js (notification-only after Phase 5)
 *   - 'self-improve' — self-improve.js
 *   - 'test'         — unit tests
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { withLock } = require('./facade/lock.js');
const { emit, readEvents, subscribeEvents, eventsPath } = require('./facade/events.js');
const { runSubprocess } = require('./facade/dispatch/subprocess.js');
const { runSdk } = require('./facade/dispatch/sdk.js');
const { statePath } = require('./state-path.js');

const VALID_SOURCES = new Set([
  'loop', 'cli', 'dashboard', 'slack', 'self-improve', 'test',
]);
const VALID_MODES = new Set(['subprocess', 'sdk']);

function readStateJson(projectDir) {
  const file = statePath(projectDir);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`facade.readState: ${file}: ${e.message}`);
  }
}

function writeStateJson(projectDir, state, opts) {
  // statePath() returns the write target preserving the legacy/.rouge
  // resolution: existing-legacy → legacy, existing-.rouge → .rouge,
  // neither → .rouge (new project default). This matches the prior
  // writeJson behavior in rouge-loop.js and keeps unmigrated projects
  // writing to their existing location.
  const file = statePath(projectDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Strict schema validation by default. State drift causes phase-loop
  // pathologies (see stack-rank's 94-cycle foundation-eval spiral on
  // `status='evaluating'` absent from the enum). Better to halt on a
  // bad write than let it compound across every future iteration.
  // Tests + migrations can opt out via `opts.validate: false`.
  if (!opts || opts.validate !== false) {
    try {
      const { validate, SchemaViolationError } = require('./schema-validator.js');
      try {
        validate('state.json', state, `facade.writeState ${file}`, { strict: true });
      } catch (err) {
        if (err instanceof SchemaViolationError) throw err;
        throw err;
      }
    } catch (err) {
      if (err && err.name === 'SchemaViolationError') throw err;
      /* validator unavailable — skip silently */
    }
  }
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

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
async function writeState(opts) {
  const { projectDir, mutator, source, eventDetail, timeoutMs, allowSlow, validate } = opts || {};
  if (!projectDir) throw new Error('facade.writeState: projectDir required');
  if (typeof mutator !== 'function') throw new Error('facade.writeState: mutator must be a function');
  if (!VALID_SOURCES.has(source)) {
    throw new Error(`facade.writeState: source '${source}' invalid (must be one of ${[...VALID_SOURCES].join(', ')})`);
  }

  const result = await withLock(projectDir, async () => {
    const state = readStateJson(projectDir) || {};
    const next = mutator(state);
    const finalState = next === undefined ? state : next;
    writeStateJson(projectDir, finalState, { validate });
    return finalState;
  }, { timeoutMs, allowSlow });

  const event = emit({
    projectDir,
    source,
    event: 'state.write',
    detail: eventDetail || {},
  });

  return { state: result, event };
}

/**
 * Read the current state without locking (atomic byte-level write
 * already protects readers).
 */
function readState(projectDir) {
  if (!projectDir) throw new Error('facade.readState: projectDir required');
  return readStateJson(projectDir);
}

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
async function runPhase(opts) {
  const { projectDir, phase, mode, prompt, source, dispatchOpts, signal } = opts || {};
  if (!projectDir) throw new Error('facade.runPhase: projectDir required');
  if (!phase) throw new Error('facade.runPhase: phase required');
  if (!VALID_MODES.has(mode)) {
    throw new Error(`facade.runPhase: mode '${mode}' invalid (must be one of ${[...VALID_MODES].join(', ')})`);
  }
  if (!VALID_SOURCES.has(source)) {
    throw new Error(`facade.runPhase: source '${source}' invalid`);
  }

  const startEvent = emit({
    projectDir,
    source,
    event: 'phase.start',
    detail: { phase, mode },
  });

  let result;
  let error;
  try {
    if (mode === 'subprocess') {
      result = await runSubprocess({ prompt, signal, ...(dispatchOpts || {}) });
    } else {
      result = await runSdk({ prompt, signal, ...(dispatchOpts || {}) });
    }
  } catch (e) {
    error = e;
  }

  const endEvent = emit({
    projectDir,
    source,
    event: 'phase.end',
    detail: {
      phase,
      mode,
      ok: !error,
      error: error ? String(error.message || error) : undefined,
    },
  });

  if (error) throw error;
  return { result, startEvent, endEvent };
}

module.exports = {
  writeState,
  readState,
  runPhase,
  emit,
  readEvents,
  subscribeEvents,
  eventsPath,
  VALID_SOURCES,
  VALID_MODES,
};
