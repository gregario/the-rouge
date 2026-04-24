const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  TIER_DEFAULTS,
  getDefaults,
  readDefaultsFromSizing,
  readBudgetCapFromSizing,
} = require('../src/launcher/tier-defaults.js');

describe('TIER_DEFAULTS shape', () => {
  test('has entry for each tier with positive numbers', () => {
    for (const tier of ['XS', 'S', 'M', 'L', 'XL']) {
      const entry = TIER_DEFAULTS[tier];
      assert.ok(entry, `missing entry for ${tier}`);
      assert.ok(typeof entry.budget_cap_usd === 'number' && entry.budget_cap_usd > 0);
      assert.ok(typeof entry.suggested_cycles === 'number' && entry.suggested_cycles > 0);
    }
  });

  test('budget_cap_usd monotonically non-decreasing by tier', () => {
    const order = ['XS', 'S', 'M', 'L', 'XL'];
    for (let i = 1; i < order.length; i++) {
      const prev = TIER_DEFAULTS[order[i - 1]].budget_cap_usd;
      const cur = TIER_DEFAULTS[order[i]].budget_cap_usd;
      assert.ok(cur >= prev, `${order[i]} (${cur}) must be >= ${order[i - 1]} (${prev})`);
    }
  });

  test('suggested_cycles monotonically non-decreasing by tier', () => {
    const order = ['XS', 'S', 'M', 'L', 'XL'];
    for (let i = 1; i < order.length; i++) {
      const prev = TIER_DEFAULTS[order[i - 1]].suggested_cycles;
      const cur = TIER_DEFAULTS[order[i]].suggested_cycles;
      assert.ok(cur >= prev);
    }
  });
});

describe('getDefaults', () => {
  test('returns a copy (mutating the result does not pollute the table)', () => {
    const a = getDefaults('M');
    a.budget_cap_usd = 9999;
    const b = getDefaults('M');
    assert.notEqual(b.budget_cap_usd, 9999);
  });

  test('unknown tier throws', () => {
    assert.throws(() => getDefaults('XXL'), /unknown tier/);
  });
});

describe('readDefaultsFromSizing', () => {
  test('returns null when projectDir is null/empty', () => {
    assert.equal(readDefaultsFromSizing(null), null);
    assert.equal(readDefaultsFromSizing(''), null);
  });

  test('returns null when sizing.json missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-tier-empty-'));
    try {
      assert.equal(readDefaultsFromSizing(dir), null);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('returns null when sizing.json is malformed JSON', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-tier-bad-'));
    fs.mkdirSync(path.join(dir, 'seed_spec'));
    fs.writeFileSync(path.join(dir, 'seed_spec', 'sizing.json'), '{ bad json');
    try {
      assert.equal(readDefaultsFromSizing(dir), null);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('reads stamped defaults off the artifact when present', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-tier-stamped-'));
    fs.mkdirSync(path.join(dir, 'seed_spec'));
    fs.writeFileSync(path.join(dir, 'seed_spec', 'sizing.json'), JSON.stringify({
      schema_version: 'sizing-v1',
      project_size: 'L',
      defaults: { budget_cap_usd: 123, suggested_cycles: 9 },
    }));
    try {
      const r = readDefaultsFromSizing(dir);
      assert.deepEqual(r, { budget_cap_usd: 123, suggested_cycles: 9 });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('falls back to tier lookup when artifact has project_size but no defaults', () => {
    // Pre-PR-6 artifact shape — no defaults block stamped on disk.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-tier-legacy-'));
    fs.mkdirSync(path.join(dir, 'seed_spec'));
    fs.writeFileSync(path.join(dir, 'seed_spec', 'sizing.json'), JSON.stringify({
      schema_version: 'sizing-v1',
      project_size: 'XS',
    }));
    try {
      const r = readDefaultsFromSizing(dir);
      assert.deepEqual(r, TIER_DEFAULTS.XS);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('returns null when artifact has neither defaults nor recognisable tier', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-tier-missing-tier-'));
    fs.mkdirSync(path.join(dir, 'seed_spec'));
    fs.writeFileSync(path.join(dir, 'seed_spec', 'sizing.json'), JSON.stringify({
      schema_version: 'sizing-v1',
      project_size: 'NOPE',
    }));
    try {
      assert.equal(readDefaultsFromSizing(dir), null);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('rejects incomplete defaults block and falls back to tier lookup', () => {
    // If defaults is present but only has one field, we can't trust it —
    // fall through to tier lookup so we always return a complete set.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-tier-partial-'));
    fs.mkdirSync(path.join(dir, 'seed_spec'));
    fs.writeFileSync(path.join(dir, 'seed_spec', 'sizing.json'), JSON.stringify({
      schema_version: 'sizing-v1',
      project_size: 'M',
      defaults: { budget_cap_usd: 99 }, // missing suggested_cycles
    }));
    try {
      const r = readDefaultsFromSizing(dir);
      assert.deepEqual(r, TIER_DEFAULTS.M);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('readBudgetCapFromSizing', () => {
  test('convenience: returns only budget_cap_usd or null', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-tier-cap-'));
    fs.mkdirSync(path.join(dir, 'seed_spec'));
    fs.writeFileSync(path.join(dir, 'seed_spec', 'sizing.json'), JSON.stringify({
      schema_version: 'sizing-v1',
      project_size: 'L',
      defaults: { budget_cap_usd: 100, suggested_cycles: 8 },
    }));
    try {
      assert.equal(readBudgetCapFromSizing(dir), 100);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('returns null when no sizing information available', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-tier-nocap-'));
    try {
      assert.equal(readBudgetCapFromSizing(dir), null);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
