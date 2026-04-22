#!/usr/bin/env node
/**
 * Tests for src/launcher/triage.js
 *
 * Confirms each classification rule fires on the right signal shape
 * and the default bucket catches unclassified cases. Uses a temp
 * project directory so tests don't depend on real Rouge projects.
 *
 * Usage: node tests/triage.test.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { classify, CLASSES, detectSchemaViolation } = require('../src/launcher/triage.js');
const { recordAndCheck } = require('../src/launcher/spin-detector.js');

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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'triage-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeSchemaViolationLog(dir, count) {
  const line = `[2026-04-22T00:00:00Z] [schema:state.json] write /path/state.json: /foundation/status must be equal to one of the allowed values\n`;
  fs.writeFileSync(path.join(dir, 'build.log'), line.repeat(count));
}

function testSchemaViolationBecomesSelfHealCandidate() {
  const dir = makeTempProject();
  try {
    writeSchemaViolationLog(dir, 5);
    const result = classify({ projectDir: dir, phase: 'foundation-eval' });
    assert(result.class === CLASSES.SELF_HEAL_CANDIDATE, 'schema violation → self-heal-candidate');
    assert(result.evidence.kind === 'schema-enum-drift', 'evidence kind recorded');
    assert(result.evidence.occurrences === 5, 'occurrence count captured');
    assert(result.evidence.instance_path === '/foundation/status', 'instance path parsed');
  } finally { cleanup(dir); }
}

function testSingleSchemaWarnIsNotEnough() {
  const dir = makeTempProject();
  try {
    writeSchemaViolationLog(dir, 1);
    const schema = detectSchemaViolation(dir);
    assert(schema === null, 'single warn line is not enough to classify');
  } finally { cleanup(dir); }
}

function testIdenticalFoundationEvalIsSelfHeal() {
  const dir = makeTempProject();
  try {
    // No schema violation in log — pure fingerprint spin.
    const report = { verdict: 'FAIL', findings: ['schema missing user table'] };
    recordAndCheck(dir, 'foundation-eval', report);
    recordAndCheck(dir, 'foundation-eval', report);
    recordAndCheck(dir, 'foundation-eval', report);
    const result = classify({ projectDir: dir, phase: 'foundation-eval' });
    assert(result.class === CLASSES.SELF_HEAL_CANDIDATE, 'identical foundation-eval → self-heal');
    assert(result.evidence.kind === 'identical-foundation-eval', 'evidence kind matches');
  } finally { cleanup(dir); }
}

function testIdenticalMilestoneCheckIsHumanJudgment() {
  const dir = makeTempProject();
  try {
    const report = { verdict: 'NEEDS_IMPROVEMENT', findings: ['empty states missing'] };
    recordAndCheck(dir, 'milestone-check', report);
    recordAndCheck(dir, 'milestone-check', report);
    recordAndCheck(dir, 'milestone-check', report);
    const result = classify({ projectDir: dir, phase: 'milestone-check' });
    assert(result.class === CLASSES.HUMAN_JUDGMENT_NEEDED, 'identical milestone-check → human-judgment');
    assert(result.evidence.verdict === 'NEEDS_IMPROVEMENT', 'verdict preserved');
  } finally { cleanup(dir); }
}

function testInfrastructureGapIsMechanicalAutomation() {
  const dir = makeTempProject();
  try {
    const result = classify({
      projectDir: dir,
      escalation: { id: 'esc-123', classification: 'infrastructure-gap' },
    });
    assert(result.class === CLASSES.MECHANICAL_AUTOMATION_MISSING, 'infrastructure-gap → mechanical-automation-missing');
  } finally { cleanup(dir); }
}

function testUnclassifiedFallsThrough() {
  const dir = makeTempProject();
  try {
    const result = classify({ projectDir: dir });
    assert(result.class === CLASSES.UNKNOWN, 'no signal → unknown');
  } finally { cleanup(dir); }
}

function testNoProjectDirIsUnknown() {
  const result = classify({});
  assert(result.class === CLASSES.UNKNOWN, 'missing projectDir → unknown');
}

function testSchemaViolationTakesPrecedenceOverFingerprintSpin() {
  // If both conditions exist, schema violation is the stronger signal —
  // it points directly at the fix. We should classify self-heal with
  // schema-enum-drift evidence, not identical-foundation-eval.
  const dir = makeTempProject();
  try {
    writeSchemaViolationLog(dir, 5);
    const report = { verdict: 'FAIL', findings: ['anything'] };
    recordAndCheck(dir, 'foundation-eval', report);
    recordAndCheck(dir, 'foundation-eval', report);
    recordAndCheck(dir, 'foundation-eval', report);
    const result = classify({ projectDir: dir, phase: 'foundation-eval' });
    assert(result.class === CLASSES.SELF_HEAL_CANDIDATE, 'still self-heal');
    assert(result.evidence.kind === 'schema-enum-drift', 'schema evidence wins over fingerprint spin');
  } finally { cleanup(dir); }
}

function main() {
  console.log('triage classifier');
  testSchemaViolationBecomesSelfHealCandidate();
  testSingleSchemaWarnIsNotEnough();
  testIdenticalFoundationEvalIsSelfHeal();
  testIdenticalMilestoneCheckIsHumanJudgment();
  testInfrastructureGapIsMechanicalAutomation();
  testUnclassifiedFallsThrough();
  testNoProjectDirIsUnknown();
  testSchemaViolationTakesPrecedenceOverFingerprintSpin();
  console.log(`  ${checks} checks, ${failures} failures`);
  if (failures > 0) {
    console.error('FAIL');
    process.exit(1);
  }
  console.log('PASS');
}

main();
