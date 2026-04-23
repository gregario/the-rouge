const { test, describe } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { RUBRIC_DIMENSIONS } = require('../src/launcher/gold-set-calibrator.js');

const CLI_PATH = path.join(__dirname, '..', 'src', 'launcher', 'rouge-cli.js');

function runCLI(args) {
  try {
    const stdout = execFileSync('node', [CLI_PATH, ...args], {
      encoding: 'utf8',
      timeout: 15000,
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      status: err.status === undefined ? 1 : err.status,
      stdout: (err.stdout || '').toString(),
      stderr: (err.stderr || '').toString(),
    };
  }
}

function fullLabels(score) {
  const out = {};
  for (const dim of RUBRIC_DIMENSIONS) out[dim] = score;
  return out;
}

function makeEntry(id, labels, verdict = 'PRODUCTION_READY') {
  return {
    schema_version: 'gold-set-entry-v1',
    id,
    rubric_id: 'product-quality',
    rubric_version: 1,
    source: {
      project: 'proj-foo',
      cycle_id: `${id}-cycle`,
      captured_at: '2026-04-23T00:00:00Z',
    },
    human_labels: labels,
    human_verdict: verdict,
    labeler: 'test@example.com',
    labeled_at: '2026-04-23T00:00:00Z',
  };
}

function seedFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-cal-'));
  const goldDir = path.join(dir, 'gold');
  fs.mkdirSync(goldDir);
  const modelLabels = {};
  for (let i = 0; i < 25; i++) {
    const score = i % 4;
    const entry = makeEntry(`e${i}`, fullLabels(score));
    fs.writeFileSync(path.join(goldDir, `e${i}.json`), JSON.stringify(entry));
    modelLabels[`e${i}`] = {
      labels: fullLabels(score),
      verdict: 'PRODUCTION_READY',
    };
  }
  const modelLabelsPath = path.join(dir, 'model-labels.json');
  fs.writeFileSync(modelLabelsPath, JSON.stringify(modelLabels));
  return { dir, goldDir, modelLabelsPath };
}

describe('rouge eval-calibrate CLI', () => {
  test('--help exits 0 with usage text', () => {
    const r = runCLI(['eval-calibrate', '--help']);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('Gate prompt changes'));
    assert.ok(r.stdout.includes('--min-kappa'));
  });

  test('empty gold-set dir exits 2 with actionable message', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-cal-empty-'));
    try {
      const r = runCLI(['eval-calibrate', '--gold-set', dir]);
      assert.equal(r.status, 2);
      assert.ok(r.stdout.includes('INSUFFICIENT DATA'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('perfect agreement exits 0 with passed verdict', () => {
    const { dir, goldDir, modelLabelsPath } = seedFixture();
    try {
      const r = runCLI([
        'eval-calibrate',
        '--gold-set', goldDir,
        '--model-labels', modelLabelsPath,
        '--min-kappa', '0.75',
        '--min-entries', '20',
      ]);
      assert.equal(r.status, 0, `expected 0, got ${r.status}. stdout=${r.stdout}\nstderr=${r.stderr}`);
      assert.ok(r.stdout.includes('PASSED'));
      assert.ok(r.stdout.includes('Verdict agreement: 100.0%'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('one-dimension regression exits 1 and names the failing dim', () => {
    const { dir, goldDir, modelLabelsPath } = seedFixture();
    try {
      // Rewrite model labels to be wrong-by-2 on interaction_fidelity.
      const model = JSON.parse(fs.readFileSync(modelLabelsPath, 'utf8'));
      for (const id of Object.keys(model)) {
        const h = model[id].labels.interaction_fidelity;
        model[id].labels.interaction_fidelity = (h + 2) % 4;
      }
      fs.writeFileSync(modelLabelsPath, JSON.stringify(model));

      const r = runCLI([
        'eval-calibrate',
        '--gold-set', goldDir,
        '--model-labels', modelLabelsPath,
        '--min-kappa', '0.75',
        '--min-entries', '20',
      ]);
      assert.equal(r.status, 1);
      assert.ok(r.stdout.includes('FAILED'));
      assert.ok(r.stdout.includes('interaction_fidelity'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('missing model-labels file exits 2', () => {
    const r = runCLI([
      'eval-calibrate',
      '--model-labels', '/tmp/definitely-does-not-exist-xyz.json',
    ]);
    assert.equal(r.status, 2);
    assert.ok(r.stderr.includes('Model labels file not found'));
  });

  test('unknown flag exits 2', () => {
    const r = runCLI(['eval-calibrate', '--nope']);
    assert.equal(r.status, 2);
    assert.ok(r.stderr.includes('Unknown flag'));
  });

  test('non-number --min-kappa exits 2', () => {
    const r = runCLI(['eval-calibrate', '--min-kappa', 'notanumber']);
    assert.equal(r.status, 2);
    assert.ok(r.stderr.includes('--min-kappa expects a number'));
  });
});
