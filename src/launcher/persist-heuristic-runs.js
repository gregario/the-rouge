/**
 * persist-heuristic-runs.js
 *
 * After the evaluation phase writes `heuristic_runs[]` to cycle_context,
 * the launcher reads those entries and appends them to a per-project
 * sidecar JSONL. The sidecar is the evidence layer P2.1 (variant evidence
 * aggregation) will eventually read across all projects to compute
 * promotion recommendations.
 *
 * This module is the minimal wiring for P0.9. It does NOT evaluate variants
 * itself — that's the evaluator's job. It only reads what the evaluator
 * wrote and persists it immutably for later aggregation.
 *
 * Sidecar path: <projectDir>/.rouge/heuristic-runs.jsonl
 *
 * Shape expected in cycle_context.heuristic_runs[]:
 *   {
 *     entry_id: string      (required)
 *     variant_id: string    (required)
 *     outcome: "pass"|"fail"|"env_limited"  (required)
 *     evidence?: object     (optional — measured value, threshold, etc.)
 *     timestamp?: string    (filled in if missing)
 *     cycle_number?: number (filled in from state if missing)
 *   }
 *
 * Malformed entries are skipped with a warning; never throws.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { appendRunLog } = require('./variant-tracker.js');

const VALID_OUTCOMES = new Set(['pass', 'fail', 'env_limited']);

function sidecarPath(projectDir) {
  return path.join(projectDir, '.rouge', 'heuristic-runs.jsonl');
}

/**
 * @param {string} projectDir
 * @param {object} cycleContext - the loaded cycle_context.json
 * @param {object} state - the loaded state.json (for cycle_number fallback)
 * @returns {{ persisted: number, skipped: number, errors: string[] }}
 */
function persistHeuristicRuns(projectDir, cycleContext, state) {
  const result = { persisted: 0, skipped: 0, errors: [] };
  if (!projectDir) {
    result.errors.push('projectDir required');
    return result;
  }
  const runs = cycleContext && Array.isArray(cycleContext.heuristic_runs)
    ? cycleContext.heuristic_runs
    : [];
  if (runs.length === 0) return result;

  const logPath = sidecarPath(projectDir);
  const cycleNumber = (state && typeof state.cycle_number === 'number') ? state.cycle_number : null;
  const ts = new Date().toISOString();

  for (const raw of runs) {
    if (!raw || typeof raw !== 'object') {
      result.skipped += 1;
      result.errors.push('non-object entry');
      continue;
    }
    if (!raw.entry_id || typeof raw.entry_id !== 'string') {
      result.skipped += 1;
      result.errors.push('missing entry_id');
      continue;
    }
    if (!raw.variant_id || typeof raw.variant_id !== 'string') {
      result.skipped += 1;
      result.errors.push(`${raw.entry_id}: missing variant_id`);
      continue;
    }
    if (!VALID_OUTCOMES.has(raw.outcome)) {
      result.skipped += 1;
      result.errors.push(`${raw.entry_id}/${raw.variant_id}: invalid outcome '${raw.outcome}'`);
      continue;
    }
    const entry = {
      entry_id: raw.entry_id,
      variant_id: raw.variant_id,
      outcome: raw.outcome,
      timestamp: raw.timestamp || ts,
      cycle_number: (typeof raw.cycle_number === 'number') ? raw.cycle_number : cycleNumber,
    };
    if (raw.evidence && typeof raw.evidence === 'object') entry.evidence = raw.evidence;
    try {
      appendRunLog(logPath, entry);
      result.persisted += 1;
    } catch (e) {
      result.skipped += 1;
      result.errors.push(`append failed for ${raw.entry_id}/${raw.variant_id}: ${e.message}`);
    }
  }

  return result;
}

/**
 * Read persisted runs from a project's sidecar. Used by aggregation tools.
 */
function readPersistedRuns(projectDir) {
  const logPath = sidecarPath(projectDir);
  if (!fs.existsSync(logPath)) return [];
  const text = fs.readFileSync(logPath, 'utf8');
  const runs = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      runs.push(JSON.parse(line));
    } catch {
      // skip malformed
    }
  }
  return runs;
}

module.exports = { persistHeuristicRuns, readPersistedRuns, sidecarPath };
