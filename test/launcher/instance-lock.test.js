const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { acquire, release, isRunning, lockPath } = require('../../src/launcher/instance-lock');

describe('instance-lock', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-lock-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('acquire succeeds when no lock exists', () => {
    const result = acquire(tmpDir);
    assert.strictEqual(result.acquired, true);
    assert.ok(fs.existsSync(lockPath(tmpDir)));
  });

  test('acquire writes PID to lock file', () => {
    acquire(tmpDir);
    const lock = JSON.parse(fs.readFileSync(lockPath(tmpDir), 'utf-8'));
    assert.strictEqual(lock.pid, process.pid);
    assert.ok(lock.startedAt);
  });

  test('acquire refuses when lock held by live process (self)', () => {
    // Write a lock with our own PID but pretend it's "another" by not matching
    const file = lockPath(tmpDir);
    fs.writeFileSync(file, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    // Since it's our own PID and we're alive, acquire from same process should still work
    // (the check is `existing.pid !== process.pid`)
    const result = acquire(tmpDir);
    assert.strictEqual(result.acquired, true);
  });

  test('acquire refuses when lock held by another live process', () => {
    // Use PID 1 (launchd/init — always alive on macOS/Linux)
    const file = lockPath(tmpDir);
    fs.writeFileSync(file, JSON.stringify({ pid: 1, startedAt: new Date().toISOString() }));
    const result = acquire(tmpDir);
    assert.strictEqual(result.acquired, false);
    assert.strictEqual(result.existingPid, 1);
  });

  test('acquire succeeds when lock held by dead process (stale recovery)', () => {
    const file = lockPath(tmpDir);
    fs.writeFileSync(file, JSON.stringify({ pid: 99999999, startedAt: new Date().toISOString() }));
    const result = acquire(tmpDir);
    assert.strictEqual(result.acquired, true);
  });

  test('release removes lock file when PID matches', () => {
    acquire(tmpDir);
    assert.ok(fs.existsSync(lockPath(tmpDir)));
    release(tmpDir);
    assert.ok(!fs.existsSync(lockPath(tmpDir)));
  });

  test('release does not remove lock file when PID does not match', () => {
    const file = lockPath(tmpDir);
    fs.writeFileSync(file, JSON.stringify({ pid: 1, startedAt: new Date().toISOString() }));
    release(tmpDir);
    assert.ok(fs.existsSync(file));
  });

  test('isRunning returns true for live process', () => {
    const file = lockPath(tmpDir);
    fs.writeFileSync(file, JSON.stringify({ pid: 1, startedAt: new Date().toISOString() }));
    const status = isRunning(tmpDir);
    assert.strictEqual(status.running, true);
    assert.strictEqual(status.pid, 1);
  });

  test('isRunning returns false and cleans stale lock', () => {
    const file = lockPath(tmpDir);
    fs.writeFileSync(file, JSON.stringify({ pid: 99999999, startedAt: new Date().toISOString() }));
    const status = isRunning(tmpDir);
    assert.strictEqual(status.running, false);
    assert.strictEqual(status.pid, null);
    assert.ok(!fs.existsSync(file));
  });

  test('isRunning returns false when no lock file exists', () => {
    const status = isRunning(tmpDir);
    assert.strictEqual(status.running, false);
  });

  test('acquire with filter option stores it in lock file', () => {
    acquire(tmpDir, { filter: 'irish-planning' });
    const lock = JSON.parse(fs.readFileSync(lockPath(tmpDir), 'utf-8'));
    assert.strictEqual(lock.filter, 'irish-planning');
  });
});
