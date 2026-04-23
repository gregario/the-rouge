const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  DEFAULT_PLAN,
  SYNTH_LABELER,
  deriveVerdict,
  scoresFromTuple,
  synthesizeEntry,
  generateDefaultSet,
  writeEntries,
} = require('../src/launcher/gold-set-synth.js');

const {
  RUBRIC_DIMENSIONS,
  validateGoldSetEntry,
  computePerDimensionKappa,
  evaluateCalibration,
} = require('../src/launcher/gold-set-calibrator.js');

describe('deriveVerdict', () => {
  test('any 0 → NOT_READY', () => {
    const scores = scoresFromTuple([0, 3, 3, 3, 3, 3]);
    assert.equal(deriveVerdict(scores), 'NOT_READY');
  });

  test('any 1 with no 0 → NEEDS_IMPROVEMENT', () => {
    const scores = scoresFromTuple([1, 3, 3, 3, 3, 3]);
    assert.equal(deriveVerdict(scores), 'NEEDS_IMPROVEMENT');
  });

  test('all ≥ 2 with at least one 3 → PRODUCTION_READY', () => {
    const scores = scoresFromTuple([2, 3, 2, 3, 2, 3]);
    assert.equal(deriveVerdict(scores), 'PRODUCTION_READY');
  });

  test('all 2s → NEEDS_IMPROVEMENT (no 3 means no peak)', () => {
    const scores = scoresFromTuple([2, 2, 2, 2, 2, 2]);
    assert.equal(deriveVerdict(scores), 'NEEDS_IMPROVEMENT');
  });

  test('all 3s → PRODUCTION_READY', () => {
    const scores = scoresFromTuple([3, 3, 3, 3, 3, 3]);
    assert.equal(deriveVerdict(scores), 'PRODUCTION_READY');
  });
});

describe('scoresFromTuple', () => {
  test('maps tuple to dimension dict in rubric order', () => {
    const out = scoresFromTuple([3, 2, 1, 0, 3, 2]);
    assert.equal(out.journey_completeness, 3);
    assert.equal(out.interaction_fidelity, 2);
    assert.equal(out.visual_coherence, 1);
    assert.equal(out.content_grounding, 0);
    assert.equal(out.edge_resilience, 3);
    assert.equal(out.vision_fit, 2);
  });

  test('rejects wrong length', () => {
    assert.throws(() => scoresFromTuple([1, 2, 3]), /6 entries/);
  });

  test('rejects out-of-range scores', () => {
    assert.throws(() => scoresFromTuple([0, 1, 2, 3, 4, 0]), /score for edge_resilience/);
    assert.throws(() => scoresFromTuple([0, 1, 2, 3, -1, 0]), /score for edge_resilience/);
    assert.throws(() => scoresFromTuple([1.5, 1, 2, 3, 3, 0]), /journey_completeness/);
  });
});

describe('synthesizeEntry', () => {
  test('produces a schema-valid entry', () => {
    const e = synthesizeEntry('synthetic-99', [3, 2, 2, 3, 1, 2]);
    const check = validateGoldSetEntry(e);
    assert.equal(check.valid, true, check.reason);
  });

  test('human_labels match the tuple', () => {
    const e = synthesizeEntry('x', [3, 2, 2, 3, 1, 2]);
    assert.equal(e.human_labels.journey_completeness, 3);
    assert.equal(e.human_labels.edge_resilience, 1);
    assert.equal(e.human_verdict, 'NEEDS_IMPROVEMENT');
    assert.equal(e.labeler, SYNTH_LABELER);
    assert.equal(e.rubric_version, 1);
    assert.equal(e.rubric_id, 'product-quality');
  });

  test('determinism: same inputs → identical JSON', () => {
    const a = synthesizeEntry('x', [2, 3, 1, 2, 3, 2]);
    const b = synthesizeEntry('x', [2, 3, 1, 2, 3, 2]);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });

  test('cycle_context_excerpt reflects score intent', () => {
    const perfect = synthesizeEntry('p', [3, 3, 3, 3, 3, 3]);
    const broken = synthesizeEntry('b', [0, 0, 0, 0, 0, 0]);

    // Perfect: every journey reaches success state.
    assert.ok(perfect.cycle_context_excerpt.product_walk.journeys.every((j) => j.reached_success_state));
    // Broken: no journey reaches success state.
    assert.ok(broken.cycle_context_excerpt.product_walk.journeys.every((j) => !j.reached_success_state));

    // Perfect: no dead elements.
    for (const screen of perfect.cycle_context_excerpt.product_walk.screens) {
      assert.ok(screen.interactive_elements.every((el) => el.result !== 'no visible response'));
    }
    // Broken: every element dead.
    for (const screen of broken.cycle_context_excerpt.product_walk.screens) {
      assert.ok(screen.interactive_elements.every((el) => el.result === 'no visible response'));
    }

    // Perfect: functional_correctness PASS; broken: FAIL.
    assert.equal(perfect.cycle_context_excerpt.functional_correctness, 'PASS');
    assert.equal(broken.cycle_context_excerpt.functional_correctness, 'FAIL');
  });
});

describe('generateDefaultSet', () => {
  test('produces exactly 20 schema-valid entries', () => {
    const set = generateDefaultSet();
    assert.equal(set.length, 20);
    for (const e of set) {
      const check = validateGoldSetEntry(e);
      assert.equal(check.valid, true, `${e.id}: ${check.reason}`);
    }
  });

  test('ids are sequential and stable', () => {
    const set = generateDefaultSet();
    assert.equal(set[0].id, 'synthetic-01');
    assert.equal(set[9].id, 'synthetic-10');
    assert.equal(set[19].id, 'synthetic-20');
  });

  test('verdict distribution spans all three verdicts', () => {
    const set = generateDefaultSet();
    const verdicts = new Set(set.map((e) => e.human_verdict));
    assert.ok(verdicts.has('PRODUCTION_READY'));
    assert.ok(verdicts.has('NEEDS_IMPROVEMENT'));
    assert.ok(verdicts.has('NOT_READY'));
  });

  test('every dimension takes at least 3 distinct values across the set', () => {
    // This guarantees no column-collapse when the calibrator runs.
    const set = generateDefaultSet();
    for (const dim of RUBRIC_DIMENSIONS) {
      const distinct = new Set(set.map((e) => e.human_labels[dim]));
      assert.ok(
        distinct.size >= 3,
        `${dim} only takes ${distinct.size} distinct scores: ${[...distinct].sort().join(', ')}`
      );
    }
  });

  test('set drives calibrator to PASS when paired with itself', () => {
    // Sanity: fixture + identical model labels → perfect Kappa, passes gate.
    const set = generateDefaultSet();
    const paired = set.map((e) => ({
      id: e.id,
      humanLabels: e.human_labels,
      modelLabels: e.human_labels,
      humanVerdict: e.human_verdict,
      modelVerdict: e.human_verdict,
    }));
    const r = evaluateCalibration(paired, { minKappa: 0.75, minEntries: 20 });
    assert.equal(r.passed, true);
    assert.equal(r.collapsedDimensions.length, 0);
    for (const dim of RUBRIC_DIMENSIONS) {
      assert.ok(Math.abs(r.perDimension[dim].kappa - 1.0) < 1e-9);
    }
  });

  test('DEFAULT_PLAN matches the expected shape', () => {
    assert.equal(DEFAULT_PLAN.length, 20);
    for (const tuple of DEFAULT_PLAN) {
      assert.equal(tuple.length, RUBRIC_DIMENSIONS.length);
      for (const s of tuple) {
        assert.ok(Number.isInteger(s) && s >= 0 && s <= 3);
      }
    }
  });
});

describe('writeEntries', () => {
  test('writes one file per entry with pretty JSON', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-synth-'));
    try {
      const set = generateDefaultSet();
      const r = writeEntries(set, dir);
      assert.equal(r.written.length, 20);
      assert.equal(r.refused.length, 0);
      // Inspect one file for shape.
      const file = path.join(dir, 'synthetic-01.json');
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.equal(parsed.id, 'synthetic-01');
      assert.equal(parsed.labeler, SYNTH_LABELER);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('dry-run does not write', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-synth-dry-'));
    try {
      const set = generateDefaultSet();
      const r = writeEntries(set, dir, { dryRun: true });
      assert.equal(r.written.length, 0);
      assert.equal(r.skipped.length, 20);
      assert.equal(fs.readdirSync(dir).length, 0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('refuses to clobber a non-synthetic entry by default', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-synth-clobber-'));
    try {
      const humanEntry = synthesizeEntry('synthetic-01', [2, 2, 2, 3, 2, 2]);
      humanEntry.labeler = 'human@example.com'; // pretend a human labeled this one
      fs.writeFileSync(path.join(dir, 'synthetic-01.json'), JSON.stringify(humanEntry, null, 2));

      const set = generateDefaultSet();
      const r = writeEntries(set, dir);
      assert.ok(r.refused.some((x) => x.file.endsWith('synthetic-01.json')));
      // The human-labeled file is untouched.
      const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'synthetic-01.json'), 'utf8'));
      assert.equal(onDisk.labeler, 'human@example.com');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('overwriteNonSynthetic: true clobbers even non-synthetic files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-synth-over-'));
    try {
      const humanEntry = synthesizeEntry('synthetic-01', [2, 2, 2, 3, 2, 2]);
      humanEntry.labeler = 'human@example.com';
      fs.writeFileSync(path.join(dir, 'synthetic-01.json'), JSON.stringify(humanEntry, null, 2));

      const set = generateDefaultSet();
      const r = writeEntries(set, dir, { overwriteNonSynthetic: true });
      assert.equal(r.refused.length, 0);
      const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'synthetic-01.json'), 'utf8'));
      assert.equal(onDisk.labeler, SYNTH_LABELER);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
