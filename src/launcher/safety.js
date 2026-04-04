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

function shouldEscalateForSpin(state, config = {}) {
  const threshold = config.zero_delta_threshold || 3;
  const stallMinutes = config.time_stall_minutes || 30;
  const stories = state.stories_executed || [];
  const now = Date.now();

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
};
