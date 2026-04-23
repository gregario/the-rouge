'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  recommendAudit,
  cycleFixRatio,
  cycleRootCause,
} = require('../src/launcher/audit-recommender.js');

function mkCycle(opts = {}) {
  const cycle = {};
  if (opts.fix !== undefined || opts.feature !== undefined) {
    cycle.commit_breakdown = {
      fix: opts.fix || 0,
      feature: opts.feature || 0,
      refactor: opts.refactor || 0,
    };
  }
  if (opts.root_cause) {
    cycle.structured_retro = {
      failed: [{ area: 'x', observation: 'y', root_cause: opts.root_cause }],
    };
  }
  if (opts.escalations !== undefined) cycle.escalations = opts.escalations;
  return cycle;
}

test('cycleFixRatio computes correctly', () => {
  assert.equal(cycleFixRatio(mkCycle({ fix: 8, feature: 2 })), 0.8);
  assert.equal(cycleFixRatio(mkCycle({ fix: 0, feature: 10 })), 0);
  assert.equal(cycleFixRatio(mkCycle({ fix: 10, feature: 0 })), 1);
});

test('cycleFixRatio returns null when no breakdown', () => {
  assert.equal(cycleFixRatio({}), null);
  assert.equal(cycleFixRatio(null), null);
  assert.equal(cycleFixRatio(mkCycle({ fix: 0, feature: 0 })), null);
});

test('cycleFixRatio reads from retro_metrics as fallback', () => {
  const cycle = { retro_metrics: { commit_breakdown: { fix: 5, feature: 5 } } };
  assert.equal(cycleFixRatio(cycle), 0.5);
});

test('cycleRootCause extracts most common from failed[]', () => {
  const cycle = {
    structured_retro: {
      failed: [
        { area: 'a', observation: 'x', root_cause: 'spec_ambiguity' },
        { area: 'b', observation: 'y', root_cause: 'impl_bug' },
        { area: 'c', observation: 'z', root_cause: 'spec_ambiguity' },
      ],
    },
  };
  assert.equal(cycleRootCause(cycle), 'spec_ambiguity');
});

test('cycleRootCause falls back to analysis_recommendation', () => {
  const cycle = { analysis_recommendation: { root_cause: 'missing_context' } };
  assert.equal(cycleRootCause(cycle), 'missing_context');
});

test('cycleRootCause returns null when no signal', () => {
  assert.equal(cycleRootCause({}), null);
  assert.equal(cycleRootCause(null), null);
});

test('recommendAudit: empty or too-short history → not recommended', () => {
  assert.equal(recommendAudit([]).recommended, false);
  assert.equal(recommendAudit([mkCycle({ fix: 10, feature: 0 })]).recommended, false);
  assert.match(recommendAudit([]).reason, /insufficient history/);
});

test('recommendAudit: non-array input → not recommended', () => {
  assert.equal(recommendAudit(null).recommended, false);
  assert.equal(recommendAudit('string').recommended, false);
});

test('recommendAudit: 3 cycles of high fix ratio → recommended', () => {
  const cycles = [
    mkCycle({ fix: 8, feature: 2 }),
    mkCycle({ fix: 9, feature: 1 }),
    mkCycle({ fix: 7, feature: 3 }),
  ];
  const result = recommendAudit(cycles);
  assert.equal(result.recommended, true);
  assert.ok(result.signals.some((s) => /fix-to-feature ratio/.test(s)));
});

test('recommendAudit: 3 cycles of varied fix ratio → NOT recommended on that signal', () => {
  const cycles = [
    mkCycle({ fix: 2, feature: 8 }),  // 0.2 — not fix-mode
    mkCycle({ fix: 5, feature: 5 }),  // 0.5 — not over threshold
    mkCycle({ fix: 3, feature: 7 }),  // 0.3
  ];
  const result = recommendAudit(cycles);
  assert.equal(result.recommended, false);
});

test('recommendAudit: same root_cause across 3 cycles → recommended', () => {
  const cycles = [
    mkCycle({ fix: 2, feature: 8, root_cause: 'spec_ambiguity' }),
    mkCycle({ fix: 2, feature: 8, root_cause: 'spec_ambiguity' }),
    mkCycle({ fix: 2, feature: 8, root_cause: 'spec_ambiguity' }),
  ];
  const result = recommendAudit(cycles);
  assert.equal(result.recommended, true);
  assert.ok(result.signals.some((s) => /same root_cause 'spec_ambiguity'/.test(s)));
});

test('recommendAudit: different root_causes → no root_cause signal', () => {
  const cycles = [
    mkCycle({ fix: 2, feature: 8, root_cause: 'impl_bug' }),
    mkCycle({ fix: 2, feature: 8, root_cause: 'spec_ambiguity' }),
    mkCycle({ fix: 2, feature: 8, root_cause: 'missing_context' }),
  ];
  const result = recommendAudit(cycles);
  // no fix signal (low ratios), no root_cause signal (varied)
  assert.equal(result.recommended, false);
});

test('recommendAudit: escalations in every cycle → recommended', () => {
  const cycles = [
    mkCycle({ fix: 1, feature: 9, escalations: 1 }),
    mkCycle({ fix: 1, feature: 9, escalations: 2 }),
    mkCycle({ fix: 1, feature: 9, escalations: 1 }),
  ];
  const result = recommendAudit(cycles);
  assert.equal(result.recommended, true);
  assert.ok(result.signals.some((s) => /escalations/.test(s)));
});

test('recommendAudit: evidence captures raw data for inspection', () => {
  const cycles = [
    mkCycle({ fix: 8, feature: 2, root_cause: 'impl_bug' }),
    mkCycle({ fix: 9, feature: 1, root_cause: 'impl_bug' }),
    mkCycle({ fix: 7, feature: 3, root_cause: 'impl_bug' }),
  ];
  const result = recommendAudit(cycles);
  assert.equal(result.evidence.cycles_considered, 3);
  assert.deepEqual(result.evidence.fix_ratios, [0.8, 0.9, 0.7]);
  assert.deepEqual(result.evidence.root_causes, ['impl_bug', 'impl_bug', 'impl_bug']);
  // two signals should fire
  assert.ok(result.signals.length >= 2);
});

test('recommendAudit: custom window and threshold', () => {
  const cycles = [
    mkCycle({ fix: 6, feature: 4 }),
    mkCycle({ fix: 6, feature: 4 }),
  ];
  // Window 2, lower threshold — both fire
  const result = recommendAudit(cycles, { window: 2, fixRatioThreshold: 0.5 });
  assert.equal(result.recommended, true);
});

test('recommendAudit: uses most recent N cycles', () => {
  const cycles = [
    mkCycle({ fix: 0, feature: 10 }),  // old — ignored
    mkCycle({ fix: 0, feature: 10 }),  // old — ignored
    mkCycle({ fix: 8, feature: 2 }),   // recent
    mkCycle({ fix: 9, feature: 1 }),   // recent
    mkCycle({ fix: 7, feature: 3 }),   // recent — current
  ];
  const result = recommendAudit(cycles, { window: 3 });
  assert.equal(result.recommended, true);
  // evidence should show the last 3 ratios only
  assert.deepEqual(result.evidence.fix_ratios, [0.8, 0.9, 0.7]);
});

test('recommendAudit: mixed signals still trigger on one', () => {
  const cycles = [
    // fix ratio high but not consistent in root_cause or escalations
    mkCycle({ fix: 9, feature: 1, root_cause: 'a' }),
    mkCycle({ fix: 8, feature: 2, root_cause: 'b' }),
    mkCycle({ fix: 10, feature: 0, root_cause: 'c' }),
  ];
  const result = recommendAudit(cycles);
  // fix-ratio signal fires; root_cause doesn't
  assert.equal(result.recommended, true);
  assert.equal(result.signals.length, 1);
});

test('recommendAudit: reason summarizes signal count', () => {
  const cycles = [
    mkCycle({ fix: 8, feature: 2, root_cause: 'x', escalations: 1 }),
    mkCycle({ fix: 9, feature: 1, root_cause: 'x', escalations: 1 }),
    mkCycle({ fix: 7, feature: 3, root_cause: 'x', escalations: 1 }),
  ];
  const result = recommendAudit(cycles);
  // 3 signals: fix ratio, root_cause, escalations
  assert.equal(result.signals.length, 3);
  assert.match(result.reason, /3 signal/);
});
