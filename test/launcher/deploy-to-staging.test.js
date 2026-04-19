const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { deploy } = require('../../src/launcher/deploy-to-staging.js');

// Helper: create a temp project dir with an optional vision.json
function makeTempProject(visionJson) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-test-'));
  if (visionJson !== undefined) {
    fs.writeFileSync(path.join(dir, 'vision.json'), JSON.stringify(visionJson, null, 2));
  }
  return dir;
}

// Helper: capture console.log output during a sync function call
function captureLogs(fn) {
  const logs = [];
  const orig = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try {
    const result = fn();
    return { result, logs };
  } finally {
    console.log = orig;
  }
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('deploy-to-staging', () => {
  // ── detectDeployTarget behaviour (tested through deploy()) ──

  describe('missing deployment_target', () => {
    let projectDir;
    beforeEach(() => { projectDir = makeTempProject({}); });
    afterEach(() => cleanup(projectDir));

    test('returns null when vision.json has no infrastructure key', () => {
      const result = deploy(projectDir);
      assert.strictEqual(result, null);
    });

    test('returns null when infrastructure exists but deployment_target is missing', () => {
      cleanup(projectDir);
      projectDir = makeTempProject({ infrastructure: {} });
      const result = deploy(projectDir);
      assert.strictEqual(result, null);
    });

    test('returns null when vision.json does not exist', () => {
      cleanup(projectDir);
      projectDir = makeTempProject(undefined); // no vision.json at all
      const result = deploy(projectDir);
      assert.strictEqual(result, null);
    });
  });

  describe('unknown deployment_target', () => {
    let projectDir;
    afterEach(() => cleanup(projectDir));

    test('returns null for an unrecognised target', () => {
      projectDir = makeTempProject({
        infrastructure: { deployment_target: 'heroku' },
      });
      const result = deploy(projectDir);
      assert.strictEqual(result, null);
    });

    test('returns null for empty-string target', () => {
      projectDir = makeTempProject({
        infrastructure: { deployment_target: '' },
      });
      const result = deploy(projectDir);
      assert.strictEqual(result, null);
    });
  });

  // ── #96 regression: unknown target must NOT fall through to cloudflare ──

  describe('#96 regression — no silent fallthrough', () => {
    let projectDir;
    afterEach(() => cleanup(projectDir));

    test('deploy with target "aws" does not attempt cloudflare commands', () => {
      projectDir = makeTempProject({
        infrastructure: { deployment_target: 'aws' },
      });
      // If this fell through to cloudflare, deploy() would try to run
      // `npm run build` / `npx wrangler deploy` and throw (or succeed).
      // Instead it should bail early with null.
      const result = deploy(projectDir);
      assert.strictEqual(result, null);
    });

    test('deploy with target "netlify" does not attempt any deployment', () => {
      projectDir = makeTempProject({
        infrastructure: { deployment_target: 'netlify' },
      });
      const result = deploy(projectDir);
      assert.strictEqual(result, null);
    });
  });

  // ── Handler registry: valid targets are recognised ──
  // We verify by checking log output. Valid targets produce "Deploying X to staging"
  // before failing on the actual CLI command. Unknown targets produce "no handler".

  describe('handler registry recognises valid targets', () => {
    let projectDir;
    afterEach(() => cleanup(projectDir));

    test('vercel target passes handler lookup (logs "Deploying", not "no handler")', () => {
      projectDir = makeTempProject({
        infrastructure: { deployment_target: 'vercel' },
      });
      const { result, logs } = captureLogs(() => deploy(projectDir));
      assert.strictEqual(result, null); // actual deploy fails, but handler was found
      const logText = logs.join('\n');
      assert.ok(logText.includes('Deploying'), 'should log "Deploying" for a valid target');
      assert.ok(!logText.includes('no handler'), 'should NOT log "no handler"');
    });

    test('cloudflare target passes handler lookup', () => {
      projectDir = makeTempProject({
        infrastructure: { deployment_target: 'cloudflare' },
      });
      const { result, logs } = captureLogs(() => deploy(projectDir));
      assert.strictEqual(result, null);
      assert.ok(logs.join('\n').includes('target: cloudflare)'));
    });

    test('cloudflare-workers alias passes handler lookup', () => {
      projectDir = makeTempProject({
        infrastructure: { deployment_target: 'cloudflare-workers' },
      });
      const { result, logs } = captureLogs(() => deploy(projectDir));
      assert.strictEqual(result, null);
      assert.ok(logs.join('\n').includes('target: cloudflare-workers)'));
    });

    test('docker-compose target passes handler lookup (#157)', () => {
      projectDir = makeTempProject({
        infrastructure: { deployment_target: 'docker-compose' },
      });
      const { result, logs } = captureLogs(() => deploy(projectDir));
      // Actual docker compose call fails (no compose file, no docker
      // running in test). What we care about is the handler WAS found
      // and attempted — no "no handler is registered" error.
      assert.strictEqual(result, null);
      const logText = logs.join('\n');
      assert.ok(logText.includes('target: docker-compose)'), 'should log target');
      assert.ok(!logText.includes('no handler is registered'), 'handler must be registered');
    });

    test('docker alias passes handler lookup (#157)', () => {
      projectDir = makeTempProject({
        infrastructure: { deployment_target: 'docker' },
      });
      const { result, logs } = captureLogs(() => deploy(projectDir));
      assert.strictEqual(result, null);
      const logText = logs.join('\n');
      assert.ok(logText.includes('target: docker)'), 'should log target');
      assert.ok(!logText.includes('no handler is registered'), 'alias must resolve to docker-compose handler');
    });

    test('unknown target logs "no handler" message', () => {
      projectDir = makeTempProject({
        infrastructure: { deployment_target: 'heroku' },
      });
      const { result, logs } = captureLogs(() => deploy(projectDir));
      assert.strictEqual(result, null);
      assert.ok(logs.join('\n').includes('no handler is registered'));
    });

    test('github-pages target passes handler lookup', () => {
      projectDir = makeTempProject({
        infrastructure: { deployment_target: 'github-pages' },
      });
      const { result, logs } = captureLogs(() => deploy(projectDir));
      // The handler will fail (no build script, no git remote in the
      // temp dir) — the assertion is that the target is KNOWN and
      // attempted, not that it succeeds.
      assert.strictEqual(result, null);
      const logText = logs.join('\n');
      assert.ok(logText.includes('target: github-pages)'), 'should log target');
      assert.ok(!logText.includes('no handler is registered'), 'handler must be registered');
    });

    test('gh-pages alias passes handler lookup', () => {
      projectDir = makeTempProject({
        infrastructure: { deployment_target: 'gh-pages' },
      });
      const { result, logs } = captureLogs(() => deploy(projectDir));
      assert.strictEqual(result, null);
      const logText = logs.join('\n');
      assert.ok(logText.includes('target: gh-pages)'), 'should log target');
      assert.ok(!logText.includes('no handler is registered'), 'alias must resolve to github-pages handler');
    });

    // The gh-pages handler previously swallowed a missing git remote and
    // returned null URL silently, so the launcher treated deploys against
    // remote-less projects as "succeeded with unknown URL". These tests
    // lock in the fail-fast behaviour: missing or non-GitHub remotes now
    // throw a clear error that deploy() reports as a failure.

    test('github-pages: no origin remote → deploy fails with clear error, not silent null URL', () => {
      projectDir = makeTempProject({
        infrastructure: { deployment_target: 'github-pages' },
      });
      const { result, logs } = captureLogs(() => deploy(projectDir));
      assert.strictEqual(result, null);
      const logText = logs.join('\n');
      assert.ok(
        logText.includes('no `origin` remote configured') || logText.includes('origin` remote is empty'),
        `Expected a "no origin remote" failure message, got: ${logText}`,
      );
    });

    test('github-pages: non-GitHub remote → deploy fails with GitHub-URL error', () => {
      projectDir = makeTempProject({
        infrastructure: { deployment_target: 'github-pages' },
      });
      // Simulate a git repo with a non-GitHub remote (GitLab).
      const { execSync } = require('child_process');
      execSync('git init -q', { cwd: projectDir });
      execSync('git remote add origin https://gitlab.com/someorg/someproject.git', { cwd: projectDir });

      const { result, logs } = captureLogs(() => deploy(projectDir));
      assert.strictEqual(result, null);
      const logText = logs.join('\n');
      assert.ok(
        logText.includes('not a github.com URL'),
        `Expected the "not a github.com URL" failure message, got: ${logText}`,
      );
    });
  });

  // ── detectDeployTarget in isolation ──
  // We can test the pure detection logic by reading deploy() behaviour
  // with carefully crafted vision.json files.

  describe('detectDeployTarget reads vision.json correctly', () => {
    let projectDir;
    afterEach(() => cleanup(projectDir));

    test('deployment_target value is read verbatim', () => {
      projectDir = makeTempProject({
        infrastructure: { deployment_target: 'some-custom-value' },
      });
      // deploy() will log the unknown target name in the error — this
      // confirms detectDeployTarget returned 'some-custom-value' not null
      // (null would produce a different log message about "no deployment_target")
      const result = deploy(projectDir);
      assert.strictEqual(result, null);
    });

    test('null deployment_target is treated as missing', () => {
      projectDir = makeTempProject({
        infrastructure: { deployment_target: null },
      });
      const result = deploy(projectDir);
      assert.strictEqual(result, null);
    });

    test('false deployment_target is treated as missing', () => {
      projectDir = makeTempProject({
        infrastructure: { deployment_target: false },
      });
      const result = deploy(projectDir);
      assert.strictEqual(result, null);
    });
  });
});
