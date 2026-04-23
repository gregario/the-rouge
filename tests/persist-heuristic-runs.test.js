'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  persistHeuristicRuns,
  readPersistedRuns,
  sidecarPath,
} = require('../src/launcher/persist-heuristic-runs.js');

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-persist-test-'));
}

test('persists well-formed runs to sidecar JSONL', () => {
  const dir = tmpProject();
  const ctx = {
    heuristic_runs: [
      { entry_id: 'page-load-time', variant_id: 'baseline', outcome: 'pass', evidence: { measured: 1800, threshold: 2000 } },
      { entry_id: 'page-load-time', variant_id: 'shadow-2500', outcome: 'pass', evidence: { measured: 1800, threshold: 2500 } },
      { entry_id: 'no-console-errors', variant_id: 'baseline', outcome: 'fail', evidence: { errors: 3 } },
    ],
  };
  const state = { cycle_number: 5 };
  const result = persistHeuristicRuns(dir, ctx, state);
  assert.equal(result.persisted, 3);
  assert.equal(result.skipped, 0);
  const persisted = readPersistedRuns(dir);
  assert.equal(persisted.length, 3);
  assert.equal(persisted[0].cycle_number, 5);
  assert.ok(persisted[0].timestamp);
  assert.deepEqual(persisted[0].evidence, { measured: 1800, threshold: 2000 });
});

test('skips runs with missing entry_id', () => {
  const dir = tmpProject();
  const ctx = {
    heuristic_runs: [
      { variant_id: 'baseline', outcome: 'pass' },
      { entry_id: 'valid', variant_id: 'baseline', outcome: 'pass' },
    ],
  };
  const result = persistHeuristicRuns(dir, ctx, { cycle_number: 0 });
  assert.equal(result.persisted, 1);
  assert.equal(result.skipped, 1);
  assert.match(result.errors[0], /entry_id/);
});

test('skips runs with missing variant_id', () => {
  const dir = tmpProject();
  const ctx = {
    heuristic_runs: [
      { entry_id: 'x', outcome: 'pass' },
    ],
  };
  const result = persistHeuristicRuns(dir, ctx, { cycle_number: 0 });
  assert.equal(result.persisted, 0);
  assert.equal(result.skipped, 1);
  assert.match(result.errors[0], /variant_id/);
});

test('skips runs with invalid outcome', () => {
  const dir = tmpProject();
  const ctx = {
    heuristic_runs: [
      { entry_id: 'x', variant_id: 'y', outcome: 'maybe' },
      { entry_id: 'x', variant_id: 'y', outcome: 'pass' },
    ],
  };
  const result = persistHeuristicRuns(dir, ctx, { cycle_number: 0 });
  assert.equal(result.persisted, 1);
  assert.equal(result.skipped, 1);
  assert.match(result.errors[0], /outcome/);
});

test('no-op when cycle_context has no heuristic_runs', () => {
  const dir = tmpProject();
  const result = persistHeuristicRuns(dir, {}, { cycle_number: 0 });
  assert.equal(result.persisted, 0);
  assert.equal(result.skipped, 0);
  assert.ok(!fs.existsSync(sidecarPath(dir)));
});

test('no-op when cycle_context is null/undefined', () => {
  const dir = tmpProject();
  const r1 = persistHeuristicRuns(dir, null, { cycle_number: 0 });
  const r2 = persistHeuristicRuns(dir, undefined, { cycle_number: 0 });
  assert.equal(r1.persisted + r2.persisted, 0);
});

test('preserves provided timestamp and cycle_number', () => {
  const dir = tmpProject();
  const ctx = {
    heuristic_runs: [
      {
        entry_id: 'x',
        variant_id: 'y',
        outcome: 'pass',
        timestamp: '2026-01-01T00:00:00Z',
        cycle_number: 99,
      },
    ],
  };
  persistHeuristicRuns(dir, ctx, { cycle_number: 5 });
  const runs = readPersistedRuns(dir);
  assert.equal(runs[0].timestamp, '2026-01-01T00:00:00Z');
  assert.equal(runs[0].cycle_number, 99);
});

test('appends across multiple calls (immutable log)', () => {
  const dir = tmpProject();
  persistHeuristicRuns(dir, {
    heuristic_runs: [{ entry_id: 'a', variant_id: 'b', outcome: 'pass' }],
  }, { cycle_number: 1 });
  persistHeuristicRuns(dir, {
    heuristic_runs: [{ entry_id: 'a', variant_id: 'b', outcome: 'fail' }],
  }, { cycle_number: 2 });
  const runs = readPersistedRuns(dir);
  assert.equal(runs.length, 2);
  assert.equal(runs[0].outcome, 'pass');
  assert.equal(runs[1].outcome, 'fail');
  assert.equal(runs[0].cycle_number, 1);
  assert.equal(runs[1].cycle_number, 2);
});

test('returns errors array without throwing on missing projectDir', () => {
  const result = persistHeuristicRuns(null, { heuristic_runs: [] }, {});
  assert.ok(Array.isArray(result.errors));
  assert.match(result.errors[0], /projectDir required/);
});

test('sidecarPath uses .rouge/ subdir convention', () => {
  const p = sidecarPath('/tmp/my-project');
  assert.ok(p.endsWith('.rouge/heuristic-runs.jsonl') || p.endsWith('.rouge\\heuristic-runs.jsonl'));
});

test('readPersistedRuns skips malformed JSONL lines', () => {
  const dir = tmpProject();
  fs.mkdirSync(path.join(dir, '.rouge'), { recursive: true });
  fs.writeFileSync(
    sidecarPath(dir),
    '{"entry_id":"a","variant_id":"b","outcome":"pass"}\nnot json\n{"entry_id":"c","variant_id":"d","outcome":"fail"}\n'
  );
  const runs = readPersistedRuns(dir);
  assert.equal(runs.length, 2);
});

test('readPersistedRuns returns [] for missing log', () => {
  const dir = tmpProject();
  assert.deepEqual(readPersistedRuns(dir), []);
});

test('persisted entries compatible with variant-tracker recordRun downstream', () => {
  // Integration check: the shape we persist should be readable by tools
  // that feed variant-tracker's recordRun — entry_id + variant_id + outcome
  // are the required trio.
  const dir = tmpProject();
  persistHeuristicRuns(dir, {
    heuristic_runs: [
      { entry_id: 'page-load-time', variant_id: 'baseline', outcome: 'pass' },
    ],
  }, { cycle_number: 1 });
  const runs = readPersistedRuns(dir);
  const { normalizeEntry, recordRun } = require('../src/launcher/variant-tracker.js');
  const entry = normalizeEntry({
    id: 'page-load-time', name: 'LCP', rule: 'LCP<2000', type: 'non-functional', tier: 'global', version: 1,
    threshold: 2000, status: 'active',
  });
  // Feed each persisted run into variant-tracker
  let updated = entry;
  for (const r of runs) {
    if (r.entry_id === entry.id) {
      updated = recordRun(updated, r.variant_id, r.outcome);
    }
  }
  const baseline = updated.variants.find((v) => v.variant_id === 'baseline');
  assert.equal(baseline.stats.runs, 1);
  assert.equal(baseline.stats.passes, 1);
});
