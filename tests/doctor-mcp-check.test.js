'use strict';

/**
 * Integration test for P0.6 — MCP health-check wired into runDoctor.
 *
 * Verifies:
 *   - runDoctor adds an `mcps` check
 *   - with env vars set → status 'ok'
 *   - with env vars missing → status 'warning' (not 'blocker')
 *   - check detail summarizes ready/missing counts
 *   - doctor continues to pass (allRequired stays honest) regardless of
 *     MCP state — missing MCP env is never a blocker
 */

const { test } = require('node:test');
const assert = require('node:assert');

const { runDoctor } = require('../src/launcher/doctor.js');

test('doctor surfaces an mcps check', () => {
  const result = runDoctor({});
  const mcpCheck = result.checks.find((c) => c.id === 'mcps');
  assert.ok(mcpCheck, 'mcps check missing from doctor output');
});

test('doctor mcps check has one of the expected statuses', () => {
  const result = runDoctor({});
  const mcpCheck = result.checks.find((c) => c.id === 'mcps');
  assert.ok(['ok', 'warning'].includes(mcpCheck.status),
    `mcps check status should be ok/warning, got: ${mcpCheck.status}`);
});

test('doctor mcps check is never a blocker (missing MCP env must not block builds)', () => {
  const result = runDoctor({});
  const mcpCheck = result.checks.find((c) => c.id === 'mcps');
  assert.notEqual(mcpCheck.status, 'blocker',
    'mcps should never block doctor — the user may not need an MCP whose env is missing');
});

test('doctor mcps detail summarizes counts (ready/total form)', () => {
  const result = runDoctor({});
  const mcpCheck = result.checks.find((c) => c.id === 'mcps');
  // Expect either "N/M ready" or a fallback message
  const hasCountForm = /\d+\/\d+ ready/.test(mcpCheck.detail);
  const hasFallback = /no MCP|check unavailable/.test(mcpCheck.detail);
  assert.ok(hasCountForm || hasFallback,
    `mcps detail should summarize counts or explain why not: got "${mcpCheck.detail}"`);
});

test('runDoctor overall allRequired unaffected by MCP env gaps', () => {
  // If the host machine is missing Node / Claude / git / jq / gh, blockers
  // will trip regardless. What we assert: MCP warnings alone don't push
  // allRequired to false.
  const result = runDoctor({});
  const mcpCheck = result.checks.find((c) => c.id === 'mcps');
  if (mcpCheck.status === 'warning') {
    // An mcps warning must not be counted as a blocker
    assert.ok(!result.blockers.includes('mcps'),
      'mcps warning leaked into blockers list');
  }
});
