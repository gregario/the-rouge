#!/usr/bin/env node
/**
 * Tests for src/launcher/findings-fingerprint.js
 *
 * Covers the "same finding → same hash" invariant that Wave-2's
 * semantic-spin detector relies on to decide when to stop retrying.
 *
 * Usage: node tests/findings-fingerprint.test.js
 */

const { fingerprintReport, hasIdenticalTail } = require('../src/launcher/findings-fingerprint.js');

let failures = 0;
let checks = 0;

function assert(condition, message) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${message}`);
  }
}

function testNullReturnsEmpty() {
  assert(fingerprintReport(null) === '', 'null report → empty fingerprint');
  assert(fingerprintReport(undefined) === '', 'undefined report → empty fingerprint');
}

function testIdenticalReportsSameHash() {
  const a = { verdict: 'FAIL', structural_gaps: ['schema missing user.email', 'no migrations/002'] };
  const b = { verdict: 'FAIL', structural_gaps: ['no migrations/002', 'schema missing user.email'] };
  assert(fingerprintReport(a) === fingerprintReport(b), 'finding order doesn\'t affect hash');
}

function testKeyOrderStable() {
  const a = { verdict: 'FAIL', dimensions: { schema: { status: 'FAIL' }, auth: { status: 'PASS' } } };
  const b = { verdict: 'FAIL', dimensions: { auth: { status: 'PASS' }, schema: { status: 'FAIL' } } };
  assert(fingerprintReport(a) === fingerprintReport(b), 'key order doesn\'t affect hash');
}

function testVerdictCaseInsensitive() {
  const a = { verdict: 'FAIL' };
  const b = { verdict: 'fail' };
  const c = { verdict: 'Fail' };
  const h = fingerprintReport(a);
  assert(fingerprintReport(b) === h && fingerprintReport(c) === h, 'verdict case does not matter');
}

function testWhitespaceNormalisation() {
  const a = { verdict: 'FAIL', findings: ['schema  missing    user.email'] };
  const b = { verdict: 'FAIL', findings: [' schema missing user.email  '] };
  assert(fingerprintReport(a) === fingerprintReport(b), 'collapsed whitespace in findings doesn\'t shift hash');
}

function testDifferentVerdictsDiffer() {
  const a = { verdict: 'FAIL', findings: ['x'] };
  const b = { verdict: 'PASS', findings: ['x'] };
  assert(fingerprintReport(a) !== fingerprintReport(b), 'different verdicts → different hash');
}

function testDifferentFindingsDiffer() {
  const a = { verdict: 'FAIL', structural_gaps: ['missing users table'] };
  const b = { verdict: 'FAIL', structural_gaps: ['missing products table'] };
  assert(fingerprintReport(a) !== fingerprintReport(b), 'different findings → different hash');
}

function testTransientFieldsIgnored() {
  const a = { verdict: 'FAIL', findings: ['x'], timestamp: '2026-04-21T12:00:00Z', session_id: 'abc' };
  const b = { verdict: 'FAIL', findings: ['x'], timestamp: '2026-04-22T13:00:00Z', session_id: 'xyz' };
  assert(fingerprintReport(a) === fingerprintReport(b), 'timestamp/session_id are ignored');
}

function testConfidenceRoundedToTwoDecimals() {
  const a = { verdict: 'NEEDS_IMPROVEMENT', confidence: 0.821 };
  const b = { verdict: 'NEEDS_IMPROVEMENT', confidence: 0.823 };
  // 0.82 vs 0.82 → same
  assert(fingerprintReport(a) === fingerprintReport(b), 'tiny confidence drift doesn\'t shift hash (2-decimal rounding)');
  const c = { verdict: 'NEEDS_IMPROVEMENT', confidence: 0.87 };
  assert(fingerprintReport(a) !== fingerprintReport(c), 'meaningful confidence delta does shift hash');
}

function testDimensionFindingsContribute() {
  // Two reports with the same overall verdict but different
  // per-dimension findings should still differ. This is the
  // testimonial case: PO stuck at NEEDS_IMPROVEMENT with shifting
  // dimension-level findings should be distinguishable from
  // NEEDS_IMPROVEMENT with unchanging findings.
  const a = {
    verdict: 'NEEDS_IMPROVEMENT',
    dimensions: { ux: { status: 'FAIL', findings: ['nav unclear'] } },
  };
  const b = {
    verdict: 'NEEDS_IMPROVEMENT',
    dimensions: { ux: { status: 'FAIL', findings: ['empty states missing'] } },
  };
  assert(fingerprintReport(a) !== fingerprintReport(b), 'dimension findings contribute to hash');
}

function testSilentDegradationContributes() {
  const a = { verdict: 'PASS', silent_degradation_check: { status: 'PASS', evidence: [] } };
  const b = { verdict: 'PASS', silent_degradation_check: { status: 'FAIL', evidence: ['mock stub in auth'] } };
  assert(fingerprintReport(a) !== fingerprintReport(b), 'silent-degradation status contributes');
}

function testHasIdenticalTailPositive() {
  const h = 'abc123';
  assert(hasIdenticalTail([h, h, h], 3) === true, 'three identical → tail positive at n=3');
  assert(hasIdenticalTail(['x', h, h, h], 3) === true, 'last three identical → positive');
  assert(hasIdenticalTail([h, h], 2) === true, 'two identical → positive at n=2');
}

function testHasIdenticalTailNegative() {
  assert(hasIdenticalTail(['a', 'b', 'c'], 3) === false, 'three distinct → negative');
  assert(hasIdenticalTail(['a', 'a', 'b'], 3) === false, 'tail differs → negative');
  assert(hasIdenticalTail(['a'], 2) === false, 'too few entries → negative');
  assert(hasIdenticalTail([], 1) === false, 'empty → negative');
  assert(hasIdenticalTail(['', '', ''], 3) === false, 'empty-string fingerprints → negative (sentinel)');
}

function main() {
  console.log('findings-fingerprint');
  testNullReturnsEmpty();
  testIdenticalReportsSameHash();
  testKeyOrderStable();
  testVerdictCaseInsensitive();
  testWhitespaceNormalisation();
  testDifferentVerdictsDiffer();
  testDifferentFindingsDiffer();
  testTransientFieldsIgnored();
  testConfidenceRoundedToTwoDecimals();
  testDimensionFindingsContribute();
  testSilentDegradationContributes();
  testHasIdenticalTailPositive();
  testHasIdenticalTailNegative();
  console.log(`  ${checks} checks, ${failures} failures`);
  if (failures > 0) {
    console.error('FAIL');
    process.exit(1);
  }
  console.log('PASS');
}

main();
