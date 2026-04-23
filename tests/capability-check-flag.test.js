'use strict';

/**
 * Integration test for the rouge.config.json capability_check.enabled flag.
 *
 * Verifies the shipping config has the flag present, has it enabled by
 * default, and the values match the module defaults so the wiring stays
 * consistent with the gate's assumptions.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  DEFAULT_RECURRENCE_THRESHOLD,
  DEFAULT_ESTIMATED_FIX_COST_USD,
  DEFAULT_ESTIMATED_FIX_ATTEMPTS,
} = require('../src/launcher/capability-check.js');

const CONFIG_PATH = path.join(__dirname, '..', 'rouge.config.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

test('rouge.config.json has capability_check section', () => {
  assert.ok(config.capability_check, 'capability_check section missing');
});

test('capability_check.enabled is true by default', () => {
  // P1.21 default: ON. The failure mode being prevented (endless loop
  // burning dollars) is too expensive to risk with opt-in.
  assert.equal(config.capability_check.enabled, true);
});

test('config recurrence_threshold matches module default', () => {
  assert.equal(config.capability_check.recurrence_threshold, DEFAULT_RECURRENCE_THRESHOLD);
});

test('config estimated_fix_cost_usd matches module default', () => {
  assert.equal(config.capability_check.estimated_fix_cost_usd, DEFAULT_ESTIMATED_FIX_COST_USD);
});

test('config estimated_attempts matches module default', () => {
  assert.equal(config.capability_check.estimated_attempts, DEFAULT_ESTIMATED_FIX_ATTEMPTS);
});

test('config has a _note explaining the rollback path', () => {
  assert.ok(config.capability_check._note);
  assert.match(config.capability_check._note, /P1\.21/);
  assert.match(config.capability_check._note, /rollback/);
});

test('launcher honors capability_check.enabled=false (flag gate)', () => {
  // This test asserts the source-code behavior without running the full
  // loop: the block should be gated by `ccConfig.enabled !== false`.
  // Read rouge-loop.js and verify the gate pattern is present.
  const loopSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'launcher', 'rouge-loop.js'),
    'utf8'
  );
  assert.match(loopSrc, /capability_check/);
  assert.match(loopSrc, /ccConfig\.enabled\s*!==\s*false/);
});
