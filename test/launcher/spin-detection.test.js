const { test, describe } = require('node:test');
const assert = require('node:assert');

const { detectZeroDeltaSpin, detectDuplicateStories, detectTimeStall, shouldEscalateForSpin } = require('../../src/launcher/safety.js');

describe('Spin Detection', () => {
  describe('detectZeroDeltaSpin', () => {
    test('returns false when no zero-delta stories', () => {
      const history = [
        { name: 'story-a', delta: 45, duration_ms: 480000 },
        { name: 'story-b', delta: 30, duration_ms: 360000 },
      ];
      assert.equal(detectZeroDeltaSpin(history), false);
    });

    test('returns false when fewer than 3 zero-delta stories', () => {
      const history = [
        { name: 'story-a', delta: 45, duration_ms: 480000 },
        { name: 'story-b', delta: 0, duration_ms: 120000 },
        { name: 'story-c', delta: 0, duration_ms: 120000 },
      ];
      assert.equal(detectZeroDeltaSpin(history), false);
    });

    test('returns true when 3+ zero-delta stories', () => {
      const history = [
        { name: 'story-a', delta: 0, duration_ms: 120000 },
        { name: 'story-b', delta: 0, duration_ms: 120000 },
        { name: 'story-c', delta: 0, duration_ms: 120000 },
      ];
      assert.equal(detectZeroDeltaSpin(history), true);
    });

    test('handles empty history', () => {
      assert.equal(detectZeroDeltaSpin([]), false);
    });
  });

  describe('detectDuplicateStories', () => {
    test('returns empty array when no duplicates', () => {
      const history = [
        { name: 'story-a', delta: 10 },
        { name: 'story-b', delta: 20 },
      ];
      assert.deepEqual(detectDuplicateStories(history), []);
    });

    test('returns duplicate story names', () => {
      const history = [
        { name: 'story-a', delta: 10 },
        { name: 'story-b', delta: 20 },
        { name: 'story-a', delta: 0 },
      ];
      assert.deepEqual(detectDuplicateStories(history), ['story-a']);
    });

    test('returns each duplicate only once', () => {
      const history = [
        { name: 'story-a', delta: 10 },
        { name: 'story-a', delta: 0 },
        { name: 'story-a', delta: 0 },
      ];
      assert.deepEqual(detectDuplicateStories(history), ['story-a']);
    });
  });

  describe('detectTimeStall', () => {
    test('returns false when recent progress exists', () => {
      const now = Date.now();
      assert.equal(detectTimeStall(now - 5 * 60 * 1000, now, 30), false);
    });

    test('returns true when no progress for threshold minutes', () => {
      const now = Date.now();
      assert.equal(detectTimeStall(now - 31 * 60 * 1000, now, 30), true);
    });

    test('returns false at exactly threshold', () => {
      const now = Date.now();
      assert.equal(detectTimeStall(now - 30 * 60 * 1000, now, 30), false);
    });
  });

  describe('shouldEscalateForSpin', () => {
    test('returns null when no spin detected', () => {
      const result = shouldEscalateForSpin({
        stories_executed: [
          { name: 'story-a', delta: 45, duration_ms: 480000 },
        ],
        last_meaningful_progress_at: Date.now(),
      }, { zero_delta_threshold: 3, time_stall_minutes: 30 });
      assert.equal(result, null);
    });

    test('returns reason for zero-delta spin', () => {
      const result = shouldEscalateForSpin({
        stories_executed: [
          { name: 'a', delta: 0, duration_ms: 120000 },
          { name: 'b', delta: 0, duration_ms: 120000 },
          { name: 'c', delta: 0, duration_ms: 120000 },
        ],
        last_meaningful_progress_at: Date.now(),
      }, { zero_delta_threshold: 3, time_stall_minutes: 30 });
      assert.ok(result);
      assert.ok(result.includes('zero'));
    });

    test('returns reason for duplicate stories', () => {
      const result = shouldEscalateForSpin({
        stories_executed: [
          { name: 'story-a', delta: 10, duration_ms: 120000 },
          { name: 'story-a', delta: 0, duration_ms: 120000 },
        ],
        last_meaningful_progress_at: Date.now(),
      }, { zero_delta_threshold: 3, time_stall_minutes: 30 });
      assert.ok(result);
      assert.ok(result.includes('duplicate') || result.includes('Duplicate'));
    });

    test('returns reason for time stall', () => {
      const result = shouldEscalateForSpin({
        stories_executed: [],
        last_meaningful_progress_at: Date.now() - 31 * 60 * 1000,
      }, { zero_delta_threshold: 3, time_stall_minutes: 30 });
      assert.ok(result);
      assert.ok(result.includes('progress') || result.includes('stall'));
    });

    test('uses defaults when config not provided', () => {
      const result = shouldEscalateForSpin({
        stories_executed: [],
        last_meaningful_progress_at: Date.now(),
      });
      assert.equal(result, null);
    });
  });
});
