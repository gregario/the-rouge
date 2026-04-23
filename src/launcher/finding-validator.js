/**
 * finding-validator.js
 *
 * Post-phase validator that enforces P1.15 + P1.16 invariants on judge
 * findings: `confidence: high` requires a non-trivial `evidence_span`.
 * The prompt says so; this module makes it true.
 *
 * Invoked from rouge-loop.js at milestone-check post-phase, alongside
 * persist-heuristic-runs. Mutates cycle_context in place to downgrade
 * findings that don't meet the evidence bar, and appends a
 * `validation_warnings` array documenting every downgrade so the next
 * cycle's retrospective can see the pattern.
 *
 * Scope of validation (the finding arrays this module touches):
 *   evaluation_report.qa.fix_tasks[]
 *   evaluation_report.qa.ai_code_audit.dimensions[].findings[]    (via code_review_report passthrough)
 *   evaluation_report.qa.security_review.categories[].findings[]  (via passthrough)
 *   evaluation_report.design.a11y_review.findings[]
 *   evaluation_report.design.design_review.notable_issues[]
 *   evaluation_report.po.improvement_items[]
 *   code_review_report.ai_code_audit.dimensions[].findings[]
 *   code_review_report.security_review.categories[].findings[]
 *   code_review_report.security_review.critical_findings[]
 *   code_review_report.language_review.blocking[]
 *   code_review_report.language_review.warnings[]
 *   code_review_report.language_review.informational[]
 *
 * Rules (all conservative — prefer downgrade over hard fail):
 *   - confidence missing → default to "moderate", warn
 *   - confidence not in {high, moderate, low} → default to "moderate", warn
 *   - confidence === "high" AND (!evidence_span OR evidence_span.length < 10) → downgrade to "moderate", warn
 *
 * Never throws. Malformed shapes are skipped with a warning, not crashed.
 */

'use strict';

const VALID_CONFIDENCES = new Set(['high', 'moderate', 'low']);
const MIN_EVIDENCE_SPAN = 10;

function isObj(x) {
  return x && typeof x === 'object' && !Array.isArray(x);
}

/**
 * Validate a single finding object. Mutates in place. Returns a warning
 * description if something was changed/flagged, or null.
 */
function validateFinding(finding, context = {}) {
  if (!isObj(finding)) return null;
  const loc = context.loc || 'unknown';
  const id = finding.id || finding.category || finding.file || '(anon)';

  if (finding.confidence === undefined || finding.confidence === null) {
    finding.confidence = 'moderate';
    return `${loc}/${id}: confidence missing — defaulted to moderate`;
  }

  if (typeof finding.confidence !== 'string' || !VALID_CONFIDENCES.has(finding.confidence)) {
    const bad = finding.confidence;
    finding.confidence = 'moderate';
    return `${loc}/${id}: invalid confidence '${bad}' — defaulted to moderate`;
  }

  if (finding.confidence === 'high') {
    // P1.16b: prefer structured evidence_ref; fall back to evidence_span.
    // Structured ref validation happens in validateFindingArrays/Map where
    // the cycle_context and projectDir are available — we just check the
    // shape here.
    const hasRef = isObj(finding.evidence_ref)
      && typeof finding.evidence_ref.path === 'string'
      && finding.evidence_ref.path.length > 0
      && typeof finding.evidence_ref.quote === 'string'
      && finding.evidence_ref.quote.trim().length > 0;
    if (hasRef) return null;  // structural check passes; deeper validation in caller

    // Back-compat: evidence_span (pre-P1.16b shape) still accepted if ≥ MIN chars
    const span = finding.evidence_span;
    const spanOk = typeof span === 'string' && span.trim().length >= MIN_EVIDENCE_SPAN;
    if (!spanOk) {
      finding.confidence = 'moderate';
      return `${loc}/${id}: high-confidence without evidence_ref or evidence_span (≥${MIN_EVIDENCE_SPAN} chars) — downgraded to moderate`;
    }
    return `${loc}/${id}: high-confidence using deprecated evidence_span (P1.16b prefers evidence_ref)`;
  }

  return null;
}

/**
 * Deep-validate a high-confidence finding's evidence_ref against the
 * cycle_context + project directory. Only call on findings that already
 * passed the shape check in validateFinding.
 *
 * Mutates the finding to downgrade confidence if the ref doesn't resolve
 * or the quote doesn't match the resolved text. Returns a warning string
 * if a downgrade occurred, or null otherwise.
 */
function validateEvidenceRefDeep(finding, context = {}) {
  if (!isObj(finding)) return null;
  if (finding.confidence !== 'high') return null;
  if (!isObj(finding.evidence_ref)) return null;  // nothing to validate

  const loc = context.loc || 'unknown';
  const id = finding.id || finding.category || finding.file || '(anon)';

  let validateEvidenceRef;
  try {
    ({ validateEvidenceRef } = require('./quote-match-validator.js'));
  } catch {
    return null;  // module unavailable — skip silently, finding keeps its shape
  }

  const result = validateEvidenceRef(finding, context.cycleContext, context.projectDir);
  if (result.valid) return null;

  finding.confidence = 'moderate';
  return `${loc}/${id}: evidence_ref validation failed (${result.reason}) — downgraded to moderate`;
}

/**
 * Walk all known finding arrays under a container, validate each.
 * Returns flat list of warnings.
 */
function validateFindingArrays(container, specs, opts = {}) {
  const warnings = [];
  if (!isObj(container)) return warnings;
  for (const spec of specs) {
    const arr = spec.get(container);
    if (!Array.isArray(arr)) continue;
    for (const f of arr) {
      const w = validateFinding(f, { loc: spec.loc });
      if (w) warnings.push(w);
      // P1.16b: deep-validate evidence_ref on high-confidence findings
      const deepW = validateEvidenceRefDeep(f, {
        loc: spec.loc,
        cycleContext: opts.cycleContext,
        projectDir: opts.projectDir,
      });
      if (deepW) warnings.push(deepW);
    }
  }
  return warnings;
}

/** Walk a map-shaped container like dimensions or categories. */
function validateFindingsInMap(container, keyList, locPrefix, opts = {}) {
  const warnings = [];
  if (!isObj(container)) return warnings;
  for (const key of keyList) {
    const sub = container[key];
    if (!isObj(sub)) continue;
    const arr = sub.findings;
    if (!Array.isArray(arr)) continue;
    for (const f of arr) {
      const w = validateFinding(f, { loc: `${locPrefix}.${key}` });
      if (w) warnings.push(w);
      const deepW = validateEvidenceRefDeep(f, {
        loc: `${locPrefix}.${key}`,
        cycleContext: opts.cycleContext,
        projectDir: opts.projectDir,
      });
      if (deepW) warnings.push(deepW);
    }
  }
  return warnings;
}

/**
 * Main entry. Mutates cycleContext and returns a summary.
 * @param {object} cycleContext - cycle_context object (mutated)
 * @param {object} [opts] - { projectDir?: string } — enables P1.16b deep
 *   evidence_ref validation against the filesystem when findings use
 *   type:'file' references.
 * @returns {{ warnings: string[], downgraded: number, defaulted: number, invalid: number }}
 */
function validateCycleContext(cycleContext, opts = {}) {
  const summary = { warnings: [], downgraded: 0, defaulted: 0, invalid: 0 };
  if (!isObj(cycleContext)) return summary;
  const deepOpts = { cycleContext, projectDir: opts.projectDir };

  // Evaluation report — fix_tasks + improvement_items + flat arrays
  const evalReport = cycleContext.evaluation_report;
  if (isObj(evalReport)) {
    const specs = [
      { loc: 'eval.qa.fix_tasks', get: (c) => c.qa && c.qa.fix_tasks },
      { loc: 'eval.po.improvement_items', get: (c) => c.po && c.po.improvement_items },
      { loc: 'eval.design.a11y_findings', get: (c) => c.design && c.design.a11y_review && c.design.a11y_review.findings },
      { loc: 'eval.design.notable_issues', get: (c) => c.design && c.design.design_review && c.design.design_review.notable_issues },
    ];
    summary.warnings.push(...validateFindingArrays(evalReport, specs, deepOpts));
  }

  // Code review report — dimensions + security categories + language_review + critical_findings
  const cr = cycleContext.code_review_report;
  if (isObj(cr)) {
    // ai_code_audit.dimensions.{architecture,consistency,...}.findings
    if (isObj(cr.ai_code_audit) && isObj(cr.ai_code_audit.dimensions)) {
      summary.warnings.push(
        ...validateFindingsInMap(cr.ai_code_audit.dimensions, Object.keys(cr.ai_code_audit.dimensions), 'cr.ai_code_audit.dimensions', deepOpts)
      );
    }
    if (isObj(cr.ai_code_audit) && Array.isArray(cr.ai_code_audit.critical_findings)) {
      for (const f of cr.ai_code_audit.critical_findings) {
        const w = validateFinding(f, { loc: 'cr.ai_code_audit.critical_findings' });
        if (w) summary.warnings.push(w);
        const dw = validateEvidenceRefDeep(f, { loc: 'cr.ai_code_audit.critical_findings', ...deepOpts });
        if (dw) summary.warnings.push(dw);
      }
    }

    // security_review.categories.*.findings + critical_findings
    if (isObj(cr.security_review)) {
      if (isObj(cr.security_review.categories)) {
        summary.warnings.push(
          ...validateFindingsInMap(cr.security_review.categories, Object.keys(cr.security_review.categories), 'cr.security_review.categories', deepOpts)
        );
      }
      if (Array.isArray(cr.security_review.critical_findings)) {
        for (const f of cr.security_review.critical_findings) {
          const w = validateFinding(f, { loc: 'cr.security_review.critical_findings' });
          if (w) summary.warnings.push(w);
          const dw = validateEvidenceRefDeep(f, { loc: 'cr.security_review.critical_findings', ...deepOpts });
          if (dw) summary.warnings.push(dw);
        }
      }
    }

    // language_review.blocking|warnings|informational
    if (isObj(cr.language_review)) {
      for (const bucket of ['blocking', 'warnings', 'informational']) {
        const arr = cr.language_review[bucket];
        if (!Array.isArray(arr)) continue;
        for (const f of arr) {
          const w = validateFinding(f, { loc: `cr.language_review.${bucket}` });
          if (w) summary.warnings.push(w);
          const dw = validateEvidenceRefDeep(f, { loc: `cr.language_review.${bucket}`, ...deepOpts });
          if (dw) summary.warnings.push(dw);
        }
      }
    }
  }

  // Tabulate warning types. Order matters — the invalid-confidence message
  // contains "defaulted to moderate" as its action, so we must check for
  // "invalid confidence" BEFORE "confidence missing" to avoid miscount.
  for (const w of summary.warnings) {
    if (w.includes('high-confidence without evidence_ref or evidence_span')) summary.downgraded += 1;
    else if (w.includes('evidence_ref validation failed')) summary.downgraded += 1;
    else if (w.includes('deprecated evidence_span')) summary.defaulted += 1;
    else if (w.includes('invalid confidence')) summary.invalid += 1;
    else if (w.includes('confidence missing')) summary.defaulted += 1;
  }

  // Attach to cycleContext so retrospective can see it
  if (summary.warnings.length > 0) {
    cycleContext.validation_warnings = (cycleContext.validation_warnings || []).concat(summary.warnings);
  }

  return summary;
}

module.exports = {
  validateFinding,
  validateEvidenceRefDeep,
  validateCycleContext,
  VALID_CONFIDENCES,
  MIN_EVIDENCE_SPAN,
};
