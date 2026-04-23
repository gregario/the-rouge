'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  validateFinding,
  validateCycleContext,
  VALID_CONFIDENCES,
  MIN_EVIDENCE_SPAN,
} = require('../src/launcher/finding-validator.js');

// ---- validateFinding (single) ----

test('valid high-confidence finding with evidence_ref passes unchanged', () => {
  const f = {
    id: 'f1',
    confidence: 'high',
    evidence_ref: { type: 'cycle_context', path: 'a.b', quote: 'verbatim text' },
  };
  const w = validateFinding(f);
  assert.equal(w, null);
  assert.equal(f.confidence, 'high');
});

test('valid high-confidence finding with evidence_span (back-compat) warns but keeps high', () => {
  // P1.16b: evidence_span is deprecated. Accepted with a warning for back-compat.
  const f = { id: 'f1', confidence: 'high', evidence_span: 'verbatim quote from the walk, long enough' };
  const w = validateFinding(f);
  assert.match(w, /deprecated evidence_span/);
  assert.equal(f.confidence, 'high');
});

test('valid moderate finding passes unchanged even without evidence_span', () => {
  const f = { id: 'f1', confidence: 'moderate' };
  const w = validateFinding(f);
  assert.equal(w, null);
  assert.equal(f.confidence, 'moderate');
});

test('missing confidence defaults to moderate with warning', () => {
  const f = { id: 'f1' };
  const w = validateFinding(f);
  assert.equal(f.confidence, 'moderate');
  assert.match(w, /confidence missing/);
});

test('null confidence defaults to moderate with warning', () => {
  const f = { id: 'f1', confidence: null };
  const w = validateFinding(f);
  assert.equal(f.confidence, 'moderate');
  assert.match(w, /confidence missing/);
});

test('invalid confidence string defaults to moderate with warning', () => {
  const f = { id: 'f1', confidence: 'very high' };
  const w = validateFinding(f);
  assert.equal(f.confidence, 'moderate');
  assert.match(w, /invalid confidence 'very high'/);
});

test('high-confidence without evidence_ref OR evidence_span downgrades to moderate', () => {
  const f = { id: 'f1', confidence: 'high' };
  const w = validateFinding(f);
  assert.equal(f.confidence, 'moderate');
  assert.match(w, /high-confidence without evidence_ref or evidence_span/);
});

test('high-confidence with empty evidence_span downgrades', () => {
  const f = { id: 'f1', confidence: 'high', evidence_span: '' };
  const w = validateFinding(f);
  assert.equal(f.confidence, 'moderate');
  assert.match(w, /downgraded to moderate/);
});

test('high-confidence with too-short evidence_span downgrades', () => {
  const f = { id: 'f1', confidence: 'high', evidence_span: 'short' };
  const w = validateFinding(f);
  assert.equal(f.confidence, 'moderate');
});

test('high-confidence with whitespace-padded short evidence_span downgrades', () => {
  const f = { id: 'f1', confidence: 'high', evidence_span: '   hi   ' };
  const w = validateFinding(f);
  assert.equal(f.confidence, 'moderate');
});

test('high-confidence with exactly MIN_EVIDENCE_SPAN chars passes (back-compat warn)', () => {
  const span = 'x'.repeat(MIN_EVIDENCE_SPAN);
  const f = { id: 'f1', confidence: 'high', evidence_span: span };
  const w = validateFinding(f);
  // Back-compat path: keeps high confidence, warns about deprecation
  assert.match(w, /deprecated evidence_span/);
  assert.equal(f.confidence, 'high');
});

test('non-object finding returns null (no crash)', () => {
  assert.equal(validateFinding(null), null);
  assert.equal(validateFinding('string'), null);
  assert.equal(validateFinding(undefined), null);
  assert.equal(validateFinding(42), null);
  assert.equal(validateFinding([]), null);
});

// ---- validateCycleContext (full tree) ----

test('validates fix_tasks under evaluation_report.qa (back-compat evidence_span)', () => {
  const ctx = {
    evaluation_report: {
      qa: {
        fix_tasks: [
          { id: 'fix-1', confidence: 'high', evidence_span: 'plenty of evidence here' },  // back-compat: keep high, warn
          { id: 'fix-2', confidence: 'high' },                                              // downgrade
          { id: 'fix-3' },                                                                  // defaulted
        ],
      },
    },
  };
  const summary = validateCycleContext(ctx);
  assert.equal(ctx.evaluation_report.qa.fix_tasks[0].confidence, 'high');      // back-compat keeps high
  assert.equal(ctx.evaluation_report.qa.fix_tasks[1].confidence, 'moderate');  // downgraded
  assert.equal(ctx.evaluation_report.qa.fix_tasks[2].confidence, 'moderate');  // defaulted
  assert.equal(summary.downgraded, 1);
  // deprecated-evidence_span count as "defaulted" per tabulation rule; plus the truly-defaulted one = 2
  assert.equal(summary.defaulted, 2);
});

test('validates ai_code_audit.dimensions.*.findings', () => {
  const ctx = {
    code_review_report: {
      ai_code_audit: {
        dimensions: {
          architecture: {
            score: 90,
            findings: [
              { id: 'a1', confidence: 'high' },
              { id: 'a2', confidence: 'moderate' },
            ],
          },
          security: {
            score: 80,
            findings: [
              { id: 's1', confidence: 'high', evidence_span: 'SELECT * FROM users WHERE id = ' + 'x' },
            ],
          },
        },
      },
    },
  };
  validateCycleContext(ctx);
  assert.equal(ctx.code_review_report.ai_code_audit.dimensions.architecture.findings[0].confidence, 'moderate');
  assert.equal(ctx.code_review_report.ai_code_audit.dimensions.architecture.findings[1].confidence, 'moderate');
  assert.equal(ctx.code_review_report.ai_code_audit.dimensions.security.findings[0].confidence, 'high');
});

test('validates language_review buckets', () => {
  const ctx = {
    code_review_report: {
      language_review: {
        language: 'typescript',
        blocking: [{ id: 'b1', confidence: 'high' }],
        warnings: [{ id: 'w1' }],
        informational: [{ id: 'i1', confidence: 'low' }],
      },
    },
  };
  const summary = validateCycleContext(ctx);
  assert.equal(ctx.code_review_report.language_review.blocking[0].confidence, 'moderate');
  assert.equal(ctx.code_review_report.language_review.warnings[0].confidence, 'moderate');
  assert.equal(ctx.code_review_report.language_review.informational[0].confidence, 'low');
  assert.equal(summary.warnings.length, 2);
});

test('handles empty cycle_context gracefully', () => {
  const summary = validateCycleContext({});
  assert.equal(summary.warnings.length, 0);
  assert.equal(summary.downgraded, 0);
});

test('handles null / undefined / non-object input without throwing', () => {
  assert.doesNotThrow(() => validateCycleContext(null));
  assert.doesNotThrow(() => validateCycleContext(undefined));
  assert.doesNotThrow(() => validateCycleContext('string'));
  assert.doesNotThrow(() => validateCycleContext(42));
});

test('appends validation_warnings to cycle_context when any warnings fire', () => {
  const ctx = {
    evaluation_report: {
      qa: { fix_tasks: [{ id: 'x', confidence: 'high' }] },
    },
  };
  validateCycleContext(ctx);
  assert.ok(Array.isArray(ctx.validation_warnings));
  assert.equal(ctx.validation_warnings.length, 1);
});

test('validation_warnings accumulate (does not overwrite existing)', () => {
  const ctx = {
    validation_warnings: ['prior warning'],
    evaluation_report: {
      qa: { fix_tasks: [{ id: 'x', confidence: 'high' }] },
    },
  };
  validateCycleContext(ctx);
  assert.equal(ctx.validation_warnings.length, 2);
  assert.equal(ctx.validation_warnings[0], 'prior warning');
});

test('no validation_warnings key added when no warnings', () => {
  const ctx = {
    evaluation_report: { qa: { fix_tasks: [{ id: 'x', confidence: 'moderate' }] } },
  };
  validateCycleContext(ctx);
  assert.equal(ctx.validation_warnings, undefined);
});

test('summary counts match warning array', () => {
  const ctx = {
    evaluation_report: {
      qa: {
        fix_tasks: [
          { id: 'a', confidence: 'high' },       // downgraded
          { id: 'b', confidence: 'bogus' },      // invalid
          { id: 'c' },                           // defaulted
          { id: 'd', confidence: 'moderate' },   // OK
        ],
      },
    },
  };
  const summary = validateCycleContext(ctx);
  assert.equal(summary.downgraded, 1);
  assert.equal(summary.invalid, 1);
  assert.equal(summary.defaulted, 1);
  assert.equal(summary.warnings.length, 3);
});

test('VALID_CONFIDENCES is the closed vocabulary', () => {
  assert.ok(VALID_CONFIDENCES.has('high'));
  assert.ok(VALID_CONFIDENCES.has('moderate'));
  assert.ok(VALID_CONFIDENCES.has('low'));
  assert.ok(!VALID_CONFIDENCES.has('unverified'));  // P1.15: use `unknown` verdict instead
});

// ---- P1.16b deep evidence_ref validation ----

test('deep: valid evidence_ref (cycle_context) resolves + matches → keeps high', () => {
  const ctx = {
    product_walk: {
      screens: [{ interactive_elements: [{ result: 'Button clicked, navigates to /settings' }] }],
    },
    evaluation_report: {
      qa: {
        fix_tasks: [
          {
            id: 'fix-ok',
            confidence: 'high',
            evidence_ref: {
              type: 'cycle_context',
              path: 'product_walk.screens[0].interactive_elements[0].result',
              quote: 'navigates to /settings',
            },
          },
        ],
      },
    },
  };
  const summary = validateCycleContext(ctx);
  assert.equal(ctx.evaluation_report.qa.fix_tasks[0].confidence, 'high');
  // no downgrade
  assert.ok(!summary.warnings.some((w) => w.includes('evidence_ref validation failed')));
});

test('deep: evidence_ref.path does not resolve → downgraded to moderate', () => {
  const ctx = {
    product_walk: { screens: [] },
    evaluation_report: {
      qa: {
        fix_tasks: [
          {
            id: 'fix-bad-path',
            confidence: 'high',
            evidence_ref: {
              type: 'cycle_context',
              path: 'product_walk.screens[99].interactive_elements[0].result',
              quote: 'fabricated',
            },
          },
        ],
      },
    },
  };
  const summary = validateCycleContext(ctx);
  assert.equal(ctx.evaluation_report.qa.fix_tasks[0].confidence, 'moderate');
  assert.ok(summary.warnings.some((w) => /evidence_ref validation failed/.test(w)));
  assert.equal(summary.downgraded, 1);
});

test('deep: evidence_ref.quote not in resolved text → downgraded', () => {
  const ctx = {
    product_walk: { screens: [{ title: 'Dashboard home' }] },
    evaluation_report: {
      qa: {
        fix_tasks: [
          {
            id: 'fix-bad-quote',
            confidence: 'high',
            evidence_ref: {
              type: 'cycle_context',
              path: 'product_walk.screens[0].title',
              quote: 'a completely fabricated quote about something else entirely',
            },
          },
        ],
      },
    },
  };
  const summary = validateCycleContext(ctx);
  assert.equal(ctx.evaluation_report.qa.fix_tasks[0].confidence, 'moderate');
  assert.ok(summary.warnings.some((w) => /evidence_ref validation failed/.test(w)));
});

test('deep: moderate-confidence findings skip evidence_ref validation', () => {
  // moderate findings don't need an evidence_ref; validateEvidenceRefDeep short-circuits
  const ctx = {
    evaluation_report: {
      qa: {
        fix_tasks: [
          { id: 'fix-mod', confidence: 'moderate' },
        ],
      },
    },
  };
  const summary = validateCycleContext(ctx);
  assert.equal(ctx.evaluation_report.qa.fix_tasks[0].confidence, 'moderate');
  assert.equal(summary.warnings.length, 0);
});

test('deep: evidence_ref with file type validates against projectDir', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fv-deep-'));
  fs.writeFileSync(path.join(d, 'auth.ts'), [
    'function login() {',
    "  throw new Error('no auth')",
    '}',
  ].join('\n'));
  const ctx = {
    evaluation_report: {
      qa: {
        fix_tasks: [
          {
            id: 'fix-file',
            confidence: 'high',
            evidence_ref: {
              type: 'file',
              path: 'auth.ts:2',
              quote: "throw new Error('no auth')",
            },
          },
        ],
      },
    },
  };
  const summary = validateCycleContext(ctx, { projectDir: d });
  assert.equal(ctx.evaluation_report.qa.fix_tasks[0].confidence, 'high');  // resolved + matched
  assert.equal(summary.warnings.length, 0);
});
