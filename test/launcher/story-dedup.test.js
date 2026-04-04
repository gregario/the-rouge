const { test, describe } = require('node:test');
const assert = require('node:assert');

const { getCompletedStoryNames, isStoryDuplicate } = require('../../src/launcher/safety.js');

describe('Story Deduplication', () => {
  describe('getCompletedStoryNames', () => {
    test('extracts story names with outcome=pass from checkpoints', () => {
      const checkpoints = [
        { state: { story_results: [{ name: 'add-list', outcome: 'pass' }, { name: 'add-edit', outcome: 'fail' }] } },
        { state: { story_results: [{ name: 'trip-api', outcome: 'pass' }] } },
      ];
      const names = getCompletedStoryNames(checkpoints);
      assert.deepEqual(names, ['add-list', 'trip-api']);
    });

    test('handles checkpoints without story_results', () => {
      const checkpoints = [
        { state: {} },
        { state: { story_results: [{ name: 'add-list', outcome: 'pass' }] } },
      ];
      const names = getCompletedStoryNames(checkpoints);
      assert.deepEqual(names, ['add-list']);
    });

    test('returns empty array for empty checkpoints', () => {
      assert.deepEqual(getCompletedStoryNames([]), []);
    });

    test('deduplicates story names', () => {
      const checkpoints = [
        { state: { story_results: [{ name: 'add-list', outcome: 'pass' }] } },
        { state: { story_results: [{ name: 'add-list', outcome: 'pass' }] } },
      ];
      const names = getCompletedStoryNames(checkpoints);
      assert.deepEqual(names, ['add-list']);
    });
  });

  describe('isStoryDuplicate', () => {
    test('returns true for completed story', () => {
      assert.equal(isStoryDuplicate('add-list', ['add-list', 'trip-api']), true);
    });

    test('returns false for uncompleted story', () => {
      assert.equal(isStoryDuplicate('add-edit', ['add-list', 'trip-api']), false);
    });

    test('returns false for empty completed list', () => {
      assert.equal(isStoryDuplicate('add-list', []), false);
    });
  });
});
