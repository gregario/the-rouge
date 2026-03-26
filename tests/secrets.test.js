#!/usr/bin/env node
/**
 * Tests for src/launcher/secrets.js
 *
 * Runs on macOS using the OS Keychain with a test service name.
 * Cleans up all test entries after completion.
 *
 * Usage: node tests/secrets.test.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  storeSecret,
  getSecret,
  listSecrets,
  deleteSecret,
  loadProjectSecrets,
  discoverIntegrations,
  validateSecret,
  validateIntegration,
  recordValidation,
  setExpiry,
  getExpiringSecrets,
  INTEGRATION_KEYS,
} = require('../src/launcher/secrets.js');

const TEST_SERVICE = 'test-integration';
const TEST_KEY_1 = 'TEST_SECRET_KEY_1';
const TEST_KEY_2 = 'TEST_SECRET_KEY_2';
const TEST_VALUE_1 = 'test-value-abc-123';
const TEST_VALUE_2 = 'test-value-xyz-789';

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

// ---------------------------------------------------------------------------
// Cleanup helper — removes all test secrets
// ---------------------------------------------------------------------------

function cleanup() {
  try { deleteSecret(TEST_SERVICE, TEST_KEY_1); } catch {}
  try { deleteSecret(TEST_SERVICE, TEST_KEY_2); } catch {}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log('\nSecrets module tests');
console.log('='.repeat(50));

// Clean slate
cleanup();

// Test 1: getSecret returns null for non-existent key
console.log('\n[getSecret — non-existent key]');
{
  const result = getSecret(TEST_SERVICE, TEST_KEY_1);
  assertEqual(result, null, 'returns null for missing key');
}

// Test 2: storeSecret + getSecret round-trip
console.log('\n[storeSecret + getSecret round-trip]');
{
  storeSecret(TEST_SERVICE, TEST_KEY_1, TEST_VALUE_1);
  const result = getSecret(TEST_SERVICE, TEST_KEY_1);
  assertEqual(result, TEST_VALUE_1, 'retrieves stored value');
}

// Test 3: storeSecret overwrites existing value
console.log('\n[storeSecret — overwrite]');
{
  const newValue = 'overwritten-value';
  storeSecret(TEST_SERVICE, TEST_KEY_1, newValue);
  const result = getSecret(TEST_SERVICE, TEST_KEY_1);
  assertEqual(result, newValue, 'overwrite returns new value');
  // Restore original for subsequent tests
  storeSecret(TEST_SERVICE, TEST_KEY_1, TEST_VALUE_1);
}

// Test 4: Store second key
console.log('\n[storeSecret — multiple keys]');
{
  storeSecret(TEST_SERVICE, TEST_KEY_2, TEST_VALUE_2);
  const val1 = getSecret(TEST_SERVICE, TEST_KEY_1);
  const val2 = getSecret(TEST_SERVICE, TEST_KEY_2);
  assertEqual(val1, TEST_VALUE_1, 'first key still correct');
  assertEqual(val2, TEST_VALUE_2, 'second key correct');
}

// Test 5: listSecrets
console.log('\n[listSecrets]');
{
  const names = listSecrets(TEST_SERVICE);
  assert(Array.isArray(names), 'returns an array');
  assert(names.includes(TEST_KEY_1), 'includes first key');
  assert(names.includes(TEST_KEY_2), 'includes second key');
}

// Test 6: deleteSecret
console.log('\n[deleteSecret]');
{
  const result = deleteSecret(TEST_SERVICE, TEST_KEY_1);
  assertEqual(result, true, 'returns true on successful delete');
  const afterDelete = getSecret(TEST_SERVICE, TEST_KEY_1);
  assertEqual(afterDelete, null, 'key is gone after delete');
}

// Test 7: deleteSecret non-existent key
console.log('\n[deleteSecret — non-existent key]');
{
  const result = deleteSecret(TEST_SERVICE, 'NONEXISTENT_KEY_12345');
  assertEqual(result, false, 'returns false for missing key');
}

// Test 8: Values with special characters
console.log('\n[storeSecret — special characters]');
{
  const specialValue = "sk_live_abc123!@#$%^&*()_+-=[]{}|;':\",./<>?";
  storeSecret(TEST_SERVICE, TEST_KEY_1, specialValue);
  const result = getSecret(TEST_SERVICE, TEST_KEY_1);
  assertEqual(result, specialValue, 'handles special characters');
}

// Test 9: discoverIntegrations with mock project
console.log('\n[discoverIntegrations — mock project]');
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-test-'));
  const vision = {
    name: 'test-project',
    infrastructure: {
      stripe: { plan: 'test' },
      supabase: { project: 'test-abc' },
    },
  };
  fs.writeFileSync(path.join(tmpDir, 'vision.json'), JSON.stringify(vision));

  const integrations = discoverIntegrations(tmpDir);
  assert(integrations.includes('stripe'), 'detects stripe');
  assert(integrations.includes('supabase'), 'detects supabase');
  assert(!integrations.includes('sentry'), 'does not detect absent sentry');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true });
}

// Test 10: loadProjectSecrets with mock project
console.log('\n[loadProjectSecrets — mock project]');
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-test-'));
  const vision = {
    name: 'test-project',
    infrastructure: {
      stripe: {},
    },
  };
  fs.writeFileSync(path.join(tmpDir, 'vision.json'), JSON.stringify(vision));

  // Store a stripe key for this test
  storeSecret('stripe', 'STRIPE_SECRET_KEY', 'sk_test_fake');

  const { env, missing, loaded } = loadProjectSecrets(tmpDir);
  assert(loaded.includes('STRIPE_SECRET_KEY'), 'loads stored stripe key');
  assertEqual(env['STRIPE_SECRET_KEY'], 'sk_test_fake', 'env contains value');
  assert(missing.includes('STRIPE_PUBLISHABLE_KEY'), 'reports missing publishable key');

  // Cleanup
  deleteSecret('stripe', 'STRIPE_SECRET_KEY');
  fs.rmSync(tmpDir, { recursive: true });
}

// Test 11: loadProjectSecrets with no vision.json
console.log('\n[loadProjectSecrets — no vision.json]');
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-test-'));
  const { env, missing, loaded } = loadProjectSecrets(tmpDir);
  assertEqual(Object.keys(env).length, 0, 'empty env');
  assertEqual(missing.length, 0, 'no missing');
  assertEqual(loaded.length, 0, 'no loaded');
  fs.rmSync(tmpDir, { recursive: true });
}

// Test 12: INTEGRATION_KEYS is exported and complete
console.log('\n[INTEGRATION_KEYS export]');
{
  assert(typeof INTEGRATION_KEYS === 'object', 'INTEGRATION_KEYS is an object');
  const expected = ['stripe', 'supabase', 'sentry', 'slack', 'cloudflare'];
  for (const name of expected) {
    assert(Array.isArray(INTEGRATION_KEYS[name]), `has ${name} keys`);
  }
}

// Test 13: validateSecret — non-existent key
console.log('\n[validateSecret — non-existent key]');
{
  const result = validateSecret('test-integration', 'NONEXISTENT_KEY');
  assertEqual(result.status, 'invalid', 'reports invalid for missing key');
  assertEqual(result.message, 'not stored', 'message says not stored');
}

// Test 14: validateSecret — key with no validator
console.log('\n[validateSecret — no validator defined]');
{
  storeSecret('test-integration', TEST_KEY_1, TEST_VALUE_1);
  const result = validateSecret('test-integration', TEST_KEY_1);
  assertEqual(result.status, 'unchecked', 'reports unchecked for unknown key');
}

// Test 15: validateIntegration returns array for known integration
console.log('\n[validateIntegration — known integration]');
{
  const results = validateIntegration('stripe');
  assert(Array.isArray(results), 'returns array');
  assertEqual(results.length, INTEGRATION_KEYS.stripe.length, 'one result per key');
  for (const r of results) {
    assert(typeof r.status === 'string', `has status for ${r.key}`);
  }
}

// Test 16: validateIntegration returns empty for unknown integration
console.log('\n[validateIntegration — unknown integration]');
{
  const results = validateIntegration('nonexistent');
  assertEqual(results.length, 0, 'returns empty array');
}

// Test 17: Token expiry — setExpiry + getExpiringSecrets
console.log('\n[token expiry — set and get]');
{
  // Set an expiry in the past (should show as expired)
  setExpiry('test-integration', 'EXPIRED_KEY', '2020-01-01');
  const expiring = getExpiringSecrets(9999);
  const found = expiring.find((e) => e.id === 'test-integration/EXPIRED_KEY');
  assert(found !== undefined, 'finds expired key');
  assert(found.days_remaining < 0, 'days_remaining is negative for expired key');
}

// Test 18: Token expiry — future key not in short window
console.log('\n[token expiry — future key outside window]');
{
  const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  setExpiry('test-integration', 'FUTURE_KEY', futureDate);
  const expiring = getExpiringSecrets(7);
  const found = expiring.find((e) => e.id === 'test-integration/FUTURE_KEY');
  assertEqual(found, undefined, 'future key not in 7-day window');
}

// Test 19: recordValidation sets last_validated
console.log('\n[recordValidation — sets timestamp]');
{
  recordValidation('test-integration', 'VALIDATED_KEY', { notes: 'test run' });
  // Read the file directly to verify
  const expiryFile = path.join(os.homedir(), '.rouge-token-expiry.json');
  const registry = JSON.parse(fs.readFileSync(expiryFile, 'utf8'));
  const entry = registry['test-integration/VALIDATED_KEY'];
  assert(entry !== undefined, 'entry exists in registry');
  assert(typeof entry.last_validated === 'string', 'has last_validated timestamp');
  assertEqual(entry.notes, 'test run', 'preserves notes');
}

// Cleanup expiry test entries
{
  const expiryFile = path.join(os.homedir(), '.rouge-token-expiry.json');
  try {
    const registry = JSON.parse(fs.readFileSync(expiryFile, 'utf8'));
    delete registry['test-integration/EXPIRED_KEY'];
    delete registry['test-integration/FUTURE_KEY'];
    delete registry['test-integration/VALIDATED_KEY'];
    fs.writeFileSync(expiryFile, JSON.stringify(registry, null, 2) + '\n');
  } catch { /* fine */ }
}

// ---------------------------------------------------------------------------
// Cleanup and summary
// ---------------------------------------------------------------------------

cleanup();

console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed.\n');
}
