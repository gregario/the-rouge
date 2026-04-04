const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { migrateV2StateToV3 } = require('../../src/launcher/state-migration.js');
const { readAllCheckpoints } = require('../../src/launcher/checkpoint.js');
const { readTaskLedger } = require('../../src/launcher/task-ledger.js');

describe('V2 → V3 State Migration', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-test-'));
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

  function writeV2State(overrides = {}) {
    const state = {
      current_state: 'story-building',
      current_milestone: 'dashboard',
      current_story: 's2',
      cycle_number: 3,
      consecutive_failures: 0,
      milestones: [
        {
          name: 'dashboard',
          status: 'in-progress',
          stories: [
            { id: 's1', name: 'add-list', status: 'done', acceptance_criteria: ['List loads'] },
            { id: 's2', name: 'add-edit', status: 'pending', acceptance_criteria: ['Edit saves'] },
          ],
        },
        {
          name: 'gps-trips',
          status: 'pending',
          stories: [
            { id: 's3', name: 'trip-api', status: 'pending', acceptance_criteria: ['API returns trips'] },
          ],
        },
      ],
      ...overrides,
    };
    fs.writeFileSync(path.join(tmpDir, 'state.json'), JSON.stringify(state, null, 2));
    return state;
  }

  test('creates task_ledger.json from state.json milestones', () => {
    writeV2State();
    const result = migrateV2StateToV3(tmpDir);
    assert.equal(result.migrated, true);

    const ledger = readTaskLedger(path.join(tmpDir, 'task_ledger.json'));
    assert.equal(ledger.milestones.length, 2);
    assert.equal(ledger.milestones[0].name, 'dashboard');
    assert.equal(ledger.milestones[0].stories.length, 2);
  });

  test('creates first checkpoint entry', () => {
    writeV2State();
    migrateV2StateToV3(tmpDir);

    const checkpoints = readAllCheckpoints(path.join(tmpDir, 'checkpoints.jsonl'));
    assert.equal(checkpoints.length, 1);
    assert.equal(checkpoints[0].phase, 'migration-v2-to-v3');
    assert.equal(checkpoints[0].state.current_milestone, 'dashboard');
  });

  test('does not migrate if task_ledger.json already exists', () => {
    writeV2State();
    fs.writeFileSync(path.join(tmpDir, 'task_ledger.json'), '{}');
    const result = migrateV2StateToV3(tmpDir);
    assert.equal(result.migrated, false);
    assert.equal(result.reason, 'already_migrated');
  });

  test('does not migrate if no state.json exists', () => {
    const result = migrateV2StateToV3(tmpDir);
    assert.equal(result.migrated, false);
    assert.equal(result.reason, 'no_state_file');
  });

  test('preserves state.json for backwards compatibility', () => {
    writeV2State();
    migrateV2StateToV3(tmpDir);
    assert.ok(fs.existsSync(path.join(tmpDir, 'state.json')));
  });

  test('initialises promoted_milestones from completed milestones', () => {
    writeV2State({
      milestones: [
        { name: 'done-ms', status: 'complete', stories: [{ id: 's1', name: 'x', status: 'done' }] },
        { name: 'wip-ms', status: 'in-progress', stories: [{ id: 's2', name: 'y', status: 'pending' }] },
      ],
    });
    migrateV2StateToV3(tmpDir);

    const checkpoints = readAllCheckpoints(path.join(tmpDir, 'checkpoints.jsonl'));
    assert.deepEqual(checkpoints[0].state.promoted_milestones, ['done-ms']);
  });
});
