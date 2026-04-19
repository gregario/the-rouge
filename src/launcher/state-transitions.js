/**
 * State-transition helpers for rouge-loop.
 *
 * Problem this solves: before this module existed, `state.current_state`
 * was a raw field and developers had to remember, by convention, to
 * also push onto `state.escalations[]` when transitioning to
 * 'escalation', to set `current_story`+`current_milestone` when
 * transitioning to 'story-building', and so on. The convention was
 * violated in at least 4 sites in rouge-loop.js — most visibly, a
 * project would show `current_state='escalation'` with `escalations=[]`
 * and the dashboard would render nothing.
 *
 * Every function here atomically enforces the paired invariants for a
 * given transition and returns the new state-machine state as a string
 * (or null if the transition is a self-loop within the current state).
 * Callers assign the return value to the `next` variable consumed by
 * rouge-loop.js's unified transition path (state.current_state = next;
 * log; notify; checkpoint).
 *
 * Use `assertInvariants(state)` before every `writeJson(stateFile, ...)`
 * — or wrap writeJson in `safeWriteState` — so bugs that introduce
 * drift fail loudly at write time instead of silently persisting.
 */

/**
 * Common shape for a pushed escalation object. Callers pass a subset
 * of fields; defaults fill in the rest. Every escalation has
 * `status: 'pending'` on creation so the dashboard can filter.
 */
function buildEscalation({ id, tier, classification, summary, story_id = null }) {
  if (!tier && tier !== 0) {
    throw new Error('buildEscalation: tier is required');
  }
  if (!classification) {
    throw new Error('buildEscalation: classification is required');
  }
  if (!summary) {
    throw new Error('buildEscalation: summary is required');
  }
  return {
    id: id || `esc-${classification}-${Date.now()}`,
    tier,
    classification,
    summary,
    story_id,
    status: 'pending',
    created_at: new Date().toISOString(),
  };
}

/**
 * Raise an escalation and transition the state machine accordingly.
 * Pushes the escalation object atomically; caller MUST assign the
 * return value to `next` so the unified transition path fires.
 *
 * Fixes the class of bug where code set `next = 'escalation'` or
 * `state.current_state = 'escalation'` without pushing any escalation
 * object — leaving the dashboard's escalation view rendering nothing.
 *
 * @returns {'escalation'}
 */
function escalate(state, opts) {
  if (!state.escalations) state.escalations = [];
  state.escalations.push(buildEscalation(opts));
  return 'escalation';
}

/**
 * Begin building a specific story — first entry into story-building
 * for that story. Sets `current_milestone`, `current_story`, and the
 * story's own status in lockstep so the phase prompt sees a coherent
 * view. Replaces the old `startStory()` helper.
 *
 * @returns {'story-building'}
 */
function beginStory(state, { milestone, story }) {
  if (!milestone) throw new Error('beginStory: milestone is required');
  if (!story) throw new Error('beginStory: story is required');
  story.status = 'in-progress';
  state.current_milestone = milestone.name;
  state.current_story = story.id;
  return 'story-building';
}

/**
 * Advance to the next eligible story *within* the same milestone while
 * already in story-building. Updates status + pointer together so the
 * next phase iteration doesn't see a 'pending' story flagged as active
 * (the :1724 bug).
 *
 * Returns null because we stay in 'story-building' — the launcher's
 * transition logger will not emit a redundant 'story-building →
 * story-building' event.
 *
 * @returns {null}
 */
function advanceStory(state, { story }) {
  if (!story) throw new Error('advanceStory: story is required');
  story.status = 'in-progress';
  state.current_story = story.id;
  return null;
}

/**
 * Mark a story for retry after a human resolution. Ensures
 * current_story points at the retrying story — previously :1506 could
 * leave current_story pointing at whatever it was before the retry,
 * creating a dangling pointer if no eligible next story existed.
 *
 * @returns {null}
 */
function retryStory(state, { story }) {
  if (!story) throw new Error('retryStory: story is required');
  story.status = 'retrying';
  state.current_story = story.id;
  return null;
}

/**
 * Update a story's status. If an escalation is attached, atomically
 * push it and return 'escalation' so the state machine transitions.
 * Callers use the pattern:
 *
 *   const transitionTo = setStoryStatus(state, { story, status, escalation });
 *   if (transitionTo) next = transitionTo;
 *
 * @returns {null | 'escalation'}
 */
function setStoryStatus(state, { story, status, escalation = null }) {
  if (!story) throw new Error('setStoryStatus: story is required');
  if (!status) throw new Error('setStoryStatus: status is required');
  story.status = status;
  if (escalation) {
    return escalate(state, { ...escalation, story_id: story.id });
  }
  return null;
}

/**
 * Promote the current milestone to the review phase. Clears
 * `current_story` because milestone-check operates on the whole
 * milestone, not a specific story.
 *
 * @returns {'milestone-check'}
 */
function toMilestoneCheck(state) {
  state.current_story = null;
  return 'milestone-check';
}

/**
 * Check structural invariants on a state object. Throws on any
 * violation. Call before every `writeJson(stateFile, state)` — or use
 * `safeWriteState` which wraps both — so drift between related fields
 * surfaces at write time instead of lingering until the UI renders
 * blank.
 *
 * Enforced invariants:
 * - state='escalation' ⇒ at least one escalation with status='pending'
 * - state='story-building' ⇒ current_milestone AND current_story both set
 * - state='story-building' ⇒ the referenced milestone+story exist in state.milestones[]
 * - state='milestone-check' or 'milestone-fix' ⇒ current_milestone set
 * - state='complete' ⇒ every milestone has status in ['complete','partial','skipped']
 */
function assertInvariants(state) {
  if (!state || typeof state !== 'object') {
    throw new Error('assertInvariants: state must be an object');
  }
  const cs = state.current_state;

  if (cs === 'escalation') {
    const pending = (state.escalations || []).filter((e) => e && e.status === 'pending');
    if (pending.length === 0) {
      throw new Error(
        `INVARIANT: current_state='escalation' but no escalations with status='pending'`,
      );
    }
  }

  if (cs === 'story-building') {
    if (!state.current_milestone) {
      throw new Error(`INVARIANT: current_state='story-building' but current_milestone is null`);
    }
    if (!state.current_story) {
      throw new Error(`INVARIANT: current_state='story-building' but current_story is null`);
    }
    const ms = (state.milestones || []).find((m) => m.name === state.current_milestone);
    if (!ms) {
      throw new Error(
        `INVARIANT: current_milestone='${state.current_milestone}' not found in state.milestones`,
      );
    }
    const story = (ms.stories || []).find((s) => s.id === state.current_story);
    if (!story) {
      throw new Error(
        `INVARIANT: current_story='${state.current_story}' not found in milestone '${state.current_milestone}'`,
      );
    }
  }

  if (cs === 'milestone-check' || cs === 'milestone-fix') {
    if (!state.current_milestone) {
      throw new Error(`INVARIANT: current_state='${cs}' but current_milestone is null`);
    }
  }

  if (cs === 'complete') {
    const bad = (state.milestones || []).filter(
      (m) => !['complete', 'partial', 'skipped'].includes(m.status),
    );
    if (bad.length > 0) {
      throw new Error(
        `INVARIANT: current_state='complete' but ${bad.length} milestone(s) not promoted: ${bad.map((m) => m.name).join(', ')}`,
      );
    }
  }

  return true;
}

module.exports = {
  escalate,
  beginStory,
  advanceStory,
  retryStory,
  setStoryStatus,
  toMilestoneCheck,
  assertInvariants,
  buildEscalation,
};
