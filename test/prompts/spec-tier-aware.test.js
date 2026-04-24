const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// P1.5R PR 5 — SPEC reads sizing.json and adjusts FA count + AC range per
// tier. These tests lock in that the tier-aware guidance stays in the
// prompt. If someone (including a future self-improve pass) drops the
// guidance, the test fails, preventing silent regression.

const SPEC_PATH = path.join(__dirname, '..', '..', 'src', 'prompts', 'seeding', '04-spec.md');
const SPEC = fs.readFileSync(SPEC_PATH, 'utf8');

describe('SPEC tier-aware guidance', () => {
  test('instructs to read sizing.json before Beat 1', () => {
    const beat1Idx = SPEC.indexOf('### Beat 1');
    const sizingMention = SPEC.indexOf('sizing.json');
    assert.ok(sizingMention > -1, 'prompt must mention sizing.json');
    assert.ok(sizingMention < beat1Idx, 'sizing.json must be referenced BEFORE Beat 1');
  });

  test('references all five tiers', () => {
    // Each tier should appear at least once in the tier-aware section.
    for (const tier of ['XS', 'S', 'M', 'L', 'XL']) {
      const re = new RegExp(`\\b${tier}\\b`);
      assert.ok(re.test(SPEC), `prompt missing tier: ${tier}`);
    }
  });

  test('includes FA count + AC range guidance', () => {
    // Rough string-match: the tier table should carry counts.
    assert.ok(/FA count/i.test(SPEC), 'missing FA count guidance');
    assert.ok(/ACs per FA|AC range|ACs each/i.test(SPEC), 'missing AC range guidance');
  });

  test('specifies default-to-M fallback when sizing.json missing', () => {
    assert.ok(
      /defaulted?[- ]to[- ]M/i.test(SPEC) || /default to M/i.test(SPEC),
      'prompt must describe a default-to-M fallback when sizing.json is missing'
    );
  });

  test('defines L/XL iterative per-FA mode', () => {
    assert.ok(/iterative per-FA|per-FA iterative/i.test(SPEC), 'missing iterative per-FA language');
  });

  test('requires a mandatory cross-cut pass at L/XL', () => {
    assert.ok(/cross-cut pass/i.test(SPEC), 'missing cross-cut pass language');
    assert.ok(/mandatory/i.test(SPEC), 'cross-cut pass must be called out as mandatory');
  });

  test('preserves "depth is tier-invariant" instruction', () => {
    // Critical: a future self-improve pass might try to weaken per-FA
    // depth for small tiers. This test ensures the "tier reduces scope,
    // never rigor" framing stays.
    assert.ok(
      /tier-invariant|tier reduces scope,? never rigor|reduces scope/i.test(SPEC),
      'prompt must preserve the "tier does not weaken rigor" invariant'
    );
  });

  test('cross-cut pass hunts for the four conflict classes named in the design doc', () => {
    // If a future edit drops any of these, the cross-cut becomes weaker
    // and specs drift across FAs without anyone noticing.
    assert.ok(/data[- ]model conflict/i.test(SPEC), 'cross-cut missing data-model-conflict check');
    assert.ok(/AC contradiction/i.test(SPEC), 'cross-cut missing AC-contradiction check');
    assert.ok(/cross-FA journey|missing cross-FA/i.test(SPEC), 'cross-cut missing cross-FA-journey check');
    assert.ok(/shared[- ]component drift/i.test(SPEC), 'cross-cut missing shared-component-drift check');
  });
});
