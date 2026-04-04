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

module.exports = { checkMilestoneLock, promoteMilestone };
