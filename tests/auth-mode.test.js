#!/usr/bin/env node
/**
 * Tests for src/launcher/auth-mode.js — spawn env mux across the four
 * auth modes (subscription / api / bedrock / vertex).
 */

const { buildClaudeEnv, resolveAuthMode, VALID_MODES } = require('../src/launcher/auth-mode.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) { passed++; console.log(`  PASS: ${message}`); }
  else { failed++; console.error(`  FAIL: ${message}`); }
}
function assertEqual(actual, expected, message) {
  assert(actual === expected, `${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// Snapshot + restore the one env var we mutate in tests.
const SAVED_OVERRIDE = process.env.ROUGE_LLM_PROVIDER;
delete process.env.ROUGE_LLM_PROVIDER;

console.log('\nauth-mode tests');
console.log('='.repeat(50));

console.log('\n[VALID_MODES]');
assert(VALID_MODES.includes('subscription') && VALID_MODES.includes('api') &&
       VALID_MODES.includes('bedrock') && VALID_MODES.includes('vertex'),
       'exports all four modes');

console.log('\n[resolveAuthMode default]');
assertEqual(resolveAuthMode(null), 'subscription', 'null state → subscription');
assertEqual(resolveAuthMode({}), 'subscription', 'empty state → subscription');
assertEqual(resolveAuthMode({ authMode: 'api' }), 'api', 'state.authMode honored');
assertEqual(resolveAuthMode({ authMode: 'bogus' }), 'subscription', 'invalid mode falls back');

console.log('\n[ROUGE_LLM_PROVIDER override]');
process.env.ROUGE_LLM_PROVIDER = 'bedrock';
assertEqual(resolveAuthMode({ authMode: 'api' }), 'bedrock', 'env var wins over state');
process.env.ROUGE_LLM_PROVIDER = 'garbage';
assertEqual(resolveAuthMode({ authMode: 'api' }), 'api', 'invalid override ignored');
delete process.env.ROUGE_LLM_PROVIDER;

const INHERITED = {
  ANTHROPIC_API_KEY: 'leaked-from-shell',
  CLAUDE_CODE_USE_BEDROCK: '1',
  CLAUDE_CODE_USE_VERTEX: '1',
  PATH: '/usr/bin',
};

console.log('\n[subscription mode]');
{
  const { env, mode } = buildClaudeEnv({ state: { authMode: 'subscription' }, baseEnv: INHERITED });
  assertEqual(mode, 'subscription', 'mode reported');
  assertEqual(env.ANTHROPIC_API_KEY, undefined, 'inherited ANTHROPIC_API_KEY scrubbed');
  assertEqual(env.CLAUDE_CODE_USE_BEDROCK, undefined, 'Bedrock flag scrubbed');
  assertEqual(env.CLAUDE_CODE_USE_VERTEX, undefined, 'Vertex flag scrubbed');
  assertEqual(env.PATH, '/usr/bin', 'unrelated env preserved');
}

console.log('\n[api mode]');
{
  const { env } = buildClaudeEnv({
    state: { authMode: 'api' },
    secretsEnv: { ANTHROPIC_API_KEY: 'sk-from-keychain' },
    baseEnv: INHERITED,
  });
  assertEqual(env.ANTHROPIC_API_KEY, 'sk-from-keychain', 'keychain key wins over inherited');
  assertEqual(env.CLAUDE_CODE_USE_BEDROCK, undefined, 'Bedrock not set');
  assertEqual(env.CLAUDE_CODE_USE_VERTEX, undefined, 'Vertex not set');
}

console.log('\n[api mode falls back to inherited ANTHROPIC_API_KEY when no keychain]');
{
  const { env } = buildClaudeEnv({ state: { authMode: 'api' }, baseEnv: INHERITED });
  assertEqual(env.ANTHROPIC_API_KEY, 'leaked-from-shell', 'inherited key used when keychain empty');
}

console.log('\n[bedrock mode]');
{
  const { env } = buildClaudeEnv({
    state: { authMode: 'bedrock' },
    secretsEnv: {
      AWS_BEDROCK_ACCESS_KEY_ID: 'AKIA_X',
      AWS_BEDROCK_SECRET_ACCESS_KEY: 'secret_x',
      AWS_BEDROCK_REGION: 'us-west-2',
    },
    baseEnv: INHERITED,
  });
  assertEqual(env.CLAUDE_CODE_USE_BEDROCK, '1', 'Bedrock flag set');
  assertEqual(env.ANTHROPIC_API_KEY, undefined, 'ANTHROPIC_API_KEY scrubbed in bedrock mode');
  assertEqual(env.CLAUDE_CODE_USE_VERTEX, undefined, 'Vertex not set');
  assertEqual(env.AWS_ACCESS_KEY_ID, 'AKIA_X', 'AWS_ACCESS_KEY_ID mapped');
  assertEqual(env.AWS_SECRET_ACCESS_KEY, 'secret_x', 'AWS_SECRET_ACCESS_KEY mapped');
  assertEqual(env.AWS_REGION, 'us-west-2', 'AWS_REGION mapped');
}

console.log('\n[vertex mode]');
{
  const { env } = buildClaudeEnv({
    state: { authMode: 'vertex' },
    secretsEnv: {
      GCP_VERTEX_PROJECT: 'my-proj',
      GCP_VERTEX_REGION: 'us-central1',
      GCP_VERTEX_ADC: '/tmp/adc.json',
    },
    baseEnv: INHERITED,
  });
  assertEqual(env.CLAUDE_CODE_USE_VERTEX, '1', 'Vertex flag set');
  assertEqual(env.ANTHROPIC_API_KEY, undefined, 'ANTHROPIC_API_KEY scrubbed in vertex mode');
  assertEqual(env.CLAUDE_CODE_USE_BEDROCK, undefined, 'Bedrock not set');
  assertEqual(env.ANTHROPIC_VERTEX_PROJECT_ID, 'my-proj', 'project id mapped');
  assertEqual(env.CLOUD_ML_REGION, 'us-central1', 'region mapped');
  assertEqual(env.GOOGLE_APPLICATION_CREDENTIALS, '/tmp/adc.json', 'ADC path mapped');
}

console.log('\n[override wins: state says api, env says subscription]');
{
  process.env.ROUGE_LLM_PROVIDER = 'subscription';
  const { env, mode } = buildClaudeEnv({
    state: { authMode: 'api' },
    secretsEnv: { ANTHROPIC_API_KEY: 'sk-from-keychain' },
    baseEnv: INHERITED,
  });
  assertEqual(mode, 'subscription', 'override wins');
  assertEqual(env.ANTHROPIC_API_KEY, undefined, 'no API key leaked in forced subscription mode');
  delete process.env.ROUGE_LLM_PROVIDER;
}

// Restore
if (SAVED_OVERRIDE !== undefined) process.env.ROUGE_LLM_PROVIDER = SAVED_OVERRIDE;

console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('All tests passed.\n');
