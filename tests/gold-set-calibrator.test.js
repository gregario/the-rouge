const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  RUBRIC_DIMENSIONS,
  computeQuadraticWeightedKappa,
  computePerDimensionKappa,
  computeVerdictAgreement,
  evaluateCalibration,
  validateGoldSetEntry,
  loadGoldSet,
  pairEntries,
} = require('../src/launcher/gold-set-calibrator.js');

function makeEntry(id, labels, verdict = 'PRODUCTION_READY', opts = {}) {
  return {
    schema_version: 'gold-set-entry-v1',
    id,
    rubric_id: 'product-quality',
    rubric_version: 1,
    source: {
      project: opts.project || 'proj-foo',
      cycle_id: opts.cycle_id || `${id}-cycle`,
      captured_at: '2026-04-23T00:00:00Z',
    },
    human_labels: labels,
    human_verdict: verdict,
    labeler: 'test@example.com',
    labeled_at: '2026-04-23T00:00:00Z',
  };
}

function fullLabels(score) {
  const out = {};
  for (const dim of RUBRIC_DIMENSIONS) out[dim] = score;
  return out;
}

describe('computeQuadraticWeightedKappa', () => {
  test('perfect agreement → 1.0', () => {
    const pairs = [
      [0, 0], [1, 1], [2, 2], [3, 3],
      [0, 0], [3, 3], [1, 1], [2, 2],
    ];
    const result = computeQuadraticWeightedKappa(pairs);
    assert.equal(result.n, 8);
    assert.ok(Math.abs(result.kappa - 1.0) < 1e-9, `expected 1.0, got ${result.kappa}`);
  });

  test('perfect ordinal disagreement on 0↔3 returns -1', () => {
    const pairs = [[0, 3], [3, 0]];
    const { kappa } = computeQuadraticWeightedKappa(pairs);
    assert.ok(Math.abs(kappa - -1.0) < 1e-9, `expected -1.0, got ${kappa}`);
  });

  test('distribution collapse (all ratings same on one axis) returns null', () => {
    // Human always scores 3, model varies.
    const pairs = [[3, 0], [3, 1], [3, 2], [3, 3]];
    const result = computeQuadraticWeightedKappa(pairs);
    assert.equal(result.kappa, null);
    assert.equal(result.reason, 'distribution-collapse');
  });

  test('empty pairs → null with no-pairs reason', () => {
    const result = computeQuadraticWeightedKappa([]);
    assert.equal(result.kappa, null);
    assert.equal(result.n, 0);
    assert.equal(result.reason, 'no-pairs');
  });

  test('chance-level agreement (independent distributions) is near zero', () => {
    // Manually constructed: joint distribution equals product of marginals.
    // Both rater A and rater B score each category with equal probability.
    // We build 16 pairs — one per cell of the 4x4 matrix — so observed
    // equals expected exactly and Kappa should be exactly 0.
    const pairs = [];
    for (let i = 0; i <= 3; i++) {
      for (let j = 0; j <= 3; j++) {
        pairs.push([i, j]);
      }
    }
    const { kappa } = computeQuadraticWeightedKappa(pairs);
    assert.ok(Math.abs(kappa) < 1e-9, `expected ~0, got ${kappa}`);
  });

  test('invalid score throws with useful message', () => {
    assert.throws(
      () => computeQuadraticWeightedKappa([[0, 4]]),
      /invalid model score at index 0: 4/
    );
    assert.throws(
      () => computeQuadraticWeightedKappa([[0, 0], [-1, 0]]),
      /invalid human score at index 1: -1/
    );
    assert.throws(
      () => computeQuadraticWeightedKappa([[1.5, 2]]),
      /invalid human score/
    );
  });

  test('near-agreement kappa is high', () => {
    // 10 pairs, 8 perfect matches, 2 off-by-one.
    const pairs = [
      [0, 0], [1, 1], [2, 2], [3, 3],
      [0, 0], [1, 1], [2, 2], [3, 3],
      [2, 3], [1, 0],
    ];
    const { kappa } = computeQuadraticWeightedKappa(pairs);
    assert.ok(kappa > 0.8, `expected > 0.8, got ${kappa}`);
    assert.ok(kappa < 1.0);
  });
});

describe('computePerDimensionKappa', () => {
  test('per-dimension Kappa returns one entry per rubric dimension', () => {
    const pairedEntries = [];
    for (let i = 0; i < 8; i++) {
      pairedEntries.push({
        humanLabels: fullLabels(i % 4),
        modelLabels: fullLabels(i % 4),
      });
    }
    const result = computePerDimensionKappa(pairedEntries);
    for (const dim of RUBRIC_DIMENSIONS) {
      assert.ok(result[dim], `missing ${dim}`);
      assert.ok(Math.abs(result[dim].kappa - 1.0) < 1e-9);
    }
  });

  test('abstain (null) labels are excluded from that dimension', () => {
    const entries = [
      { humanLabels: { ...fullLabels(2), vision_fit: null }, modelLabels: fullLabels(2) },
      { humanLabels: fullLabels(3), modelLabels: fullLabels(3) },
      { humanLabels: fullLabels(0), modelLabels: fullLabels(0) },
      { humanLabels: fullLabels(1), modelLabels: fullLabels(1) },
    ];
    const result = computePerDimensionKappa(entries);
    assert.equal(result.journey_completeness.n, 4);
    assert.equal(result.vision_fit.n, 3);
  });
});

describe('computeVerdictAgreement', () => {
  test('perfect verdict agreement → 1.0', () => {
    const entries = [
      { humanVerdict: 'PRODUCTION_READY', modelVerdict: 'PRODUCTION_READY' },
      { humanVerdict: 'NEEDS_IMPROVEMENT', modelVerdict: 'NEEDS_IMPROVEMENT' },
    ];
    const r = computeVerdictAgreement(entries);
    assert.equal(r.agreement, 1);
    assert.equal(r.matches, 2);
    assert.equal(r.n, 2);
  });

  test('one disagreement in three → 2/3', () => {
    const entries = [
      { humanVerdict: 'PRODUCTION_READY', modelVerdict: 'PRODUCTION_READY' },
      { humanVerdict: 'NEEDS_IMPROVEMENT', modelVerdict: 'NEEDS_IMPROVEMENT' },
      { humanVerdict: 'NOT_READY', modelVerdict: 'NEEDS_IMPROVEMENT' },
    ];
    const r = computeVerdictAgreement(entries);
    assert.ok(Math.abs(r.agreement - 2 / 3) < 1e-9);
  });

  test('invalid verdicts excluded', () => {
    const entries = [
      { humanVerdict: 'PRODUCTION_READY', modelVerdict: 'NOT_A_VERDICT' },
      { humanVerdict: 'NEEDS_IMPROVEMENT', modelVerdict: 'NEEDS_IMPROVEMENT' },
    ];
    const r = computeVerdictAgreement(entries);
    assert.equal(r.n, 1);
    assert.equal(r.matches, 1);
  });

  test('no valid pairs → null', () => {
    const r = computeVerdictAgreement([]);
    assert.equal(r.agreement, null);
    assert.equal(r.n, 0);
  });
});

describe('evaluateCalibration', () => {
  function makePaired(n, humanScore, modelScore, verdict = 'PRODUCTION_READY') {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({
        id: `entry-${i}`,
        humanLabels: fullLabels(humanScore),
        modelLabels: fullLabels(modelScore),
        humanVerdict: verdict,
        modelVerdict: verdict,
      });
    }
    return out;
  }

  test('below minEntries → insufficientData, passed false', () => {
    const entries = makePaired(5, 3, 3);
    const r = evaluateCalibration(entries, { minEntries: 20, minKappa: 0.75 });
    assert.equal(r.passed, false);
    assert.equal(r.insufficientData, true);
    assert.equal(r.n, 5);
    assert.ok(r.reason.includes('20'));
  });

  test('all entries same score → distribution collapse → failed', () => {
    // Everyone scored 3 across the board: Kappa is undefined per dimension.
    const entries = makePaired(25, 3, 3);
    const r = evaluateCalibration(entries, { minEntries: 20, minKappa: 0.75 });
    assert.equal(r.passed, false);
    assert.equal(r.insufficientData, false);
    assert.equal(r.collapsedDimensions.length, RUBRIC_DIMENSIONS.length);
    for (const c of r.collapsedDimensions) {
      assert.equal(c.reason, 'distribution-collapse');
    }
  });

  test('perfect agreement across varied scores → passed', () => {
    const entries = [];
    for (let i = 0; i < 25; i++) {
      const score = i % 4;
      entries.push({
        id: `entry-${i}`,
        humanLabels: fullLabels(score),
        modelLabels: fullLabels(score),
        humanVerdict: 'PRODUCTION_READY',
        modelVerdict: 'PRODUCTION_READY',
      });
    }
    const r = evaluateCalibration(entries, { minEntries: 20, minKappa: 0.75 });
    assert.equal(r.passed, true);
    assert.equal(r.failedDimensions.length, 0);
    assert.equal(r.collapsedDimensions.length, 0);
    for (const dim of RUBRIC_DIMENSIONS) {
      assert.ok(Math.abs(r.perDimension[dim].kappa - 1.0) < 1e-9);
    }
  });

  test('kappa below threshold → failed with failedDimensions populated', () => {
    // 20 entries where model is consistently wrong by 2 on one dimension.
    const entries = [];
    for (let i = 0; i < 25; i++) {
      const h = i % 4;
      const m = (h + 2) % 4;
      const labels = fullLabels(h);
      const modelLabels = fullLabels(h);
      modelLabels.interaction_fidelity = m;
      entries.push({
        id: `entry-${i}`,
        humanLabels: labels,
        modelLabels,
        humanVerdict: 'PRODUCTION_READY',
        modelVerdict: 'PRODUCTION_READY',
      });
    }
    const r = evaluateCalibration(entries, { minEntries: 20, minKappa: 0.75 });
    assert.equal(r.passed, false);
    assert.ok(r.failedDimensions.some((f) => f.dim === 'interaction_fidelity'));
  });

  test('custom thresholds via options', () => {
    const entries = makePaired(10, 3, 3);
    const r = evaluateCalibration(entries, { minEntries: 5, minKappa: 0.9 });
    // Distribution collapse on all dims still fails regardless of thresholds.
    assert.equal(r.passed, false);
  });
});

describe('validateGoldSetEntry', () => {
  test('accepts a well-formed entry', () => {
    const entry = makeEntry('x', fullLabels(2));
    assert.equal(validateGoldSetEntry(entry).valid, true);
  });

  test('rejects wrong schema_version', () => {
    const entry = makeEntry('x', fullLabels(2));
    entry.schema_version = 'gold-set-entry-v2';
    assert.equal(validateGoldSetEntry(entry).valid, false);
  });

  test('rejects out-of-range score', () => {
    const labels = fullLabels(2);
    labels.vision_fit = 7;
    const entry = makeEntry('x', labels);
    const r = validateGoldSetEntry(entry);
    assert.equal(r.valid, false);
    assert.ok(r.reason.includes('vision_fit'));
  });

  test('accepts null score (abstain)', () => {
    const labels = fullLabels(2);
    labels.vision_fit = null;
    const entry = makeEntry('x', labels);
    assert.equal(validateGoldSetEntry(entry).valid, true);
  });

  test('rejects missing dimension key (abstain must be explicit null)', () => {
    const labels = fullLabels(2);
    delete labels.vision_fit;
    const entry = makeEntry('x', labels);
    const r = validateGoldSetEntry(entry);
    assert.equal(r.valid, false);
    assert.ok(r.reason.includes('vision_fit'));
    assert.ok(r.reason.includes('null'));
  });

  test('rejects missing labeler', () => {
    const entry = makeEntry('x', fullLabels(2));
    entry.labeler = '';
    assert.equal(validateGoldSetEntry(entry).valid, false);
  });

  test('rejects bad verdict', () => {
    const entry = makeEntry('x', fullLabels(2), 'LOOKS_GOOD');
    assert.equal(validateGoldSetEntry(entry).valid, false);
  });

  test('rejects non-integer score', () => {
    const labels = fullLabels(2);
    labels.journey_completeness = 1.5;
    const entry = makeEntry('x', labels);
    assert.equal(validateGoldSetEntry(entry).valid, false);
  });

  test('rejects missing source fields', () => {
    const entry = makeEntry('x', fullLabels(2));
    delete entry.source.cycle_id;
    assert.equal(validateGoldSetEntry(entry).valid, false);
  });

  test('rejects wrong rubric_id', () => {
    const entry = makeEntry('x', fullLabels(2));
    entry.rubric_id = 'content-quality';
    assert.equal(validateGoldSetEntry(entry).valid, false);
  });

  test('rejects arrays and non-objects', () => {
    assert.equal(validateGoldSetEntry([]).valid, false);
    assert.equal(validateGoldSetEntry(null).valid, false);
    assert.equal(validateGoldSetEntry('string').valid, false);
  });
});

describe('loadGoldSet', () => {
  test('missing directory returns empty with reason', () => {
    const r = loadGoldSet('/tmp/definitely-does-not-exist-xyz-123');
    assert.deepEqual(r.entries, []);
    assert.equal(r.reason, 'directory-not-found');
  });

  test('loads valid entries and collects errors', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-goldset-'));
    try {
      const good = makeEntry('one', fullLabels(2));
      fs.writeFileSync(path.join(dir, 'one.json'), JSON.stringify(good));

      const bad = makeEntry('two', fullLabels(2));
      bad.rubric_version = 0;
      fs.writeFileSync(path.join(dir, 'two.json'), JSON.stringify(bad));

      fs.writeFileSync(path.join(dir, 'three.json'), '{ not json');

      // Non-JSON file is ignored, not treated as error.
      fs.writeFileSync(path.join(dir, 'README.md'), '# hi');

      const r = loadGoldSet(dir);
      assert.equal(r.entries.length, 1);
      assert.equal(r.entries[0].id, 'one');
      assert.equal(r.errors.length, 2);
      assert.ok(r.errors.some((e) => e.file.endsWith('two.json')));
      assert.ok(r.errors.some((e) => e.file.endsWith('three.json')));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('file instead of directory returns not-a-directory reason', () => {
    const file = path.join(os.tmpdir(), `not-a-dir-${Date.now()}`);
    fs.writeFileSync(file, 'x');
    try {
      const r = loadGoldSet(file);
      assert.equal(r.reason, 'not-a-directory');
    } finally {
      fs.rmSync(file, { force: true });
    }
  });
});

describe('pairEntries', () => {
  test('pairs by id, reports both unmatched sets', () => {
    const gold = [
      makeEntry('a', fullLabels(2)),
      makeEntry('b', fullLabels(3)),
      makeEntry('c', fullLabels(1)),
    ];
    const model = {
      a: { labels: fullLabels(2), verdict: 'PRODUCTION_READY' },
      c: { labels: fullLabels(1), verdict: 'NEEDS_IMPROVEMENT' },
      d: { labels: fullLabels(0), verdict: 'NOT_READY' },
    };
    const r = pairEntries(gold, model);
    assert.equal(r.paired.length, 2);
    assert.deepEqual(r.unmatchedGold, ['b']);
    assert.deepEqual(r.unmatchedModel, ['d']);
    assert.equal(r.paired[0].humanVerdict, 'PRODUCTION_READY');
    assert.equal(r.paired[0].modelVerdict, 'PRODUCTION_READY');
  });

  test('empty model map → all gold unmatched', () => {
    const gold = [makeEntry('a', fullLabels(2))];
    const r = pairEntries(gold, {});
    assert.equal(r.paired.length, 0);
    assert.deepEqual(r.unmatchedGold, ['a']);
  });
});
