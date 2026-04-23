'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  VALID_CATEGORIES, VALID_SEVERITIES,
  makeEventId, createEvent, appendEvent, write, readEvents, query,
} = require('../src/launcher/governance.js');

function tmpLog() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-test-'));
  return path.join(dir, 'governance.jsonl');
}

test('makeEventId format', () => {
  const id = makeEventId('2026-04-23T10:00:00Z');
  assert.match(id, /^gov-20260423-[a-f0-9]{4}$/);
});

test('createEvent with minimum fields', () => {
  const e = createEvent({ category: 'approval', summary: 'ship v1.0' });
  assert.equal(e.category, 'approval');
  assert.equal(e.summary, 'ship v1.0');
  assert.ok(e.event_id);
  assert.ok(e.timestamp);
  assert.equal(e.severity, 'info');
});

test('createEvent rejects missing category', () => {
  assert.throws(() => createEvent({ summary: 'x' }), /category required/);
});

test('createEvent rejects invalid category', () => {
  assert.throws(() => createEvent({ category: 'bogus', summary: 'x' }), /invalid category/);
});

test('createEvent rejects short summary', () => {
  assert.throws(() => createEvent({ category: 'approval', summary: 'x' }), /summary required/);
});

test('createEvent rejects missing summary', () => {
  assert.throws(() => createEvent({ category: 'approval' }), /summary required/);
});

test('createEvent rejects invalid severity', () => {
  assert.throws(
    () => createEvent({ category: 'approval', summary: 'valid', severity: 'panic' }),
    /invalid severity/
  );
});

test('createEvent preserves all optional fields', () => {
  const e = createEvent({
    category: 'amendment-promotion',
    summary: 'promote lcp-2500 variant',
    project: 'my-app',
    cycle: 7,
    phase: 'retrospective',
    actor: 'rouge-retrospective',
    evidence_refs: ['cp-abc', 'https://x/pr/42'],
    severity: 'notice',
    detail: { entry_id: 'page-load-time', variant_id: 'lcp-2500' },
  });
  assert.equal(e.project, 'my-app');
  assert.equal(e.cycle, 7);
  assert.equal(e.detail.entry_id, 'page-load-time');
  assert.deepEqual(e.evidence_refs, ['cp-abc', 'https://x/pr/42']);
});

test('appendEvent writes to JSONL', () => {
  const log = tmpLog();
  const e = createEvent({ category: 'approval', summary: 'test event' });
  appendEvent(log, e);
  const lines = fs.readFileSync(log, 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.summary, 'test event');
});

test('write creates + appends in one call', () => {
  const log = tmpLog();
  write(log, { category: 'approval', summary: 'test one' });
  write(log, { category: 'deploy-override', summary: 'test two' });
  const events = readEvents(log);
  assert.equal(events.length, 2);
  assert.equal(events[1].category, 'deploy-override');
});

test('readEvents returns empty for missing log', () => {
  const events = readEvents('/nonexistent/gov.jsonl');
  assert.deepEqual(events, []);
});

test('readEvents skips malformed lines', () => {
  const log = tmpLog();
  fs.writeFileSync(log, '{"valid": true}\nnot json\n{"another": true}\n');
  const events = readEvents(log, { silent: true });
  assert.equal(events.length, 2);
});

test('query filters by category', () => {
  const log = tmpLog();
  write(log, { category: 'approval', summary: 'approve alpha' });
  write(log, { category: 'deploy-override', summary: 'deploy beta' });
  write(log, { category: 'approval', summary: 'approve gamma' });
  const result = query(log, { category: 'approval' });
  assert.equal(result.length, 2);
});

test('query filters by project + severity', () => {
  const log = tmpLog();
  write(log, { category: 'approval', summary: 'approve alpha', project: 'p1', severity: 'info' });
  write(log, { category: 'approval', summary: 'approve beta', project: 'p2', severity: 'critical' });
  write(log, { category: 'approval', summary: 'approve gamma', project: 'p1', severity: 'critical' });
  const result = query(log, { project: 'p1', severity: 'critical' });
  assert.equal(result.length, 1);
  assert.equal(result[0].summary, 'approve gamma');
});

test('query filters by time window', () => {
  const log = tmpLog();
  write(log, {
    category: 'approval', summary: 'early approval',
    timestamp: '2026-01-01T00:00:00Z',
  });
  write(log, {
    category: 'approval', summary: 'mid approval',
    timestamp: '2026-06-01T00:00:00Z',
  });
  write(log, {
    category: 'approval', summary: 'late approval',
    timestamp: '2026-12-01T00:00:00Z',
  });
  const result = query(log, {
    since: '2026-03-01',
    until: '2026-09-01',
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].summary, 'mid approval');
});

test('VALID_CATEGORIES contains expected members', () => {
  assert.ok(VALID_CATEGORIES.has('amendment-promotion'));
  assert.ok(VALID_CATEGORIES.has('safety-override'));
  assert.ok(VALID_CATEGORIES.has('escalation-resolved'));
});

test('VALID_SEVERITIES contains expected members', () => {
  assert.ok(VALID_SEVERITIES.has('info'));
  assert.ok(VALID_SEVERITIES.has('critical'));
});
