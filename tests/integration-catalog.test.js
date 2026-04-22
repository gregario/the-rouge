#!/usr/bin/env node
/**
 * Tests for src/launcher/integration-catalog.js
 *
 * Covers manifest resolution + prerequisite runners + URL templating.
 * The shipped manifests (github-pages, vercel, cloudflare-pages,
 * docker-compose) must all load cleanly and their aliases resolve.
 *
 * Usage: node tests/integration-catalog.test.js
 */

const path = require('path');
const fs = require('fs');
const {
  getManifest,
  runCheck,
  resolveTemplate,
  resolveHealthCheckUrl,
  _resetCache,
} = require('../src/launcher/integration-catalog.js');

let failures = 0;
let checks = 0;

function assert(condition, message) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${message}`);
  }
}

function testGithubPagesManifestLoads() {
  const m = getManifest('github-pages');
  assert(!!m, 'github-pages manifest resolves');
  assert(m.kind === 'deploy', 'github-pages kind=deploy');
  assert(Array.isArray(m.prerequisites), 'has prerequisites');
  assert(m.health_check.url_template.includes('{owner}'), 'url_template uses owner placeholder');
}

function testGhPagesAliasResolves() {
  const m1 = getManifest('github-pages');
  const m2 = getManifest('gh-pages');
  assert(m1 === m2, 'gh-pages alias resolves to the same manifest object');
}

function testCloudflarePagesAliases() {
  const m1 = getManifest('cloudflare-pages');
  const m2 = getManifest('cloudflare');
  const m3 = getManifest('cloudflare-workers');
  assert(m1 && m1 === m2 && m1 === m3, 'cloudflare-pages resolves via all three aliases');
}

function testVercelManifestLoads() {
  const m = getManifest('vercel');
  assert(!!m, 'vercel manifest resolves');
  assert(m.human_name === 'Vercel', 'human_name is set');
}

function testDockerComposeManifestLoads() {
  const m = getManifest('docker-compose');
  assert(!!m, 'docker-compose manifest resolves');
  const aliased = getManifest('docker');
  assert(aliased === m, 'docker alias resolves');
}

function testUnknownTargetReturnsNull() {
  const m = getManifest('never-heard-of-it');
  assert(m === null, 'unknown target → null');
  const empty = getManifest('');
  assert(empty === null, 'empty target → null');
}

function testResolveTemplate() {
  const out = resolveTemplate('repos/{owner}/{repo}/pages', { owner: 'gregario', repo: 'foo' });
  assert(out === 'repos/gregario/foo/pages', 'template substitution works');
  const partial = resolveTemplate('hello {missing}', {});
  assert(partial === 'hello {missing}', 'unknown placeholder is left alone');
}

function testResolveHealthCheckUrl() {
  const m = getManifest('github-pages');
  const url = resolveHealthCheckUrl(m, { owner: 'gregario', repo: 'testproj' });
  assert(url === 'https://gregario.github.io/testproj/', 'github-pages URL templating');
}

function testFileExistsCheck() {
  // Use this repo's own package.json as a known-present file.
  const ok = runCheck({ kind: 'file-exists', path: 'package.json' }, { projectDir: path.resolve(__dirname, '..') });
  assert(ok.ok === true, 'file-exists: present file → ok');
  const missing = runCheck({ kind: 'file-exists', path: 'no-such-file' }, { projectDir: path.resolve(__dirname, '..') });
  assert(missing.ok === false, 'file-exists: missing file → not ok');
}

function testEnvVarCheck() {
  const prev = process.env.ROUGE_CATALOG_TEST;
  process.env.ROUGE_CATALOG_TEST = '1';
  try {
    const ok = runCheck({ kind: 'env-var-present', env_var: 'ROUGE_CATALOG_TEST' }, {});
    assert(ok.ok === true, 'env-var-present: set var → ok');
  } finally {
    if (prev === undefined) delete process.env.ROUGE_CATALOG_TEST;
    else process.env.ROUGE_CATALOG_TEST = prev;
  }
  const missing = runCheck({ kind: 'env-var-present', env_var: 'ROUGE_NEVER_SET_PLEASE' }, {});
  assert(missing.ok === false, 'env-var-present: unset → not ok');
}

function testSecretsPresentCheckDefers() {
  // Secrets checks are handled by the caller (secrets module) to avoid
  // circular requires. Catalog returns {ok:false} with a hint.
  const r = runCheck({ kind: 'secret-present', secret_key: 'SOMETHING' }, {});
  assert(r.ok === false, 'secret-present defers with ok:false');
  assert(r.detail && r.detail.includes('secret-present'), 'detail explains deferral');
}

function testUnknownCheckKind() {
  const r = runCheck({ kind: 'mystery-protocol' }, {});
  assert(r.ok === false, 'unknown check kind → not ok');
}

function main() {
  _resetCache();
  console.log('integration-catalog reader');
  testGithubPagesManifestLoads();
  testGhPagesAliasResolves();
  testCloudflarePagesAliases();
  testVercelManifestLoads();
  testDockerComposeManifestLoads();
  testUnknownTargetReturnsNull();
  testResolveTemplate();
  testResolveHealthCheckUrl();
  testFileExistsCheck();
  testEnvVarCheck();
  testSecretsPresentCheckDefers();
  testUnknownCheckKind();
  console.log(`  ${checks} checks, ${failures} failures`);
  if (failures > 0) {
    console.error('FAIL');
    process.exit(1);
  }
  console.log('PASS');
}

main();
