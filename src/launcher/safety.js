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
  const zeroDeltaCount = storiesExecuted.filter(s => s.delta === 0).length;
  return zeroDeltaCount >= threshold;
}

function detectDuplicateStories(storiesExecuted) {
  const seen = new Set();
  const duplicates = new Set();
  for (const story of storiesExecuted) {
    if (seen.has(story.name)) {
      duplicates.add(story.name);
    }
    seen.add(story.name);
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

module.exports = {
  checkMilestoneLock, promoteMilestone,
  detectZeroDeltaSpin, detectDuplicateStories, detectTimeStall, shouldEscalateForSpin,
};
