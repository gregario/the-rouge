const { test, describe } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Real CLI spawn tests. Covers G6 (real rouge-cli spawn) and G10
// (feasibility end-to-end). Unlike tests/cli.test.js (which mocks
// execFileSync and verifies call sites), these actually invoke the
// binary in a sandboxed tmp dir so regressions in argument parsing
// or command dispatch get caught.

const CLI = path.resolve(__dirname, '..', '..', 'src', 'launcher', 'rouge-cli.js');

function runCli(args, opts = {}) {
  const { env: extraEnv, ...rest } = opts;
  return spawnSync('node', [CLI, ...args], {
    encoding: 'utf8',
    timeout: 15000,
    ...rest,
    env: {
      ...process.env,
      // Force the none-secrets backend so tests don't prompt for
      // keychain access on CI or dev machines.
      ROUGE_SECRETS_BACKEND: 'none',
      ...(extraEnv || {}),
    },
  });
}

describe('CLI integration — real spawn', () => {
  test('rouge --help exits 0 and mentions core commands', () => {
    const r = runCli(['--help']);
    // --help may exit 0 or 1 depending on implementation; what we
    // care about is that it ran and produced structured output.
    assert.ok(r.status === 0 || r.status === 1, `unexpected exit ${r.status}: ${r.stderr}`);
    const combined = (r.stdout || '') + (r.stderr || '');
    assert.match(combined, /init/);
    assert.match(combined, /seed/);
    assert.match(combined, /build/);
    assert.match(combined, /status/);
  });

  test('rouge with no args prints usage', () => {
    const r = runCli([]);
    const combined = (r.stdout || '') + (r.stderr || '');
    assert.ok(combined.length > 0, 'expected usage output');
  });

  test('rouge init creates a project directory at ROUGE_PROJECTS_DIR', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-cli-init-'));
    try {
      const r = runCli(['init', 'test-project'], {
        cwd: tmp,
        env: { ROUGE_PROJECTS_DIR: tmp },
      });
      assert.equal(r.status, 0, `init failed: ${r.stderr}`);
      const projectDir = path.join(tmp, 'test-project');
      assert.ok(fs.existsSync(projectDir), 'project dir not created');
      // init itself only creates the directory + a .gitkeep; state.json
      // appears during seeding. Just verify the dir landed at the right
      // place with ROUGE_PROJECTS_DIR honoured.
      const combined = (r.stdout || '') + (r.stderr || '');
      assert.match(combined, /Project created/i);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('rouge init rejects existing project name', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-cli-init-'));
    try {
      const first = runCli(['init', 'dupe'], { cwd: tmp, env: { ROUGE_PROJECTS_DIR: tmp } });
      assert.equal(first.status, 0);
      const second = runCli(['init', 'dupe'], { cwd: tmp, env: { ROUGE_PROJECTS_DIR: tmp } });
      assert.notEqual(second.status, 0, 'expected non-zero exit on duplicate init');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('rouge feasibility "add mapbox-geocoding" produces a structured verdict', () => {
    const r = runCli(['feasibility', 'add mapbox geocoding for address lookup']);
    assert.equal(r.status, 0, `feasibility failed: ${r.stderr}`);
    const combined = (r.stdout || '') + (r.stderr || '');
    // Verdict is one of: ready, escalate, defer
    assert.match(combined, /proceed|escalate|defer/i);
    // Output should include the four checks by name
    assert.match(combined, /scope/i);
    assert.match(combined, /knowledge/i);
    assert.match(combined, /tools/i);
    assert.match(combined, /testab/i);
  });

  test('rouge feasibility with --type integration is accepted', () => {
    const r = runCli(['feasibility', '--type', 'integration', 'add resend email transactional']);
    assert.equal(r.status, 0, `typed feasibility failed: ${r.stderr}`);
    const combined = (r.stdout || '') + (r.stderr || '');
    assert.match(combined, /proceed|escalate|defer/i);
  });
});
