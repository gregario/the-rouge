const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { writeCheckpoint, readLatestCheckpoint, readAllCheckpoints, recoverFromCheckpoint } = require('../../src/launcher/checkpoint.js');

describe('Checkpoint I/O', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('writeCheckpoint appends to JSONL file', () => {
    const cpPath = path.join(tmpDir, 'checkpoints.jsonl');
    writeCheckpoint(cpPath, {
      phase: 'story-building',
      state: { current_milestone: 'vehicle-registry', current_story: 'add-edit' },
      costs: { phase_tokens: 45000, cumulative_tokens: 45000 }
    });
    const lines = fs.readFileSync(cpPath, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    const cp = JSON.parse(lines[0]);
    assert.equal(cp.phase, 'story-building');
    assert.ok(cp.id.startsWith('cp-'));
    assert.ok(cp.timestamp);
  });

  test('writeCheckpoint appends multiple entries', () => {
    const cpPath = path.join(tmpDir, 'checkpoints.jsonl');
    writeCheckpoint(cpPath, { phase: 'foundation', state: { step: 1 }, costs: {} });
    writeCheckpoint(cpPath, { phase: 'story-building', state: { step: 2 }, costs: {} });
    const lines = fs.readFileSync(cpPath, 'utf8').trim().split('\n');
    assert.equal(lines.length, 2);
  });

  test('readLatestCheckpoint returns most recent', () => {
    const cpPath = path.join(tmpDir, 'checkpoints.jsonl');
    writeCheckpoint(cpPath, { phase: 'foundation', state: { step: 1 }, costs: {} });
    writeCheckpoint(cpPath, { phase: 'story-building', state: { step: 2 }, costs: {} });
    const latest = readLatestCheckpoint(cpPath);
    assert.equal(latest.phase, 'story-building');
    assert.equal(latest.state.step, 2);
  });

  test('readLatestCheckpoint returns null for missing file', () => {
    const cpPath = path.join(tmpDir, 'checkpoints.jsonl');
    const latest = readLatestCheckpoint(cpPath);
    assert.equal(latest, null);
  });

  test('readLatestCheckpoint returns null for empty file', () => {
    const cpPath = path.join(tmpDir, 'checkpoints.jsonl');
    fs.writeFileSync(cpPath, '', 'utf8');
    const latest = readLatestCheckpoint(cpPath);
    assert.equal(latest, null);
  });

  test('readAllCheckpoints returns array of all entries', () => {
    const cpPath = path.join(tmpDir, 'checkpoints.jsonl');
    writeCheckpoint(cpPath, { phase: 'foundation', state: {}, costs: {} });
    writeCheckpoint(cpPath, { phase: 'story-building', state: {}, costs: {} });
    writeCheckpoint(cpPath, { phase: 'milestone-check', state: {}, costs: {} });
    const all = readAllCheckpoints(cpPath);
    assert.equal(all.length, 3);
  });

  test('readAllCheckpoints returns empty array for missing file', () => {
    const cpPath = path.join(tmpDir, 'checkpoints.jsonl');
    const all = readAllCheckpoints(cpPath);
    assert.deepEqual(all, []);
  });

  test('recoverFromCheckpoint truncates after given checkpoint ID', () => {
    const cpPath = path.join(tmpDir, 'checkpoints.jsonl');
    writeCheckpoint(cpPath, { phase: 'foundation', state: { step: 1 }, costs: {} });
    writeCheckpoint(cpPath, { phase: 'story-building', state: { step: 2 }, costs: {} });
    writeCheckpoint(cpPath, { phase: 'milestone-check', state: { step: 3 }, costs: {} });
    const all = readAllCheckpoints(cpPath);
    recoverFromCheckpoint(cpPath, all[0].id);
    const after = readAllCheckpoints(cpPath);
    assert.equal(after.length, 1);
    assert.equal(after[0].phase, 'foundation');
  });

  test('recoverFromCheckpoint throws for unknown checkpoint ID', () => {
    const cpPath = path.join(tmpDir, 'checkpoints.jsonl');
    writeCheckpoint(cpPath, { phase: 'foundation', state: {}, costs: {} });
    assert.throws(
      () => recoverFromCheckpoint(cpPath, 'cp-nonexistent'),
      /not found/
    );
  });
});
