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

    test('returns consecutive duplicate story names', () => {
      // After da651fd, detectDuplicateStories checks consecutive entries only.
      // Non-consecutive repeats (a, b, a) are not flagged — they legitimately
      // re-appear after resets or across milestone boundaries.
      const history = [
        { name: 'story-a', delta: 10 },
        { name: 'story-a', delta: 0 },
        { name: 'story-b', delta: 20 },
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

    test('initialises stories_executed when missing entirely (not just empty)', () => {
      // `in` semantics: this state has NO stories_executed key at all.
      // Spin detection should not throw, and should not fire on the
      // other spin heuristics (nothing to detect). It should also
      // mutate the state to set stories_executed = [] so subsequent
      // loop ticks don't trip on undefined either.
      const state = { last_meaningful_progress_at: Date.now() };
      const originalWarn = console.warn;
      let warned = false;
      console.warn = () => { warned = true; };
      try {
        const result = shouldEscalateForSpin(state);
        assert.equal(result, null);
        assert.ok('stories_executed' in state);
        assert.deepEqual(state.stories_executed, []);
        assert.equal(warned, true, 'expected a warn log about missing stories_executed');
      } finally {
        console.warn = originalWarn;
      }
    });

    test('wall-clock fallback fires when last checkpoint is >24h old', () => {
      const oldTs = Date.now() - 25 * 60 * 60 * 1000;
      const result = shouldEscalateForSpin({
        stories_executed: [],
        last_checkpoint_at: new Date(oldTs).toISOString(),
        // No last_meaningful_progress_at — so time-stall can't fire.
      });
      assert.ok(result);
      assert.match(result, /24h|wall-clock/i);
    });

    test('wall-clock fallback does NOT fire within 24h', () => {
      const recentTs = Date.now() - 2 * 60 * 60 * 1000;
      const result = shouldEscalateForSpin({
        stories_executed: [],
        last_checkpoint_at: new Date(recentTs).toISOString(),
      });
      assert.equal(result, null);
    });

    test('wall-clock fallback ignores unparseable timestamps', () => {
      const result = shouldEscalateForSpin({
        stories_executed: [],
        last_checkpoint_at: 'not a date',
      });
      // Should not throw or fire spuriously.
      assert.equal(result, null);
    });
  });
});
