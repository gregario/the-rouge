/**
 * structured-retro.js
 *
 * Builds a structured retrospective output from cycle observations.
 * Shape borrowed from everything-claude-code's continuous-learning-v2 classify
 * phase: worked / failed / untried trichotomy.
 *
 * Used by (future) cycle-retrospective phase to produce machine-parseable
 * retro records that feed:
 *   - variant-tracker (for heuristic A/B comparison)
 *   - amendify (to draft prompt/skill amendments)
 *   - governance (as retrospective-derived events)
 *
 * Pure, stateless, no I/O.
 */

'use strict';

function newRetro(opts = {}) {
  const now = opts.timestamp || new Date().toISOString();
  return {
    cycle_id: opts.cycle_id || null,
    project: opts.project || null,
    timestamp: now,
    worked: [],
    failed: [],
    untried: [],
    amendments_proposed: [],
    heuristic_runs: [],
    notes: [],
  };
}

function addWorked(retro, { area, observation, evidence_refs = [] }) {
  if (!area || !observation) throw new Error('addWorked: area and observation required');
  retro.worked.push({ area, observation, evidence_refs });
  return retro;
}

function addFailed(retro, { area, observation, evidence_refs = [], root_cause, confidence = 0.5 }) {
  if (!area || !observation) throw new Error('addFailed: area and observation required');
  retro.failed.push({ area, observation, evidence_refs, root_cause, confidence });
  return retro;
}

function addUntried(retro, { area, observation, evidence_refs = [] }) {
  if (!area || !observation) throw new Error('addUntried: area and observation required');
  retro.untried.push({ area, observation, evidence_refs });
  return retro;
}

function addAmendmentProposal(retro, proposal) {
  if (!proposal || !proposal.target || !proposal.rationale) {
    throw new Error('addAmendmentProposal: proposal.target and proposal.rationale required');
  }
  retro.amendments_proposed.push(proposal);
  return retro;
}

function addHeuristicRun(retro, { entry_id, variant_id, outcome, evidence_ref }) {
  if (!entry_id || !variant_id || !outcome) {
    throw new Error('addHeuristicRun: entry_id, variant_id, outcome required');
  }
  retro.heuristic_runs.push({ entry_id, variant_id, outcome, evidence_ref });
  return retro;
}

function addNote(retro, note) {
  if (!note || typeof note !== 'string') throw new Error('addNote: note must be a non-empty string');
  retro.notes.push(note);
  return retro;
}

function summary(retro) {
  return {
    worked_count: retro.worked.length,
    failed_count: retro.failed.length,
    untried_count: retro.untried.length,
    amendments_proposed_count: retro.amendments_proposed.length,
    heuristic_runs_count: retro.heuristic_runs.length,
    top_failed_areas: topAreas(retro.failed),
  };
}

function topAreas(items, n = 3) {
  const counts = {};
  for (const item of items) {
    counts[item.area] = (counts[item.area] || 0) + 1;
  }
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([area, count]) => ({ area, count }));
}

/**
 * Detect recurring-pattern signals: an area shows up as failed in N consecutive cycles.
 *
 * @param {object[]} priorRetros - array of retro objects, most recent first
 * @param {object} currentRetro - the retro being built
 * @param {number} n - threshold (default 3)
 * @returns {string[]} area names that are recurring
 */
function recurringFailedAreas(priorRetros, currentRetro, n = 3) {
  const retros = [currentRetro, ...priorRetros].slice(0, n);
  if (retros.length < n) return [];
  const areasByRetro = retros.map((r) => new Set(r.failed.map((x) => x.area)));
  return [...areasByRetro[0]].filter((area) =>
    areasByRetro.every((set) => set.has(area))
  );
}

module.exports = {
  newRetro,
  addWorked,
  addFailed,
  addUntried,
  addAmendmentProposal,
  addHeuristicRun,
  addNote,
  summary,
  recurringFailedAreas,
  topAreas,
};
