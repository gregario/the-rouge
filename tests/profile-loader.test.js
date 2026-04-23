'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadProfile, loadProfileRaw, listProfiles, ALL_FALLBACK } =
  require('../src/launcher/profile-loader.js');

/** Build a mock root with the layout profile-loader expects. */
function buildMockRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-loader-'));
  fs.mkdirSync(path.join(root, 'profiles'));
  fs.mkdirSync(path.join(root, 'library', 'rules', 'common'), { recursive: true });
  fs.mkdirSync(path.join(root, 'library', 'rules', 'typescript'), { recursive: true });
  fs.mkdirSync(path.join(root, 'library', 'rules', 'web'), { recursive: true });
  fs.mkdirSync(path.join(root, 'library', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(root, 'library', 'agents', 'typescript-reviewer.md'), '---\nname: typescript-reviewer\n---');
  fs.writeFileSync(path.join(root, 'library', 'agents', 'README.md'), '# agents');
  fs.mkdirSync(path.join(root, 'library', 'skills', 'tdd-workflow'), { recursive: true });
  fs.writeFileSync(path.join(root, 'library', 'skills', 'tdd-workflow', 'SKILL.md'), '---\nname: tdd-workflow\n---');
  fs.mkdirSync(path.join(root, 'mcp-configs'));
  fs.writeFileSync(path.join(root, 'mcp-configs', 'github.json'), JSON.stringify({ name: 'github' }));
  fs.writeFileSync(path.join(root, 'mcp-configs', 'context7.json'), JSON.stringify({ name: 'context7' }));
  return root;
}

function writeProfile(root, name, profile) {
  fs.writeFileSync(path.join(root, 'profiles', `${name}.json`), JSON.stringify(profile));
}

function opts(root) {
  return {
    profilesDir: path.join(root, 'profiles'),
    libraryDir: path.join(root, 'library'),
    mcpDir: path.join(root, 'mcp-configs'),
    silent: true,
  };
}

test('loadProfileRaw returns parsed profile', () => {
  const root = buildMockRoot();
  writeProfile(root, 'test', { name: 'test', foo: 'bar' });
  const p = loadProfileRaw('test', { profilesDir: path.join(root, 'profiles') });
  assert.equal(p.foo, 'bar');
});

test('loadProfileRaw returns null for missing', () => {
  const root = buildMockRoot();
  const p = loadProfileRaw('nope', { profilesDir: path.join(root, 'profiles') });
  assert.equal(p, null);
});

test('loadProfileRaw throws on invalid JSON', () => {
  const root = buildMockRoot();
  fs.writeFileSync(path.join(root, 'profiles', 'broken.json'), '{not json');
  assert.throws(() => loadProfileRaw('broken', { profilesDir: path.join(root, 'profiles') }), /invalid JSON/);
});

test('loadProfile with missing name → all fallback + warning', () => {
  const root = buildMockRoot();
  const result = loadProfile('nonexistent', opts(root));
  assert.equal(result.profile.name, 'all');
  assert.ok(result.warnings.some((w) => /not found/.test(w)));
});

test('loadProfile with null name → all fallback, no warning', () => {
  const root = buildMockRoot();
  const result = loadProfile(null, opts(root));
  assert.equal(result.profile.name, 'all');
  assert.equal(result.warnings.length, 0);
});

test('loadProfile resolves real entries', () => {
  const root = buildMockRoot();
  writeProfile(root, 'saas', {
    name: 'saas',
    description: 'test',
    stack_hints: {},
    seeding_phases: [],
    loop_phases: [],
    rules_to_load: ['common', 'typescript', 'web'],
    agents_to_enable: ['typescript-reviewer'],
    skills_to_load: ['tdd-workflow'],
    mcps_to_enable: ['github', 'context7'],
    quality_bar: {},
  });
  const result = loadProfile('saas', opts(root));
  assert.deepEqual(result.resolved.rules.sort(), ['common', 'typescript', 'web']);
  assert.deepEqual(result.resolved.agents, ['typescript-reviewer']);
  assert.deepEqual(result.resolved.skills, ['tdd-workflow']);
  assert.deepEqual(result.resolved.mcps.sort(), ['context7', 'github']);
  assert.equal(result.warnings.length, 0);
});

test('loadProfile warns on missing referenced entries, still loads existing', () => {
  const root = buildMockRoot();
  writeProfile(root, 'ghosty', {
    name: 'ghosty',
    description: 'test',
    stack_hints: {},
    seeding_phases: [],
    loop_phases: [],
    rules_to_load: ['common', 'nonexistent-lang'],
    agents_to_enable: ['typescript-reviewer', 'ghost-agent'],
    skills_to_load: [],
    mcps_to_enable: ['github', 'nope-mcp'],
    quality_bar: {},
  });
  const result = loadProfile('ghosty', opts(root));
  assert.deepEqual(result.resolved.rules, ['common']);
  assert.deepEqual(result.resolved.agents, ['typescript-reviewer']);
  assert.deepEqual(result.resolved.mcps, ['github']);
  assert.equal(result.warnings.length, 3);
});

test('loadProfile with "all" expands to all available', () => {
  const root = buildMockRoot();
  writeProfile(root, 'fullopen', {
    name: 'fullopen',
    description: 'test',
    stack_hints: {},
    seeding_phases: 'all',
    loop_phases: 'all',
    rules_to_load: 'all',
    agents_to_enable: 'all',
    skills_to_load: 'all',
    mcps_to_enable: 'all',
    quality_bar: {},
  });
  const result = loadProfile('fullopen', opts(root));
  assert.equal(result.resolved.rules.length, 3);
  assert.equal(result.resolved.agents.length, 1);
  assert.equal(result.resolved.mcps.length, 2);
});

test('listProfiles returns all profile names', () => {
  const root = buildMockRoot();
  writeProfile(root, 'a', { name: 'a' });
  writeProfile(root, 'b', { name: 'b' });
  const list = listProfiles({ profilesDir: path.join(root, 'profiles') });
  assert.deepEqual(list.sort(), ['a', 'b']);
});

test('ALL_FALLBACK has name "all" and expected shape', () => {
  assert.equal(ALL_FALLBACK.name, 'all');
  assert.equal(ALL_FALLBACK.rules_to_load, 'all');
  assert.equal(ALL_FALLBACK.agents_to_enable, 'all');
});

test('real profiles/*.json all load cleanly against real catalog', () => {
  const real = listProfiles();
  assert.ok(real.length >= 5, `expected at least 5 real profiles; got ${real.length}`);
  for (const name of real) {
    const result = loadProfile(name, { silent: true });
    assert.equal(result.profile.name, name, `profile ${name} should load and match name`);
    // Warnings acceptable (profiles may reference future additions) but errors should not occur.
    assert.ok(result.resolved, `profile ${name} should resolve`);
  }
});
