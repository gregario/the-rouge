/**
 * audit-recommender.js
 *
 * Detects when Rouge has entered "whack-a-mole fix mode" — 3+ consecutive
 * cycles dominated by fix work without new feature completion, OR 3+
 * consecutive cycles surfacing the same root-cause category in analyzer
 * output. When the signal fires, Rouge should stop patching and do a
 * systematic audit (the owner's "no partial solutions / research before
 * solving" discipline, codified).
 *
 * Pure function. Reads from an array of cycle records — typically the
 * journey entries from journey.json or previous_cycles[] in cycle_context.
 * Never reads/writes disk.
 *
 * Invoked from post-retrospective-hook after amendment queuing. If
 * recommended, caller writes a governance event and surfaces the
 * recommendation in cycle_context for the next analyzer phase to consume.
 */

'use strict';

const DEFAULT_WINDOW = 3;
const DEFAULT_FIX_RATIO_THRESHOLD = 0.70;

/**
 * Compute fix-to-feature ratio for a cycle record.
 * Supports two shapes:
 *   1. journey_entry.commit_breakdown = { feature, fix, refactor, ... }
 *   2. retro_metrics.commit_breakdown = same shape
 * Returns null if not enough data to compute.
 */
function cycleFixRatio(cycle) {
  const breakdown =
    (cycle && cycle.commit_breakdown) ||
    (cycle && cycle.retro_metrics && cycle.retro_metrics.commit_breakdown) ||
    null;
  if (!breakdown || typeof breakdown !== 'object') return null;
  const fix = Number(breakdown.fix || 0);
  const feature = Number(breakdown.feature || 0);
  const total = fix + feature;
  if (total === 0) return null;
  return fix / total;
}

/**
 * Extract the dominant root_cause for a cycle (if the cycle's analyzer
 * output is recorded). Looks at structured_retro.failed[].root_cause
 * first, then analysis_recommendation.root_cause as fallback.
 */
function cycleRootCause(cycle) {
  if (!cycle) return null;
  const failed = (cycle.structured_retro && Array.isArray(cycle.structured_retro.failed))
    ? cycle.structured_retro.failed
    : [];
  if (failed.length > 0) {
    // Most common root_cause across failed items
    const counts = {};
    for (const f of failed) {
      if (f && f.root_cause) counts[f.root_cause] = (counts[f.root_cause] || 0) + 1;
    }
    const top = Object.entries(counts).sort(([, a], [, b]) => b - a)[0];
    if (top) return top[0];
  }
  if (cycle.analysis_recommendation && cycle.analysis_recommendation.root_cause) {
    return String(cycle.analysis_recommendation.root_cause);
  }
  return null;
}

/**
 * Main recommender.
 *
 * @param {object[]} cycles - array of cycle records, most recent LAST
 *   (so cycles[cycles.length - 1] is the current cycle)
 * @param {object} [opts]
 *   - window: how many recent cycles to consider (default 3)
 *   - fixRatioThreshold: fix ratio above which signals "fix-mode" (default 0.70)
 * @returns {{
 *   recommended: boolean,
 *   reason: string,
 *   signals: string[],
 *   evidence: object
 * }}
 */
function recommendAudit(cycles, opts = {}) {
  const window = opts.window || DEFAULT_WINDOW;
  const fixThreshold = opts.fixRatioThreshold ?? DEFAULT_FIX_RATIO_THRESHOLD;

  if (!Array.isArray(cycles)) {
    return { recommended: false, reason: 'cycles must be an array', signals: [], evidence: {} };
  }
  if (cycles.length < window) {
    return {
      recommended: false,
      reason: `insufficient history: ${cycles.length} cycles, need ${window}`,
      signals: [],
      evidence: { window, available: cycles.length },
    };
  }

  const recent = cycles.slice(-window);
  const signals = [];
  const evidence = { window, cycles_considered: recent.length };

  // Signal 1: sustained high fix-to-feature ratio
  const ratios = recent.map(cycleFixRatio);
  const validRatios = ratios.filter((r) => r !== null);
  evidence.fix_ratios = ratios;
  if (validRatios.length === window && validRatios.every((r) => r >= fixThreshold)) {
    signals.push(
      `fix-to-feature ratio ≥ ${fixThreshold.toFixed(2)} across last ${window} cycles ` +
      `(observed: ${validRatios.map((r) => r.toFixed(2)).join(', ')})`
    );
  }

  // Signal 2: same root_cause recurring across all recent cycles
  const causes = recent.map(cycleRootCause);
  evidence.root_causes = causes;
  const nonNullCauses = causes.filter((c) => c !== null);
  if (nonNullCauses.length === window) {
    const first = nonNullCauses[0];
    if (nonNullCauses.every((c) => c === first)) {
      signals.push(
        `same root_cause '${first}' observed in last ${window} cycles — ` +
        `fixes aren't reaching the real issue`
      );
    }
  }

  // Signal 3: escalations rising without quality gain
  const escalations = recent.map((c) => Number((c && c.escalations) || 0));
  evidence.escalations = escalations;
  if (escalations.length === window && escalations.every((e) => e > 0)) {
    signals.push(`escalations in every recent cycle (${escalations.join(', ')}) — process may be broken`);
  }

  const recommended = signals.length >= 1;
  const reason = recommended
    ? `audit recommended: ${signals.length} signal(s) fired`
    : 'no audit signals fired';

  return { recommended, reason, signals, evidence };
}

module.exports = {
  recommendAudit,
  cycleFixRatio,
  cycleRootCause,
  DEFAULT_WINDOW,
  DEFAULT_FIX_RATIO_THRESHOLD,
};
