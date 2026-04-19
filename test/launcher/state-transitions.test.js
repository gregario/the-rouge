const { test, describe } = require('node:test');
const assert = require('node:assert');

const {
  escalate,
  beginStory,
  advanceStory,
  retryStory,
  setStoryStatus,
  toMilestoneCheck,
  assertInvariants,
  buildEscalation,
} = require('../../src/launcher/state-transitions.js');

function makeState(overrides = {}) {
  return {
    current_state: 'story-building',
    current_milestone: 'ms-1',
    current_story: 's1',
    milestones: [
      {
        name: 'ms-1',
        stories: [
          { id: 's1', status: 'in-progress' },
          { id: 's2', status: 'pending' },
          { id: 's3', status: 'pending' },
        ],
      },
    ],
    escalations: [],
    ...overrides,
  };
}

describe('buildEscalation', () => {
  test('requires tier/classification/summary', () => {
    assert.throws(() => buildEscalation({ classification: 'x', summary: 'y' }), /tier/);
    assert.throws(() => buildEscalation({ tier: 1, summary: 'y' }), /classification/);
    assert.throws(() => buildEscalation({ tier: 1, classification: 'x' }), /summary/);
  });
  test('accepts tier=0 (not falsy-guarded away)', () => {
    const e = buildEscalation({ tier: 0, classification: 'x', summary: 'y' });
    assert.equal(e.tier, 0);
  });
  test('always marks status=pending and timestamps', () => {
    const e = buildEscalation({ tier: 1, classification: 'x', summary: 'y' });
    assert.equal(e.status, 'pending');
    assert.ok(e.created_at);
    assert.ok(e.id);
  });
});

describe('escalate', () => {
  test('pushes a pending escalation and returns "escalation"', () => {
    const state = makeState();
    const next = escalate(state, { tier: 1, classification: 'spin', summary: 'looping' });
    assert.equal(next, 'escalation');
    assert.equal(state.escalations.length, 1);
    assert.equal(state.escalations[0].status, 'pending');
  });
  test('initializes escalations array if absent', () => {
    const state = makeState();
    delete state.escalations;
    escalate(state, { tier: 2, classification: 'x', summary: 'y' });
    assert.equal(state.escalations.length, 1);
  });
  test('carries story_id when provided', () => {
    const state = makeState();
    escalate(state, { tier: 1, classification: 'x', summary: 'y', story_id: 's1' });
    assert.equal(state.escalations[0].story_id, 's1');
  });
});

describe('beginStory', () => {
  test('sets milestone+story pointers and story status', () => {
    const state = makeState({ current_milestone: null, current_story: null });
    const ms = state.milestones[0];
    const story = ms.stories[1]; // s2, pending
    const next = beginStory(state, { milestone: ms, story });
    assert.equal(next, 'story-building');
    assert.equal(state.current_milestone, 'ms-1');
    assert.equal(state.current_story, 's2');
    assert.equal(story.status, 'in-progress');
  });
  test('throws on missing args', () => {
    const state = makeState();
    assert.throws(() => beginStory(state, { story: {} }), /milestone/);
    assert.throws(() => beginStory(state, { milestone: {} }), /story/);
  });
});

describe('advanceStory', () => {
  test('updates status and pointer together, stays in story-building', () => {
    const state = makeState();
    const story = state.milestones[0].stories[1];
    const next = advanceStory(state, { story });
    assert.equal(next, null);
    assert.equal(story.status, 'in-progress');
    assert.equal(state.current_story, 's2');
  });
});

describe('retryStory', () => {
  test('marks story retrying and updates current_story pointer', () => {
    const state = makeState({ current_story: 'old-pointer' });
    const story = state.milestones[0].stories[2];
    retryStory(state, { story });
    assert.equal(story.status, 'retrying');
    assert.equal(state.current_story, 's3');
  });
});

describe('setStoryStatus', () => {
  test('sets story status, returns null when no escalation', () => {
    const state = makeState();
    const story = state.milestones[0].stories[0];
    const next = setStoryStatus(state, { story, status: 'done' });
    assert.equal(next, null);
    assert.equal(story.status, 'done');
    assert.equal(state.escalations.length, 0);
  });
  test('when escalation provided, pushes it AND returns "escalation"', () => {
    const state = makeState();
    const story = state.milestones[0].stories[0];
    const next = setStoryStatus(state, {
      story,
      status: 'blocked',
      escalation: { tier: 1, classification: 'max-retries', summary: '3 failures' },
    });
    assert.equal(next, 'escalation');
    assert.equal(story.status, 'blocked');
    assert.equal(state.escalations.length, 1);
    assert.equal(state.escalations[0].story_id, 's1');
  });
});

describe('toMilestoneCheck', () => {
  test('clears current_story and returns "milestone-check"', () => {
    const state = makeState();
    const next = toMilestoneCheck(state);
    assert.equal(next, 'milestone-check');
    assert.equal(state.current_story, null);
    // current_milestone is preserved so the check knows what to evaluate
    assert.equal(state.current_milestone, 'ms-1');
  });
});

describe('assertInvariants', () => {
  test('passes for a healthy story-building state', () => {
    const state = makeState({ current_state: 'story-building' });
    assert.doesNotThrow(() => assertInvariants(state));
  });
  test('fails when state=escalation but escalations[] is empty (the testimonial bug)', () => {
    const state = makeState({ current_state: 'escalation', escalations: [] });
    assert.throws(() => assertInvariants(state), /no escalations with status='pending'/);
  });
  test('fails when state=escalation but all escalations are resolved', () => {
    const state = makeState({
      current_state: 'escalation',
      escalations: [{ id: 'e1', status: 'resolved' }],
    });
    assert.throws(() => assertInvariants(state), /pending/);
  });
  test('fails when state=story-building but current_story is null', () => {
    const state = makeState({ current_state: 'story-building', current_story: null });
    assert.throws(() => assertInvariants(state), /current_story is null/);
  });
  test('fails when state=story-building but current_milestone is null', () => {
    const state = makeState({ current_state: 'story-building', current_milestone: null });
    assert.throws(() => assertInvariants(state), /current_milestone is null/);
  });
  test('fails when current_story points to a nonexistent story', () => {
    const state = makeState({ current_state: 'story-building', current_story: 'missing' });
    assert.throws(() => assertInvariants(state), /not found in milestone/);
  });
  test('fails when milestone-check has no current_milestone', () => {
    const state = makeState({ current_state: 'milestone-check', current_milestone: null });
    assert.throws(() => assertInvariants(state), /current_milestone is null/);
  });
  test('fails when state=complete but milestones are not all promoted', () => {
    const state = makeState({
      current_state: 'complete',
      milestones: [{ name: 'ms-1', status: 'in-progress', stories: [] }],
    });
    assert.throws(() => assertInvariants(state), /not promoted/);
  });
  test('passes for state=complete with all milestones complete/partial/skipped', () => {
    const state = makeState({
      current_state: 'complete',
      current_milestone: null,
      current_story: null,
      milestones: [
        { name: 'ms-1', status: 'complete', stories: [] },
        { name: 'ms-2', status: 'partial', stories: [] },
        { name: 'ms-3', status: 'skipped', stories: [] },
      ],
    });
    assert.doesNotThrow(() => assertInvariants(state));
  });
  test('passes for terminal states like ready/seeding/complete with clean shape', () => {
    assert.doesNotThrow(() =>
      assertInvariants({ current_state: 'ready', milestones: [], escalations: [] }),
    );
    assert.doesNotThrow(() =>
      assertInvariants({ current_state: 'seeding', milestones: [], escalations: [] }),
    );
  });
});

describe('integration: setStoryStatus + assertInvariants', () => {
  test('using setStoryStatus with escalation keeps state/escalations coherent', () => {
    const state = makeState();
    const story = state.milestones[0].stories[0];
    const next = setStoryStatus(state, {
      story,
      status: 'blocked',
      escalation: { tier: 1, classification: 'max-retries', summary: '3 failures' },
    });
    state.current_state = next;
    // This is the exact pattern the migrated :864 site uses — and the
    // invariant check must pass after it.
    assert.doesNotThrow(() => assertInvariants(state));
  });

  test('the testimonial bug is now impossible via the helpers', () => {
    // Pre-fix reproduction: raw code would set current_state='escalation'
    // without pushing onto escalations[]. The helper prevents this.
    const state = makeState();
    // Any attempt to use `escalate` pushes an object:
    escalate(state, { tier: 1, classification: 'deploy-failure', summary: 'no staging url' });
    state.current_state = 'escalation';
    assert.doesNotThrow(() => assertInvariants(state));
    assert.equal(state.escalations.length, 1);
  });
});
