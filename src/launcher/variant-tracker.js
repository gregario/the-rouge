/**
 * variant-tracker.js
 *
 * Baseline-vs-amended variant tracking for library heuristics.
 * Borrowed in pattern from everything-claude-code's skill-improvement/evaluate.js.
 *
 * Data model (see schemas/library-entry-v2.json):
 *   - An entry represents a rule/heuristic (e.g. "LCP must be under 2000ms").
 *   - An entry has one or more variants. Exactly one variant is 'active' at any time.
 *   - 'shadow' variants are measured but don't gate; used for A/B comparison.
 *   - V1 entries (no variants[]) are normalized at load time: their top-level
 *     threshold/status becomes an implicit 'baseline' variant.
 *
 * Run history is stored in a sidecar JSONL file, one line per run:
 *   <entry_id>, <variant_id>, <outcome>, <timestamp>, <project>, <cycle>
 *
 * This module is pure and stateless except for file I/O helpers. No external
 * dependencies beyond node:fs / node:path.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const VALID_OUTCOMES = new Set(['pass', 'fail', 'env_limited']);

/**
 * Normalize a library entry so it always has a variants[] array.
 * V1 entries get an implicit 'baseline' variant synthesized from top-level fields.
 */
function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new TypeError('normalizeEntry: entry must be an object');
  }
  if (Array.isArray(raw.variants) && raw.variants.length > 0) {
    return { ...raw, version: raw.version || 2 };
  }
  // V1 → synthesize baseline variant
  const baseline = {
    variant_id: 'baseline',
    status: raw.status || 'active',
    stats: { runs: 0, passes: 0, fails: 0, env_limited: 0 },
  };
  if (raw.threshold !== undefined) baseline.threshold = raw.threshold;
  return {
    ...raw,
    version: raw.version || 1,
    variants: [baseline],
  };
}

function loadEntry(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return normalizeEntry(raw);
}

/** Return the 'active' variant, or null if none. */
function activeVariant(entry) {
  const e = normalizeEntry(entry);
  return e.variants.find((v) => v.status === 'active') || null;
}

/** Return all 'shadow' variants (measured but not enforced). */
function shadowVariants(entry) {
  const e = normalizeEntry(entry);
  return e.variants.filter((v) => v.status === 'shadow');
}

/** Return a variant by id, or null. */
function getVariant(entry, variantId) {
  const e = normalizeEntry(entry);
  return e.variants.find((v) => v.variant_id === variantId) || null;
}

/** Compute pass rate for a variant, or null if runs === 0. */
function passRate(variant) {
  if (!variant || !variant.stats) return null;
  const runs = variant.stats.runs || 0;
  if (runs === 0) return null;
  const passes = variant.stats.passes || 0;
  return passes / runs;
}

/**
 * Delta between two variants. Returns null for any insufficient data.
 *   {
 *     aPassRate, bPassRate, delta, runsA, runsB,
 *     sufficient: boolean   // true when both have >= minRuns
 *   }
 */
function computeDelta(entry, variantIdA, variantIdB, opts = {}) {
  const minRuns = opts.minRuns ?? 2;
  const a = getVariant(entry, variantIdA);
  const b = getVariant(entry, variantIdB);
  if (!a || !b) return null;
  const rA = passRate(a);
  const rB = passRate(b);
  const runsA = a.stats?.runs || 0;
  const runsB = b.stats?.runs || 0;
  return {
    aPassRate: rA,
    bPassRate: rB,
    delta: (rA !== null && rB !== null) ? rB - rA : null,
    runsA,
    runsB,
    sufficient: runsA >= minRuns && runsB >= minRuns,
  };
}

/**
 * Promotion recommendation for a shadow variant against the active.
 *   'promote-amendment' | 'keep-baseline' | 'insufficient-data'
 *
 * Logic:
 *   - Requires both variants to have >= minRuns
 *   - Requires delta > minDelta (default 0) to promote
 *   - Requires the shadow's fail rate not to exceed the active's (no regressions)
 */
function recommendation(entry, opts = {}) {
  const minRuns = opts.minRuns ?? 3;
  const minDelta = opts.minDelta ?? 0;
  const active = activeVariant(entry);
  const shadows = shadowVariants(entry);
  if (!active || shadows.length === 0) {
    return { action: 'keep-baseline', reason: 'no shadow variant to evaluate' };
  }
  // Consider only the first shadow for now (most heuristics will have one at a time).
  const shadow = shadows[0];
  const runsActive = active.stats?.runs || 0;
  const runsShadow = shadow.stats?.runs || 0;
  if (runsActive < minRuns || runsShadow < minRuns) {
    return {
      action: 'insufficient-data',
      reason: `minRuns=${minRuns}, active=${runsActive}, shadow=${runsShadow}`,
    };
  }
  const rActive = passRate(active);
  const rShadow = passRate(shadow);
  const delta = rShadow - rActive;
  const failsActive = active.stats?.fails || 0;
  const failsShadow = shadow.stats?.fails || 0;
  const failRateActive = failsActive / runsActive;
  const failRateShadow = failsShadow / runsShadow;
  if (failRateShadow > failRateActive) {
    return {
      action: 'keep-baseline',
      reason: `shadow has higher fail rate (${failRateShadow.toFixed(3)} > ${failRateActive.toFixed(3)})`,
      delta,
    };
  }
  if (delta > minDelta) {
    return {
      action: 'promote-amendment',
      reason: `shadow pass rate ${rShadow.toFixed(3)} > active ${rActive.toFixed(3)} (Δ=${delta.toFixed(3)})`,
      delta,
      shadow_variant_id: shadow.variant_id,
    };
  }
  return {
    action: 'keep-baseline',
    reason: `shadow pass rate not sufficiently better (Δ=${delta.toFixed(3)}, min=${minDelta})`,
    delta,
  };
}

/**
 * Record a run to the sidecar JSONL log and update the in-memory entry's variant stats.
 * Pure in-memory helper: caller decides where to persist the entry.
 */
function recordRun(entry, variantId, outcome, meta = {}) {
  if (!VALID_OUTCOMES.has(outcome)) {
    throw new Error(`recordRun: outcome must be one of ${[...VALID_OUTCOMES].join(', ')}`);
  }
  const e = normalizeEntry(entry);
  const v = e.variants.find((x) => x.variant_id === variantId);
  if (!v) throw new Error(`recordRun: unknown variant_id '${variantId}' for entry '${e.id}'`);
  v.stats = v.stats || { runs: 0, passes: 0, fails: 0, env_limited: 0 };
  v.stats.runs = (v.stats.runs || 0) + 1;
  if (outcome === 'pass') v.stats.passes = (v.stats.passes || 0) + 1;
  else if (outcome === 'fail') v.stats.fails = (v.stats.fails || 0) + 1;
  else v.stats.env_limited = (v.stats.env_limited || 0) + 1;
  v.stats.last_run_at = meta.timestamp || new Date().toISOString();
  return e;
}

/** Append a run to a JSONL log. Caller-provided path. */
function appendRunLog(logPath, entry) {
  const dir = path.dirname(logPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
}

module.exports = {
  normalizeEntry,
  loadEntry,
  activeVariant,
  shadowVariants,
  getVariant,
  passRate,
  computeDelta,
  recommendation,
  recordRun,
  appendRunLog,
};
