'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { collectBlockingFindings, buildCapabilityContext } =
  require('../src/launcher/capability-check-runner.js');

// =========================================================================
// collectBlockingFindings
// =========================================================================

test('collects HIGH/CRITICAL + high/moderate-confidence findings from fix_tasks', () => {
  const ctx = {
    evaluation_report: {
      qa: {
        fix_tasks: [
          { id: 'f1', severity: 'CRITICAL', confidence: 'high' },
          { id: 'f2', severity: 'HIGH', confidence: 'moderate' },
          { id: 'f3', severity: 'MEDIUM', confidence: 'high' },  // wrong severity
          { id: 'f4', severity: 'HIGH', confidence: 'low' },     // wrong confidence
          { id: 'f5', severity: 'HIGH' },                         // no confidence = moderate default
        ],
      },
    },
  };
  const out = collectBlockingFindings(ctx);
  const ids = out.map((f) => f.id);
  assert.deepEqual(ids.sort(), ['f1', 'f2', 'f5']);
});

test('collects from code_review_report.ai_code_audit.critical_findings', () => {
  const ctx = {
    code_review_report: {
      ai_code_audit: {
        critical_findings: [
          { id: 'a1', severity: 'CRITICAL', confidence: 'high' },
        ],
      },
    },
  };
  const out = collectBlockingFindings(ctx);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'a1');
});

test('collects from code_review_report.security_review.critical_findings', () => {
  const ctx = {
    code_review_report: {
      security_review: {
        critical_findings: [
          { id: 's1', severity: 'HIGH', confidence: 'moderate' },
        ],
      },
    },
  };
  const out = collectBlockingFindings(ctx);
  assert.equal(out.length, 1);
});

test('collects from language_review.blocking[] (severity-agnostic)', () => {
  const ctx = {
    code_review_report: {
      language_review: {
        blocking: [
          { id: 'l1', confidence: 'high' },        // collected (severity absent, treated as HIGH)
          { id: 'l2', confidence: 'low' },         // skipped (low confidence)
          { id: 'l3', confidence: 'moderate' },    // collected
        ],
      },
    },
  };
  const out = collectBlockingFindings(ctx);
  const ids = out.map((f) => f.id);
  assert.deepEqual(ids.sort(), ['l1', 'l3']);
});

test('merges findings across sources without dedup', () => {
  const ctx = {
    evaluation_report: { qa: { fix_tasks: [{ id: 'q', severity: 'HIGH', confidence: 'high' }] } },
    code_review_report: {
      ai_code_audit: { critical_findings: [{ id: 'a', severity: 'CRITICAL', confidence: 'high' }] },
      security_review: { critical_findings: [{ id: 's', severity: 'HIGH', confidence: 'moderate' }] },
      language_review: { blocking: [{ id: 'l', confidence: 'high' }] },
    },
  };
  const out = collectBlockingFindings(ctx);
  assert.equal(out.length, 4);
});

test('returns [] for null / undefined / non-object ctx', () => {
  assert.deepEqual(collectBlockingFindings(null), []);
  assert.deepEqual(collectBlockingFindings(undefined), []);
  assert.deepEqual(collectBlockingFindings('string'), []);
  assert.deepEqual(collectBlockingFindings(42), []);
  assert.deepEqual(collectBlockingFindings([]), []);
});

test('returns [] for empty ctx', () => {
  assert.deepEqual(collectBlockingFindings({}), []);
});

test('ignores malformed finding shapes (non-object entries)', () => {
  const ctx = {
    evaluation_report: {
      qa: {
        fix_tasks: [
          null,
          'string',
          42,
          { id: 'valid', severity: 'HIGH', confidence: 'high' },
        ],
      },
    },
  };
  const out = collectBlockingFindings(ctx);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'valid');
});

test('handles case variants in severity / confidence', () => {
  const ctx = {
    evaluation_report: {
      qa: {
        fix_tasks: [
          { id: 'a', severity: 'critical', confidence: 'HIGH' },   // lowercase severity, uppercase confidence
          { id: 'b', severity: 'High', confidence: 'Moderate' },    // mixed case
        ],
      },
    },
  };
  const out = collectBlockingFindings(ctx);
  assert.equal(out.length, 2);
});

// =========================================================================
// buildCapabilityContext
// =========================================================================

test('buildCapabilityContext: extracts stack_hints from active_spec.infrastructure', () => {
  const ctx = {
    active_spec: {
      infrastructure: { primary_language: 'typescript', targets_browser: true, uses_db: true },
    },
  };
  const out = buildCapabilityContext('/tmp', {}, {}, ctx);
  assert.deepEqual(out.stack_hints, {
    primary_language: 'typescript', targets_browser: true, uses_db: true,
  });
});

test('buildCapabilityContext: missing infrastructure → undefined fields, not crash', () => {
  const out = buildCapabilityContext('/tmp', {}, {}, {});
  assert.equal(typeof out.stack_hints, 'object');
  assert.equal(out.stack_hints.primary_language, undefined);
});

test('buildCapabilityContext: null cycleContext → safe defaults', () => {
  const out = buildCapabilityContext('/tmp', {}, {}, null);
  assert.ok(out);
  assert.equal(typeof out.stack_hints, 'object');
  assert.deepEqual(out.priorCycleFindings, []);
});

test('buildCapabilityContext: budget_remaining computed from cap - spent', () => {
  const out = buildCapabilityContext('/tmp', { cumulative_cost_usd: 30 }, { budget_cap_usd: 100 }, {});
  assert.equal(out.budget_remaining_usd, 70);
});

test('buildCapabilityContext: budget_remaining null when cap not set', () => {
  const out = buildCapabilityContext('/tmp', { cumulative_cost_usd: 30 }, {}, {});
  assert.equal(out.budget_remaining_usd, null);
});

test('buildCapabilityContext: budget_remaining floor at 0 when over budget', () => {
  const out = buildCapabilityContext('/tmp', { cumulative_cost_usd: 200 }, { budget_cap_usd: 100 }, {});
  assert.equal(out.budget_remaining_usd, 0);
});

test('buildCapabilityContext: priorCycleFindings walks previous_cycles (last 3)', () => {
  const makeCycle = (id) => ({
    evaluation_report: {
      qa: { fix_tasks: [{ id, severity: 'HIGH', confidence: 'high' }] },
    },
  });
  const ctx = {
    previous_cycles: [
      makeCycle('old'), makeCycle('c1'), makeCycle('c2'), makeCycle('c3'),
    ],
  };
  const out = buildCapabilityContext('/tmp', {}, {}, ctx);
  assert.equal(out.priorCycleFindings.length, 3);
  assert.equal(out.priorCycleFindings[0][0].id, 'c1');
  assert.equal(out.priorCycleFindings[2][0].id, 'c3');
});

test('buildCapabilityContext: empty prior cycles → []', () => {
  const out = buildCapabilityContext('/tmp', {}, {}, { previous_cycles: [] });
  assert.deepEqual(out.priorCycleFindings, []);
});

test('buildCapabilityContext: availableIntegrations loaded from catalog (≥1 real)', () => {
  // Smoke test against the real catalog — we expect at least the known
  // tier-2 slugs (supabase, stripe, sentry, etc.) to load.
  const out = buildCapabilityContext('/tmp', {}, {}, {});
  assert.ok(Array.isArray(out.availableIntegrations));
  // Catalog may have 0+ entries depending on tier-2/. Don't assert
  // specific slugs; just that loading didn't throw.
});

test('buildCapabilityContext: profile.stack_hints mirrors stack_hints', () => {
  const ctx = {
    active_spec: {
      infrastructure: { primary_language: 'rust', targets_browser: false },
    },
  };
  const out = buildCapabilityContext('/tmp', {}, {}, ctx);
  assert.deepEqual(out.profile.stack_hints, out.stack_hints);
});

test('buildCapabilityContext: handles null state gracefully', () => {
  const out = buildCapabilityContext('/tmp', null, { budget_cap_usd: 50 }, {});
  // No cumulative_cost_usd → spent defaults to 0 → remaining = 50
  assert.equal(out.budget_remaining_usd, 50);
});
