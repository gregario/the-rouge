#!/usr/bin/env node
/**
 * Tests for src/launcher/schema-validator.js
 *
 * Covers the warn/strict dual-mode introduced 2026-04-22 to surface
 * schema drift at the write site rather than letting bad shapes land
 * on disk and compound across phase cycles.
 *
 * Usage: node tests/schema-validator.test.js
 */

const { validate, SchemaViolationError } = require('../src/launcher/schema-validator.js');

let failures = 0;
let checks = 0;

function assert(condition, message) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${message}`);
  }
}

function assertThrows(fn, errorType, message) {
  checks++;
  try {
    fn();
    failures++;
    console.error(`  ✗ ${message} — expected throw, got no-op`);
  } catch (err) {
    if (!(err instanceof errorType)) {
      failures++;
      console.error(`  ✗ ${message} — threw ${err.constructor.name}, expected ${errorType.name}`);
    }
  }
}

// Mute warn lines during the warn-mode cases so test output stays clean.
const originalWarn = console.warn;
function silenceWarns(fn) {
  console.warn = () => {};
  try { fn(); } finally { console.warn = originalWarn; }
}

function testWarnModeReturnsValid() {
  const valid = { current_state: 'seeding' };
  const res = validate('state.json', valid, 'unit-test');
  assert(res.valid === true, 'warn: valid state returns {valid: true}');
  assert(res.errors.length === 0, 'warn: valid state has no errors');
}

function testWarnModeReturnsInvalidWithoutThrowing() {
  const invalid = { current_state: 'not-a-real-state' };
  let res;
  silenceWarns(() => {
    res = validate('state.json', invalid, 'unit-test');
  });
  assert(res.valid === false, 'warn: invalid state returns {valid: false}');
  assert(res.errors.length > 0, 'warn: invalid state has errors');
}

function testStrictModeThrowsOnInvalid() {
  const invalid = { current_state: 'not-a-real-state' };
  assertThrows(
    () => validate('state.json', invalid, 'unit-test', { strict: true }),
    SchemaViolationError,
    'strict: invalid state throws SchemaViolationError',
  );
}

function testStrictModeDoesNotThrowOnValid() {
  const valid = { current_state: 'seeding' };
  const res = validate('state.json', valid, 'unit-test', { strict: true });
  assert(res.valid === true, 'strict: valid state returns {valid: true}');
}

function testStrictModeViaEnvVar() {
  const invalid = { current_state: 'bogus' };
  const prev = process.env.ROUGE_STRICT_SCHEMA;
  process.env.ROUGE_STRICT_SCHEMA = '1';
  try {
    assertThrows(
      () => validate('state.json', invalid, 'unit-test'),
      SchemaViolationError,
      'strict (env): invalid state throws when ROUGE_STRICT_SCHEMA=1',
    );
  } finally {
    if (prev === undefined) delete process.env.ROUGE_STRICT_SCHEMA;
    else process.env.ROUGE_STRICT_SCHEMA = prev;
  }
}

function testFoundationEvaluatingPasses() {
  // The exact case from stack-rank's 94-cycle spiral. With the enum
  // expansion in schemas/state.json, this must now be accepted.
  const state = {
    current_state: 'foundation-eval',
    foundation: { status: 'evaluating' },
  };
  const res = validate('state.json', state, 'unit-test', { strict: true });
  assert(res.valid === true, 'strict: foundation.status=evaluating is valid (stack-rank regression)');
}

function testErrorCarriesPayload() {
  const invalid = { current_state: 'nope' };
  try {
    validate('state.json', invalid, 'write /path/to/state.json', { strict: true });
    failures++;
    console.error('  ✗ error: strict mode did not throw');
    checks++;
  } catch (err) {
    checks += 3;
    if (!(err instanceof SchemaViolationError)) { failures++; console.error('  ✗ error: wrong type'); }
    if (err.schemaName !== 'state.json') { failures++; console.error('  ✗ error: wrong schemaName'); }
    if (!err.context.includes('/path/to/state.json')) { failures++; console.error('  ✗ error: wrong context'); }
  }
}

function main() {
  console.log('schema-validator warn/strict modes');
  testWarnModeReturnsValid();
  testWarnModeReturnsInvalidWithoutThrowing();
  testStrictModeThrowsOnInvalid();
  testStrictModeDoesNotThrowOnValid();
  testStrictModeViaEnvVar();
  testFoundationEvaluatingPasses();
  testErrorCarriesPayload();
  console.log(`  ${checks} checks, ${failures} failures`);
  if (failures > 0) {
    console.error('FAIL');
    process.exit(1);
  }
  console.log('PASS');
}

main();
