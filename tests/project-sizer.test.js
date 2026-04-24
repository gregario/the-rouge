const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  TIERS,
  REQUIRED_SIGNALS,
  BOUNDARIES,
  tierForSignal,
  maxTier,
  classify,
  applyHumanOverride,
  growTier,
  parseClassifierSignals,
} = require('../src/launcher/project-sizer.js');

const CALCULATOR     = { entity_count: 1,  integration_count: 0,  role_count: 1, journey_count: 1,  screen_count: 1  };
const TODO           = { entity_count: 3,  integration_count: 1,  role_count: 1, journey_count: 2,  screen_count: 3  };
const CRUD_SAAS      = { entity_count: 5,  integration_count: 3,  role_count: 2, journey_count: 5,  screen_count: 7  };
const PLANNING       = { entity_count: 8,  integration_count: 4,  role_count: 3, journey_count: 7,  screen_count: 12 };
const PLATFORM       = { entity_count: 20, integration_count: 10, role_count: 5, journey_count: 15, screen_count: 50 };

describe('tierForSignal', () => {
  test('entity_count band edges', () => {
    assert.equal(tierForSignal('entity_count', 0), 'XS');
    assert.equal(tierForSignal('entity_count', 1), 'XS');
    assert.equal(tierForSignal('entity_count', 2), 'S');
    assert.equal(tierForSignal('entity_count', 3), 'S');
    assert.equal(tierForSignal('entity_count', 4), 'M');
    assert.equal(tierForSignal('entity_count', 6), 'M');
    assert.equal(tierForSignal('entity_count', 7), 'L');
    assert.equal(tierForSignal('entity_count', 12), 'L');
    assert.equal(tierForSignal('entity_count', 13), 'XL');
    assert.equal(tierForSignal('entity_count', 100), 'XL');
  });

  test('integration_count band edges', () => {
    assert.equal(tierForSignal('integration_count', 0), 'XS');
    assert.equal(tierForSignal('integration_count', 1), 'S');
    assert.equal(tierForSignal('integration_count', 2), 'S');
    assert.equal(tierForSignal('integration_count', 3), 'M');
    assert.equal(tierForSignal('integration_count', 5), 'M');
    assert.equal(tierForSignal('integration_count', 6), 'L');
    assert.equal(tierForSignal('integration_count', 10), 'L');
    assert.equal(tierForSignal('integration_count', 11), 'XL');
  });

  test('rejects unknown signal', () => {
    assert.throws(() => tierForSignal('nonsense', 5), /unknown signal/);
  });

  test('rejects non-integer value', () => {
    assert.throws(() => tierForSignal('entity_count', 1.5), /non-negative integer/);
    assert.throws(() => tierForSignal('entity_count', -1), /non-negative integer/);
    assert.throws(() => tierForSignal('entity_count', '5'), /non-negative integer/);
  });
});

describe('maxTier', () => {
  test('returns the larger tier', () => {
    assert.equal(maxTier('XS', 'S'), 'S');
    assert.equal(maxTier('M', 'XS'), 'M');
    assert.equal(maxTier('L', 'XL'), 'XL');
    assert.equal(maxTier('XL', 'XL'), 'XL');
  });
});

describe('classify — canonical examples', () => {
  test('calculator → XS', () => {
    const r = classify(CALCULATOR);
    assert.equal(r.project_size, 'XS');
    assert.equal(r.schema_version, 'sizing-v1');
    assert.equal(r.decided_by, 'classifier');
    assert.ok(r.reasoning.includes('XS'));
    assert.deepEqual(r.signals, CALCULATOR);
  });

  test('todo app → S', () => {
    const r = classify(TODO);
    assert.equal(r.project_size, 'S');
  });

  test('crud SaaS → M', () => {
    const r = classify(CRUD_SAAS);
    assert.equal(r.project_size, 'M');
  });

  test('planning-windows-shaped → L', () => {
    const r = classify(PLANNING);
    assert.equal(r.project_size, 'L');
  });

  test('platform shape → XL', () => {
    const r = classify(PLATFORM);
    assert.equal(r.project_size, 'XL');
  });
});

describe('classify — max-aggregation behavior', () => {
  test('a single high signal pulls the tier up', () => {
    // One integration-heavy signal on an otherwise trivial project.
    // 12 integrations on a 1-entity project → max-aggregation picks XL
    // because 12 lands in XL for integration_count.
    const r = classify({
      entity_count: 1,
      integration_count: 12,
      role_count: 1,
      journey_count: 1,
      screen_count: 1,
    });
    assert.equal(r.project_size, 'XL');
  });

  test('zero on all signals → XS', () => {
    const r = classify({
      entity_count: 0,
      integration_count: 0,
      role_count: 0,
      journey_count: 0,
      screen_count: 0,
    });
    assert.equal(r.project_size, 'XS');
  });
});

describe('classify — reasoning text', () => {
  test('names the driving signals', () => {
    const r = classify(PLANNING);
    // entity_count=8 (L), integration_count=4 (M), role_count=3 (M),
    // journey_count=7 (L), screen_count=12 (L). Drivers: entity/journey/screen.
    assert.ok(r.reasoning.includes('entity_count=8'));
    assert.ok(r.reasoning.includes('journey_count=7'));
    assert.ok(r.reasoning.includes('screen_count=12'));
    assert.ok(r.reasoning.includes('(L)'));
  });

  test('notes when all signals align', () => {
    const r = classify({
      entity_count: 1,
      integration_count: 0,
      role_count: 1,
      journey_count: 1,
      screen_count: 1,
    });
    assert.ok(r.reasoning.includes('all signals align'));
  });
});

describe('classify — validation', () => {
  test('rejects missing signal', () => {
    assert.throws(
      () => classify({ entity_count: 1, integration_count: 0, role_count: 1, journey_count: 1 }),
      /missing required signal: screen_count/
    );
  });

  test('rejects invalid values', () => {
    assert.throws(
      () => classify({ ...CALCULATOR, entity_count: -1 }),
      /non-negative integer/
    );
  });

  test('rejects non-object input', () => {
    assert.throws(() => classify(null), /must be an object/);
    assert.throws(() => classify([1, 2, 3]), /must be an object/);
    assert.throws(() => classify('XS'), /must be an object/);
  });
});

describe('classify — defaults field (P1.5R PR 6)', () => {
  const { TIER_DEFAULTS } = require('../src/launcher/tier-defaults.js');

  test('stamps defaults matching the tier on the artifact', () => {
    for (const [tuple, expectedTier] of [
      [CALCULATOR, 'XS'],
      [CRUD_SAAS, 'M'],
      [PLATFORM, 'XL'],
    ]) {
      const r = classify(tuple);
      assert.equal(r.project_size, expectedTier);
      assert.deepEqual(r.defaults, TIER_DEFAULTS[expectedTier]);
    }
  });

  test('applyHumanOverride refreshes defaults to match override tier', () => {
    const c = classify(CRUD_SAAS); // M
    const overridden = require('../src/launcher/project-sizer.js').applyHumanOverride(
      c, 'L', 'bigger than it looked'
    );
    assert.equal(overridden.project_size, 'L');
    assert.deepEqual(overridden.defaults, TIER_DEFAULTS.L);
  });

  test('growTier refreshes defaults to match upgraded tier', () => {
    const c = classify(TODO); // S
    const grown = require('../src/launcher/project-sizer.js').growTier(c, 'M', 'scope grew');
    assert.equal(grown.project_size, 'M');
    assert.deepEqual(grown.defaults, TIER_DEFAULTS.M);
  });
});

describe('classify — schema compliance', () => {
  test('emitted artifact validates against sizing-v1 schema', () => {
    const schemaPath = path.join(__dirname, '..', 'schemas', 'sizing-v1.json');
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    let Ajv;
    try { Ajv = require('ajv'); } catch { return; } // ajv not installed, skip
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    const artifact = classify(CRUD_SAAS);
    const ok = validate(artifact);
    assert.ok(ok, `schema errors: ${JSON.stringify(validate.errors)}`);
  });
});

describe('applyHumanOverride', () => {
  test('records override + classifier_would_pick', () => {
    const classifier = classify(CRUD_SAAS);
    const overridden = applyHumanOverride(classifier, 'L', 'I think this has more scope than the signals show');
    assert.equal(overridden.project_size, 'L');
    assert.equal(overridden.decided_by, 'human-override');
    assert.equal(overridden.human_override.classifier_would_pick, 'M');
    assert.ok(overridden.human_override.human_reasoning.includes('more scope'));
  });

  test('rejects invalid tier', () => {
    const classifier = classify(CRUD_SAAS);
    assert.throws(
      () => applyHumanOverride(classifier, 'XXL', 'because'),
      /humanTier must be one of/
    );
  });

  test('rejects empty reasoning', () => {
    const classifier = classify(CRUD_SAAS);
    assert.throws(
      () => applyHumanOverride(classifier, 'L', ''),
      /humanReasoning is required/
    );
  });
});

describe('growTier', () => {
  test('upgrades tier and records history', () => {
    const prior = classify(TODO); // S
    const grown = growTier(prior, 'M', 'discovered 3 more entities during spec');
    assert.equal(grown.project_size, 'M');
    assert.equal(grown.grew_from.length, 1);
    assert.equal(grown.grew_from[0].from, 'S');
    assert.equal(grown.grew_from[0].to, 'M');
    assert.ok(grown.grew_from[0].reason.includes('entities'));
  });

  test('refuses to downgrade', () => {
    const prior = classify(PLANNING); // L
    assert.throws(
      () => growTier(prior, 'S', 'scope got smaller'),
      /can only move upward/
    );
  });

  test('refuses same-tier', () => {
    const prior = classify(PLANNING); // L
    assert.throws(
      () => growTier(prior, 'L', 'no change'),
      /can only move upward/
    );
  });

  test('chain of upgrades preserves history', () => {
    let a = classify(TODO); // S
    a = growTier(a, 'M', 'first upgrade');
    a = growTier(a, 'L', 'second upgrade');
    assert.equal(a.project_size, 'L');
    assert.equal(a.grew_from.length, 2);
    assert.deepEqual(a.grew_from.map((g) => g.to), ['M', 'L']);
  });
});

describe('parseClassifierSignals', () => {
  test('parses a well-formed block', () => {
    const md = `# Some Product

## Brainstorming notes
lots of stuff...

## Classifier Signals

- entity_count: 5
- integration_count: 3
- role_count: 2
- journey_count: 5
- screen_count: 7

## Next section`;
    const r = parseClassifierSignals(md);
    assert.equal(r.partial, false);
    assert.deepEqual(r.signals, {
      entity_count: 5,
      integration_count: 3,
      role_count: 2,
      journey_count: 5,
      screen_count: 7,
    });
  });

  test('parses without list markers (plain key:value)', () => {
    const md = `## Classifier Signals

entity_count: 1
integration_count: 0
role_count: 1
journey_count: 1
screen_count: 1
`;
    const r = parseClassifierSignals(md);
    assert.equal(r.partial, false);
    assert.equal(r.signals.entity_count, 1);
  });

  test('returns null when block is missing', () => {
    const md = '# just some markdown without the block';
    assert.equal(parseClassifierSignals(md), null);
  });

  test('reports partial when some signals are missing', () => {
    const md = `## Classifier Signals

- entity_count: 5
- role_count: 2
`;
    const r = parseClassifierSignals(md);
    assert.equal(r.partial, true);
    assert.deepEqual(r.missing.sort(), ['integration_count', 'journey_count', 'screen_count']);
  });

  test('ignores unrelated lines inside the block', () => {
    const md = `## Classifier Signals

- entity_count: 5
- integration_count: 3
- some random prose about the counts
- role_count: 2
- journey_count: 5
- screen_count: 7
`;
    const r = parseClassifierSignals(md);
    assert.equal(r.partial, false);
    assert.equal(r.signals.entity_count, 5);
  });

  test('block terminates at next ## heading', () => {
    const md = `## Classifier Signals

- entity_count: 5

## Something Else

- journey_count: 99
`;
    const r = parseClassifierSignals(md);
    // journey_count=99 is in a different section, should not be parsed.
    assert.equal(r.partial, true);
    assert.ok(r.missing.includes('journey_count'));
  });

  test('non-string input returns null', () => {
    assert.equal(parseClassifierSignals(null), null);
    assert.equal(parseClassifierSignals(undefined), null);
    assert.equal(parseClassifierSignals(42), null);
  });
});

describe('constants surface', () => {
  test('TIERS is the expected ordered list', () => {
    assert.deepEqual([...TIERS], ['XS', 'S', 'M', 'L', 'XL']);
  });

  test('REQUIRED_SIGNALS matches BOUNDARIES keys', () => {
    assert.deepEqual([...REQUIRED_SIGNALS].sort(), Object.keys(BOUNDARIES).sort());
  });
});
