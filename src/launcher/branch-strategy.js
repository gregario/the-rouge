/**
 * V3 Branch strategy — single branch per project, milestone tags, story revert.
 * No branch-per-story. No merges. No fragmentation.
 */

function getBuildBranchName(projectName) {
  const sanitised = projectName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
  return `rouge/build-${sanitised}`;
}

function getMilestoneTagName(milestoneName) {
  return `milestone/${milestoneName}`;
}

function getStoryRevertCommand(firstCommit, lastCommit) {
  if (lastCommit) {
    return `git revert --no-edit ${firstCommit}..${lastCommit}`;
  }
  return `git revert --no-edit ${firstCommit}`;
}

module.exports = { getBuildBranchName, getMilestoneTagName, getStoryRevertCommand };
