#!/usr/bin/env node
/**
 * Tests for src/launcher/self-heal-applier.js
 *
 * Covers the non-git parts: config loading, patch application, and
 * red/yellow zone refusal + draft writing. Green-zone apply paths
 * require a real git branch and are exercised via the e2e fixture
 * (tests/fixtures/stuck-project) rather than here — unit tests
 * must not run git operations on the working repo.
 *
 * Usage: node tests/self-heal-applier.test.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { applyPlan, loadConfig, applyPatchToContent } = require('../src/launcher/self-heal-applier.js');

let failures = 0;
let checks = 0;

function assert(condition, message) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${message}`);
  }
}

function testLoadConfigDefaults() {
  // If rouge.config.json doesn't define self_heal, we default to
  // enabled=true zones=['green'].
  const cfg = loadConfig();
  assert(cfg.enabled === true, 'default enabled=true');
  assert(Array.isArray(cfg.zones), 'zones is an array');
  assert(cfg.zones.includes('green'), 'green is in the default zones allowlist');
}

function testRedZoneRefused() {
  const plan = {
    kind: 'bad',
    description: 'should never apply',
    files: [{ path: 'src/launcher/safety.js', added_lines: 1, removed_lines: 0, patch: { kind: 'noop' } }],
  };
  const result = applyPlan(plan, { dryRun: true });
  assert(result.applied === false, 'red-zone plan not applied');
  assert(result.zone === 'red', 'zone=red recorded');
  assert(/refused/i.test(result.reason), 'reason mentions refusal');
}

function testYellowZoneWritesDraft() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'draft-'));
  // Redirect the draft output to a temp dir by making the applier
  // think it's operating from there — easier: let it write into the
  // repo's .rouge/self-heal-drafts and then clean up.
  const plan = {
    kind: 'add-enum-value',
    description: 'Add evaluating to enum',
    files: [{
      path: 'schemas/state.json',
      added_lines: 0,
      removed_lines: 0,
      patch: { kind: 'json-enum-append', instance_path: '/foundation/status', new_value: 'test', new_enum: ['a', 'test'] },
    }],
  };
  const result = applyPlan(plan, { dryRun: true });
  assert(result.applied === false, 'yellow plan is not auto-applied');
  assert(result.zone === 'yellow', 'zone=yellow recorded');
  assert(!!result.draft_path, 'draft_path returned');
  if (result.draft_path) {
    assert(fs.existsSync(result.draft_path), 'draft file exists on disk');
    // Clean up the draft we just created so this test stays hermetic.
    try { fs.unlinkSync(result.draft_path); } catch {}
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

function testDryRunOnGreenReturnsPlan() {
  const plan = {
    kind: 'tiny-fix',
    description: 'no-op',
    files: [{ path: 'src/launcher/rouge-loop.js', added_lines: 1, removed_lines: 0, patch: { kind: 'noop' } }],
  };
  const result = applyPlan(plan, { dryRun: true });
  assert(result.zone === 'green', 'green zone classified');
  assert(result.applied === false, 'dry-run does not apply');
  assert(result.reason === 'dry-run', 'reason=dry-run');
  assert(result.plan === plan, 'plan returned for inspection');
}

function testApplyPatchToContentAppendsEnum() {
  const tmpFile = path.join(os.tmpdir(), 'schema-' + Date.now() + '.json');
  const schema = {
    type: 'object',
    properties: {
      foundation: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['a', 'b'] },
        },
      },
    },
  };
  fs.writeFileSync(tmpFile, JSON.stringify(schema, null, 2));
  try {
    // applyPatchToContent resolves paths relative to ROOT, so we
    // need to temporarily use a path inside the repo. We create a
    // temp file inside ROOT's tmp area.
    const repoRoot = path.resolve(__dirname, '..');
    const rel = 'tmp-test-schema-' + Date.now() + '.json';
    const inside = path.join(repoRoot, rel);
    fs.writeFileSync(inside, JSON.stringify(schema, null, 2));
    try {
      const result = applyPatchToContent(rel, {
        kind: 'json-enum-append',
        instance_path: '/foundation/status',
        new_value: 'c',
        new_enum: ['a', 'b', 'c'],
      });
      const parsed = JSON.parse(result);
      assert(parsed.properties.foundation.properties.status.enum.join(',') === 'a,b,c', 'enum extended correctly');
    } finally {
      fs.unlinkSync(inside);
    }
  } finally {
    fs.unlinkSync(tmpFile);
  }
}

function testDisabledConfigShortCircuits() {
  // Simulate a disabled config by writing rouge.config.json with
  // self_heal.enabled=false, then restoring it after the test.
  const cfgPath = path.resolve(__dirname, '..', 'rouge.config.json');
  const prev = fs.readFileSync(cfgPath, 'utf8');
  const parsed = JSON.parse(prev);
  parsed.self_heal = { enabled: false };
  fs.writeFileSync(cfgPath, JSON.stringify(parsed, null, 2));
  try {
    const plan = {
      kind: 'noop',
      description: 'x',
      files: [{ path: 'src/launcher/rouge-loop.js', added_lines: 1, removed_lines: 0, patch: { kind: 'noop' } }],
    };
    const result = applyPlan(plan, { dryRun: true });
    assert(result.applied === false, 'disabled config: not applied');
    assert(/disabled/i.test(result.reason), 'reason mentions disabled');
  } finally {
    fs.writeFileSync(cfgPath, prev);
  }
}

function main() {
  console.log('self-heal-applier');
  testLoadConfigDefaults();
  testRedZoneRefused();
  testYellowZoneWritesDraft();
  testDryRunOnGreenReturnsPlan();
  testApplyPatchToContentAppendsEnum();
  testDisabledConfigShortCircuits();
  console.log(`  ${checks} checks, ${failures} failures`);
  if (failures > 0) {
    console.error('FAIL');
    process.exit(1);
  }
  console.log('PASS');
}

main();
