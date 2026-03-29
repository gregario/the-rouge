#!/usr/bin/env node
/**
 * Tests for the contribute-pattern module.
 *
 * Tests validation logic, YAML parsing, tier routing, and duplicate detection.
 * Does NOT test git/PR operations (those require a real repo).
 *
 * Usage: node tests/contribute.test.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  validateDraft,
  destinationPath,
  checkDuplicate,
  parseYaml,
} = require('../src/launcher/contribute-pattern.js');

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

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-contribute-test-'));
}

function cleanupDir(dir) {
  try { fs.rmSync(dir, { recursive: true }); } catch { /* fine */ }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log('\nContribute-pattern module tests');
console.log('='.repeat(50));

// ---- YAML parsing ----

console.log('\n[parseYaml — basic scalar fields]');
{
  const result = parseYaml('id: mapbox-geocoding\nname: Mapbox Geocoding\ntier: 3\n');
  assertEqual(result.id, 'mapbox-geocoding', 'parses id');
  assertEqual(result.name, 'Mapbox Geocoding', 'parses name');
  assertEqual(result.tier, '3', 'parses tier');
}

console.log('\n[parseYaml — multi-line scalar with >]');
{
  const result = parseYaml('description: >\n  This is a multi-line\n  description field.\ntier: 2\n');
  assert(result.description.includes('multi-line'), 'captures multi-line content');
  assert(result.description.includes('description field'), 'captures continuation');
  assertEqual(result.tier, '2', 'parses field after multi-line');
}

console.log('\n[parseYaml — block sequence]');
{
  const result = parseYaml('tags:\n  - checkout\n  - server-side\n  - redirect\nid: test\n');
  assert(Array.isArray(result.tags), 'tags is an array');
  assertEqual(result.tags.length, 3, 'tags has 3 items');
  assertEqual(result.tags[0], 'checkout', 'first tag is correct');
  assertEqual(result.id, 'test', 'field after sequence parsed');
}

console.log('\n[parseYaml — flow-style array]');
{
  const result = parseYaml('compatible_with: [nextjs-cloudflare, gatsby]\nid: test\n');
  assert(Array.isArray(result.compatible_with), 'compatible_with is an array');
  assertEqual(result.compatible_with.length, 2, 'has 2 items');
  assertEqual(result.compatible_with[0], 'nextjs-cloudflare', 'first item correct');
}

// ---- Validation ----

console.log('\n[validateDraft — valid draft]');
{
  const tmpDir = makeTmpDir();
  const draftPath = path.join(tmpDir, 'mapbox-geocoding.yaml');
  fs.writeFileSync(draftPath, [
    'id: mapbox-geocoding',
    'name: Mapbox Geocoding',
    'tier: 3',
    'description: Geocoding wrapper for Mapbox API',
  ].join('\n'));

  const result = validateDraft(draftPath);
  assert(result.valid, 'valid draft passes validation');
  assertEqual(result.errors.length, 0, 'no errors');
  assertEqual(result.data.id, 'mapbox-geocoding', 'parsed id');
  assertEqual(result.data.tier, '3', 'parsed tier');
  cleanupDir(tmpDir);
}

console.log('\n[validateDraft — missing required fields]');
{
  const tmpDir = makeTmpDir();
  const draftPath = path.join(tmpDir, 'bad.yaml');
  fs.writeFileSync(draftPath, 'name: Incomplete\n');

  const result = validateDraft(draftPath);
  assert(!result.valid, 'invalid draft fails validation');
  assert(result.errors.some(e => e.includes('id')), 'reports missing id');
  assert(result.errors.some(e => e.includes('tier')), 'reports missing tier');
  cleanupDir(tmpDir);
}

console.log('\n[validateDraft — invalid id format]');
{
  const tmpDir = makeTmpDir();
  const draftPath = path.join(tmpDir, 'bad-id.yaml');
  fs.writeFileSync(draftPath, [
    'id: Mapbox_Geocoding',
    'name: Mapbox Geocoding',
    'tier: 3',
    'description: Bad id format',
  ].join('\n'));

  const result = validateDraft(draftPath);
  assert(!result.valid, 'invalid id fails validation');
  assert(result.errors.some(e => e.includes('kebab-case')), 'reports kebab-case error');
  cleanupDir(tmpDir);
}

console.log('\n[validateDraft — invalid tier]');
{
  const tmpDir = makeTmpDir();
  const draftPath = path.join(tmpDir, 'bad-tier.yaml');
  fs.writeFileSync(draftPath, [
    'id: test-thing',
    'name: Test Thing',
    'tier: 5',
    'description: Invalid tier',
  ].join('\n'));

  const result = validateDraft(draftPath);
  assert(!result.valid, 'invalid tier fails validation');
  assert(result.errors.some(e => e.includes('tier')), 'reports tier error');
  cleanupDir(tmpDir);
}

console.log('\n[validateDraft — file not found]');
{
  const result = validateDraft('/tmp/nonexistent-rouge-test-file.yaml');
  assert(!result.valid, 'missing file fails validation');
  assert(result.errors.some(e => e.includes('not found')), 'reports file not found');
}

console.log('\n[validateDraft — missing description]');
{
  const tmpDir = makeTmpDir();
  const draftPath = path.join(tmpDir, 'no-desc.yaml');
  fs.writeFileSync(draftPath, [
    'id: test-thing',
    'name: Test Thing',
    'tier: 2',
  ].join('\n'));

  const result = validateDraft(draftPath);
  assert(!result.valid, 'missing description fails');
  assert(result.errors.some(e => e.includes('description')), 'reports missing description');
  cleanupDir(tmpDir);
}

// ---- Destination path ----

console.log('\n[destinationPath — routes to correct tier]');
{
  const dest1 = destinationPath({ id: 'nextjs-cloudflare', tier: '1' });
  assert(dest1.includes('tier-1'), 'tier 1 routes to tier-1 dir');
  assert(dest1.endsWith('nextjs-cloudflare.yaml'), 'filename matches id');

  const dest2 = destinationPath({ id: 'supabase', tier: '2' });
  assert(dest2.includes('tier-2'), 'tier 2 routes to tier-2 dir');

  const dest3 = destinationPath({ id: 'stripe-checkout', tier: '3' });
  assert(dest3.includes('tier-3'), 'tier 3 routes to tier-3 dir');
}

// ---- Duplicate detection ----

console.log('\n[checkDuplicate — detects existing entry]');
{
  // supabase.yaml exists in tier-2
  const result = checkDuplicate({ id: 'supabase', tier: '2' });
  assertEqual(result, 'update', 'existing entry detected as update');
}

console.log('\n[checkDuplicate — detects new entry]');
{
  const result = checkDuplicate({ id: 'nonexistent-service-xyz', tier: '2' });
  assertEqual(result, 'new', 'new entry detected as new');
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
