/**
 * V3 Integration smoke test — validates the full V3 state model works end-to-end.
 * Does NOT call Claude (no API cost). Tests the launcher modules working together.
 *
 * To run: node --test test/integration/tiny-project.test.js
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { writeCheckpoint, readLatestCheckpoint, readAllCheckpoints } = require('../../src/launcher/checkpoint.js');
const { readTaskLedger, addFixStories, getNextStory, getNextMilestone } = require('../../src/launcher/task-ledger.js');
const { checkMilestoneLock, promoteMilestone, shouldEscalateForSpin, getCompletedStoryNames, isStoryDuplicate } = require('../../src/launcher/safety.js');
const { trackPhaseCost, checkBudgetCap, getCostSummary } = require('../../src/launcher/cost-tracker.js');
const { deployWithRetry, shouldBlockMilestoneCheck } = require('../../src/launcher/deploy-blocking.js');
const { migrateV2StateToV3 } = require('../../src/launcher/state-migration.js');
const { injectPreamble } = require('../../src/launcher/preamble-injector.js');
const { getModelForPhase } = require('../../src/launcher/model-selection.js');
const { appendLearning, readLearnings } = require('../../src/launcher/learnings.js');
const { appendToolCall, readAuditTrail } = require('../../src/launcher/audit-trail.js');

describe('V3 Integration: Tiny Project', () => {
  let projectDir;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-integration-'));

    // Write a V2 state.json
    fs.writeFileSync(path.join(projectDir, 'state.json'), JSON.stringify({
      current_state: 'story-building',
      current_milestone: 'core-features',
      current_story: 's1',
      cycle_number: 1,
      consecutive_failures: 0,
      milestones: [
        {
          name: 'core-features',
          status: 'in-progress',
          stories: [
            { id: 's1', name: 'add-list-page', status: 'pending', acceptance_criteria: ['List renders'] },
            { id: 's2', name: 'add-detail-page', status: 'pending', acceptance_criteria: ['Detail loads'] },
          ],
        },
      ],
    }));

    // Write cycle_context.json
    fs.writeFileSync(path.join(projectDir, 'cycle_context.json'), JSON.stringify({
      _cycle_number: 1,
    }));
  });

  afterEach(() => { fs.rmSync(projectDir, { recursive: true }); });

  test('full lifecycle: migrate → build stories → promote → verify', async () => {
    const checkpointsFile = path.join(projectDir, 'checkpoints.jsonl');
    const ledgerFile = path.join(projectDir, 'task_ledger.json');

    // Step 1: Migrate V2 → V3
    const migration = migrateV2StateToV3(projectDir);
    assert.equal(migration.migrated, true);
    assert.ok(fs.existsSync(ledgerFile));
    assert.ok(fs.existsSync(checkpointsFile));

    const ledger = readTaskLedger(ledgerFile);
    assert.equal(ledger.milestones.length, 1);
    assert.equal(ledger.milestones[0].stories.length, 2);

    // Step 2: Simulate story building
    const state = { promoted_milestones: [], stories_executed: [], costs: { cumulative_tokens: 0, cumulative_cost_usd: 0 } };

    // Build story 1
    const story1 = getNextStory(ledger, 'core-features');
    assert.equal(story1.name, 'add-list-page');

    writeCheckpoint(checkpointsFile, {
      phase: 'story-building',
      state: { ...state, current_story: 's1', story_results: [{ name: 'add-list-page', outcome: 'pass' }] },
      costs: state.costs,
    });

    state.stories_executed.push({ name: 'add-list-page', delta: 15, duration_ms: 300000 });
    trackPhaseCost(state, 50000, 'opus');

    // Mark story done and check dedup
    story1.status = 'done';
    const completedNames = getCompletedStoryNames(readAllCheckpoints(checkpointsFile));
    assert.ok(isStoryDuplicate('add-list-page', completedNames));
    assert.ok(!isStoryDuplicate('add-detail-page', completedNames));

    // Build story 2
    writeCheckpoint(checkpointsFile, {
      phase: 'story-building',
      state: { ...state, current_story: 's2', story_results: [{ name: 'add-detail-page', outcome: 'pass' }] },
      costs: state.costs,
    });
    trackPhaseCost(state, 40000, 'opus');

    // Step 3: No spin detected
    const spinResult = shouldEscalateForSpin({
      stories_executed: state.stories_executed,
      last_meaningful_progress_at: Date.now(),
    });
    assert.equal(spinResult, null);

    // Step 4: Deploy succeeds
    const deployResult = await deployWithRetry(() => 'https://staging.example.dev', { maxRetries: 3, retryDelayMs: 0 });
    assert.equal(deployResult.blocked, false);
    assert.equal(shouldBlockMilestoneCheck(deployResult), false);

    // Step 5: Promote milestone
    assert.equal(checkMilestoneLock({ state }, 'core-features'), false);
    promoteMilestone(state, 'core-features');
    assert.equal(checkMilestoneLock({ state }, 'core-features'), true);

    // Step 6: Verify cost tracking
    assert.ok(state.costs.cumulative_cost_usd > 0);
    assert.equal(checkBudgetCap(state, 50), false); // under budget

    const allCps = readAllCheckpoints(checkpointsFile);
    assert.ok(allCps.length >= 2); // migration + 2 story checkpoints

    // Step 7: Verify preamble injection works
    const preamble = injectPreamble({
      projectDir,
      phaseName: 'story-building',
      phaseDescription: 'Build the current story',
      modelName: getModelForPhase('story-building'),
      requiredOutputKeys: ['story_result'],
    });
    assert.ok(preamble.includes('story-building'));
    assert.ok(preamble.includes('opus'));

    // Step 8: Verify learnings
    appendLearning(projectDir, 'Infrastructure', 'Use supabase-js not Prisma');
    const learnings = readLearnings(projectDir);
    assert.ok(learnings.includes('supabase-js'));

    // Step 9: Verify audit trail
    appendToolCall(projectDir, { tool: 'Bash', command: 'npm test', phase: 'story-building' });
    const trail = readAuditTrail(projectDir);
    assert.equal(trail.length, 1);
  });

  test('budget cap triggers escalation', () => {
    const state = { costs: { cumulative_tokens: 5000000, cumulative_cost_usd: 55.00 } };
    assert.equal(checkBudgetCap(state, 50), true);
  });

  test('spin detection triggers on zero-delta stories', () => {
    const result = shouldEscalateForSpin({
      stories_executed: [
        { name: 'a', delta: 0 },
        { name: 'b', delta: 0 },
        { name: 'c', delta: 0 },
      ],
      last_meaningful_progress_at: Date.now(),
    });
    assert.ok(result);
  });

  test('task_ledger unchanged after read operations', () => {
    migrateV2StateToV3(projectDir);
    const ledgerFile = path.join(projectDir, 'task_ledger.json');
    const before = fs.readFileSync(ledgerFile, 'utf8');
    const ledger = readTaskLedger(ledgerFile);
    getNextStory(ledger, 'core-features');
    getNextMilestone(ledger);
    const after = fs.readFileSync(ledgerFile, 'utf8');
    assert.equal(before, after, 'task_ledger.json was modified by read operations');
  });
});
