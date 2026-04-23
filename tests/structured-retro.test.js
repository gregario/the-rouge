'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  newRetro,
  addWorked,
  addFailed,
  addUntried,
  addAmendmentProposal,
  addHeuristicRun,
  addNote,
  summary,
  recurringFailedAreas,
  topAreas,
} = require('../src/launcher/structured-retro.js');

test('newRetro returns an empty retro with timestamp', () => {
  const r = newRetro({ cycle_id: 'cyc-001', project: 'my-app' });
  assert.equal(r.cycle_id, 'cyc-001');
  assert.equal(r.project, 'my-app');
  assert.ok(r.timestamp);
  assert.deepEqual(r.worked, []);
  assert.deepEqual(r.failed, []);
  assert.deepEqual(r.untried, []);
});

test('addWorked / addFailed / addUntried push entries', () => {
  const r = newRetro();
  addWorked(r, { area: 'auth', observation: 'RLS handled access correctly' });
  addFailed(r, { area: 'forms', observation: 'validation not surfacing', confidence: 0.8 });
  addUntried(r, { area: 'rate-limiting', observation: 'spec required but no attempt' });
  assert.equal(r.worked.length, 1);
  assert.equal(r.failed.length, 1);
  assert.equal(r.untried.length, 1);
});

test('addFailed records root_cause and confidence', () => {
  const r = newRetro();
  addFailed(r, {
    area: 'forms',
    observation: 'x',
    root_cause: 'missing_context',
    confidence: 0.7,
  });
  assert.equal(r.failed[0].root_cause, 'missing_context');
  assert.equal(r.failed[0].confidence, 0.7);
});

test('addWorked requires area and observation', () => {
  const r = newRetro();
  assert.throws(() => addWorked(r, { area: 'x' }), /required/);
  assert.throws(() => addWorked(r, { observation: 'x' }), /required/);
});

test('addAmendmentProposal requires target + rationale', () => {
  const r = newRetro();
  assert.throws(() => addAmendmentProposal(r, { target: 'x' }), /rationale/);
  assert.throws(() => addAmendmentProposal(r, { rationale: 'y' }), /target/);
  addAmendmentProposal(r, {
    target: 'src/prompts/loop/01-building.md',
    rationale: 'factory keeps re-reading the same 3 files',
  });
  assert.equal(r.amendments_proposed.length, 1);
});

test('addHeuristicRun records entry+variant+outcome', () => {
  const r = newRetro();
  addHeuristicRun(r, { entry_id: 'lcp', variant_id: 'baseline', outcome: 'pass' });
  assert.equal(r.heuristic_runs.length, 1);
  assert.throws(() => addHeuristicRun(r, { entry_id: 'x' }), /required/);
});

test('addNote accepts string', () => {
  const r = newRetro();
  addNote(r, 'this cycle ran long');
  assert.equal(r.notes[0], 'this cycle ran long');
  assert.throws(() => addNote(r, ''), /non-empty/);
});

test('summary counts correctly', () => {
  const r = newRetro();
  addWorked(r, { area: 'a', observation: 'x' });
  addFailed(r, { area: 'b', observation: 'y' });
  addFailed(r, { area: 'b', observation: 'z' });
  addFailed(r, { area: 'c', observation: 'w' });
  addUntried(r, { area: 'd', observation: 'v' });
  const s = summary(r);
  assert.equal(s.worked_count, 1);
  assert.equal(s.failed_count, 3);
  assert.equal(s.untried_count, 1);
  assert.equal(s.top_failed_areas[0].area, 'b');
  assert.equal(s.top_failed_areas[0].count, 2);
});

test('topAreas ranks by count, descending', () => {
  const items = [
    { area: 'a' }, { area: 'b' }, { area: 'a' },
    { area: 'c' }, { area: 'a' }, { area: 'b' },
  ];
  const ranked = topAreas(items);
  assert.equal(ranked[0].area, 'a');
  assert.equal(ranked[0].count, 3);
  assert.equal(ranked[1].area, 'b');
});

test('recurringFailedAreas detects areas failing in N consecutive retros', () => {
  const r1 = newRetro();
  addFailed(r1, { area: 'forms', observation: '...' });
  addFailed(r1, { area: 'auth', observation: '...' });

  const r2 = newRetro();
  addFailed(r2, { area: 'forms', observation: '...' });
  addFailed(r2, { area: 'payments', observation: '...' });

  const r3 = newRetro();
  addFailed(r3, { area: 'forms', observation: '...' });
  addFailed(r3, { area: 'auth', observation: '...' });

  const recurring = recurringFailedAreas([r2, r3], r1, 3);
  assert.deepEqual(recurring, ['forms']);
});

test('recurringFailedAreas returns empty when insufficient history', () => {
  const r1 = newRetro();
  addFailed(r1, { area: 'forms', observation: '...' });
  const recurring = recurringFailedAreas([], r1, 3);
  assert.deepEqual(recurring, []);
});
