const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const child_process = require('child_process');

const {
  provisionCloudflare,
  provisionSupabase,
  getSupabaseToken,
  supabaseApi,
} = require('../../src/launcher/provision-infrastructure.js');

// These tests validate the file-writing + decision logic of the
// provisioning functions without hitting real Cloudflare / Supabase
// APIs. `execSync` is mocked per-test via node:test's t.mock API.
// The intent: catch regressions in the gate-and-write paths that
// happen before (or instead of) subprocess calls, since those paths
// are where real-world bugs have landed (wrong project name in
// wrangler.toml, missing env var in readiness detection, etc.).

function makeProject(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'provision-test-'));
  for (const [name, content] of Object.entries(files)) {
    const p = path.join(dir, name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('provision-infrastructure', () => {
  // ── provisionCloudflare: file-writing paths ──

  describe('provisionCloudflare', () => {
    let projectDir;

    beforeEach(() => {
      projectDir = makeProject({
        'package.json': {
          name: 'test-product',
          devDependencies: { '@opennextjs/cloudflare': '^1.0.0' },
        },
      });
    });

    afterEach(() => cleanup(projectDir));

    test('writes wrangler.toml with correct project name when absent', (t) => {
      t.mock.method(child_process, 'execSync', () => ''); // mock the build call

      provisionCloudflare(projectDir, 'test-product');

      const wrangler = fs.readFileSync(path.join(projectDir, 'wrangler.toml'), 'utf8');
      assert.match(wrangler, /name = "test-product"/);
      assert.match(wrangler, /main = "\.open-next\/worker\.js"/);
      assert.match(wrangler, /\[env\.staging\]/);
      assert.match(wrangler, /name = "test-product-staging"/);
    });

    test('writes open-next.config.ts with cloudflare-node wrapper', (t) => {
      t.mock.method(child_process, 'execSync', () => '');

      provisionCloudflare(projectDir, 'test-product');

      const cfg = fs.readFileSync(path.join(projectDir, 'open-next.config.ts'), 'utf8');
      assert.match(cfg, /cloudflare-node/);
      assert.match(cfg, /cloudflare-edge/);
      assert.match(cfg, /edgeExternals: \['node:crypto'\]/);
    });

    test('does not overwrite an existing wrangler.toml', (t) => {
      fs.writeFileSync(
        path.join(projectDir, 'wrangler.toml'),
        'name = "custom-name"\ncompatibility_date = "2024-01-01"\n',
      );
      t.mock.method(child_process, 'execSync', () => '');

      provisionCloudflare(projectDir, 'whatever');

      const wrangler = fs.readFileSync(path.join(projectDir, 'wrangler.toml'), 'utf8');
      assert.match(wrangler, /name = "custom-name"/);
      assert.doesNotMatch(wrangler, /name = "whatever"/);
    });

    test('installs @opennextjs/cloudflare when package.json lacks it', (t) => {
      // Overwrite with a package.json that has no OpenNext dep
      fs.writeFileSync(
        path.join(projectDir, 'package.json'),
        JSON.stringify({ name: 'test-product' }),
      );
      const calls = [];
      t.mock.method(child_process, 'execSync', (cmd) => {
        calls.push(cmd);
        return '';
      });

      provisionCloudflare(projectDir, 'test-product');

      assert.ok(
        calls.some((c) => /npm install -D @opennextjs\/cloudflare/.test(c)),
        `expected install call, got: ${calls.join(' | ')}`,
      );
    });

    test('skips install when @opennextjs/cloudflare already in devDependencies', (t) => {
      const calls = [];
      t.mock.method(child_process, 'execSync', (cmd) => {
        calls.push(cmd);
        return '';
      });

      provisionCloudflare(projectDir, 'test-product');

      assert.ok(
        !calls.some((c) => /npm install -D @opennextjs\/cloudflare/.test(c)),
        'did not expect install call when dep is already present',
      );
    });

    test('runs @opennextjs/cloudflare build after setup', (t) => {
      const calls = [];
      t.mock.method(child_process, 'execSync', (cmd) => {
        calls.push(cmd);
        return '';
      });

      provisionCloudflare(projectDir, 'test-product');

      assert.ok(
        calls.some((c) => /@opennextjs\/cloudflare build/.test(c)),
        `expected build call, got: ${calls.join(' | ')}`,
      );
    });
  });

  // ── getSupabaseToken: env fallback when keychain fails ──

  describe('getSupabaseToken', () => {
    test('falls back to SUPABASE_ACCESS_TOKEN env var when keychain fails', (t) => {
      // Mock the keychain lookup to throw (simulating no macOS keychain
      // entry). That forces getSupabaseToken to the env fallback path.
      t.mock.method(child_process, 'execSync', () => {
        throw new Error('security: The specified item could not be found');
      });
      const prior = process.env.SUPABASE_ACCESS_TOKEN;
      process.env.SUPABASE_ACCESS_TOKEN = 'sbp_test_token';
      try {
        const tok = getSupabaseToken();
        assert.equal(tok, 'sbp_test_token');
      } finally {
        if (prior === undefined) delete process.env.SUPABASE_ACCESS_TOKEN;
        else process.env.SUPABASE_ACCESS_TOKEN = prior;
      }
    });

    test('returns null when keychain fails AND env var missing', (t) => {
      t.mock.method(child_process, 'execSync', () => {
        throw new Error('no keychain entry');
      });
      const prior = process.env.SUPABASE_ACCESS_TOKEN;
      delete process.env.SUPABASE_ACCESS_TOKEN;
      try {
        assert.equal(getSupabaseToken(), null);
      } finally {
        if (prior !== undefined) process.env.SUPABASE_ACCESS_TOKEN = prior;
      }
    });
  });

  // ── supabaseApi: URL construction ──

  describe('supabaseApi', () => {
    test('constructs the correct curl command with auth + content-type', (t) => {
      let capturedCmd = '';
      t.mock.method(child_process, 'execSync', (cmd) => {
        capturedCmd = cmd;
        return '{"ok":true}';
      });

      const result = supabaseApi('GET', '/projects', 'sbp_abc123');

      assert.match(capturedCmd, /curl -s -X GET/);
      assert.match(capturedCmd, /https:\/\/api\.supabase\.com\/v1\/projects/);
      assert.match(capturedCmd, /Authorization: Bearer sbp_abc123/);
      assert.match(capturedCmd, /Content-Type: application\/json/);
      assert.deepEqual(result, { ok: true });
    });

    test('throws when curl output is not JSON (upstream contract)', (t) => {
      // Documented behaviour: supabaseApi trusts the Supabase API to
      // return JSON on 2xx. A non-JSON response means something's
      // very wrong (DNS failure, proxy HTML, etc.) — throwing here is
      // the right signal to the caller. Test pins that contract.
      t.mock.method(child_process, 'execSync', () => 'not json at all');
      assert.throws(() => supabaseApi('GET', '/projects', 'token'), /Unexpected token/);
    });
  });

  // ── provisionSupabase: context gate ──

  describe('provisionSupabase', () => {
    let projectDir;

    beforeEach(() => {
      projectDir = makeProject({
        'cycle_context.json': {
          infrastructure: { services: ['supabase'] },
        },
      });
    });

    afterEach(() => cleanup(projectDir));

    test('no-op when no SUPABASE token available', (t) => {
      const prior = process.env.SUPABASE_ACCESS_TOKEN;
      delete process.env.SUPABASE_ACCESS_TOKEN;
      // Mock execSync to always throw — simulates keychain lookup
      // failing, which forces getSupabaseToken down the env path,
      // which returns null since we unset it. No network call can
      // happen because provisionSupabase returns early.
      t.mock.method(child_process, 'execSync', () => {
        throw new Error('keychain lookup failed in test');
      });
      try {
        assert.doesNotThrow(() => provisionSupabase(projectDir, 'test-product'));
      } finally {
        if (prior !== undefined) process.env.SUPABASE_ACCESS_TOKEN = prior;
      }
    });
  });
});
