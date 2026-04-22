/**
 * Deterministic fingerprint of evaluator findings.
 *
 * Purpose: detect semantic spin — the pattern where a phase produces
 * the same bad verdict for N consecutive cycles with no progress
 * between them. Wave-2's triage classifier compares consecutive
 * fingerprints per phase; N identical → route to self-heal / escalate.
 *
 * Design: fingerprint is computed at the launcher (not in the prompt),
 * so prompts stay focused on their domain and don't need to know about
 * the spin-detection mechanism. The launcher reads the report out of
 * cycle_context.json and passes it through `fingerprintReport`.
 *
 * What gets hashed:
 *   - `verdict` (PASS / FAIL / NEEDS_IMPROVEMENT / etc.)
 *   - `dimensions.*.status` — the per-dimension verdict breakdown
 *   - `structural_gaps[]`, `integration_gaps[]`, `findings[]` — the
 *     content of what's wrong, sorted for stability
 *   - Confidence score, if present, rounded to 2 decimals (tiny
 *     numeric drift shouldn't split the fingerprint)
 *
 * What gets ignored:
 *   - Timestamps, session IDs, phase names, any transient metadata
 *   - Key order (canonical JSON)
 *   - Whitespace in finding strings (collapsed to single spaces)
 *   - Case in verdict/status strings (upper-cased)
 *
 * The goal is "same finding tomorrow as today" → same hash.
 */

const crypto = require('crypto');

function normaliseString(s) {
  if (typeof s !== 'string') return String(s);
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

function normaliseFindingList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      if (typeof item === 'string') return normaliseString(item);
      if (item && typeof item === 'object') {
        // Normalise the whole object into sorted-key JSON so field
        // order and insignificant whitespace don't shift the hash.
        return canonicalise(item);
      }
      return String(item);
    })
    .sort();
}

function canonicalise(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalise);
  const keys = Object.keys(value).sort();
  const out = {};
  for (const k of keys) out[k] = canonicalise(value[k]);
  return out;
}

function normaliseDimensions(dimensions) {
  if (!dimensions || typeof dimensions !== 'object') return {};
  const out = {};
  for (const k of Object.keys(dimensions).sort()) {
    const dim = dimensions[k];
    if (!dim || typeof dim !== 'object') {
      out[k] = { status: String(dim).toUpperCase() };
      continue;
    }
    out[k] = {
      status: (dim.status ? String(dim.status) : '').toUpperCase(),
      // Include findings per dimension so a dimension swap shifts the
      // fingerprint even if the overall verdict doesn't.
      findings: normaliseFindingList(dim.findings),
    };
  }
  return out;
}

function roundConfidence(score) {
  if (typeof score !== 'number' || Number.isNaN(score)) return null;
  return Math.round(score * 100) / 100;
}

/**
 * Compute the fingerprint of an evaluator report. Stable across
 * runs that produce semantically identical findings.
 *
 * @param {object|null|undefined} report — an eval report object
 *   (foundation_eval_report, milestone_check_report, po_review_report,
 *   evaluation_report, or any shape with `verdict` + findings fields).
 * @returns {string} hex-encoded SHA-256 of the normalised payload,
 *   or an empty string if the report is null/undefined.
 */
function fingerprintReport(report) {
  if (report == null) return '';
  const payload = {
    verdict: (report.verdict ? String(report.verdict) : '').toUpperCase(),
    dimensions: normaliseDimensions(report.dimensions),
    structural_gaps: normaliseFindingList(report.structural_gaps),
    integration_gaps: normaliseFindingList(report.integration_gaps),
    findings: normaliseFindingList(report.findings),
    recommendations: normaliseFindingList(report.recommendations),
    confidence: roundConfidence(report.confidence ?? report.confidence_score),
    // Silent-degradation is its own dimension on foundation-eval and
    // load-bearing for whether the verdict should have been FAIL.
    silent_degradation: report.silent_degradation_check
      ? {
          status: (report.silent_degradation_check.status || '').toUpperCase(),
          evidence: normaliseFindingList(report.silent_degradation_check.evidence),
        }
      : null,
  };
  const canonical = JSON.stringify(canonicalise(payload));
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Given a sequence of fingerprints (most recent first or last — either
 * order works), return true iff the last N entries are identical.
 * Used by the spin detector to decide "this verdict hasn't moved in N
 * cycles; escalate."
 */
function hasIdenticalTail(fingerprints, n) {
  if (!Array.isArray(fingerprints) || fingerprints.length < n) return false;
  const tail = fingerprints.slice(-n);
  const first = tail[0];
  if (!first) return false;
  return tail.every((f) => f === first);
}

module.exports = { fingerprintReport, hasIdenticalTail };
