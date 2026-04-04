const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { readRegistry, registerProject, isProjectShipped, getProjectArtifacts } = require('../../src/launcher/project-registry.js');
const { resolveDependencies, checkCircularDeps } = require('../../src/launcher/dependency-resolver.js');

describe('Project Registry', () => {
  let tmpDir, registryPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-test-'));
    registryPath = path.join(tmpDir, 'registry.json');
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

  test('readRegistry returns empty projects for missing file', () => {
    const reg = readRegistry(registryPath);
    assert.deepEqual(reg.projects, {});
  });

  test('registerProject adds entry', () => {
    registerProject(registryPath, 'maps-api', {
      path: '/tmp/maps',
      provides: { 'map-api': 'https://maps.example.dev' },
    });
    const reg = readRegistry(registryPath);
    assert.ok(reg.projects['maps-api']);
    assert.equal(reg.projects['maps-api'].status, 'shipped');
  });

  test('isProjectShipped returns true for shipped project', () => {
    registerProject(registryPath, 'maps-api', { path: '/tmp/maps', provides: {} });
    assert.equal(isProjectShipped(registryPath, 'maps-api'), true);
  });

  test('isProjectShipped returns false for unknown project', () => {
    assert.equal(isProjectShipped(registryPath, 'nonexistent'), false);
  });

  test('getProjectArtifacts returns provides object', () => {
    registerProject(registryPath, 'maps-api', {
      path: '/tmp/maps',
      provides: { 'map-api': 'https://maps.example.dev', 'tile-url': 'https://tiles.dev' },
    });
    const artifacts = getProjectArtifacts(registryPath, 'maps-api');
    assert.equal(artifacts['map-api'], 'https://maps.example.dev');
    assert.equal(artifacts['tile-url'], 'https://tiles.dev');
  });
});

describe('Dependency Resolver', () => {
  let tmpDir, registryPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-test-'));
    registryPath = path.join(tmpDir, 'registry.json');
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

  test('resolves when all deps shipped', () => {
    registerProject(registryPath, 'maps-api', { path: '/tmp/maps', provides: {} });
    const manifest = {
      depends_on_projects: [{ name: 'maps-api', reason: 'needs maps', provides: ['map-api'] }],
    };
    const result = resolveDependencies(manifest, registryPath);
    assert.equal(result.resolved, true);
    assert.equal(result.unresolved.length, 0);
  });

  test('returns unresolved for missing deps', () => {
    const manifest = {
      depends_on_projects: [{ name: 'maps-api', reason: 'needs maps', provides: ['map-api'] }],
    };
    const result = resolveDependencies(manifest, registryPath);
    assert.equal(result.resolved, false);
    assert.equal(result.unresolved.length, 1);
    assert.equal(result.unresolved[0].name, 'maps-api');
  });

  test('handles empty depends_on_projects', () => {
    const manifest = { depends_on_projects: [] };
    const result = resolveDependencies(manifest, registryPath);
    assert.equal(result.resolved, true);
  });

  test('handles missing depends_on_projects key', () => {
    const manifest = {};
    const result = resolveDependencies(manifest, registryPath);
    assert.equal(result.resolved, true);
  });

  test('checkCircularDeps detects cycles', () => {
    // A depends on B, B depends on A
    const depGraph = {
      'project-a': ['project-b'],
      'project-b': ['project-a'],
    };
    const cycles = checkCircularDeps(depGraph);
    assert.ok(cycles.length > 0);
  });

  test('checkCircularDeps returns empty for acyclic graph', () => {
    const depGraph = {
      'project-a': ['project-b'],
      'project-b': ['project-c'],
      'project-c': [],
    };
    const cycles = checkCircularDeps(depGraph);
    assert.equal(cycles.length, 0);
  });

  test('max depth enforcement', () => {
    const manifest = {
      depends_on_projects: [
        { name: 'a', reason: 'needs a', provides: [] },
      ],
    };
    // Depth 0 means no deps allowed
    const result = resolveDependencies(manifest, registryPath, { maxDepth: 0 });
    assert.equal(result.resolved, false);
    assert.ok(result.unresolved[0].reason_blocked?.includes('depth'));
  });
});
