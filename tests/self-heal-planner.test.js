#!/usr/bin/env node
/**
 * Tests for src/launcher/self-heal-planner.js
 *
 * Covers enumAtPath (pure), planFix for unknown evidence kinds, and
 * planFix for schema-enum-drift when no offending assignment exists
 * in source (since the repo is clean post-Wave-1). Positive-case
 * end-to-end for an actual in-source drift is exercised by the
 * applier's integration test fixture, not here.
 *
 * Usage: node tests/self-heal-planner.test.js
 */

const { planFix, enumAtPath } = require('../src/launcher/self-heal-planner.js');

let failures = 0;
let checks = 0;

function assert(condition, message) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${message}`);
  }
}

function testEnumAtPathSimple() {
  const schema = {
    properties: { foundation: { properties: { status: { enum: ['a', 'b'] } } } },
  };
  const result = enumAtPath(schema, '/foundation/status');
  assert(Array.isArray(result) && result.length === 2, 'nested enum found');
  assert(result[0] === 'a' && result[1] === 'b', 'values preserved');
}

function testEnumAtPathMissing() {
  const schema = { properties: { foo: { properties: { bar: {} } } } };
  const result = enumAtPath(schema, '/foo/bar');
  assert(result === null, 'no enum at path → null');
  const result2 = enumAtPath(schema, '/missing/path');
  assert(result2 === null, 'missing path → null');
}

function testEnumAtPathEmptyPath() {
  const schema = { enum: ['a', 'b'] };
  const result = enumAtPath(schema, '/');
  assert(Array.isArray(result) && result.length === 2, 'empty segments returns root enum');
}

function testPlanFixNoEvidenceKind() {
  const result = planFix({ evidence: { kind: 'mystery-shape' } });
  assert(result.ok === false, 'unknown evidence kind → no plan');
  assert(/no planner/i.test(result.reason), 'reason mentions no planner');
}

function testPlanFixMissingSchema() {
  const result = planFix({ evidence: { kind: 'schema-enum-drift', schema: 'no-such-file.json', instance_path: '/x' } });
  assert(result.ok === false, 'missing schema file → no plan');
}

function testPlanFixCleanRepo() {
  // The repo has no live schema-enum drift post-Wave-1; the planner
  // should not find an offending assignment for an already-healthy
  // path and return {ok:false}.
  const result = planFix({
    evidence: { kind: 'schema-enum-drift', schema: 'state.json', instance_path: '/foundation/status', occurrences: 5 },
  });
  assert(result.ok === false, 'no drift in clean repo → no plan');
  assert(/no literal assignment/i.test(result.reason), 'reason mentions no violating assignment');
}

function testPlanFixNoTriage() {
  assert(planFix(null).ok === false, 'null triage → no plan');
  assert(planFix({}).ok === false, 'missing evidence → no plan');
}

function main() {
  console.log('self-heal-planner');
  testEnumAtPathSimple();
  testEnumAtPathMissing();
  testEnumAtPathEmptyPath();
  testPlanFixNoEvidenceKind();
  testPlanFixMissingSchema();
  testPlanFixCleanRepo();
  testPlanFixNoTriage();
  console.log(`  ${checks} checks, ${failures} failures`);
  if (failures > 0) {
    console.error('FAIL');
    process.exit(1);
  }
  console.log('PASS');
}

main();
