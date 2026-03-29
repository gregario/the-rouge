#!/usr/bin/env node
/**
 * Tests for the feasibility assessment module.
 *
 * Tests the module directly with mock proposals and verifies checks
 * against rouge-vision.json domain boundaries.
 *
 * Usage: node tests/feasibility.test.js
 */

const path = require('path');
const fs = require('fs');

const { assess, checkScope, checkKnowledge, checkTools, checkTestability } = require(
  path.join(__dirname, '..', 'src', 'launcher', 'feasibility.js')
);

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${message}`);
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    passed++;
    console.log(`  PASS: ${message}`);
  } else {
    failed++;
    console.error(`  FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Load vision for scope tests
const visionPath = path.join(__dirname, '..', 'rouge-vision.json');
const vision = JSON.parse(fs.readFileSync(visionPath, 'utf8'));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log('\nFeasibility assessment tests');
console.log('='.repeat(50));

// ---- assess() basic contract ----

console.log('\n[assess — returns expected shape]');
{
  const result = assess({ title: 'improve test coverage', description: 'add more unit tests', type: 'other' });
  assert(result.verdict !== undefined, 'result has verdict');
  assert(Array.isArray(result.checks), 'result has checks array');
  assert(typeof result.reasoning === 'string', 'result has reasoning string');
  assert(Array.isArray(result.missing), 'result has missing array');
  assertEqual(result.checks.length, 4, 'four checks performed');
}

console.log('\n[assess — throws without title]');
{
  let threw = false;
  try {
    assess({});
  } catch (e) {
    threw = true;
    assert(e.message.includes('title'), 'error mentions title');
  }
  assert(threw, 'throws on missing title');
}

// ---- Scope check ----

console.log('\n[checkScope — in-scope proposals pass]');
{
  const result = checkScope({ title: 'add web apps support', description: 'build web apps' }, vision);
  assertEqual(result.status, 'pass', 'web apps are in scope');
}

console.log('\n[checkScope — CLI tools in scope]');
{
  const result = checkScope({ title: 'build CLI tools', description: 'new CLI tool support' }, vision);
  assertEqual(result.status, 'pass', 'CLI tools are in scope');
}

console.log('\n[checkScope — out-of-scope proposals fail]');
{
  const result = checkScope({ title: 'build mobile apps', description: 'add iOS support' }, vision);
  assertEqual(result.status, 'fail', 'mobile apps are out of scope');
}

console.log('\n[checkScope — games out of scope]');
{
  const result = checkScope({ title: 'add games support', description: 'build games with Godot' }, vision);
  assertEqual(result.status, 'fail', 'games are out of scope');
}

console.log('\n[checkScope — feature area match]');
{
  const result = checkScope({ title: 'improve seeding-swarm', description: 'enhance swarm orchestrator' }, vision);
  assertEqual(result.status, 'pass', 'seeding-swarm is a feature area');
}

console.log('\n[checkScope — ambiguous proposal gets caveat]');
{
  const result = checkScope({ title: 'add logging', description: 'better logging framework' }, vision);
  assertEqual(result.status, 'caveat', 'ambiguous scope gets caveat');
}

// ---- Knowledge check ----

console.log('\n[checkKnowledge — integration with existing entries]');
{
  const result = checkKnowledge({ title: 'add stripe payments', description: 'stripe checkout', type: 'integration' });
  assertEqual(result.status, 'pass', 'stripe has library entries');
}

console.log('\n[checkKnowledge — integration without entries]');
{
  const result = checkKnowledge({ title: 'add mapbox', description: 'mapbox geocoding', type: 'integration' });
  // No mapbox entries exist in the library
  assertEqual(result.status, 'partial', 'unknown integration gets partial');
}

console.log('\n[checkKnowledge — prompt type checks eval coverage]');
{
  const result = checkKnowledge({ title: 'improve building phase', description: 'building prompt quality', type: 'prompt' });
  // building-assertions.md should exist
  assertEqual(result.status, 'pass', 'building has eval assertions');
}

console.log('\n[checkKnowledge — evaluation type checks eval coverage]');
{
  const result = checkKnowledge({ title: 'improve seeding eval', description: 'seeding evaluation', type: 'evaluation' });
  assertEqual(result.status, 'pass', 'seeding has eval assertions');
}

// ---- Tools check ----

console.log('\n[checkTools — core tools available]');
{
  const result = checkTools({ title: 'anything', description: 'basic change', type: 'other' });
  assertEqual(result.status, 'pass', 'node and git are installed');
  assertEqual(result.missing.length, 0, 'nothing missing');
}

// ---- Testability check ----

console.log('\n[checkTestability — integration with sandbox mention]');
{
  const result = checkTestability({ title: 'add stripe', description: 'stripe has test mode and sandbox', type: 'integration' });
  assertEqual(result.status, 'pass', 'sandbox mention passes');
}

console.log('\n[checkTestability — integration without sandbox info]');
{
  const result = checkTestability({ title: 'add unknown API', description: 'some API', type: 'integration' });
  assertEqual(result.status, 'caveat', 'no sandbox info gets caveat');
}

console.log('\n[checkTestability — prompt type with eval suite]');
{
  const result = checkTestability({ title: 'improve prompts', description: 'prompt quality', type: 'prompt' });
  // Eval suite exists
  assertEqual(result.status, 'pass', 'prompt with eval suite passes');
}

console.log('\n[checkTestability — evaluation type always passes]');
{
  const result = checkTestability({ title: 'improve evals', description: 'eval changes', type: 'evaluation' });
  assertEqual(result.status, 'pass', 'evaluation changes are self-testable');
}

console.log('\n[checkTestability — stack type gets caveat]');
{
  const result = checkTestability({ title: 'add Python stack', description: 'Python support', type: 'stack' });
  assertEqual(result.status, 'caveat', 'stack needs hello-world test');
}

// ---- End-to-end verdict tests ----

console.log('\n[assess — in-scope proposal gets proceed or proceed-with-caveats]');
{
  const result = assess({ title: 'improve CLI tools', description: 'enhance CLI tool support', type: 'other' });
  assert(
    result.verdict === 'proceed' || result.verdict === 'proceed-with-caveats',
    `verdict is proceed or proceed-with-caveats (got ${result.verdict})`
  );
}

console.log('\n[assess — out-of-scope proposal gets defer]');
{
  const result = assess({ title: 'build mobile apps', description: 'add iOS support', type: 'stack' });
  assertEqual(result.verdict, 'defer', 'out-of-scope gets defer');
}

console.log('\n[assess — integration with known pattern]');
{
  const result = assess({ title: 'add stripe checkout', description: 'stripe integration with test mode', type: 'integration' });
  assert(
    result.verdict === 'proceed' || result.verdict === 'proceed-with-caveats' || result.verdict === 'escalate',
    `stripe integration is feasible (got ${result.verdict})`
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed.\n');
}
