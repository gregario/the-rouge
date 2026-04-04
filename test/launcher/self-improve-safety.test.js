const { test, describe } = require('node:test');
const assert = require('node:assert');

const { isFileAllowed, isFileBlocked, validateImprovementScope } = require('../../src/launcher/self-improve-safety.js');

const DEFAULT_CONFIG = {
  allowlist: ['src/prompts/loop/*.md', 'src/prompts/seeding/*.md', 'docs/design/*.md'],
  blocklist: ['src/launcher/*.js', '.claude/settings.json', 'rouge.config.json', 'rouge-safety-check.sh'],
  test_budget_usd: 5,
};

describe('Self-Improvement Safety', () => {
  describe('isFileAllowed', () => {
    test('allows prompt files', () => {
      assert.equal(isFileAllowed('src/prompts/loop/01-building.md', DEFAULT_CONFIG.allowlist), true);
      assert.equal(isFileAllowed('src/prompts/seeding/04-spec.md', DEFAULT_CONFIG.allowlist), true);
    });

    test('allows design docs', () => {
      assert.equal(isFileAllowed('docs/design/state-schema.md', DEFAULT_CONFIG.allowlist), true);
    });

    test('rejects files not on allowlist', () => {
      assert.equal(isFileAllowed('src/launcher/rouge-loop.js', DEFAULT_CONFIG.allowlist), false);
      assert.equal(isFileAllowed('package.json', DEFAULT_CONFIG.allowlist), false);
    });
  });

  describe('isFileBlocked', () => {
    test('blocks launcher files', () => {
      assert.equal(isFileBlocked('src/launcher/rouge-loop.js', DEFAULT_CONFIG.blocklist), true);
      assert.equal(isFileBlocked('src/launcher/safety.js', DEFAULT_CONFIG.blocklist), true);
    });

    test('blocks config files', () => {
      assert.equal(isFileBlocked('.claude/settings.json', DEFAULT_CONFIG.blocklist), true);
      assert.equal(isFileBlocked('rouge.config.json', DEFAULT_CONFIG.blocklist), true);
    });

    test('does not block allowed files', () => {
      assert.equal(isFileBlocked('src/prompts/loop/01-building.md', DEFAULT_CONFIG.blocklist), false);
    });
  });

  describe('validateImprovementScope', () => {
    test('accepts valid file list', () => {
      const result = validateImprovementScope(
        ['src/prompts/loop/01-building.md', 'src/prompts/loop/04-analyzing.md'],
        DEFAULT_CONFIG
      );
      assert.equal(result.valid, true);
      assert.equal(result.rejected.length, 0);
    });

    test('rejects blocked files', () => {
      const result = validateImprovementScope(
        ['src/prompts/loop/01-building.md', 'src/launcher/rouge-loop.js'],
        DEFAULT_CONFIG
      );
      assert.equal(result.valid, false);
      assert.equal(result.rejected.length, 1);
      assert.ok(result.rejected[0].includes('rouge-loop.js'));
    });

    test('rejects files not on allowlist', () => {
      const result = validateImprovementScope(
        ['src/prompts/loop/01-building.md', 'package.json'],
        DEFAULT_CONFIG
      );
      assert.equal(result.valid, false);
      assert.equal(result.rejected.length, 1);
    });
  });
});
