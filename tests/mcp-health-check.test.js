'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { checkOne, checkAll, missingEnv } = require('../src/launcher/mcp-health-check.js');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-mcp-test-'));
}

function writeManifest(dir, name, obj) {
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(obj, null, 2));
}

test('checkOne returns ok when env required is satisfied', () => {
  const root = tmpRoot();
  writeManifest(root, 'test-mcp', {
    name: 'test-mcp',
    description: 'test',
    origin: 'Rouge',
    status: 'active',
    command: 'npx',
    args: ['-y', 'test'],
    env_required: ['TEST_TOKEN'],
    wire_into_phases: [],
    profiles_recommended: [],
  });

  const r = checkOne('test-mcp', { root, env: { TEST_TOKEN: 'abc' } });
  assert.equal(r.ok, true);
  assert.equal(r.missing_env.length, 0);
});

test('checkOne reports missing env vars', () => {
  const root = tmpRoot();
  writeManifest(root, 'needs-key', {
    name: 'needs-key',
    description: 'test',
    origin: 'Rouge',
    status: 'active',
    command: 'npx',
    env_required: ['API_KEY_A', 'API_KEY_B'],
    wire_into_phases: [],
    profiles_recommended: [],
  });

  const r = checkOne('needs-key', { root, env: {} });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing_env, ['API_KEY_A', 'API_KEY_B']);
  assert.ok(r.note.includes('missing env'));
});

test('checkOne reports retired MCPs as not ok', () => {
  const root = tmpRoot();
  writeManifest(root, 'old-mcp', {
    name: 'old-mcp',
    description: 'retired',
    origin: 'Rouge',
    status: 'retired',
    command: 'echo',
    env_required: [],
    wire_into_phases: [],
    profiles_recommended: [],
  });

  const r = checkOne('old-mcp', { root, env: {} });
  assert.equal(r.ok, false);
  assert.equal(r.manifest_status, 'retired');
});

test('checkOne handles missing manifest gracefully', () => {
  const root = tmpRoot();
  const r = checkOne('does-not-exist', { root, env: {} });
  assert.equal(r.ok, false);
  assert.ok(r.reason.includes('no manifest'));
});

test('checkOne handles invalid JSON gracefully', () => {
  const root = tmpRoot();
  fs.writeFileSync(path.join(root, 'broken.json'), '{ this is not json');
  const r = checkOne('broken', { root, env: {} });
  assert.equal(r.ok, false);
  assert.ok(r.reason.includes('invalid JSON'));
});

test('checkAll aggregates across all manifests', () => {
  const root = tmpRoot();
  writeManifest(root, 'a', {
    name: 'a', description: 'x', origin: 'Rouge', status: 'active', command: 'x',
    env_required: [], wire_into_phases: [], profiles_recommended: [],
  });
  writeManifest(root, 'b', {
    name: 'b', description: 'y', origin: 'Rouge', status: 'active', command: 'x',
    env_required: ['MISSING'], wire_into_phases: [], profiles_recommended: [],
  });

  const report = checkAll({ root, env: {} });
  assert.equal(report.count, 2);
  assert.equal(report.ok, false);
  const a = report.results.find((r) => r.name === 'a');
  const b = report.results.find((r) => r.name === 'b');
  assert.equal(a.ok, true);
  assert.equal(b.ok, false);
});

test('checkAll reports gracefully when mcp-configs dir missing', () => {
  const tmp = path.join(os.tmpdir(), 'nonexistent-rouge-mcp-dir-' + Date.now());
  const report = checkAll({ root: tmp, env: {} });
  assert.equal(report.ok, false);
  assert.ok(report.reason.includes('no mcp-configs'));
});

test('missingEnv exported works standalone', () => {
  const result = missingEnv({ env_required: ['A', 'B'] }, { A: '1' });
  assert.deepEqual(result, ['B']);
});

test('missingEnv returns [] when env_required is absent', () => {
  const result = missingEnv({}, {});
  assert.deepEqual(result, []);
});

test('real manifests validate in the repo', () => {
  const report = checkAll({ env: {} });
  assert.equal(typeof report.count, 'number');
  assert.ok(report.count >= 8, 'expected at least 8 MCP manifests');
  for (const r of report.results) {
    assert.ok(r.name, 'each result has a name');
    assert.ok(['active', 'draft', 'retired'].includes(r.manifest_status), `${r.name}: bad status`);
  }
});
