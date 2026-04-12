const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  advanceState,
  findNextStory,
  flatStories,
  startStory,
  readJson,
  writeJson,
} = require('../../src/launcher/rouge-loop.js');

function setupProject(tmpDir, state, cycleContext = {}) {
  writeJson(path.join(tmpDir, 'state.json'), state);
  writeJson(path.join(tmpDir, 'cycle_context.json'), cycleContext);
}

function readState(tmpDir) {
  return readJson(path.join(tmpDir, 'state.json'));
}

describe('advanceState — escalation human_response', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-esc-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('guidance response resolves escalation and resumes story', async () => {
    const state = {
      current_state: 'escalation',
      current_milestone: 'ms-1',
      current_story: 's1',
      consecutive_failures: 2,
      escalations: [{
        id: 'esc-042',
        tier: 2,
        classification: 'type-error',
        status: 'pending',
        story_id: 's1',
        created_at: '2026-04-05T20:00:00Z',
        human_response: {
          type: 'guidance',
          text: 'Use @supabase/supabase-js v2, not v1',
          submitted_at: '2026-04-05T21:30:00Z',
        },
      }],
      milestones: [{
        name: 'ms-1',
        status: 'in-progress',
        stories: [
          { id: 's1', status: 'blocked', depends_on: [] },
          { id: 's2', status: 'pending', depends_on: [] },
        ],
      }],
    };
    setupProject(tmpDir, state);

    await advanceState(tmpDir);

    const result = readState(tmpDir);
    // Escalation should be resolved
    assert.strictEqual(result.escalations[0].status, 'resolved');
    assert.ok(result.escalations[0].resolved_at);
    // Should resume story-building
    assert.strictEqual(result.current_state, 'story-building');
    // consecutive_failures reset
    assert.strictEqual(result.consecutive_failures, 0);
    // Guidance should be injected into cycle_context
    const ctx = readJson(path.join(tmpDir, 'cycle_context.json'));
    assert.strictEqual(ctx.human_guidance, 'Use @supabase/supabase-js v2, not v1');
  });

  test('manual-fix-applied resolves and transitions to milestone-check', async () => {
    const state = {
      current_state: 'escalation',
      current_milestone: 'ms-1',
      current_story: 's1',
      consecutive_failures: 1,
      escalations: [{
        id: 'esc-043',
        tier: 1,
        classification: 'build-failure',
        status: 'pending',
        story_id: 's1',
        created_at: '2026-04-05T20:00:00Z',
        human_response: {
          type: 'manual-fix-applied',
          text: 'Fixed the config manually',
          submitted_at: '2026-04-05T21:30:00Z',
        },
      }],
      milestones: [{
        name: 'ms-1',
        status: 'in-progress',
        stories: [
          { id: 's1', status: 'blocked', depends_on: [] },
        ],
      }],
    };
    setupProject(tmpDir, state);

    await advanceState(tmpDir);

    const result = readState(tmpDir);
    assert.strictEqual(result.escalations[0].status, 'resolved');
    assert.strictEqual(result.current_state, 'milestone-check');
    assert.strictEqual(result.consecutive_failures, 0);
    // Story should be marked done since human fixed it
    assert.strictEqual(result.milestones[0].stories[0].status, 'done');
  });

  test('dismiss-false-positive clears escalation and resumes', async () => {
    const state = {
      current_state: 'escalation',
      current_milestone: 'ms-1',
      current_story: 's1',
      consecutive_failures: 3,
      escalations: [{
        id: 'esc-044',
        tier: 2,
        classification: 'spin-detection',
        status: 'pending',
        story_id: 's1',
        created_at: '2026-04-05T20:00:00Z',
        human_response: {
          type: 'dismiss-false-positive',
          text: '',
          submitted_at: '2026-04-05T21:30:00Z',
        },
      }],
      milestones: [{
        name: 'ms-1',
        status: 'in-progress',
        stories: [
          { id: 's1', status: 'blocked', depends_on: [] },
          { id: 's2', status: 'pending', depends_on: [] },
        ],
      }],
    };
    setupProject(tmpDir, state);

    await advanceState(tmpDir);

    const result = readState(tmpDir);
    assert.strictEqual(result.escalations[0].status, 'resolved');
    assert.strictEqual(result.current_state, 'story-building');
    assert.strictEqual(result.consecutive_failures, 0);
  });

  test('abort-story marks story blocked and advances to next', async () => {
    const state = {
      current_state: 'escalation',
      current_milestone: 'ms-1',
      current_story: 's1',
      consecutive_failures: 2,
      escalations: [{
        id: 'esc-045',
        tier: 2,
        classification: 'infrastructure-gap',
        status: 'pending',
        story_id: 's1',
        created_at: '2026-04-05T20:00:00Z',
        human_response: {
          type: 'abort-story',
          text: 'Skip this, not needed',
          submitted_at: '2026-04-05T21:30:00Z',
        },
      }],
      milestones: [{
        name: 'ms-1',
        status: 'in-progress',
        stories: [
          { id: 's1', status: 'pending', depends_on: [] },
          { id: 's2', status: 'pending', depends_on: [] },
        ],
      }],
    };
    setupProject(tmpDir, state);

    await advanceState(tmpDir);

    const result = readState(tmpDir);
    assert.strictEqual(result.escalations[0].status, 'resolved');
    // s1 should be blocked
    assert.strictEqual(result.milestones[0].stories[0].status, 'blocked');
    // Should advance to s2
    assert.strictEqual(result.current_state, 'story-building');
    assert.strictEqual(result.current_story, 's2');
    assert.strictEqual(result.consecutive_failures, 0);
  });

  test('unrecognised response type is ignored — stays in escalation', async () => {
    const state = {
      current_state: 'escalation',
      current_milestone: 'ms-1',
      current_story: 's1',
      consecutive_failures: 1,
      escalations: [{
        id: 'esc-046',
        tier: 1,
        classification: 'type-error',
        status: 'pending',
        story_id: 's1',
        created_at: '2026-04-05T20:00:00Z',
        human_response: {
          type: 'unknown-type',
          text: 'whatever',
          submitted_at: '2026-04-05T21:30:00Z',
        },
      }],
      milestones: [{
        name: 'ms-1',
        status: 'in-progress',
        stories: [
          { id: 's1', status: 'blocked', depends_on: [] },
        ],
      }],
    };
    setupProject(tmpDir, state);

    await advanceState(tmpDir);

    const result = readState(tmpDir);
    // Should stay in escalation — no transition
    assert.strictEqual(result.current_state, 'escalation');
    // Escalation should still be pending (reverted)
    assert.strictEqual(result.escalations[0].status, 'pending');
  });
});
