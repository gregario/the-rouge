/**
 * Semantic-spin detection.
 *
 * Records a fingerprint of each evaluator report into
 * `<projectDir>/phase-fingerprints.jsonl` and detects when the last N
 * fingerprints for a phase are identical — the pattern that caused
 * stack-rank's 94-cycle foundation-eval spiral and testimonial's 87×
 * milestone-check/fix loop.
 *
 * Consumed by:
 *   - rouge-loop.js after foundation-eval / milestone-check produce
 *     their reports — passes the report through `recordAndCheck` and
 *     acts on the returned `isSpin` flag.
 *   - Wave-3 triage classifier, which reads the recent fingerprint
 *     history to decide whether a stuck loop is a self-heal candidate
 *     (identical findings → Rouge-code issue), a human-judgment case
 *     (drifting findings → real taste call), or something else.
 *
 * Why a dedicated JSONL rather than reusing checkpoints.jsonl:
 * checkpoints snapshot state, not cycle_context. The findings live in
 * cycle_context and are overwritten each phase, so we'd lose them
 * after the first write. The fingerprint file is append-only history.
 */

const fs = require('fs');
const path = require('path');
const { fingerprintReport, hasIdenticalTail } = require('./findings-fingerprint.js');

const FILE_NAME = 'phase-fingerprints.jsonl';
const DEFAULT_SPIN_THRESHOLD = 3;

function filePath(projectDir) {
  return path.join(projectDir, FILE_NAME);
}

/**
 * Append a fingerprint record for a phase.
 *
 * @param {string} projectDir
 * @param {string} phase — phase name (e.g. 'foundation-eval', 'milestone-check').
 * @param {object|null} report — the evaluator report object from cycle_context.
 * @param {object} [meta] — extra fields stored with the entry for later triage
 *   (verdict, confidence, finding counts — anything non-sensitive that helps
 *   a human skim the history).
 * @returns {string} the fingerprint (empty string if the report was null).
 */
function recordFingerprint(projectDir, phase, report, meta) {
  const fp = fingerprintReport(report);
  const entry = {
    phase,
    ts: new Date().toISOString(),
    fingerprint: fp,
    verdict: (report && report.verdict) ? String(report.verdict).toUpperCase() : null,
    ...(meta || {}),
  };
  try {
    fs.appendFileSync(filePath(projectDir), JSON.stringify(entry) + '\n');
  } catch {
    // Non-fatal — fingerprint history is advisory. If we can't write it,
    // the spin detector degrades to "never detects," which is strictly
    // safer than crashing the phase.
  }
  return fp;
}

/**
 * Read the fingerprint file and return the last N entries for a phase.
 */
function readRecent(projectDir, phase, n) {
  const p = filePath(projectDir);
  if (!fs.existsSync(p)) return [];
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const forPhase = [];
    // Walk from the end backwards to bound the read; cheaper than
    // parsing the whole file when history is long.
    for (let i = lines.length - 1; i >= 0 && forPhase.length < n; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.phase === phase) forPhase.unshift(entry);
      } catch {
        // skip malformed lines
      }
    }
    return forPhase;
  } catch {
    return [];
  }
}

/**
 * True if the last N fingerprints for this phase are identical
 * (and non-empty — an empty fingerprint is our sentinel for "no
 * report," which shouldn't count as spin).
 */
function detectSpin(projectDir, phase, threshold) {
  const n = threshold || DEFAULT_SPIN_THRESHOLD;
  const recent = readRecent(projectDir, phase, n);
  if (recent.length < n) return false;
  const fps = recent.map((e) => e.fingerprint);
  return hasIdenticalTail(fps, n);
}

/**
 * One-shot: append the fingerprint AND return whether this was the
 * N-th identical tail. Returned object includes:
 *
 * - `fingerprint` — the hash that was just recorded
 * - `isSpin` — true iff the last N entries for this phase are identical
 * - `recent` — the last N entries (including the one just written),
 *   useful for synthesising the escalation message with the phase's
 *   verdict and findings.
 */
function recordAndCheck(projectDir, phase, report, opts) {
  const meta = (opts && opts.meta) || {};
  const threshold = (opts && opts.threshold) || DEFAULT_SPIN_THRESHOLD;
  const fingerprint = recordFingerprint(projectDir, phase, report, meta);
  const recent = readRecent(projectDir, phase, threshold);
  const fps = recent.map((e) => e.fingerprint);
  const isSpin = hasIdenticalTail(fps, threshold);
  return { fingerprint, isSpin, recent };
}

module.exports = {
  recordFingerprint,
  readRecent,
  detectSpin,
  recordAndCheck,
  DEFAULT_SPIN_THRESHOLD,
};
