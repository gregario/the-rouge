const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const facade = require('../../../src/launcher/facade.js');
const { eventsPath, readEvents } = require('../../../src/launcher/facade/events.js');
const { statePath } = require('../../../src/launcher/state-path.js');

let projectDir;
beforeEach(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-facade-test-'));
  // Pre-create .rouge dir so statePath resolution settles consistently.
  fs.mkdirSync(path.join(projectDir, '.rouge'), { recursive: true });
});
afterEach(() => {
  try { fs.rmSync(projectDir, { recursive: true, force: true }); } catch (_e) {}
});

describe('facade.writeState — atomic state mutation', () => {
  test('mutator runs against an empty state when no state file exists', async () => {
    const { state } = await facade.writeState({
      projectDir,
      source: 'test',
      mutator: (s) => { s.created = true; },
    });
    assert.equal(state.created, true);
    const onDisk = JSON.parse(fs.readFileSync(statePath(projectDir), 'utf8'));
    assert.equal(onDisk.created, true);
  });

  test('mutator can return a replacement object', async () => {
    const { state } = await facade.writeState({
      projectDir,
      source: 'test',
      mutator: () => ({ replaced: 1 }),
    });
    assert.deepEqual(state, { replaced: 1 });
  });

  test('emits a state.write event after commit', async () => {
    await facade.writeState({
      projectDir,
      source: 'cli',
      mutator: (s) => { s.x = 1; },
      eventDetail: { reason: 'unit-test' },
    });
    const r = readEvents(projectDir);
    const writeEvents = r.entries.filter((e) => e.event === 'state.write');
    assert.equal(writeEvents.length, 1);
    assert.equal(writeEvents[0].source, 'cli');
    assert.deepEqual(writeEvents[0].detail, { reason: 'unit-test' });
  });

  test('rejects an invalid source', async () => {
    await assert.rejects(
      facade.writeState({ projectDir, source: 'nope', mutator: () => {} }),
      /source 'nope' invalid/
    );
  });

  test('rejects when mutator is not a function', async () => {
    await assert.rejects(
      facade.writeState({ projectDir, source: 'test', mutator: 'oops' }),
      /mutator must be a function/
    );
  });

  test('serializes concurrent writes (lock + last-writer-wins on observable state)', async () => {
    // Two concurrent increments. Without the lock, the second
    // mutator's prior-read would be stale and one increment would be
    // lost. With the lock, the final state must be n: 2.
    fs.writeFileSync(statePath(projectDir), JSON.stringify({ n: 0 }));
    await Promise.all([
      facade.writeState({ projectDir, source: 'test', mutator: (s) => { s.n = (s.n || 0) + 1; } }),
      facade.writeState({ projectDir, source: 'test', mutator: (s) => { s.n = (s.n || 0) + 1; } }),
    ]);
    const final = JSON.parse(fs.readFileSync(statePath(projectDir), 'utf8'));
    assert.equal(final.n, 2);
  });
});

describe('facade.readState — lock-free read', () => {
  test('returns the parsed state', async () => {
    await facade.writeState({
      projectDir,
      source: 'test',
      mutator: () => ({ hello: 'world' }),
    });
    const got = facade.readState(projectDir);
    assert.deepEqual(got, { hello: 'world' });
  });

  test('returns null when no state file exists', () => {
    assert.equal(facade.readState(projectDir), null);
  });
});

describe('facade.runPhase — dispatch validation', () => {
  test('rejects an invalid mode', async () => {
    await assert.rejects(
      facade.runPhase({ projectDir, phase: 'loop.test', mode: 'bogus', source: 'test', prompt: 'x' }),
      /mode 'bogus' invalid/
    );
  });

  test('rejects missing phase', async () => {
    await assert.rejects(
      facade.runPhase({ projectDir, mode: 'subprocess', source: 'test', prompt: 'x' }),
      /phase required/
    );
  });

  test('rejects missing source', async () => {
    await assert.rejects(
      facade.runPhase({ projectDir, phase: 'loop.x', mode: 'subprocess', prompt: 'x' }),
      /source '.*' invalid/
    );
  });

  test('emits phase.start + phase.end on dispatch failure', async () => {
    // Force a failure by passing an unreachable signal that fires
    // immediately. The subprocess will bail; we just want the events
    // to land.
    const ac = new AbortController();
    ac.abort();
    await assert.rejects(
      facade.runPhase({
        projectDir,
        phase: 'loop.test-only',
        mode: 'subprocess',
        source: 'test',
        prompt: 'irrelevant',
        signal: ac.signal,
      })
    );
    const r = readEvents(projectDir);
    const events = r.entries.map((e) => e.event);
    assert.ok(events.includes('phase.start'), `expected phase.start, got: ${events.join(',')}`);
    assert.ok(events.includes('phase.end'), `expected phase.end, got: ${events.join(',')}`);
    const endEvent = r.entries.find((e) => e.event === 'phase.end');
    assert.equal(endEvent.detail.ok, false);
    assert.ok(endEvent.detail.error);
  });
});
