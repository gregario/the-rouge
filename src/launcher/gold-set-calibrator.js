/**
 * Gold-set calibrator for the product-quality rubric (P1.18).
 *
 * Reads human-labeled gold-set entries from library/gold-sets/product-eval/
 * plus model-produced labels for the same cycle IDs, then computes
 * quadratic-weighted Cohen's Kappa per rubric dimension. If every dimension
 * meets the minimum Kappa threshold AND enough entries exist, the calibration
 * passes; otherwise it fails with specifics.
 *
 * This is the instrument that gates prompt changes to the judgment layer.
 * Without it, "I edited 02e and tests still pass" is not the same as
 * "the judge still agrees with human reviewers." A prompt edit that
 * quietly shifts the judge's verdict distribution would go undetected.
 *
 * Scope of v1:
 *   - Pure computation. Given (human_labels, model_labels) pairs, returns
 *     per-dimension Kappa + pass/fail + reasons.
 *   - No orchestration of model runs. Caller produces model_labels out-of-band
 *     (a real cycle run or a regression fixture) and passes them to the CLI.
 *   - Single labeler per entry. Inter-rater reliability across multiple
 *     labelers is v2.
 *   - Weighted Kappa with equal dimension weights. Per-profile weighting
 *     (e.g. interaction_fidelity more critical for a game than vision_fit)
 *     is v2.
 *   - Single-sample judge output. Judge-temperature variance is not
 *     captured here; stabilizing via multi-sample is v2.
 *
 * Gameability note: gold-sets are blocklisted from self-improve
 * (rouge.config.json → library/gold-sets/**). A pipeline-authored edit to
 * gold labels could quietly retune them to match drifting model output,
 * which would make Kappa meaningless. The blocklist is the primary defense;
 * this module assumes gold-set edits are human-authored PRs.
 */

const path = require('node:path');
const fs = require('node:fs');

const { validate } = require('./schema-validator.js');

const RUBRIC_DIMENSIONS = Object.freeze([
  'journey_completeness',
  'interaction_fidelity',
  'visual_coherence',
  'content_grounding',
  'edge_resilience',
  'vision_fit',
]);

const SCORE_MIN = 0;
const SCORE_MAX = 3;
const VERDICT_ENUM = Object.freeze(['PRODUCTION_READY', 'NEEDS_IMPROVEMENT', 'NOT_READY']);

const DEFAULT_MIN_KAPPA = 0.75;
const DEFAULT_MIN_ENTRIES = 20;
const GOLD_SET_SCHEMA = 'gold-set-entry-v1.json';

/**
 * Quadratic-weighted Cohen's Kappa for paired ordinal ratings.
 *
 * Returns { kappa, n, rowSums, colSums, reason? }.
 *
 * Kappa is null when:
 *   - No pairs are provided (reason: 'no-pairs').
 *   - All ratings collapse onto a single category on either axis — a common
 *     failure mode when everyone scores 3 (reason: 'distribution-collapse').
 *     This is distinct from "perfect agreement at 3" — both cases have
 *     sum(weights * observed) = 0, so Kappa is 0/0. We report null rather
 *     than a misleading number; a collapsed dimension can't be calibrated
 *     and shouldn't pass the gate.
 *
 * @param {Array<[number, number]>} pairs — each [humanScore, modelScore], integers 0..3.
 * @returns {{kappa: number|null, n: number, rowSums?: number[], colSums?: number[], reason?: string}}
 */
function computeQuadraticWeightedKappa(pairs) {
  const n = pairs.length;
  if (n === 0) return { kappa: null, n, reason: 'no-pairs' };

  const K = SCORE_MAX - SCORE_MIN + 1;
  const observed = Array.from({ length: K }, () => Array(K).fill(0));
  for (let i = 0; i < n; i++) {
    const [h, m] = pairs[i];
    if (!Number.isInteger(h) || h < SCORE_MIN || h > SCORE_MAX) {
      throw new Error(
        `invalid human score at index ${i}: ${h} (must be integer ${SCORE_MIN}..${SCORE_MAX})`
      );
    }
    if (!Number.isInteger(m) || m < SCORE_MIN || m > SCORE_MAX) {
      throw new Error(
        `invalid model score at index ${i}: ${m} (must be integer ${SCORE_MIN}..${SCORE_MAX})`
      );
    }
    observed[h - SCORE_MIN][m - SCORE_MIN]++;
  }

  const rowSums = observed.map((row) => row.reduce((a, b) => a + b, 0));
  const colSums = Array.from({ length: K }, (_, j) =>
    observed.reduce((sum, row) => sum + row[j], 0)
  );

  const nonEmptyRows = rowSums.filter((s) => s > 0).length;
  const nonEmptyCols = colSums.filter((s) => s > 0).length;
  if (nonEmptyRows < 2 || nonEmptyCols < 2) {
    return { kappa: null, n, rowSums, colSums, reason: 'distribution-collapse' };
  }

  const maxDist = K - 1;
  let observedDisagreement = 0;
  let expectedDisagreement = 0;
  for (let i = 0; i < K; i++) {
    for (let j = 0; j < K; j++) {
      const w = ((i - j) ** 2) / (maxDist ** 2);
      observedDisagreement += w * observed[i][j];
      expectedDisagreement += (w * rowSums[i] * colSums[j]) / n;
    }
  }

  if (expectedDisagreement === 0) {
    // Defensive — shouldn't reach given non-empty-axis check, but guard
    // against floating-point edge cases and future K changes.
    return { kappa: null, n, rowSums, colSums, reason: 'expected-disagreement-zero' };
  }

  const kappa = 1 - observedDisagreement / expectedDisagreement;
  return { kappa, n, rowSums, colSums };
}

/**
 * Per-dimension Kappa for the product-quality rubric.
 * Null values in either human or model labels are treated as abstain and
 * excluded from that dimension's pair set.
 *
 * @param {Array<{humanLabels: Object, modelLabels: Object}>} pairedEntries
 * @returns {Object<string, {kappa: number|null, n: number, reason?: string}>}
 */
function computePerDimensionKappa(pairedEntries) {
  const out = {};
  for (const dim of RUBRIC_DIMENSIONS) {
    const pairs = [];
    for (const e of pairedEntries) {
      const h = e.humanLabels ? e.humanLabels[dim] : null;
      const m = e.modelLabels ? e.modelLabels[dim] : null;
      if (h === null || h === undefined) continue;
      if (m === null || m === undefined) continue;
      pairs.push([h, m]);
    }
    out[dim] = computeQuadraticWeightedKappa(pairs);
  }
  return out;
}

/**
 * Unweighted agreement rate on the overall verdict. Complements per-dimension
 * Kappa — catches the case where dimensions agree numerically but the
 * aggregated verdict drifts (e.g. rubric aggregation rule changes).
 */
function computeVerdictAgreement(pairedEntries) {
  const valid = pairedEntries.filter(
    (e) => VERDICT_ENUM.includes(e.humanVerdict) && VERDICT_ENUM.includes(e.modelVerdict)
  );
  if (valid.length === 0) return { agreement: null, matches: 0, n: 0, reason: 'no-pairs' };
  const matches = valid.filter((e) => e.humanVerdict === e.modelVerdict).length;
  return { agreement: matches / valid.length, matches, n: valid.length };
}

/**
 * Evaluate a batch of paired entries against the calibration gate.
 *
 * Pass conditions:
 *   - At least `minEntries` paired entries.
 *   - Every dimension has Kappa ≥ minKappa.
 *   - No dimension is collapsed (null Kappa). A collapsed dimension
 *     means the gold set doesn't discriminate for that axis — either the
 *     labeler gave everything the same score or model output collapsed.
 *     Either way the gate can't say the judge is accurate on that axis,
 *     so the gate fails.
 *
 * @param {Array<{id?: string, humanLabels: Object, modelLabels: Object, humanVerdict: string, modelVerdict: string}>} pairedEntries
 * @param {{minKappa?: number, minEntries?: number}} [options]
 */
function evaluateCalibration(pairedEntries, options = {}) {
  const minKappa = options.minKappa ?? DEFAULT_MIN_KAPPA;
  const minEntries = options.minEntries ?? DEFAULT_MIN_ENTRIES;

  if (pairedEntries.length < minEntries) {
    return {
      passed: false,
      insufficientData: true,
      n: pairedEntries.length,
      minEntries,
      minKappa,
      reason: `need at least ${minEntries} paired entries; have ${pairedEntries.length}`,
    };
  }

  const perDimension = computePerDimensionKappa(pairedEntries);
  const verdictAgreement = computeVerdictAgreement(pairedEntries);

  const failedDimensions = [];
  const collapsedDimensions = [];
  for (const [dim, result] of Object.entries(perDimension)) {
    if (result.kappa === null) {
      collapsedDimensions.push({ dim, reason: result.reason });
      continue;
    }
    if (result.kappa < minKappa) {
      failedDimensions.push({ dim, kappa: result.kappa });
    }
  }

  const passed = failedDimensions.length === 0 && collapsedDimensions.length === 0;

  return {
    passed,
    insufficientData: false,
    n: pairedEntries.length,
    minEntries,
    minKappa,
    perDimension,
    verdictAgreement,
    failedDimensions,
    collapsedDimensions,
  };
}

/**
 * Pure-JS shape check on a gold-set entry (no AJV dependency).
 * Returns { valid: boolean, reason?: string }.
 * The shared schema-validator performs a deeper JSON-schema check when
 * ajv is installed; this function is the non-optional floor.
 */
function validateGoldSetEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return { valid: false, reason: 'entry is not an object' };
  }
  if (entry.schema_version !== 'gold-set-entry-v1') {
    return {
      valid: false,
      reason: `schema_version must be 'gold-set-entry-v1' (got ${JSON.stringify(entry.schema_version)})`,
    };
  }
  if (typeof entry.id !== 'string' || entry.id.length === 0) {
    return { valid: false, reason: 'missing or empty id' };
  }
  if (entry.rubric_id !== 'product-quality') {
    return {
      valid: false,
      reason: `rubric_id must be 'product-quality' (got ${JSON.stringify(entry.rubric_id)})`,
    };
  }
  if (!Number.isInteger(entry.rubric_version) || entry.rubric_version < 1) {
    return { valid: false, reason: 'rubric_version must be a positive integer' };
  }
  if (!VERDICT_ENUM.includes(entry.human_verdict)) {
    return { valid: false, reason: `human_verdict must be one of ${VERDICT_ENUM.join('|')}` };
  }
  if (!entry.human_labels || typeof entry.human_labels !== 'object') {
    return { valid: false, reason: 'missing human_labels object' };
  }
  for (const dim of RUBRIC_DIMENSIONS) {
    if (!(dim in entry.human_labels)) {
      return {
        valid: false,
        reason: `human_labels.${dim} must be present (use null to abstain)`,
      };
    }
    const v = entry.human_labels[dim];
    if (v === null) continue;
    if (!Number.isInteger(v) || v < SCORE_MIN || v > SCORE_MAX) {
      return {
        valid: false,
        reason: `human_labels.${dim} must be integer ${SCORE_MIN}..${SCORE_MAX} or null (got ${JSON.stringify(v)})`,
      };
    }
  }
  if (typeof entry.labeler !== 'string' || entry.labeler.length === 0) {
    return { valid: false, reason: 'missing labeler' };
  }
  if (!entry.source || typeof entry.source !== 'object') {
    return { valid: false, reason: 'missing source object' };
  }
  for (const f of ['project', 'cycle_id', 'captured_at']) {
    if (typeof entry.source[f] !== 'string' || entry.source[f].length === 0) {
      return { valid: false, reason: `missing source.${f}` };
    }
  }
  return { valid: true };
}

/**
 * Load every *.json entry from a gold-set directory.
 *
 * Non-JSON files and README.md are ignored. Invalid entries are collected
 * in `errors` with the file path and reason — callers decide whether to
 * abort or warn. Schema validation is two-pass: local shape check (always)
 * plus deep schema-validator check (when ajv is available).
 *
 * Returns { entries, errors, skipped }.
 */
function loadGoldSet(dir) {
  const entries = [];
  const errors = [];
  const skipped = [];

  if (!fs.existsSync(dir)) {
    return { entries, errors, skipped, reason: 'directory-not-found', dir };
  }
  const stat = fs.statSync(dir);
  if (!stat.isDirectory()) {
    return { entries, errors, skipped, reason: 'not-a-directory', dir };
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();

  for (const file of files) {
    const filePath = path.join(dir, file);
    let raw;
    try {
      raw = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      errors.push({ file: filePath, reason: `read failed: ${err.message}` });
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      errors.push({ file: filePath, reason: `invalid JSON: ${err.message}` });
      continue;
    }
    const localCheck = validateGoldSetEntry(parsed);
    if (!localCheck.valid) {
      errors.push({ file: filePath, reason: localCheck.reason });
      continue;
    }
    const deepCheck = validate(GOLD_SET_SCHEMA, parsed, `gold-set:${file}`);
    if (!deepCheck.valid) {
      errors.push({ file: filePath, reason: `schema: ${deepCheck.errors.join('; ')}` });
      continue;
    }
    entries.push({ ...parsed, __file: filePath });
  }

  return { entries, errors, skipped };
}

/**
 * Pair gold-set entries with model-produced labels by id.
 *
 * @param {Array<Object>} goldEntries
 * @param {Object<string, {labels: Object, verdict: string}>} modelLabelsById
 * @returns {{paired: Array, unmatchedGold: string[], unmatchedModel: string[]}}
 */
function pairEntries(goldEntries, modelLabelsById) {
  const paired = [];
  const unmatchedGold = [];
  const seenModel = new Set();
  for (const gold of goldEntries) {
    const model = modelLabelsById[gold.id];
    if (!model) {
      unmatchedGold.push(gold.id);
      continue;
    }
    seenModel.add(gold.id);
    paired.push({
      id: gold.id,
      humanLabels: gold.human_labels,
      modelLabels: model.labels || {},
      humanVerdict: gold.human_verdict,
      modelVerdict: model.verdict,
    });
  }
  const unmatchedModel = Object.keys(modelLabelsById).filter((id) => !seenModel.has(id));
  return { paired, unmatchedGold, unmatchedModel };
}

module.exports = {
  RUBRIC_DIMENSIONS,
  VERDICT_ENUM,
  SCORE_MIN,
  SCORE_MAX,
  DEFAULT_MIN_KAPPA,
  DEFAULT_MIN_ENTRIES,
  GOLD_SET_SCHEMA,
  computeQuadraticWeightedKappa,
  computePerDimensionKappa,
  computeVerdictAgreement,
  evaluateCalibration,
  validateGoldSetEntry,
  loadGoldSet,
  pairEntries,
};
