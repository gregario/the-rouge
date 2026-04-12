const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Import the processInfraAction function
const { processInfraAction } = require('../../src/launcher/rouge-loop.js');

describe('processInfraAction', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-infra-test-'));
    // Write minimal state.json
    fs.writeFileSync(path.join(tmpDir, 'state.json'), JSON.stringify({
      current_state: 'story-building',
      milestones: [],
    }));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns handled: false when no pending-action.json exists', () => {
    const result = processInfraAction(tmpDir, {});
    assert.strictEqual(result.handled, false);
  });

  test('returns handled: false and cleans up invalid action file', () => {
    fs.writeFileSync(path.join(tmpDir, 'pending-action.json'), JSON.stringify({ invalid: true }));
    const result = processInfraAction(tmpDir, {});
    assert.strictEqual(result.handled, false);
    assert.strictEqual(fs.existsSync(path.join(tmpDir, 'pending-action.json')), false);
  });

  test('refuses unknown action type', () => {
    fs.writeFileSync(path.join(tmpDir, 'pending-action.json'), JSON.stringify({
      action: 'launch-missiles',
      params: {},
      reason: 'test',
    }));
    const result = processInfraAction(tmpDir, {});
    assert.strictEqual(result.handled, true);
    assert.strictEqual(result.result.status, 'refused');
    assert.ok(result.result.reason.includes('Unknown action type'));
    // action-result.json should exist
    const actionResult = JSON.parse(fs.readFileSync(path.join(tmpDir, 'action-result.json'), 'utf8'));
    assert.strictEqual(actionResult.status, 'refused');
    // pending-action.json should be consumed
    assert.strictEqual(fs.existsSync(path.join(tmpDir, 'pending-action.json')), false);
  });

  test('refuses git-push with force flag', () => {
    fs.writeFileSync(path.join(tmpDir, 'pending-action.json'), JSON.stringify({
      action: 'git-push',
      params: { force: true },
      reason: 'test force push',
    }));
    const result = processInfraAction(tmpDir, {});
    assert.strictEqual(result.handled, true);
    assert.strictEqual(result.result.status, 'refused');
    assert.ok(result.result.reason.includes('Force push is never allowed'));
  });

  test('refuses db-seed with absolute path', () => {
    fs.writeFileSync(path.join(tmpDir, 'pending-action.json'), JSON.stringify({
      action: 'db-seed',
      params: { script: '/usr/bin/evil' },
      reason: 'test absolute path',
    }));
    const result = processInfraAction(tmpDir, {});
    assert.strictEqual(result.handled, true);
    assert.strictEqual(result.result.status, 'refused');
    assert.ok(result.result.reason.includes('relative to project dir'));
  });

  test('refuses db-seed with path traversal', () => {
    fs.writeFileSync(path.join(tmpDir, 'pending-action.json'), JSON.stringify({
      action: 'db-seed',
      params: { script: '../../../etc/passwd' },
      reason: 'test traversal',
    }));
    const result = processInfraAction(tmpDir, {});
    assert.strictEqual(result.handled, true);
    assert.strictEqual(result.result.status, 'refused');
  });

  test('refuses git-tag without tag_name', () => {
    fs.writeFileSync(path.join(tmpDir, 'pending-action.json'), JSON.stringify({
      action: 'git-tag',
      params: {},
      reason: 'test missing tag',
    }));
    const result = processInfraAction(tmpDir, {});
    assert.strictEqual(result.handled, true);
    assert.strictEqual(result.result.status, 'refused');
    assert.ok(result.result.reason.includes('tag_name is required'));
  });

  test('writes action-result.json after processing', () => {
    fs.writeFileSync(path.join(tmpDir, 'pending-action.json'), JSON.stringify({
      action: 'unknown-action',
      params: {},
    }));
    processInfraAction(tmpDir, {});
    assert.ok(fs.existsSync(path.join(tmpDir, 'action-result.json')));
    const result = JSON.parse(fs.readFileSync(path.join(tmpDir, 'action-result.json'), 'utf8'));
    assert.strictEqual(result.action, 'unknown-action');
  });

  test('appends to interventions.jsonl for audit trail', () => {
    fs.writeFileSync(path.join(tmpDir, 'pending-action.json'), JSON.stringify({
      action: 'git-push',
      params: { force: true },
      reason: 'audit test',
    }));
    processInfraAction(tmpDir, {});
    const interventions = fs.readFileSync(path.join(tmpDir, 'interventions.jsonl'), 'utf8').trim().split('\n');
    assert.strictEqual(interventions.length, 1);
    const entry = JSON.parse(interventions[0]);
    assert.strictEqual(entry.type, 'infra-action');
    assert.strictEqual(entry.action, 'git-push');
    assert.strictEqual(entry.status, 'refused');
    assert.strictEqual(entry.reason, 'audit test');
  });

  test('git-tag succeeds in a git repo', () => {
    // Init a git repo in the temp dir
    const { execSync } = require('child_process');
    execSync('git init && git add -A && git commit -m "test" --allow-empty', {
      cwd: tmpDir, encoding: 'utf8', stdio: 'pipe',
      env: { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@test.com',
             GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@test.com' },
    });
    fs.writeFileSync(path.join(tmpDir, 'pending-action.json'), JSON.stringify({
      action: 'git-tag',
      params: { tag_name: 'v1.0.0-test' },
      reason: 'test tag',
    }));
    const result = processInfraAction(tmpDir, {});
    assert.strictEqual(result.handled, true);
    assert.strictEqual(result.result.status, 'success');
    assert.strictEqual(result.result.result.tag, 'v1.0.0-test');
  });
});
