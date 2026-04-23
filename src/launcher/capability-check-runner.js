/**
 * capability-check-runner.js — launcher-side plumbing for P1.21.
 *
 * Bridges rouge-loop.js and capability-check.js:
 *   1. collectBlockingFindings(cycleContext) — walks cycle_context to find
 *      every CRITICAL/HIGH severity finding with high/moderate confidence.
 *   2. buildCapabilityContext(projectDir, state, config, cycleContext) —
 *      assembles the data each signal needs: stack hints, available
 *      integrations (from integration-catalog.js), budget remaining,
 *      prior-cycle findings for the recurrence signal.
 *
 * Kept separate from capability-check.js (which stays I/O-free) so both
 * are unit-testable in isolation. rouge-loop.js imports this runner,
 * calls collectBlockingFindings + buildCapabilityContext, then feeds each
 * finding through capability-check.assessCapability.
 *
 * Never throws on bad input. Missing fields / malformed containers return
 * safe defaults (empty arrays, nulls) so the gate stays permissive under
 * uncertainty — audit-recommender P1.13 is the N=3 backstop.
 */

'use strict';

function isObj(x) {
  return x && typeof x === 'object' && !Array.isArray(x);
}

/**
 * Collect blocking findings from a cycle_context. Scope:
 *   - severity CRITICAL or HIGH
 *   - confidence high or moderate (per P1.15; low skipped because
 *     advisory, unverified never gates)
 *
 * Sources walked:
 *   evaluation_report.qa.fix_tasks[]
 *   code_review_report.ai_code_audit.critical_findings[]
 *   code_review_report.security_review.critical_findings[]
 *   code_review_report.language_review.blocking[]  (severity-agnostic)
 *
 * @param {object} ctx - cycle_context object
 * @returns {object[]} flat array of blocking findings
 */
function collectBlockingFindings(ctx) {
  if (!isObj(ctx)) return [];
  const out = [];

  const isBlockingByFindingSeverity = (f) => {
    if (!isObj(f)) return false;
    const sev = String(f.severity || '').toUpperCase();
    if (sev !== 'CRITICAL' && sev !== 'HIGH') return false;
    const conf = String(f.confidence || 'moderate').toLowerCase();
    return conf === 'high' || conf === 'moderate';
  };

  const push = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const f of arr) if (isBlockingByFindingSeverity(f)) out.push(f);
  };

  const evalReport = ctx.evaluation_report;
  if (isObj(evalReport) && isObj(evalReport.qa)) push(evalReport.qa.fix_tasks);

  const cr = ctx.code_review_report;
  if (isObj(cr)) {
    if (isObj(cr.ai_code_audit)) push(cr.ai_code_audit.critical_findings);
    if (isObj(cr.security_review)) push(cr.security_review.critical_findings);
    // language_review.blocking[] — severity-agnostic; treat all entries as
    // HIGH and only filter by confidence.
    if (isObj(cr.language_review) && Array.isArray(cr.language_review.blocking)) {
      for (const f of cr.language_review.blocking) {
        if (!isObj(f)) continue;
        const conf = String(f.confidence || 'moderate').toLowerCase();
        if (conf === 'high' || conf === 'moderate') out.push(f);
      }
    }
  }

  return out;
}

/**
 * Build the context object each capability-check signal needs.
 *
 * @param {string} projectDir
 * @param {object} state - state.json contents
 * @param {object} config - rouge.config.json
 * @param {object} cycleContext - cycle_context.json contents
 * @returns {{
 *   profile: { stack_hints: object },
 *   stack_hints: object,
 *   availableIntegrations: string[],
 *   budget_remaining_usd: number|null,
 *   priorCycleFindings: Array<object[]>
 * }}
 */
function buildCapabilityContext(projectDir, state, config, cycleContext) {
  const ctx = isObj(cycleContext) ? cycleContext : {};
  const activeSpec = isObj(ctx.active_spec) ? ctx.active_spec : {};

  // Stack hints — prefer active_spec.infrastructure, fall back to
  // whatever the profile declared.
  const infra = isObj(activeSpec.infrastructure) ? activeSpec.infrastructure : {};
  const stackHints = {
    primary_language: infra.primary_language,
    targets_browser: infra.targets_browser,
    uses_db: infra.uses_db,
  };

  // Available integrations — load catalog slugs. Missing catalog → empty
  // list → signals flag everything as missing (conservative; audit-
  // recommender is the N=3 backstop).
  let availableIntegrations = [];
  try {
    const { loadAll } = require('./integration-catalog.js');
    const manifests = loadAll();
    if (isObj(manifests)) availableIntegrations = Object.keys(manifests);
  } catch {
    // swallow; empty list is a safe default
  }

  // Budget remaining — config cap minus state's cumulative cost. Null if
  // cap not set or state missing the cost field.
  let budgetRemaining = null;
  const cap = isObj(config) ? config.budget_cap_usd : null;
  if (typeof cap === 'number' && Number.isFinite(cap)) {
    const spent = (state && typeof state.cumulative_cost_usd === 'number')
      ? state.cumulative_cost_usd : 0;
    budgetRemaining = Math.max(0, cap - spent);
  }

  // Prior cycle findings — walk previous_cycles (last 3) collecting the
  // blocking findings from each, so recurrence signal can fingerprint-
  // match. Returns Array<object[]>: one inner array per prior cycle.
  const priorCycleFindings = [];
  if (Array.isArray(ctx.previous_cycles)) {
    const recent = ctx.previous_cycles.slice(-3);
    for (const prev of recent) {
      const findings = collectBlockingFindings(prev);
      priorCycleFindings.push(findings);  // may be [] — recurrence handles it
    }
  }

  return {
    profile: { stack_hints: stackHints },
    stack_hints: stackHints,
    availableIntegrations,
    budget_remaining_usd: budgetRemaining,
    priorCycleFindings,
  };
}

module.exports = { collectBlockingFindings, buildCapabilityContext };
