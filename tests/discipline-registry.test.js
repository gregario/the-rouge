const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  REGISTRY,
  DISCIPLINE_NAMES,
  tierAtOrAbove,
  shouldRun,
  skipReason,
  listApplicable,
  listSkipped,
} = require('../src/launcher/discipline-registry.js');

describe('tierAtOrAbove', () => {
  test('exact match passes', () => {
    assert.equal(tierAtOrAbove('M', 'M'), true);
    assert.equal(tierAtOrAbove('XS', 'XS'), true);
  });

  test('higher tier passes', () => {
    assert.equal(tierAtOrAbove('L', 'M'), true);
    assert.equal(tierAtOrAbove('XL', 'XS'), true);
  });

  test('lower tier fails', () => {
    assert.equal(tierAtOrAbove('XS', 'M'), false);
    assert.equal(tierAtOrAbove('S', 'L'), false);
  });

  test('unknown tier throws', () => {
    assert.throws(() => tierAtOrAbove('XXL', 'M'), /unknown projectSize/);
    assert.throws(() => tierAtOrAbove('M', 'XXL'), /unknown applicable_at/);
  });
});

describe('REGISTRY integrity', () => {
  test('every discipline entry has applicable_at + file', () => {
    for (const [name, entry] of Object.entries(REGISTRY)) {
      assert.ok(entry.applicable_at, `${name} missing applicable_at`);
      assert.ok(entry.file, `${name} missing file`);
    }
  });

  test('every file in REGISTRY exists on disk', () => {
    const seedingDir = path.join(__dirname, '..', 'src', 'prompts', 'seeding');
    for (const [name, entry] of Object.entries(REGISTRY)) {
      const full = path.join(seedingDir, entry.file);
      assert.ok(fs.existsSync(full), `${name} → ${full} does not exist`);
    }
  });

  test('DISCIPLINE_NAMES order matches canonical swarm sequence', () => {
    assert.deepEqual([...DISCIPLINE_NAMES], [
      'brainstorming', 'competition', 'taste', 'sizing', 'spec',
      'infrastructure', 'design', 'legal-privacy', 'marketing',
    ]);
  });

  test('applicable_at values are all valid tiers', () => {
    const validTiers = new Set(['XS', 'S', 'M', 'L', 'XL']);
    for (const [name, entry] of Object.entries(REGISTRY)) {
      assert.ok(validTiers.has(entry.applicable_at), `${name} has invalid tier: ${entry.applicable_at}`);
    }
  });
});

describe('shouldRun', () => {
  test('XS project runs brainstorming/taste/sizing/spec only', () => {
    assert.equal(shouldRun('brainstorming', 'XS'), true);
    assert.equal(shouldRun('taste', 'XS'), true);
    assert.equal(shouldRun('sizing', 'XS'), true);
    assert.equal(shouldRun('spec', 'XS'), true);

    assert.equal(shouldRun('competition', 'XS'), false);
    assert.equal(shouldRun('infrastructure', 'XS'), false);
    assert.equal(shouldRun('design', 'XS'), false);
    assert.equal(shouldRun('legal-privacy', 'XS'), false);
    assert.equal(shouldRun('marketing', 'XS'), false);
  });

  test('S project adds infrastructure/design/legal-privacy', () => {
    assert.equal(shouldRun('infrastructure', 'S'), true);
    assert.equal(shouldRun('design', 'S'), true);
    assert.equal(shouldRun('legal-privacy', 'S'), true);

    assert.equal(shouldRun('competition', 'S'), false);
    assert.equal(shouldRun('marketing', 'S'), false);
  });

  test('M project runs all 9 disciplines', () => {
    for (const name of DISCIPLINE_NAMES) {
      assert.equal(shouldRun(name, 'M'), true, `${name} should run at M`);
    }
  });

  test('L and XL also run all 9', () => {
    for (const size of ['L', 'XL']) {
      for (const name of DISCIPLINE_NAMES) {
        assert.equal(shouldRun(name, size), true, `${name} should run at ${size}`);
      }
    }
  });

  test('unknown discipline throws', () => {
    assert.throws(() => shouldRun('nonsense', 'M'), /unknown discipline/);
  });
});

describe('listApplicable / listSkipped', () => {
  test('XS → 4 applicable, 5 skipped', () => {
    const app = listApplicable('XS');
    const skip = listSkipped('XS');
    assert.equal(app.length, 4);
    assert.equal(skip.length, 5);
    assert.deepEqual(app, ['brainstorming', 'taste', 'sizing', 'spec']);
  });

  test('S → 7 applicable, 2 skipped (competition + marketing)', () => {
    const app = listApplicable('S');
    const skip = listSkipped('S');
    assert.equal(app.length, 7);
    assert.equal(skip.length, 2);
    assert.deepEqual(skip.sort(), ['competition', 'marketing']);
  });

  test('M → 9 applicable, 0 skipped', () => {
    assert.equal(listApplicable('M').length, 9);
    assert.equal(listSkipped('M').length, 0);
  });

  test('applicable + skipped always sums to 9', () => {
    for (const size of ['XS', 'S', 'M', 'L', 'XL']) {
      const total = listApplicable(size).length + listSkipped(size).length;
      assert.equal(total, 9, `${size}: ${total} != 9`);
    }
  });

  test('applicable maintains canonical order', () => {
    const m = listApplicable('M');
    assert.deepEqual(m, [...DISCIPLINE_NAMES]);
  });
});

describe('skipReason', () => {
  test('names applicable_at and project_size', () => {
    const r = skipReason('competition', 'XS');
    assert.ok(r.includes('applicable_at=M'));
    assert.ok(r.includes('project_size=XS'));
    assert.ok(r.includes('below threshold'));
  });

  test('unknown discipline throws', () => {
    assert.throws(() => skipReason('nonsense', 'XS'), /unknown discipline/);
  });
});
