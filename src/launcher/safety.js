/**
 * V3 Safety mechanisms — all deterministic JavaScript, zero LLM authority.
 * Milestone lock, spin detection, story deduplication.
 */

function checkMilestoneLock(checkpoint, milestoneName) {
  return (checkpoint.state.promoted_milestones || []).includes(milestoneName);
}

function promoteMilestone(state, milestoneName) {
  if (!state.promoted_milestones) state.promoted_milestones = [];
  if (!state.promoted_milestones.includes(milestoneName)) {
    state.promoted_milestones.push(milestoneName);
  }
  return state;
}

// --- Spin Detection ---

function detectZeroDeltaSpin(storiesExecuted, threshold = 3) {
  // Only check the last N stories (sliding window), not all-time accumulation.
  // This prevents false positives after manual state resets.
  const recent = storiesExecuted.slice(-threshold * 2);
  const zeroDeltaCount = recent.filter(s => s.delta === 0).length;
  return zeroDeltaCount >= threshold;
}

function detectDuplicateStories(storiesExecuted) {
  // Only check for consecutive duplicates (same story re-run in a row),
  // not any-time duplicates. A story can legitimately appear in
  // stories_executed across milestone boundaries or after resets.
  const duplicates = new Set();
  for (let i = 1; i < storiesExecuted.length; i++) {
    if (storiesExecuted[i].name === storiesExecuted[i - 1].name) {
      duplicates.add(storiesExecuted[i].name);
    }
  }
  return [...duplicates];
}

function detectTimeStall(lastProgressTimestamp, now, thresholdMinutes = 30) {
  const elapsed = now - lastProgressTimestamp;
  return elapsed > thresholdMinutes * 60 * 1000;
}

// Hard ceiling: even if every other signal looks fine, a project that
// hasn't checkpointed in more than this many hours is effectively
// stuck. Kicks in for legacy states where stories_executed is absent
// entirely and all we have is last_checkpoint_at. 24 h matches the
// audit recommendation (E5).
const WALL_CLOCK_ESCALATION_HOURS = 24;

function shouldEscalateForSpin(state, config = {}) {
  const threshold = config.zero_delta_threshold || 3;
  const stallMinutes = config.time_stall_minutes || 30;
  const now = Date.now();

  // `stories_executed` missing entirely is suspicious — it means either
  // a corrupted state.json or a project that pre-dates V3 spin tracking.
  // We can't meaningfully check delta/duplicate spin without it, so
  // initialise it (side-effect) and warn; caller is expected to persist
  // state afterwards. Using `in` instead of `||` distinguishes "missing"
  // from "empty array".
  if (!('stories_executed' in state) || state.stories_executed == null) {
    state.stories_executed = [];
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[safety] stories_executed missing on state — initialised to []. Spin detection will rely on wall-clock fallback until stories are recorded.');
    }
  }
  const stories = state.stories_executed;

  if (detectZeroDeltaSpin(stories, threshold)) {
    return `${threshold}+ stories with zero code delta`;
  }

  const duplicates = detectDuplicateStories(stories);
  if (duplicates.length > 0) {
    return `Duplicate stories detected: ${duplicates.join(', ')}`;
  }

  if (state.last_meaningful_progress_at && detectTimeStall(state.last_meaningful_progress_at, now, stallMinutes)) {
    return `No progress for ${stallMinutes}+ minutes`;
  }

  // Wall-clock fallback: if nothing else fired and the last checkpoint
  // is more than WALL_CLOCK_ESCALATION_HOURS old, force escalation.
  // Covers the class of bug where stories_executed was dropped/emptied
  // and other spin checks can't see anything to fire on — without this,
  // a corrupted state could stall indefinitely.
  const lastCheckpointTs = state.last_checkpoint_at || state.last_meaningful_progress_at || null;
  if (lastCheckpointTs) {
    const parsed = typeof lastCheckpointTs === 'number' ? lastCheckpointTs : Date.parse(lastCheckpointTs);
    if (!Number.isNaN(parsed) && now - parsed > WALL_CLOCK_ESCALATION_HOURS * 60 * 60 * 1000) {
      return `No checkpoint recorded in the last ${WALL_CLOCK_ESCALATION_HOURS}h — wall-clock stall`;
    }
  }

  return null;
}

// --- Story Deduplication ---

function getCompletedStoryNames(checkpoints) {
  const names = new Set();
  for (const cp of checkpoints) {
    const results = cp.state?.story_results || [];
    for (const r of results) {
      if (r.outcome === 'pass') names.add(r.name);
    }
  }
  return [...names];
}

function isStoryDuplicate(storyName, completedNames) {
  return completedNames.includes(storyName);
}

module.exports = {
  checkMilestoneLock, promoteMilestone,
  detectZeroDeltaSpin, detectDuplicateStories, detectTimeStall, shouldEscalateForSpin,
  getCompletedStoryNames, isStoryDuplicate,
  WALL_CLOCK_ESCALATION_HOURS,
};
