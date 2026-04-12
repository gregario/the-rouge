const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  advanceState,
  findNextStory,
  findNextMilestone,
  flatStories,
  startStory,
  recordFixMemory,
  readJson,
  writeJson,
} = require('../../src/launcher/rouge-loop.js');

// --- Helper: create a temp project directory with state.json and cycle_context.json ---
function setupProject(tmpDir, state, cycleContext = {}) {
  writeJson(path.join(tmpDir, 'state.json'), state);
  writeJson(path.join(tmpDir, 'cycle_context.json'), cycleContext);
}

function readState(tmpDir) {
  return readJson(path.join(tmpDir, 'state.json'));
}

// --- fix_patterns tests ---

describe('fix_patterns extraction on story success', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-fix-patterns-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('fix_patterns populated when retried story succeeds (attempts > 1)', async () => {
    const state = {
      current_state: 'story-building',
      current_milestone: 'ms-1',
      current_story: 's1',
      consecutive_failures: 0,
      milestones: [{
        name: 'ms-1',
        status: 'in-progress',
        stories: [
          {
            id: 's1',
            name: 'Story 1',
            status: 'in-progress',
            attempts: 2,
            depends_on: [],
          },
          { id: 's2', name: 'Story 2', status: 'pending', depends_on: [] },
        ],
      }],
      fix_memory: {
        s1: [{
          attempt: 1,
          symptom: 'TypeScript type error on insert',
          diagnosis: 'Wrong type for column',
          classification: 'type-error',
          fix: 'Cast to correct type',
          outcome: 'blocked',
          files_changed: [],
        }],
      },
    };

    const ctx = {
      story_result: {
        outcome: 'pass',
        files_changed: ['src/db.ts'],
      },
    };

    setupProject(tmpDir, state, ctx);
    await advanceState(tmpDir);
    const updated = readState(tmpDir);

    assert.ok(updated.fix_patterns, 'fix_patterns should exist');
    assert.ok(updated.fix_patterns['type-error'], 'type-error pattern should exist');
    assert.strictEqual(updated.fix_patterns['type-error'].occurrences, 1);
    assert.strictEqual(updated.fix_patterns['type-error'].symptom, 'TypeScript type error on insert');
    assert.strictEqual(updated.fix_patterns['type-error'].fix, 'Cast to correct type');
    assert.strictEqual(updated.fix_patterns['type-error'].story_id, 's1');
    assert.ok(updated.fix_patterns['type-error'].first_seen);
  });

  test('fix_patterns increments occurrences on repeat pattern classification', async () => {
    const state = {
      current_state: 'story-building',
      current_milestone: 'ms-1',
      current_story: 's2',
      consecutive_failures: 0,
      milestones: [{
        name: 'ms-1',
        status: 'in-progress',
        stories: [
          { id: 's1', name: 'Story 1', status: 'done', depends_on: [] },
          { id: 's2', name: 'Story 2', status: 'in-progress', attempts: 3, depends_on: [] },
          { id: 's3', name: 'Story 3', status: 'pending', depends_on: [] },
        ],
      }],
      fix_memory: {
        s2: [{
          attempt: 1,
          symptom: 'Another type error',
          classification: 'type-error',
          fix: 'Fix types again',
          outcome: 'blocked',
          files_changed: [],
        }],
      },
      // Pre-existing pattern from a previous story
      fix_patterns: {
        'type-error': {
          pattern: 'type-error',
          symptom: 'TypeScript type error on insert',
          fix: 'Cast to correct type',
          story_id: 's1',
          first_seen: '2026-04-01T00:00:00.000Z',
          occurrences: 1,
        },
      },
    };

    const ctx = {
      story_result: {
        outcome: 'pass',
        files_changed: ['src/api.ts'],
      },
    };

    setupProject(tmpDir, state, ctx);
    await advanceState(tmpDir);
    const updated = readState(tmpDir);

    assert.ok(updated.fix_patterns['type-error'], 'type-error pattern should exist');
    assert.strictEqual(updated.fix_patterns['type-error'].occurrences, 2);
    // Original fields should be preserved (not overwritten)
    assert.strictEqual(updated.fix_patterns['type-error'].story_id, 's1');
    assert.strictEqual(updated.fix_patterns['type-error'].first_seen, '2026-04-01T00:00:00.000Z');
  });

  test('fix_patterns NOT populated on first-attempt pass (attempts === 0)', async () => {
    const state = {
      current_state: 'story-building',
      current_milestone: 'ms-1',
      current_story: 's1',
      consecutive_failures: 0,
      milestones: [{
        name: 'ms-1',
        status: 'in-progress',
        stories: [
          {
            id: 's1',
            name: 'Story 1',
            status: 'in-progress',
            attempts: 0,
            depends_on: [],
          },
          { id: 's2', name: 'Story 2', status: 'pending', depends_on: [] },
        ],
      }],
      fix_memory: {},
    };

    const ctx = {
      story_result: {
        outcome: 'pass',
        files_changed: ['src/index.ts'],
      },
    };

    setupProject(tmpDir, state, ctx);
    await advanceState(tmpDir);
    const updated = readState(tmpDir);

    // fix_patterns should not be created for first-attempt passes
    assert.ok(!updated.fix_patterns || Object.keys(updated.fix_patterns).length === 0,
      'fix_patterns should be empty or undefined on first-attempt pass');
  });
});

// --- shipped_insights tests ---

describe('shipped_insights on milestone promotion', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-shipped-insights-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('shipped_insights populated on milestone promotion', async () => {
    const state = {
      current_state: 'analyzing',
      current_milestone: 'ms-1',
      milestones: [
        {
          name: 'ms-1',
          status: 'in-progress',
          stories: [
            { id: 's1', name: 'Story 1', status: 'done', attempts: 2, depends_on: [] },
            { id: 's2', name: 'Story 2', status: 'done', attempts: 0, depends_on: [] },
          ],
        },
        {
          name: 'ms-2',
          status: 'pending',
          stories: [
            { id: 's3', name: 'Story 3', status: 'pending', depends_on: [] },
          ],
        },
      ],
      fix_patterns: {
        'type-error': { pattern: 'type-error', occurrences: 1 },
      },
    };

    const ctx = {
      analysis_recommendation: {
        action: 'promote',
      },
    };

    setupProject(tmpDir, state, ctx);
    await advanceState(tmpDir);
    const updated = readState(tmpDir);

    assert.ok(Array.isArray(updated.shipped_insights), 'shipped_insights should be an array');
    assert.strictEqual(updated.shipped_insights.length, 1);
    const insight = updated.shipped_insights[0];
    assert.strictEqual(insight.milestone, 'ms-1');
    assert.strictEqual(insight.story_count, 2);
    assert.strictEqual(insight.retry_count, 2);
    assert.deepStrictEqual(insight.patterns_discovered, ['type-error']);
    assert.ok(insight.completed_at);
  });

  test('shipped_insights survives milestone transition (not cleared)', async () => {
    const existingInsight = {
      milestone: 'ms-0',
      completed_at: '2026-04-01T00:00:00.000Z',
      story_count: 3,
      retry_count: 1,
      patterns_discovered: [],
    };

    const state = {
      current_state: 'analyzing',
      current_milestone: 'ms-1',
      shipped_insights: [existingInsight],
      milestones: [
        {
          name: 'ms-1',
          status: 'in-progress',
          stories: [
            { id: 's1', name: 'Story 1', status: 'done', attempts: 0, depends_on: [] },
          ],
        },
        {
          name: 'ms-2',
          status: 'pending',
          stories: [
            { id: 's3', name: 'Story 3', status: 'pending', depends_on: [] },
          ],
        },
      ],
    };

    const ctx = {
      analysis_recommendation: {
        action: 'promote',
      },
    };

    setupProject(tmpDir, state, ctx);
    await advanceState(tmpDir);
    const updated = readState(tmpDir);

    assert.ok(Array.isArray(updated.shipped_insights), 'shipped_insights should be an array');
    assert.strictEqual(updated.shipped_insights.length, 2, 'should have both old and new insights');
    // Old insight preserved
    assert.strictEqual(updated.shipped_insights[0].milestone, 'ms-0');
    // New insight added
    assert.strictEqual(updated.shipped_insights[1].milestone, 'ms-1');
  });

  test('existing milestone_learnings clear-on-transition preserved', async () => {
    const state = {
      current_state: 'analyzing',
      current_milestone: 'ms-1',
      milestone_learnings: [
        {
          source: 'circuit-breaker',
          diagnosis: 'test diagnosis',
          instruction: 'test instruction',
          timestamp: '2026-04-01T00:00:00.000Z',
        },
      ],
      milestones: [
        {
          name: 'ms-1',
          status: 'in-progress',
          stories: [
            { id: 's1', name: 'Story 1', status: 'done', attempts: 0, depends_on: [] },
          ],
        },
        {
          name: 'ms-2',
          status: 'pending',
          stories: [
            { id: 's3', name: 'Story 3', status: 'pending', depends_on: [] },
          ],
        },
      ],
    };

    const ctx = {
      analysis_recommendation: {
        action: 'promote',
      },
    };

    setupProject(tmpDir, state, ctx);
    await advanceState(tmpDir);
    const updated = readState(tmpDir);

    // milestone_learnings should be cleared on transition
    assert.deepStrictEqual(updated.milestone_learnings, [],
      'milestone_learnings should be cleared on milestone transition');
    // But shipped_insights should persist
    assert.ok(Array.isArray(updated.shipped_insights), 'shipped_insights should exist');
    assert.strictEqual(updated.shipped_insights.length, 1);
  });
});
