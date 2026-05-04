const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  DISCIPLINE_TIERS,
  TIER_ORDER,
  listApplicable,
  getTier,
} = require('../src/launcher/discipline-registry.js');

describe('TIER_ORDER', () => {
  test('contains the five canonical tiers in order', () => {
    assert.deepEqual(TIER_ORDER, ['XS', 'S', 'M', 'L', 'XL']);
  });
});

describe('DISCIPLINE_TIERS integrity', () => {
  test('every discipline entry has a valid tier', () => {
    const validTiers = new Set(TIER_ORDER);
    for (const [name, tier] of Object.entries(DISCIPLINE_TIERS)) {
      assert.ok(validTiers.has(tier), `${name} has invalid tier: ${tier}`);
    }
  });

  test('contains all 9 canonical disciplines', () => {
    const expected = [
      'brainstorming', 'competition', 'taste', 'sizing', 'spec',
      'infrastructure', 'design', 'legal-privacy', 'marketing',
    ];
    assert.deepEqual(Object.keys(DISCIPLINE_TIERS).sort(), expected.sort());
  });

  test('tier assignments match expected values', () => {
    assert.equal(DISCIPLINE_TIERS['brainstorming'], 'XS');
    assert.equal(DISCIPLINE_TIERS['competition'], 'M');
    assert.equal(DISCIPLINE_TIERS['taste'], 'XS');
    assert.equal(DISCIPLINE_TIERS['sizing'], 'XS');
    assert.equal(DISCIPLINE_TIERS['spec'], 'XS');
    assert.equal(DISCIPLINE_TIERS['infrastructure'], 'S');
    assert.equal(DISCIPLINE_TIERS['design'], 'S');
    assert.equal(DISCIPLINE_TIERS['legal-privacy'], 'S');
    assert.equal(DISCIPLINE_TIERS['marketing'], 'M');
  });
});

describe('getTier', () => {
  test('returns the tier for a known discipline', () => {
    assert.equal(getTier('brainstorming'), 'XS');
    assert.equal(getTier('competition'), 'M');
    assert.equal(getTier('infrastructure'), 'S');
  });

  test('returns null for an unknown discipline', () => {
    assert.equal(getTier('nonsense'), null);
    assert.equal(getTier(''), null);
  });
});

describe('listApplicable', () => {
  test('XS project runs brainstorming/taste/sizing/spec only', () => {
    const app = listApplicable('XS');
    assert.equal(app.length, 4);
    assert.deepEqual(app.sort(), ['brainstorming', 'sizing', 'spec', 'taste']);
  });

  test('S project adds infrastructure/design/legal-privacy', () => {
    const app = listApplicable('S');
    assert.equal(app.length, 7);
    // Should include all XS disciplines plus the S-tier ones
    assert.ok(app.includes('brainstorming'));
    assert.ok(app.includes('infrastructure'));
    assert.ok(app.includes('design'));
    assert.ok(app.includes('legal-privacy'));
    // Should not include M-tier disciplines
    assert.ok(!app.includes('competition'));
    assert.ok(!app.includes('marketing'));
  });

  test('M project runs all 9 disciplines', () => {
    const app = listApplicable('M');
    assert.equal(app.length, 9);
  });

  test('L and XL also run all 9', () => {
    for (const size of ['L', 'XL']) {
      const app = listApplicable(size);
      assert.equal(app.length, 9, `Expected 9 disciplines at ${size}`);
    }
  });

  test('applicable maintains insertion order from DISCIPLINE_TIERS', () => {
    const m = listApplicable('M');
    assert.deepEqual(m, Object.keys(DISCIPLINE_TIERS));
  });

  test('invalid project size throws', () => {
    assert.throws(() => listApplicable('XXL'), /Invalid project size/);
  });

  test('applicable disciplines are a subset at smaller tiers', () => {
    const xs = listApplicable('XS');
    const s = listApplicable('S');
    const m = listApplicable('M');
    // Every XS discipline should appear in S
    for (const d of xs) {
      assert.ok(s.includes(d), `${d} in XS but not S`);
    }
    // Every S discipline should appear in M
    for (const d of s) {
      assert.ok(m.includes(d), `${d} in S but not M`);
    }
  });

  test('XS → 4 applicable, 5 skipped (difference from total)', () => {
    const app = listApplicable('XS');
    const allDisciplines = Object.keys(DISCIPLINE_TIERS);
    const skipped = allDisciplines.filter(d => !app.includes(d));
    assert.equal(app.length, 4);
    assert.equal(skipped.length, 5);
  });

  test('S → 7 applicable, 2 skipped (competition + marketing)', () => {
    const app = listApplicable('S');
    const allDisciplines = Object.keys(DISCIPLINE_TIERS);
    const skipped = allDisciplines.filter(d => !app.includes(d));
    assert.equal(app.length, 7);
    assert.equal(skipped.length, 2);
    assert.deepEqual(skipped.sort(), ['competition', 'marketing']);
  });

  test('M → 9 applicable, 0 skipped', () => {
    const app = listApplicable('M');
    assert.equal(app.length, 9);
    const allDisciplines = Object.keys(DISCIPLINE_TIERS);
    const skipped = allDisciplines.filter(d => !app.includes(d));
    assert.equal(skipped.length, 0);
  });

  test('applicable + skipped always sums to 9', () => {
    const allDisciplines = Object.keys(DISCIPLINE_TIERS);
    for (const size of ['XS', 'S', 'M', 'L', 'XL']) {
      const app = listApplicable(size);
      const skipped = allDisciplines.filter(d => !app.includes(d));
      const total = app.length + skipped.length;
      assert.equal(total, 9, `${size}: ${total} != 9`);
    }
  });
});
