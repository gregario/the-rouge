const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { emit, readEvents, subscribeEvents, eventsPath } = require('../../../src/launcher/facade/events.js');

let projectDir;
beforeEach(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-events-test-'));
});
afterEach(() => {
  try { fs.rmSync(projectDir, { recursive: true, force: true }); } catch (_e) {}
});

describe('facade/events — emit', () => {
  test('writes a JSON line with all required fields', () => {
    const entry = emit({
      projectDir,
      source: 'test',
      event: 'state.write',
      detail: { what: 'just-testing' },
    });
    assert.equal(typeof entry.ts, 'string');
    assert.match(entry.ts, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(entry.source, 'test');
    assert.equal(entry.event, 'state.write');
    assert.deepEqual(entry.detail, { what: 'just-testing' });
    const file = eventsPath(projectDir);
    assert.ok(fs.existsSync(file));
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(text.endsWith('\n'));
    const parsed = JSON.parse(text.trim());
    assert.deepEqual(parsed.detail, { what: 'just-testing' });
  });

  test('appends rather than overwrites', () => {
    emit({ projectDir, source: 'test', event: 'a', detail: {} });
    emit({ projectDir, source: 'test', event: 'b', detail: {} });
    const text = fs.readFileSync(eventsPath(projectDir), 'utf8');
    const lines = text.split('\n').filter(Boolean);
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0]).event, 'a');
    assert.equal(JSON.parse(lines[1]).event, 'b');
  });

  test('throws when required fields missing', () => {
    assert.throws(() => emit({ source: 'test', event: 'x' }), /projectDir required/);
    assert.throws(() => emit({ projectDir, event: 'x' }), /source required/);
    assert.throws(() => emit({ projectDir, source: 'test' }), /event required/);
  });
});

describe('facade/events — readEvents', () => {
  test('returns empty when the events file does not exist', () => {
    const r = readEvents(projectDir);
    assert.deepEqual(r, { entries: [], nextOffset: 0 });
  });

  test('reads all events from offset 0', () => {
    emit({ projectDir, source: 'test', event: 'a', detail: { n: 1 } });
    emit({ projectDir, source: 'test', event: 'b', detail: { n: 2 } });
    emit({ projectDir, source: 'test', event: 'c', detail: { n: 3 } });
    const r = readEvents(projectDir, 0);
    assert.equal(r.entries.length, 3);
    assert.deepEqual(r.entries.map((e) => e.event), ['a', 'b', 'c']);
    assert.ok(r.nextOffset > 0);
  });

  test('respects fromOffset for incremental reads', () => {
    emit({ projectDir, source: 'test', event: 'a', detail: {} });
    const first = readEvents(projectDir, 0);
    assert.equal(first.entries.length, 1);

    emit({ projectDir, source: 'test', event: 'b', detail: {} });
    emit({ projectDir, source: 'test', event: 'c', detail: {} });

    const second = readEvents(projectDir, first.nextOffset);
    assert.equal(second.entries.length, 2);
    assert.deepEqual(second.entries.map((e) => e.event), ['b', 'c']);
  });

  test('skips corrupt lines without crashing', () => {
    const file = eventsPath(projectDir);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'not-json\n{"ts":"x","source":"test","event":"good","project":"p","detail":{}}\nalso-bad\n');
    const r = readEvents(projectDir);
    assert.equal(r.entries.length, 1);
    assert.equal(r.entries[0].event, 'good');
  });
});

describe('facade/events — subscribeEvents', () => {
  test('yields existing events then waits for new ones', async () => {
    emit({ projectDir, source: 'test', event: 'historical', detail: {} });
    const ac = new AbortController();
    const events = [];
    const iter = (async () => {
      for await (const e of subscribeEvents({
        projectDir,
        intervalMs: 20,
        signal: ac.signal,
      })) {
        events.push(e.event);
        if (events.length === 2) break;
      }
    })();
    await new Promise((r) => setTimeout(r, 60));
    emit({ projectDir, source: 'test', event: 'live', detail: {} });
    await iter;
    ac.abort();
    assert.deepEqual(events, ['historical', 'live']);
  });

  test('aborts cleanly when signal fires', async () => {
    const ac = new AbortController();
    const collected = [];
    const iterPromise = (async () => {
      for await (const e of subscribeEvents({
        projectDir,
        intervalMs: 20,
        signal: ac.signal,
      })) {
        collected.push(e);
      }
    })();
    setTimeout(() => ac.abort(), 80);
    await iterPromise;
    assert.equal(collected.length, 0);
  });
});
