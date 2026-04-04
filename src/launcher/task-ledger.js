const fs = require('fs');

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

function addFixStories(filePath, milestoneName, stories) {
  const ledger = readTaskLedger(filePath);
  const milestone = ledger.milestones.find(m => m.name === milestoneName);
  if (!milestone) throw new Error(`Milestone ${milestoneName} not found`);
  milestone.stories.push(...stories);
  fs.writeFileSync(filePath, JSON.stringify(ledger, null, 2), 'utf8');
}

function isStoryCompleted(ledger, storyName) {
  for (const milestone of ledger.milestones) {
    const story = milestone.stories.find(s => s.name === storyName);
    if (story && story.status === 'done') return true;
  }
  return false;
}

module.exports = { readTaskLedger, addFixStories, getNextStory, getNextMilestone, isStoryCompleted };
