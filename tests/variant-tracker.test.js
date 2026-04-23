'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  normalizeEntry,
  loadEntry,
  activeVariant,
  shadowVariants,
  getVariant,
  passRate,
  computeDelta,
  recommendation,
  recordRun,
  appendRunLog,
} = require('../src/launcher/variant-tracker.js');

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

function v2Entry() {
  return {
    id: 'page-load-time',
    name: 'Fast page load',
    rule: 'LCP must be under 2000ms',
    type: 'non-functional',
    tier: 'global',
    version: 2,
    variants: [
      {
        variant_id: 'baseline',
        status: 'active',
        threshold: 2000,
        stats: { runs: 10, passes: 8, fails: 2 },
      },
      {
        variant_id: 'shadow-2500',
        status: 'shadow',
        threshold: 2500,
        rationale: 'slow-4G observation',
        stats: { runs: 10, passes: 10, fails: 0 },
      },
    ],
  };
}

test('normalizeEntry synthesizes baseline from v1', () => {
  const n = normalizeEntry(v1Entry());
  assert.equal(n.variants.length, 1);
  assert.equal(n.variants[0].variant_id, 'baseline');
  assert.equal(n.variants[0].threshold, 2000);
  assert.equal(n.variants[0].status, 'active');
});

test('normalizeEntry passes v2 through', () => {
  const n = normalizeEntry(v2Entry());
  assert.equal(n.variants.length, 2);
  assert.equal(n.variants[1].variant_id, 'shadow-2500');
});

test('normalizeEntry defaults v1 status to active when absent', () => {
  const raw = v1Entry();
  delete raw.status;
  const n = normalizeEntry(raw);
  assert.equal(n.variants[0].status, 'active');
});

test('normalizeEntry throws on non-object', () => {
  assert.throws(() => normalizeEntry(null), TypeError);
  assert.throws(() => normalizeEntry('string'), TypeError);
});

test('activeVariant finds the active one', () => {
  const v = activeVariant(v2Entry());
  assert.equal(v.variant_id, 'baseline');
});

test('activeVariant returns null when none active', () => {
  const e = v2Entry();
  e.variants = e.variants.map((v) => ({ ...v, status: 'retired' }));
  assert.equal(activeVariant(e), null);
});

test('shadowVariants returns only shadow-status ones', () => {
  const list = shadowVariants(v2Entry());
  assert.equal(list.length, 1);
  assert.equal(list[0].variant_id, 'shadow-2500');
});

test('getVariant returns by id or null', () => {
  assert.ok(getVariant(v2Entry(), 'baseline'));
  assert.equal(getVariant(v2Entry(), 'nope'), null);
});

test('passRate computes correctly', () => {
  assert.equal(passRate({ stats: { runs: 10, passes: 8 } }), 0.8);
  assert.equal(passRate({ stats: { runs: 0, passes: 0 } }), null);
  assert.equal(passRate(null), null);
});

test('computeDelta returns numeric delta + sufficient flag', () => {
  const d = computeDelta(v2Entry(), 'baseline', 'shadow-2500', { minRuns: 5 });
  assert.ok(d);
  assert.equal(d.aPassRate, 0.8);
  assert.equal(d.bPassRate, 1.0);
  assert.ok(Math.abs(d.delta - 0.2) < 1e-9);
  assert.equal(d.sufficient, true);
});

test('computeDelta flags insufficient when one side has too few runs', () => {
  const d = computeDelta(v2Entry(), 'baseline', 'shadow-2500', { minRuns: 50 });
  assert.equal(d.sufficient, false);
});

test('computeDelta returns null if variant missing', () => {
  assert.equal(computeDelta(v2Entry(), 'baseline', 'unknown'), null);
});

test('recommendation: promote-amendment when shadow outperforms', () => {
  const r = recommendation(v2Entry(), { minRuns: 5 });
  assert.equal(r.action, 'promote-amendment');
  assert.equal(r.shadow_variant_id, 'shadow-2500');
});

test('recommendation: insufficient-data when below minRuns', () => {
  const e = v2Entry();
  e.variants[0].stats = { runs: 1, passes: 1, fails: 0 };
  e.variants[1].stats = { runs: 1, passes: 1, fails: 0 };
  const r = recommendation(e, { minRuns: 5 });
  assert.equal(r.action, 'insufficient-data');
});

test('recommendation: keep-baseline when shadow has higher fail rate', () => {
  const e = v2Entry();
  e.variants[0].stats = { runs: 10, passes: 10, fails: 0 };
  e.variants[1].stats = { runs: 10, passes: 5, fails: 5 };
  const r = recommendation(e, { minRuns: 5 });
  assert.equal(r.action, 'keep-baseline');
  assert.match(r.reason, /higher fail rate/);
});

test('recommendation: keep-baseline when delta not sufficient', () => {
  const e = v2Entry();
  e.variants[0].stats = { runs: 10, passes: 8, fails: 2 };
  e.variants[1].stats = { runs: 10, passes: 8, fails: 2 };
  const r = recommendation(e, { minRuns: 5, minDelta: 0.01 });
  assert.equal(r.action, 'keep-baseline');
});

test('recommendation: no shadow → keep-baseline', () => {
  const r = recommendation(v1Entry());
  assert.equal(r.action, 'keep-baseline');
  assert.match(r.reason, /no shadow/);
});

test('recordRun increments run stats', () => {
  const e = recordRun(v2Entry(), 'baseline', 'pass');
  const base = getVariant(e, 'baseline');
  assert.equal(base.stats.runs, 11);
  assert.equal(base.stats.passes, 9);
});

test('recordRun handles env_limited', () => {
  const e = recordRun(v2Entry(), 'baseline', 'env_limited');
  const base = getVariant(e, 'baseline');
  assert.equal(base.stats.runs, 11);
  assert.equal(base.stats.env_limited, 1);
});

test('recordRun rejects unknown outcome', () => {
  assert.throws(() => recordRun(v2Entry(), 'baseline', 'bogus'), /outcome/);
});

test('recordRun rejects unknown variant', () => {
  assert.throws(() => recordRun(v2Entry(), 'nope', 'pass'), /variant_id/);
});

test('loadEntry reads v1 file and normalizes', () => {
  const tmp = path.join(os.tmpdir(), `vt-test-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify(v1Entry()));
  const e = loadEntry(tmp);
  assert.equal(e.variants.length, 1);
  assert.equal(e.variants[0].variant_id, 'baseline');
  fs.unlinkSync(tmp);
});

test('appendRunLog writes JSONL lines', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-log-'));
  const logPath = path.join(tmpDir, 'runs.jsonl');
  appendRunLog(logPath, { entry: 'x', variant: 'baseline', outcome: 'pass' });
  appendRunLog(logPath, { entry: 'x', variant: 'baseline', outcome: 'fail' });
  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.entry, 'x');
});

test('real library/global entries all normalize (v1 back-compat)', () => {
  const globalDir = path.resolve(__dirname, '..', 'library', 'global');
  if (!fs.existsSync(globalDir)) return; // defensive
  const files = fs.readdirSync(globalDir).filter((f) => f.endsWith('.json'));
  assert.ok(files.length > 0);
  for (const f of files) {
    const entry = loadEntry(path.join(globalDir, f));
    assert.ok(entry.variants.length >= 1, `${f}: must have at least one variant after normalize`);
    const active = activeVariant(entry);
    // Some entries may be retired; but most should have an active variant
    if (entry.status !== 'retired') {
      assert.ok(active, `${f}: expected an active variant`);
    }
  }
});
