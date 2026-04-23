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

test('valid high-confidence finding with evidence_span passes unchanged', () => {
  const f = { id: 'f1', confidence: 'high', evidence_span: 'verbatim quote from the walk, long enough' };
  const w = validateFinding(f);
  assert.equal(w, null);
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

test('high-confidence without evidence_span downgrades to moderate', () => {
  const f = { id: 'f1', confidence: 'high' };
  const w = validateFinding(f);
  assert.equal(f.confidence, 'moderate');
  assert.match(w, /high-confidence without evidence_span/);
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

test('high-confidence with exactly MIN_EVIDENCE_SPAN chars passes', () => {
  const span = 'x'.repeat(MIN_EVIDENCE_SPAN);
  const f = { id: 'f1', confidence: 'high', evidence_span: span };
  const w = validateFinding(f);
  assert.equal(w, null);
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

test('validates fix_tasks under evaluation_report.qa', () => {
  const ctx = {
    evaluation_report: {
      qa: {
        fix_tasks: [
          { id: 'fix-1', confidence: 'high', evidence_span: 'plenty of evidence here' },
          { id: 'fix-2', confidence: 'high' },
          { id: 'fix-3' },
        ],
      },
    },
  };
  const summary = validateCycleContext(ctx);
  assert.equal(ctx.evaluation_report.qa.fix_tasks[0].confidence, 'high');
  assert.equal(ctx.evaluation_report.qa.fix_tasks[1].confidence, 'moderate');
  assert.equal(ctx.evaluation_report.qa.fix_tasks[2].confidence, 'moderate');
  assert.equal(summary.downgraded, 1);
  assert.equal(summary.defaulted, 1);
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
