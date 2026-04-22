#!/usr/bin/env node
/**
 * Tests for src/launcher/spin-detector.js
 *
 * Covers the end-to-end record-and-detect path that Wave-2's triage
 * classifier relies on. The fingerprint helper itself has its own
 * test file; this one tests the JSONL layer and spin detection.
 *
 * Usage: node tests/spin-detector.test.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { recordFingerprint, detectSpin, recordAndCheck, readRecent } = require('../src/launcher/spin-detector.js');

let failures = 0;
let checks = 0;

function assert(condition, message) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${message}`);
  }
}

function makeTempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'spin-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function testFirstFingerprintNoSpin() {
  const dir = makeTempProject();
  try {
    const report = { verdict: 'FAIL', findings: ['schema missing'] };
    const result = recordAndCheck(dir, 'foundation-eval', report);
    assert(result.fingerprint.length === 64, 'fingerprint is sha256 hex');
    assert(result.isSpin === false, 'first fingerprint is never spin');
  } finally { cleanup(dir); }
}

function testThreeIdenticalFingerprintsTripsSpin() {
  const dir = makeTempProject();
  try {
    const report = { verdict: 'FAIL', findings: ['schema missing'] };
    const r1 = recordAndCheck(dir, 'foundation-eval', report);
    const r2 = recordAndCheck(dir, 'foundation-eval', report);
    const r3 = recordAndCheck(dir, 'foundation-eval', report);
    assert(r1.isSpin === false, 'cycle 1: no spin');
    assert(r2.isSpin === false, 'cycle 2: no spin');
    assert(r3.isSpin === true, 'cycle 3: spin detected on 3rd identical');
  } finally { cleanup(dir); }
}

function testDriftingFindingsResetSpin() {
  const dir = makeTempProject();
  try {
    const a = { verdict: 'FAIL', findings: ['schema missing'] };
    const b = { verdict: 'FAIL', findings: ['auth broken'] };
    recordAndCheck(dir, 'foundation-eval', a);
    recordAndCheck(dir, 'foundation-eval', a);
    const r3 = recordAndCheck(dir, 'foundation-eval', b);
    assert(r3.isSpin === false, 'tail differs → spin not detected');
  } finally { cleanup(dir); }
}

function testPerPhaseIsolation() {
  const dir = makeTempProject();
  try {
    const same = { verdict: 'FAIL', findings: ['x'] };
    recordAndCheck(dir, 'foundation-eval', same);
    recordAndCheck(dir, 'foundation-eval', same);
    // Interleave a milestone-check write — should NOT affect
    // foundation-eval's tail.
    recordAndCheck(dir, 'milestone-check', same);
    const r3 = recordAndCheck(dir, 'foundation-eval', same);
    assert(r3.isSpin === true, 'foundation-eval tail unaffected by milestone-check writes');
    // milestone-check itself has only 1 fingerprint → no spin yet.
    assert(detectSpin(dir, 'milestone-check', 3) === false, 'milestone-check: 1 entry ≠ spin');
  } finally { cleanup(dir); }
}

function testCustomThreshold() {
  const dir = makeTempProject();
  try {
    const same = { verdict: 'NEEDS_IMPROVEMENT', findings: ['x'] };
    const r1 = recordAndCheck(dir, 'po-review', same, { threshold: 2 });
    const r2 = recordAndCheck(dir, 'po-review', same, { threshold: 2 });
    assert(r1.isSpin === false, 'threshold=2, cycle 1: no spin');
    assert(r2.isSpin === true, 'threshold=2, cycle 2: spin detected');
  } finally { cleanup(dir); }
}

function testMetaFieldsPersisted() {
  const dir = makeTempProject();
  try {
    const report = { verdict: 'FAIL', findings: ['x'] };
    recordAndCheck(dir, 'foundation-eval', report, { meta: { cycle_number: 42 } });
    const recent = readRecent(dir, 'foundation-eval', 1);
    assert(recent.length === 1, 'one entry recorded');
    assert(recent[0].cycle_number === 42, 'meta field persisted');
    assert(recent[0].verdict === 'FAIL', 'verdict extracted + uppercased');
  } finally { cleanup(dir); }
}

function testMalformedFileDegradesGracefully() {
  const dir = makeTempProject();
  try {
    // Write a deliberately-broken fingerprint file. detectSpin should
    // skip the bad line, not crash.
    fs.writeFileSync(path.join(dir, 'phase-fingerprints.jsonl'), 'not json\n');
    const report = { verdict: 'FAIL', findings: ['x'] };
    const r = recordAndCheck(dir, 'foundation-eval', report);
    assert(r.fingerprint.length === 64, 'still produces fingerprint');
    assert(r.isSpin === false, 'degrades to no-spin on malformed history');
  } finally { cleanup(dir); }
}

function testEmptyReportHandled() {
  const dir = makeTempProject();
  try {
    const r = recordAndCheck(dir, 'foundation-eval', null);
    assert(r.fingerprint === '', 'null report → empty fingerprint');
    assert(r.isSpin === false, 'null report never counts as spin');
  } finally { cleanup(dir); }
}

function main() {
  console.log('spin-detector');
  testFirstFingerprintNoSpin();
  testThreeIdenticalFingerprintsTripsSpin();
  testDriftingFindingsResetSpin();
  testPerPhaseIsolation();
  testCustomThreshold();
  testMetaFieldsPersisted();
  testMalformedFileDegradesGracefully();
  testEmptyReportHandled();
  console.log(`  ${checks} checks, ${failures} failures`);
  if (failures > 0) {
    console.error('FAIL');
    process.exit(1);
  }
  console.log('PASS');
}

main();
