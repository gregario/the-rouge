const { test, describe } = require('node:test');
const assert = require('node:assert');

const { getModelForPhase, STATE_TO_MODEL } = require('../../src/launcher/model-selection.js');

describe('Model Selection', () => {
  test('returns opus for reasoning-heavy phases', () => {
    assert.equal(getModelForPhase('seeding'), 'opus');
    assert.equal(getModelForPhase('analyzing'), 'opus');
    assert.equal(getModelForPhase('vision-check'), 'opus');
    assert.equal(getModelForPhase('generating-change-spec'), 'opus');
    assert.equal(getModelForPhase('final-review'), 'opus');
    assert.equal(getModelForPhase('story-building'), 'opus');
  });

  test('returns sonnet for mechanical phases', () => {
    assert.equal(getModelForPhase('foundation'), 'sonnet');
    assert.equal(getModelForPhase('foundation-eval'), 'sonnet');
    assert.equal(getModelForPhase('milestone-check'), 'sonnet');
    assert.equal(getModelForPhase('milestone-fix'), 'sonnet');
    assert.equal(getModelForPhase('shipping'), 'sonnet');
    assert.equal(getModelForPhase('story-diagnosis'), 'sonnet');
  });

  test('defaults to opus for unknown phase', () => {
    assert.equal(getModelForPhase('nonexistent'), 'opus');
  });

  test('config override takes precedence', () => {
    assert.equal(getModelForPhase('foundation', { foundation: 'opus' }), 'opus');
    assert.equal(getModelForPhase('story-building', { 'story-building': 'sonnet' }), 'sonnet');
  });

  test('STATE_TO_MODEL covers all known phases', () => {
    const phases = [
      'seeding', 'analyzing', 'vision-check', 'generating-change-spec',
      'final-review', 'story-building', 'foundation', 'foundation-eval',
      'milestone-check', 'milestone-fix', 'shipping', 'story-diagnosis',
    ];
    for (const p of phases) {
      assert.ok(STATE_TO_MODEL[p], `Missing mapping for ${p}`);
    }
  });
});
