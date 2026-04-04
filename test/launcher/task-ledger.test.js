const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { readTaskLedger, addFixStories, getNextStory, getNextMilestone, isStoryCompleted } = require('../../src/launcher/task-ledger.js');

describe('Task Ledger', () => {
  let tmpDir, ledgerPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-test-'));
    ledgerPath = path.join(tmpDir, 'task_ledger.json');
    fs.writeFileSync(ledgerPath, JSON.stringify({
      milestones: [
        {
          name: 'dashboard',
          stories: [
            { id: 's1', name: 'add-list', status: 'done' },
            { id: 's2', name: 'add-edit', status: 'pending' }
          ]
        },
        {
          name: 'gps-trips',
          stories: [
            { id: 's3', name: 'trip-api', status: 'pending' }
          ]
        }
      ]
    }));
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

  test('readTaskLedger returns milestones and stories', () => {
    const ledger = readTaskLedger(ledgerPath);
    assert.equal(ledger.milestones.length, 2);
    assert.equal(ledger.milestones[0].stories.length, 2);
  });

  test('readTaskLedger throws for missing file', () => {
    assert.throws(
      () => readTaskLedger(path.join(tmpDir, 'nonexistent.json')),
      /ENOENT/
    );
  });

  test('getNextStory returns first pending story in milestone', () => {
    const ledger = readTaskLedger(ledgerPath);
    const story = getNextStory(ledger, 'dashboard');
    assert.equal(story.name, 'add-edit');
  });

  test('getNextStory returns null when all done', () => {
    const ledger = readTaskLedger(ledgerPath);
    ledger.milestones[0].stories[1].status = 'done';
    const story = getNextStory(ledger, 'dashboard');
    assert.equal(story, null);
  });

  test('getNextStory returns null for unknown milestone', () => {
    const ledger = readTaskLedger(ledgerPath);
    const story = getNextStory(ledger, 'nonexistent');
    assert.equal(story, null);
  });

  test('getNextMilestone returns first milestone with pending stories', () => {
    const ledger = readTaskLedger(ledgerPath);
    ledger.milestones[0].stories.forEach(s => s.status = 'done');
    const ms = getNextMilestone(ledger);
    assert.equal(ms.name, 'gps-trips');
  });

  test('getNextMilestone returns null when all milestones done', () => {
    const ledger = readTaskLedger(ledgerPath);
    ledger.milestones.forEach(m => m.stories.forEach(s => s.status = 'done'));
    const ms = getNextMilestone(ledger);
    assert.equal(ms, null);
  });

  test('addFixStories appends stories to milestone', () => {
    addFixStories(ledgerPath, 'dashboard', [
      { id: 'fix1', name: 'fix-layout', status: 'pending' }
    ]);
    const updated = readTaskLedger(ledgerPath);
    assert.equal(updated.milestones[0].stories.length, 3);
    assert.equal(updated.milestones[0].stories[2].name, 'fix-layout');
  });

  test('addFixStories throws for unknown milestone', () => {
    assert.throws(
      () => addFixStories(ledgerPath, 'nonexistent', [{ id: 'f1', name: 'fix', status: 'pending' }]),
      /not found/
    );
  });

  test('isStoryCompleted checks across all milestones', () => {
    const ledger = readTaskLedger(ledgerPath);
    assert.equal(isStoryCompleted(ledger, 'add-list'), true);
    assert.equal(isStoryCompleted(ledger, 'add-edit'), false);
    assert.equal(isStoryCompleted(ledger, 'nonexistent'), false);
  });
});
