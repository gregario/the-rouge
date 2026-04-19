const { test, describe } = require('node:test');
const assert = require('node:assert');

const { getModelForPhase, STATE_TO_MODEL } = require('../../src/launcher/model-selection.js');

describe('Model Selection', () => {
  test('returns opus for all reasoning phases (default is opus)', () => {
    assert.equal(getModelForPhase('seeding'), 'opus');
    assert.equal(getModelForPhase('analyzing'), 'opus');
    assert.equal(getModelForPhase('vision-check'), 'opus');
    assert.equal(getModelForPhase('generating-change-spec'), 'opus');
    assert.equal(getModelForPhase('final-review'), 'opus');
    assert.equal(getModelForPhase('story-building'), 'opus');
    // Formerly Sonnet — bumped to Opus after dogfood showed these
    // phases are judgement-heavy, not mechanical.
    assert.equal(getModelForPhase('foundation'), 'opus');
    assert.equal(getModelForPhase('foundation-eval'), 'opus');
    assert.equal(getModelForPhase('milestone-fix'), 'opus');
    assert.equal(getModelForPhase('shipping'), 'opus');
  });

  test('returns sonnet for milestone-check — the one bookkeeping phase', () => {
    assert.equal(getModelForPhase('milestone-check'), 'sonnet');
  });

  test('defaults to opus for unknown phase', () => {
    assert.equal(getModelForPhase('nonexistent'), 'opus');
  });

  test('config override takes precedence', () => {
    assert.equal(getModelForPhase('foundation', { foundation: 'sonnet' }), 'sonnet');
    assert.equal(getModelForPhase('story-building', { 'story-building': 'sonnet' }), 'sonnet');
    assert.equal(getModelForPhase('milestone-check', { 'milestone-check': 'opus' }), 'opus');
  });

  test('STATE_TO_MODEL covers all known phases', () => {
    const phases = [
      'seeding', 'analyzing', 'vision-check', 'generating-change-spec',
      'final-review', 'story-building', 'foundation', 'foundation-eval',
      'milestone-check', 'milestone-fix', 'shipping',
    ];
    for (const p of phases) {
      assert.ok(STATE_TO_MODEL[p], `Missing mapping for ${p}`);
    }
  });
});
