const fs = require('fs');
const path = require('path');
const { updateTaskLedger } = require('./task-ledger-lock.js');

function readTaskLedger(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content);
}

function getNextStory(ledger, milestoneName) {
  const milestone = ledger.milestones.find(m => m.name === milestoneName);
  if (!milestone) return null;
  return milestone.stories.find(s => s.status === 'pending') || null;
}

function getNextMilestone(ledger) {
  return ledger.milestones.find(m => m.stories.some(s => s.status === 'pending')) || null;
}

async function addFixStories(filePath, milestoneName, stories) {
  // P0-003 fix: use lock wrapper to prevent concurrent write corruption
  const projectDir = path.dirname(filePath);
  await updateTaskLedger(projectDir, (ledger) => {
    if (!ledger) throw new Error('Task ledger not found');
    const milestone = ledger.milestones.find(m => m.name === milestoneName);
    if (!milestone) throw new Error(`Milestone ${milestoneName} not found`);
    milestone.stories.push(...stories);
    return ledger;
  });
}

function isStoryCompleted(ledger, storyName) {
  for (const milestone of ledger.milestones) {
    const story = milestone.stories.find(s => s.name === storyName);
    if (story && story.status === 'done') return true;
  }
  return false;
}

module.exports = { readTaskLedger, addFixStories, getNextStory, getNextMilestone, isStoryCompleted };
