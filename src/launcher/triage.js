/**
 * Triage classifier.
 *
 * Given a stuck-loop signal (semantic spin, repeated failure, missing
 * prerequisite, etc.), decide which layer of the system owns the
 * problem and route accordingly:
 *
 *   - `self-heal-candidate` — Rouge's own code has a bug the applier
 *     can fix within green-zone bounds. Route to self-heal.
 *
 *   - `mechanical-automation-missing` — a pattern that would be
 *     automated if a catalog entry existed (auto_remediate on a
 *     prerequisite, a new health-check shape, etc.). Route to a
 *     draft-PR flow that adds the manifest entry.
 *
 *   - `human-judgment-needed` — genuine 1-bit product-taste or
 *     direction call (testimonial's PO NEEDS_IMPROVEMENT loop).
 *     Route to the standard escalation UX.
 *
 *   - `unknown` — couldn't classify. Conservative default: escalate
 *     with full context so a human can decide.
 *
 * Inputs are the signals we already have on disk:
 *   - spin-detector fingerprint history (per phase)
 *   - recent checkpoints (phase + state + costs)
 *   - state.json escalations array
 *   - build.log snippet (for schema-violation detection)
 *
 * No LLM calls. Pure rule-based classification. The rules are deliberate:
 * we want this to be auditable and testable. When a class of signal
 * becomes common enough that rules can't capture it, revisit.
 */

const fs = require('fs');
const path = require('path');

const CLASSES = Object.freeze({
  SELF_HEAL_CANDIDATE: 'self-heal-candidate',
  MECHANICAL_AUTOMATION_MISSING: 'mechanical-automation-missing',
  HUMAN_JUDGMENT_NEEDED: 'human-judgment-needed',
  UNKNOWN: 'unknown',
});

/**
 * Inspect the project's build.log for evidence that Rouge's own code
 * drifted from its own schema. The signature is a repeated warn line
 * from the schema validator:
 *
 *   [schema:state.json] write /path: /foundation/status must be equal to one of the allowed values
 *
 * This is load-bearing: it's exactly the stack-rank failure mode.
 * Returns the parsed hint if detected, null otherwise.
 */
function detectSchemaViolation(projectDir) {
  const logPath = path.join(projectDir, 'build.log');
  if (!fs.existsSync(logPath)) return null;
  let recent;
  try {
    const raw = fs.readFileSync(logPath, 'utf8');
    recent = raw.slice(-20000); // last 20KB
  } catch {
    return null;
  }
  // Example: [schema:state.json] write /Users/.../state.json: /foundation/status must be equal to one of the allowed values
  const re = /\[schema:([\w.-]+)\][^\n]*?\s([/\w.-]+)\s+must be equal to one of the allowed values/g;
  const matches = [];
  let m;
  while ((m = re.exec(recent)) !== null) {
    matches.push({ schema: m[1], instancePath: m[2] });
  }
  if (matches.length < 3) return null; // need repeated drift, not one-off
  // Use the most recent match as canonical.
  const last = matches[matches.length - 1];
  return {
    schema: last.schema,
    instance_path: last.instancePath,
    occurrences: matches.length,
  };
}

/**
 * Inspect fingerprint history for a phase. Returns { identical, count,
 * verdict, drift } where drift=true means findings keep changing but
 * the phase still isn't converging (testimonial shape).
 */
function inspectFingerprintHistory(projectDir, phase, n) {
  const { readRecent } = require('./spin-detector.js');
  const recent = readRecent(projectDir, phase, Math.max(n, 5));
  if (recent.length === 0) return { identical: false, count: 0, drift: false };
  const fps = recent.map((e) => e.fingerprint).filter(Boolean);
  const lastN = fps.slice(-n);
  const identical = lastN.length === n && lastN.every((f) => f === lastN[0]);
  const uniqueCount = new Set(fps).size;
  const drift = !identical && fps.length >= 3 && uniqueCount >= 3;
  const verdict = recent.length > 0 ? recent[recent.length - 1].verdict : null;
  return { identical, count: fps.length, drift, verdict };
}

/**
 * Classify a stuck-loop signal.
 *
 * @param {object} signal — { projectDir, phase, escalation }. The
 *   escalation object (if any) is the one that just fired; phase is
 *   the phase that produced it.
 * @returns {{ class: string, reason: string, evidence: object }}
 */
function classify(signal) {
  const { projectDir, phase, escalation } = signal;
  if (!projectDir) return { class: CLASSES.UNKNOWN, reason: 'no projectDir', evidence: {} };

  // 1. Schema violation in Rouge's own code → self-heal candidate.
  //    This is the stack-rank shape: the evaluator keeps failing
  //    because the launcher keeps writing a value the schema doesn't
  //    allow. Applier can propose adding the enum value.
  const schema = detectSchemaViolation(projectDir);
  if (schema) {
    return {
      class: CLASSES.SELF_HEAL_CANDIDATE,
      reason: `Schema violation in Rouge's own code: ${schema.instance_path} fails the ${schema.schema} enum check (${schema.occurrences} repeats in build.log).`,
      evidence: { kind: 'schema-enum-drift', ...schema },
    };
  }

  // 2. Identical evaluator findings across N cycles.
  //    - If the phase is foundation-eval → likely Rouge-side (foundation
  //      can't move the needle because the evaluator is flagging a
  //      launcher-observable issue). Default to self-heal-candidate
  //      with caveat — Wave 4's classifier learnings will refine this.
  //    - If the phase is milestone-check / po-review → human judgment.
  //      The product hit a calibration wall that evaluator + fixer
  //      together can't resolve.
  if (phase) {
    const fp = inspectFingerprintHistory(projectDir, phase, 3);
    if (fp.identical) {
      if (phase === 'foundation-eval') {
        return {
          class: CLASSES.SELF_HEAL_CANDIDATE,
          reason: `Foundation-eval returned identical findings ${fp.count} times. Likely a Rouge-side precondition (schema, wiring) the foundation phase can't fix. Self-heal planner will inspect.`,
          evidence: { kind: 'identical-foundation-eval', fingerprint_count: fp.count, verdict: fp.verdict },
        };
      }
      if (phase === 'milestone-check' || phase === 'po-review') {
        return {
          class: CLASSES.HUMAN_JUDGMENT_NEEDED,
          reason: `${phase} returned identical findings ${fp.count} times with verdict ${fp.verdict}. Evaluator and fixer can't converge — this is a 1-bit taste call (ship as-is or demand a specific fix).`,
          evidence: { kind: 'identical-po-verdict', fingerprint_count: fp.count, verdict: fp.verdict },
        };
      }
      // Unknown phase with spin — conservative escalate.
      return {
        class: CLASSES.UNKNOWN,
        reason: `Phase ${phase} is in semantic spin but classifier has no rule for it. Escalating for human review.`,
        evidence: { kind: 'identical-other', phase, fingerprint_count: fp.count, verdict: fp.verdict },
      };
    }
  }

  // 3. Missing prerequisite on a deploy target → mechanical-automation-missing.
  //    Signal: escalation.classification === 'infrastructure-gap' with
  //    a deploy_target we have a manifest for. If the manifest declares
  //    an auto_remediate for the failing prerequisite, self-heal should
  //    have already handled it; that it didn't means the manifest is
  //    missing a remediation entry. Route to draft-PR adding one.
  if (escalation && escalation.classification === 'infrastructure-gap') {
    return {
      class: CLASSES.MECHANICAL_AUTOMATION_MISSING,
      reason: 'Infrastructure gap escalation. If the deploy target has a manifest but no auto_remediate for the failing prerequisite, that is the missing automation. Draft-PR flow adds it.',
      evidence: { kind: 'missing-remediation', escalation_id: escalation.id },
    };
  }

  // 4. Default conservative bucket.
  return {
    class: CLASSES.UNKNOWN,
    reason: 'No classifier rule matched. Escalating to human for review.',
    evidence: { kind: 'unclassified', phase, escalation_id: escalation ? escalation.id : null },
  };
}

module.exports = { classify, CLASSES, detectSchemaViolation };
