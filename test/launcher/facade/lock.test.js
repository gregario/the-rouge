const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { acquireLock, withLock, lockPath, SLOW_MUTATOR_MS } = require('../../../src/launcher/facade/lock.js');

let projectDir;
beforeEach(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-lock-test-'));
});
afterEach(() => {
  try { fs.rmSync(projectDir, { recursive: true, force: true }); } catch (_e) {}
});

describe('facade/lock — acquireLock', () => {
  test('acquires the lock and returns a release function', async () => {
    const release = await acquireLock(projectDir);
    assert.equal(typeof release, 'function');
    assert.ok(fs.existsSync(lockPath(projectDir)));
    release();
    assert.equal(fs.existsSync(lockPath(projectDir)), false);
  });

  test('release is idempotent', async () => {
    const release = await acquireLock(projectDir);
    release();
    release(); // does not throw
    assert.equal(fs.existsSync(lockPath(projectDir)), false);
  });

  test('second acquirer waits then succeeds when first releases', async () => {
    const release1 = await acquireLock(projectDir, { timeoutMs: 2000 });
    const acquire2 = acquireLock(projectDir, { timeoutMs: 2000 });
    setTimeout(() => release1(), 50);
    const release2 = await acquire2;
    release2();
  });

  test('times out when the lock is never released', async () => {
    const release1 = await acquireLock(projectDir);
    await assert.rejects(
      acquireLock(projectDir, { timeoutMs: 200 }),
      /timed out acquiring/
    );
    release1();
  });

  test('breaks a stale lockfile (dead PID)', async () => {
    const file = lockPath(projectDir);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Write a lockfile claiming a PID that almost certainly doesn't
    // exist (1 is init, but 999999999 is way out of range).
    fs.writeFileSync(file, JSON.stringify({ pid: 999999999, acquiredAt: Date.now() }));
    const release = await acquireLock(projectDir, { timeoutMs: 1000 });
    release();
  });
});

describe('facade/lock — withLock', () => {
  test('runs the function and releases', async () => {
    let ran = false;
    const result = await withLock(projectDir, () => { ran = true; return 'value'; });
    assert.equal(ran, true);
    assert.equal(result, 'value');
    assert.equal(fs.existsSync(lockPath(projectDir)), false);
  });

  test('releases on throw and re-raises', async () => {
    await assert.rejects(
      withLock(projectDir, () => { throw new Error('boom'); }),
      /boom/
    );
    assert.equal(fs.existsSync(lockPath(projectDir)), false);
  });

  test('throws on slow mutator in dev/test (FORK E)', async () => {
    const prevEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    try {
      await assert.rejects(
        withLock(projectDir, async () => {
          await new Promise((r) => setTimeout(r, SLOW_MUTATOR_MS + 50));
        }),
        /mutator held lock/
      );
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  test('skips slow-mutator guard when allowSlow is true', async () => {
    await withLock(
      projectDir,
      async () => { await new Promise((r) => setTimeout(r, SLOW_MUTATOR_MS + 50)); },
      { allowSlow: true }
    );
    // No throw means pass.
  });

  test('serializes concurrent withLock invocations', async () => {
    const trace = [];
    const tasks = [
      withLock(projectDir, async () => {
        trace.push('A-start');
        await new Promise((r) => setTimeout(r, 30));
        trace.push('A-end');
      }),
      withLock(projectDir, async () => {
        trace.push('B-start');
        await new Promise((r) => setTimeout(r, 30));
        trace.push('B-end');
      }),
    ];
    await Promise.all(tasks);
    // The two critical sections must not interleave. Either A-start
    // → A-end → B-start → B-end OR B-start → B-end → A-start → A-end.
    const aStart = trace.indexOf('A-start');
    const aEnd = trace.indexOf('A-end');
    const bStart = trace.indexOf('B-start');
    const bEnd = trace.indexOf('B-end');
    assert.ok(aEnd < bStart || bEnd < aStart,
      `lock did not serialize critical sections: ${JSON.stringify(trace)}`);
  });
});
