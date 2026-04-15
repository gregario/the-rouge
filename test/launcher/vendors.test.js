const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadVendors, validateManifest, mergedDenyPatterns } = require('../../src/launcher/vendors');
const { ROUGE_CORE_DENY, buildDenylistArgs } = require('../../src/launcher/tool-permissions');

function withTempVendors(vendorDirs, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-vendors-'));
  try {
    for (const [name, files] of Object.entries(vendorDirs)) {
      const dir = path.join(root, name);
      fs.mkdirSync(dir, { recursive: true });
      for (const [filename, content] of Object.entries(files)) {
        fs.writeFileSync(
          path.join(dir, filename),
          typeof content === 'string' ? content : JSON.stringify(content, null, 2)
        );
      }
    }
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const validManifest = {
  name: 'example',
  version: 1,
  deny_patterns: ['Bash(example *)'],
  intents: [{ name: 'deploy-staging', handler: 'deployStaging' }],
  ownership_fence: { manifest_field: 'example_id', verify: 'verifyOwnership' },
};

describe('vendor manifest validation', () => {
  test('accepts a minimal valid manifest', () => {
    const errors = validateManifest(validManifest, '/tmp/example');
    assert.deepStrictEqual(errors, []);
  });

  test('rejects missing required fields', () => {
    const errors = validateManifest({}, '/tmp/example');
    assert.ok(errors.some(e => e.includes('name')));
    assert.ok(errors.some(e => e.includes('version')));
    assert.ok(errors.some(e => e.includes('intents')));
    assert.ok(errors.some(e => e.includes('ownership_fence')));
  });

  test('rejects name mismatching directory', () => {
    const errors = validateManifest({ ...validManifest, name: 'other' }, '/tmp/example');
    assert.ok(errors.some(e => e.includes('must match directory')));
  });

  test('rejects non-kebab-case names', () => {
    const errors = validateManifest({ ...validManifest, name: 'Example' }, '/tmp/Example');
    assert.ok(errors.some(e => e.includes('kebab-case')));
  });

  test('rejects empty intents array', () => {
    const errors = validateManifest({ ...validManifest, intents: [] }, '/tmp/example');
    assert.ok(errors.some(e => e.includes('non-empty')));
  });

  test('rejects intent missing name or handler', () => {
    const errors = validateManifest(
      { ...validManifest, intents: [{ name: 'x' }] },
      '/tmp/example'
    );
    assert.ok(errors.some(e => e.includes('handler')));
  });

  test('rejects ownership_fence missing required fields', () => {
    const errors = validateManifest(
      { ...validManifest, ownership_fence: {} },
      '/tmp/example'
    );
    assert.ok(errors.some(e => e.includes('manifest_field')));
    assert.ok(errors.some(e => e.includes('verify')));
  });
});

describe('vendor auto-discovery', () => {
  test('empty directory returns no vendors and no errors', () => {
    withTempVendors({}, (root) => {
      const { vendors, errors } = loadVendors(root);
      assert.deepStrictEqual(vendors, []);
      assert.deepStrictEqual(errors, []);
    });
  });

  test('loads a valid manifest', () => {
    withTempVendors({ example: { 'manifest.json': validManifest } }, (root) => {
      const { vendors, errors } = loadVendors(root);
      assert.strictEqual(errors.length, 0);
      assert.strictEqual(vendors.length, 1);
      assert.strictEqual(vendors[0].name, 'example');
    });
  });

  test('reports parse errors', () => {
    withTempVendors({ broken: { 'manifest.json': '{ not valid json' } }, (root) => {
      const { vendors, errors } = loadVendors(root);
      assert.strictEqual(vendors.length, 0);
      assert.ok(errors[0].includes('parse error'));
    });
  });

  test('reports validation errors', () => {
    withTempVendors({ bad: { 'manifest.json': { name: 'bad' } } }, (root) => {
      const { vendors, errors } = loadVendors(root);
      assert.strictEqual(vendors.length, 0);
      assert.ok(errors[0].includes('bad:'));
    });
  });

  test('rejects handler.js missing declared intent export', () => {
    withTempVendors(
      {
        example: {
          'manifest.json': validManifest,
          'handler.js': 'module.exports = { verifyOwnership: () => {} }',
        },
      },
      (root) => {
        const { vendors, errors } = loadVendors(root);
        assert.strictEqual(vendors.length, 0);
        assert.ok(errors[0].includes('deployStaging'));
      }
    );
  });

  test('accepts handler.js with all required exports', () => {
    withTempVendors(
      {
        example: {
          'manifest.json': validManifest,
          'handler.js': 'module.exports = { deployStaging: () => {}, verifyOwnership: () => {} }',
        },
      },
      (root) => {
        const { vendors, errors } = loadVendors(root);
        assert.strictEqual(errors.length, 0);
        assert.strictEqual(vendors.length, 1);
      }
    );
  });

  test('mergedDenyPatterns deduplicates across vendors', () => {
    const vs = [
      { deny_patterns: ['Bash(a)', 'Bash(b)'] },
      { deny_patterns: ['Bash(b)', 'Bash(c)'] },
    ];
    assert.deepStrictEqual(mergedDenyPatterns(vs).sort(), ['Bash(a)', 'Bash(b)', 'Bash(c)']);
  });
});

describe('tool-permissions denylist', () => {
  test('ROUGE_CORE_DENY blocks all known provider CLIs', () => {
    for (const tool of ['vercel', 'supabase', 'gh', 'wrangler', 'flyctl', 'aws', 'gcloud', 'heroku']) {
      assert.ok(
        ROUGE_CORE_DENY.some(p => p.includes(tool)),
        `expected denylist to cover ${tool}`
      );
    }
  });

  test('ROUGE_CORE_DENY blocks git push, destructive rm, and network fetch', () => {
    assert.ok(ROUGE_CORE_DENY.includes('Bash(git push *)'));
    assert.ok(ROUGE_CORE_DENY.includes('Bash(rm -rf *)'));
    assert.ok(ROUGE_CORE_DENY.includes('Bash(curl *)'));
    assert.ok(ROUGE_CORE_DENY.includes('Bash(wget *)'));
  });

  test('buildDenylistArgs prepends --disallowedTools and includes core patterns', () => {
    const { args } = buildDenylistArgs({ reload: true });
    assert.strictEqual(args[0], '--disallowedTools');
    assert.ok(args.includes('Bash(vercel *)'));
    assert.ok(args.includes('Bash(git push *)'));
  });
});
