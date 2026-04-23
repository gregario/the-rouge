'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { makeAmendmentId, proposeAmendment, promoteAmendment, retireVariant, draftPR } =
  require('../src/launcher/amendify.js');
const { normalizeEntry, getVariant, activeVariant } =
  require('../src/launcher/variant-tracker.js');

function v1Entry() {
  return {
    id: 'page-load-time',
    name: 'Fast page load',
    rule: 'LCP must be under 2000ms',
    threshold: 2000,
    type: 'non-functional',
    tier: 'global',
    version: 1,
    status: 'active',
  };
}

test('makeAmendmentId is deterministic for same inputs', () => {
  const a = makeAmendmentId('page-load-time', 'lcp-2500', '2026-04-23');
  const b = makeAmendmentId('page-load-time', 'lcp-2500', '2026-04-23');
  assert.equal(a, b);
  assert.match(a, /^amendment-\d{4}-\d{2}-\d{2}-page-load-time-lcp-2500$/);
});

test('makeAmendmentId sanitizes short label', () => {
  const id = makeAmendmentId('x', 'LCP 2500ms (mobile)', '2026-04-23');
  assert.ok(/^amendment-2026-04-23-x-lcp-2500ms-mobile$/.test(id));
});

test('proposeAmendment adds a shadow variant', () => {
  const e = proposeAmendment(
    v1Entry(),
    { threshold: 2500 },
    'slow-4G observations suggest 2000 too strict',
    { shortLabel: 'lcp-2500', dateStr: '2026-04-23' }
  );
  assert.equal(e.variants.length, 2);
  const shadow = e.variants.find((v) => v.status === 'shadow');
  assert.ok(shadow);
  assert.equal(shadow.threshold, 2500);
  assert.equal(shadow.rationale, 'slow-4G observations suggest 2000 too strict');
  assert.match(shadow.variant_id, /^amendment-2026-04-23-/);
  assert.equal(shadow.proposed_by, 'rouge-retrospective');
});

test('proposeAmendment rejects empty change', () => {
  assert.throws(() => proposeAmendment(v1Entry(), null, 'reason'), TypeError);
  assert.throws(() => proposeAmendment(v1Entry(), 'string', 'reason'), TypeError);
});

test('proposeAmendment rejects missing rationale', () => {
  assert.throws(() => proposeAmendment(v1Entry(), { threshold: 2500 }, ''), TypeError);
  assert.throws(() => proposeAmendment(v1Entry(), { threshold: 2500 }, null), TypeError);
});

test('proposeAmendment throws on ID collision', () => {
  const e = proposeAmendment(v1Entry(), { threshold: 2500 }, 'reason',
    { shortLabel: 'x', dateStr: '2026-04-23' });
  assert.throws(
    () => proposeAmendment(e, { threshold: 3000 }, 'another', { shortLabel: 'x', dateStr: '2026-04-23' }),
    /collision/
  );
});

test('promoteAmendment swaps active and retires prior', () => {
  const e1 = proposeAmendment(v1Entry(), { threshold: 2500 }, 'reason',
    { shortLabel: 'lcp-2500', dateStr: '2026-04-23' });
  const shadowId = e1.variants.find((v) => v.status === 'shadow').variant_id;
  const e2 = promoteAmendment(e1, shadowId);
  const active = activeVariant(e2);
  assert.equal(active.variant_id, shadowId);
  const oldBaseline = getVariant(e2, 'baseline');
  assert.equal(oldBaseline.status, 'retired');
});

test('promoteAmendment is no-op when already active', () => {
  const e = normalizeEntry(v1Entry());
  const e2 = promoteAmendment(e, 'baseline');
  const active = activeVariant(e2);
  assert.equal(active.variant_id, 'baseline');
});

test('promoteAmendment throws on unknown variant', () => {
  assert.throws(() => promoteAmendment(v1Entry(), 'nope'), /unknown variant/);
});

test('retireVariant flips status to retired', () => {
  const e1 = proposeAmendment(v1Entry(), { threshold: 2500 }, 'reason',
    { shortLabel: 'x', dateStr: '2026-04-23' });
  const shadowId = e1.variants.find((v) => v.status === 'shadow').variant_id;
  const e2 = retireVariant(e1, shadowId);
  const retired = getVariant(e2, shadowId);
  assert.equal(retired.status, 'retired');
});

test('draftPR produces markdown with evidence and recommendation', () => {
  const e = proposeAmendment(v1Entry(), { threshold: 2500 }, 'slow-4G',
    { shortLabel: 'x', dateStr: '2026-04-23' });
  const shadowId = e.variants.find((v) => v.status === 'shadow').variant_id;
  const md = draftPR(e, shadowId, {
    evidence: 'Across 8 cycles, shadow pass rate 0.875 vs baseline 0.625.',
    recommendation: { action: 'promote-amendment', reason: 'outperformed', delta: 0.25 },
  });
  assert.match(md, /Promote amendment/);
  assert.match(md, /page-load-time/);
  assert.match(md, /0\.250/);  // delta rendered
  assert.match(md, /outperformed/);
  assert.match(md, /slow-4G/);
});

test('draftPR throws on unknown variant', () => {
  assert.throws(() => draftPR(v1Entry(), 'nope'), /unknown variant/);
});

test('full flow: propose → record runs → recommendation → promote', () => {
  // Start with v1 entry
  let e = v1Entry();
  // Propose amendment
  e = proposeAmendment(e, { threshold: 2500 }, 'slow-4G observations',
    { shortLabel: 'lcp-2500', dateStr: '2026-04-23' });
  const shadowId = e.variants.find((v) => v.status === 'shadow').variant_id;
  // Simulate runs
  const { recordRun, recommendation } = require('../src/launcher/variant-tracker.js');
  for (let i = 0; i < 10; i++) {
    e = recordRun(e, 'baseline', i < 7 ? 'pass' : 'fail');
    e = recordRun(e, shadowId, 'pass');
  }
  // Recommendation
  const rec = recommendation(e, { minRuns: 5 });
  assert.equal(rec.action, 'promote-amendment');
  // Promote
  const e2 = promoteAmendment(e, shadowId);
  assert.equal(activeVariant(e2).variant_id, shadowId);
});
