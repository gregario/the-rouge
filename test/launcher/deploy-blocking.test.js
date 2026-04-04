const { test, describe } = require('node:test');
const assert = require('node:assert');

const { deployWithRetry, shouldBlockMilestoneCheck } = require('../../src/launcher/deploy-blocking.js');

describe('Deploy Blocking', () => {
  describe('deployWithRetry', () => {
    test('returns staging URL on first success', async () => {
      let calls = 0;
      const mockDeploy = () => { calls++; return 'https://staging.example.workers.dev'; };
      const result = await deployWithRetry(mockDeploy, { maxRetries: 3, retryDelayMs: 0 });
      assert.equal(result.url, 'https://staging.example.workers.dev');
      assert.equal(result.blocked, false);
      assert.equal(calls, 1);
    });

    test('retries on failure and succeeds on 2nd attempt', async () => {
      let calls = 0;
      const mockDeploy = () => {
        calls++;
        if (calls === 1) return null;
        return 'https://staging.example.workers.dev';
      };
      const result = await deployWithRetry(mockDeploy, { maxRetries: 3, retryDelayMs: 0 });
      assert.equal(result.url, 'https://staging.example.workers.dev');
      assert.equal(result.blocked, false);
      assert.equal(calls, 2);
    });

    test('returns blocked after max retries', async () => {
      let calls = 0;
      const mockDeploy = () => { calls++; return null; };
      const result = await deployWithRetry(mockDeploy, { maxRetries: 3, retryDelayMs: 0 });
      assert.equal(result.url, null);
      assert.equal(result.blocked, true);
      assert.ok(result.reason.includes('3'));
      assert.equal(calls, 3);
    });

    test('handles deploy throwing an error', async () => {
      let calls = 0;
      const mockDeploy = () => { calls++; throw new Error('network error'); };
      const result = await deployWithRetry(mockDeploy, { maxRetries: 2, retryDelayMs: 0 });
      assert.equal(result.url, null);
      assert.equal(result.blocked, true);
      assert.equal(calls, 2);
    });
  });

  describe('shouldBlockMilestoneCheck', () => {
    test('returns true when deploy result is blocked', () => {
      assert.equal(shouldBlockMilestoneCheck({ blocked: true, url: null, reason: 'failed' }), true);
    });

    test('returns false when deploy succeeded', () => {
      assert.equal(shouldBlockMilestoneCheck({ blocked: false, url: 'https://staging.example.workers.dev' }), false);
    });

    test('returns true when deploy result is null', () => {
      assert.equal(shouldBlockMilestoneCheck(null), true);
    });
  });
});
