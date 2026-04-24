/**
 * Project sizer (P1.5R).
 *
 * Pure classifier. Maps observable signals from BRAINSTORM output to a
 * categorical project_size tier (XS / S / M / L / XL). Used by the SIZING
 * seeding sub-phase (PR 3) to write `seed_spec/sizing.json`, which every
 * downstream phase reads to right-size its behavior.
 *
 * Rationale and per-tier pipeline shape live in
 * `docs/design/adaptive-depth-dial.md`. This module is only the
 * number-to-tier mapping.
 *
 * Classification algorithm:
 *   1. Each signal (entity_count, integration_count, role_count,
 *      journey_count, screen_count) maps to a tier band independently.
 *   2. The project's tier is the MAX tier across all signals — if any
 *      one signal lands in L, the project is at least L. The failure
 *      mode we're guarding against is under-specking a complex project;
 *      a single high signal is a stronger signal than several low ones.
 *   3. The reasoning string records which signals drove the verdict.
 *
 * Classifier v1 boundaries are deliberately rough. Mis-classification
 * at boundaries is expected; the design doc calls for logging
 * (tier-at-start, tier-at-ship) pairs to governance so the boundaries
 * can be tightened empirically.
 */

'use strict';

const { getDefaults: getTierDefaults } = require('./tier-defaults.js');

const TIERS = Object.freeze(['XS', 'S', 'M', 'L', 'XL']);
const TIER_INDEX = Object.fromEntries(TIERS.map((t, i) => [t, i]));

const CLASSIFIER_VERSION = 'v1';

/**
 * Upper-bound boundaries per signal. `value <= boundaries[i]` maps to
 * tier `TIERS[i]`. If value exceeds every boundary, tier is XL.
 *
 * These boundaries are a starting point — see the comment at the top of
 * the file about empirical recalibration.
 */
const BOUNDARIES = Object.freeze({
  entity_count:      [1, 3, 6, 12],   // XS 0-1, S 2-3, M 4-6, L 7-12, XL 13+
  integration_count: [0, 2, 5, 10],   // XS 0,   S 1-2, M 3-5, L 6-10, XL 11+
  role_count:        [1, 2, 3, 5],    // XS 0-1, S 2,   M 3,   L 4-5,  XL 6+
  journey_count:     [2, 3, 6, 10],   // XS 0-2, S 3,   M 4-6, L 7-10, XL 11+
  screen_count:      [2, 4, 10, 20],  // XS 0-2, S 3-4, M 5-10, L 11-20, XL 21+
});

const REQUIRED_SIGNALS = Object.keys(BOUNDARIES);

/**
 * Return the tier for a single signal value.
 *
 * @param {string} signalName — one of REQUIRED_SIGNALS.
 * @param {number} value — non-negative integer.
 * @returns {'XS'|'S'|'M'|'L'|'XL'}
 */
function tierForSignal(signalName, value) {
  const bounds = BOUNDARIES[signalName];
  if (!bounds) throw new Error(`unknown signal: ${signalName}`);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${signalName} must be a non-negative integer; got ${JSON.stringify(value)}`);
  }
  for (let i = 0; i < bounds.length; i++) {
    if (value <= bounds[i]) return TIERS[i];
  }
  return 'XL';
}

/**
 * Return the higher of two tier strings.
 */
function maxTier(a, b) {
  return TIER_INDEX[a] >= TIER_INDEX[b] ? a : b;
}

/**
 * Classify a set of signals into a project tier.
 *
 * @param {Object} signals — must contain all of REQUIRED_SIGNALS as non-negative integers.
 * @returns {Object} sizing artifact matching schemas/sizing-v1.json.
 * @throws {Error} if any required signal is missing or invalid.
 */
function classify(signals) {
  if (!signals || typeof signals !== 'object' || Array.isArray(signals)) {
    throw new Error('signals must be an object');
  }

  const perSignal = {};
  let pickedTier = 'XS';
  for (const name of REQUIRED_SIGNALS) {
    if (!(name in signals)) {
      throw new Error(`missing required signal: ${name}`);
    }
    const tier = tierForSignal(name, signals[name]);
    perSignal[name] = tier;
    pickedTier = maxTier(pickedTier, tier);
  }

  // Reasoning: which signals drove the verdict (== pickedTier) and which
  // sat below. Readers use this to decide whether the picked tier looks
  // justified or if an override is warranted.
  const drivers = REQUIRED_SIGNALS.filter((n) => perSignal[n] === pickedTier);
  const lower = REQUIRED_SIGNALS.filter((n) => perSignal[n] !== pickedTier);

  const driverText = drivers
    .map((n) => `${n}=${signals[n]} (${perSignal[n]})`)
    .join(', ');
  const lowerText = lower.length === 0
    ? 'all signals align at this tier.'
    : `lower signals: ${lower.map((n) => `${n}=${signals[n]} (${perSignal[n]})`).join(', ')}.`;

  const reasoning = `Classified ${pickedTier}: driven by ${driverText}. ${lowerText}`;

  return {
    schema_version: 'sizing-v1',
    project_size: pickedTier,
    signals: pickSignals(signals),
    reasoning,
    classifier_version: CLASSIFIER_VERSION,
    decided_at: new Date().toISOString(),
    decided_by: 'classifier',
    human_override: null,
    grew_from: [],
    defaults: getTierDefaults(pickedTier),
  };
}

function pickSignals(signals) {
  const out = {};
  for (const name of REQUIRED_SIGNALS) out[name] = signals[name];
  return out;
}

/**
 * Apply a human override to a classifier result. Returns a new artifact
 * with decided_by='human-override' and human_override populated.
 *
 * @param {Object} classifierArtifact — result of classify().
 * @param {'XS'|'S'|'M'|'L'|'XL'} humanTier — what the human picked.
 * @param {string} humanReasoning — why.
 */
function applyHumanOverride(classifierArtifact, humanTier, humanReasoning) {
  if (!TIERS.includes(humanTier)) {
    throw new Error(`humanTier must be one of ${TIERS.join('|')}; got ${humanTier}`);
  }
  if (typeof humanReasoning !== 'string' || humanReasoning.length === 0) {
    throw new Error('humanReasoning is required');
  }
  return {
    ...classifierArtifact,
    project_size: humanTier,
    decided_by: 'human-override',
    human_override: {
      classifier_would_pick: classifierArtifact.project_size,
      human_reasoning: humanReasoning,
    },
    defaults: getTierDefaults(humanTier),
  };
}

/**
 * Record a mid-project tier upgrade. Dial grows, never shrinks (design
 * doc Q2). Returns a new artifact with `grew_from[]` appended and
 * project_size bumped.
 *
 * @param {Object} prior — current sizing artifact.
 * @param {'XS'|'S'|'M'|'L'|'XL'} newTier — the upgraded tier.
 * @param {string} reason — why the loop triggered the upgrade.
 */
function growTier(prior, newTier, reason) {
  if (!TIERS.includes(newTier)) {
    throw new Error(`newTier must be one of ${TIERS.join('|')}; got ${newTier}`);
  }
  if (TIER_INDEX[newTier] <= TIER_INDEX[prior.project_size]) {
    throw new Error(
      `growTier can only move upward; prior=${prior.project_size}, new=${newTier}`
    );
  }
  if (typeof reason !== 'string' || reason.length === 0) {
    throw new Error('reason is required for growTier');
  }
  return {
    ...prior,
    project_size: newTier,
    grew_from: [
      ...(prior.grew_from || []),
      { from: prior.project_size, to: newTier, at: new Date().toISOString(), reason },
    ],
    defaults: getTierDefaults(newTier),
  };
}

/**
 * Parse a `## Classifier Signals` block out of a BRAINSTORM markdown
 * artifact. The block must contain lines like `- entity_count: 5` or
 * `entity_count: 5` for every signal in REQUIRED_SIGNALS.
 *
 * @param {string} markdown — BRAINSTORM output.
 * @returns {Object|null} parsed signals, or null if no block found.
 */
function parseClassifierSignals(markdown) {
  if (typeof markdown !== 'string') return null;
  const headerRe = /^##+\s*Classifier Signals\s*$/im;
  const headerMatch = headerRe.exec(markdown);
  if (!headerMatch) return null;

  // Slice everything after the header up to the next `##` or end.
  const after = markdown.slice(headerMatch.index + headerMatch[0].length);
  const endRe = /^##\s/m;
  const endMatch = endRe.exec(after);
  const block = endMatch ? after.slice(0, endMatch.index) : after;

  const signals = {};
  const lineRe = /^[\s\-*]*([a-z_]+)\s*:\s*(\d+)\s*$/gim;
  let m;
  while ((m = lineRe.exec(block)) !== null) {
    const key = m[1];
    const value = Number.parseInt(m[2], 10);
    if (REQUIRED_SIGNALS.includes(key)) {
      signals[key] = value;
    }
  }

  const missing = REQUIRED_SIGNALS.filter((s) => !(s in signals));
  if (missing.length > 0) {
    return { partial: true, signals, missing };
  }
  return { partial: false, signals, missing: [] };
}

module.exports = {
  TIERS,
  REQUIRED_SIGNALS,
  BOUNDARIES,
  CLASSIFIER_VERSION,
  tierForSignal,
  maxTier,
  classify,
  applyHumanOverride,
  growTier,
  parseClassifierSignals,
};
