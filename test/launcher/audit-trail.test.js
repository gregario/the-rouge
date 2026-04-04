const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { appendToolCall, readAuditTrail } = require('../../src/launcher/audit-trail.js');

describe('Audit Trail', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-test-'));
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

  test('appendToolCall creates tools.jsonl with entry', () => {
    appendToolCall(tmpDir, {
      tool: 'Bash',
      command: 'npm run build',
      phase: 'story-building',
      story: 'vehicle-edit',
    });
    const file = path.join(tmpDir, 'tools.jsonl');
    assert.ok(fs.existsSync(file));
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    const entry = JSON.parse(lines[0]);
    assert.equal(entry.tool, 'Bash');
    assert.equal(entry.command, 'npm run build');
    assert.equal(entry.phase, 'story-building');
    assert.ok(entry.timestamp);
  });

  test('appendToolCall appends multiple entries', () => {
    appendToolCall(tmpDir, { tool: 'Bash', command: 'npm test', phase: 'story-building' });
    appendToolCall(tmpDir, { tool: 'Write', path: 'src/app.tsx', phase: 'story-building' });
    const lines = fs.readFileSync(path.join(tmpDir, 'tools.jsonl'), 'utf8').trim().split('\n');
    assert.equal(lines.length, 2);
  });

  test('readAuditTrail returns all entries', () => {
    appendToolCall(tmpDir, { tool: 'Bash', command: 'npm test', phase: 'foundation' });
    appendToolCall(tmpDir, { tool: 'Write', path: 'src/db.ts', phase: 'foundation' });
    const entries = readAuditTrail(tmpDir);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].tool, 'Bash');
    assert.equal(entries[1].tool, 'Write');
  });

  test('readAuditTrail returns empty array for missing file', () => {
    assert.deepEqual(readAuditTrail(tmpDir), []);
  });
});
