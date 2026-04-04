/**
 * V2 → V3 state migration.
 * Splits state.json into task_ledger.json + first checkpoint in checkpoints.jsonl.
 * Runs once per project on first V3 encounter.
 */

const fs = require('fs');
const path = require('path');
const { writeCheckpoint } = require('./checkpoint.js');

function migrateV2StateToV3(projectDir) {
  const stateFile = path.join(projectDir, 'state.json');
  const ledgerFile = path.join(projectDir, 'task_ledger.json');
  const checkpointsFile = path.join(projectDir, 'checkpoints.jsonl');

  // Already migrated
  if (fs.existsSync(ledgerFile)) {
    return { migrated: false, reason: 'already_migrated' };
  }

  // No state file to migrate
  if (!fs.existsSync(stateFile)) {
    return { migrated: false, reason: 'no_state_file' };
  }

  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

  // Extract milestones + stories into task ledger
  const ledger = {
    milestones: (state.milestones || []).map(m => ({
      name: m.name,
      stories: (m.stories || []).map(s => ({
        id: s.id,
        name: s.name,
        status: s.status,
        depends_on: s.depends_on || [],
        acceptance_criteria: s.acceptance_criteria || [],
      })),
    })),
  };

  fs.writeFileSync(ledgerFile, JSON.stringify(ledger, null, 2), 'utf8');

  // Determine already-promoted milestones
  const promotedMilestones = (state.milestones || [])
    .filter(m => m.status === 'complete' || m.status === 'partial')
    .map(m => m.name);

  // Write first checkpoint
  writeCheckpoint(checkpointsFile, {
    phase: 'migration-v2-to-v3',
    state: {
      current_milestone: state.current_milestone || null,
      current_story: state.current_story || null,
      promoted_milestones: promotedMilestones,
      consecutive_failures: state.consecutive_failures || 0,
      stories_executed: [],
    },
    costs: state.costs || {},
  });

  return { migrated: true };
}

module.exports = { migrateV2StateToV3 };
