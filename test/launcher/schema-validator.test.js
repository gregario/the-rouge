const { test, describe } = require('node:test');
const assert = require('node:assert');

const { validate } = require('../../src/launcher/schema-validator.js');

describe('schema-validator', () => {
  test('valid V3 state passes', () => {
    const state = {
      current_state: 'story-building',
      cycle_number: 3,
      milestones: [
        { name: 'foundation', status: 'complete', stories: [{ id: 's1', status: 'done' }] },
      ],
    };
    const result = validate('state.json', state, 'unit test');
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  test('state with V2 enum value warns but does not throw', () => {
    const state = { current_state: 'qa-gate' }; // Removed in V3
    const result = validate('state.json', state, 'unit test');
    // Warn-only: invalid but no throw. The function returns
    // { valid: false, errors: [...] } and the caller decides.
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
    assert.match(result.errors[0], /current_state/);
  });

  test('state without current_state fails validation', () => {
    const result = validate('state.json', { cycle_number: 1 }, 'unit test');
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => /current_state/.test(e)));
  });

  test('state with unknown extra fields is tolerated (additionalProperties: true)', () => {
    const state = {
      current_state: 'ready',
      cycle_number: 0,
      _my_experimental_field: 'whatever',
      some_v4_feature: { nested: true },
    };
    const result = validate('state.json', state, 'unit test');
    assert.equal(result.valid, true);
  });

  test('unknown schema name is a no-op (returns valid)', () => {
    const result = validate('not-a-real-schema.json', { anything: true }, 'unit test');
    assert.equal(result.valid, true);
  });

  test('escalations array tolerates missing classification/summary', () => {
    const state = {
      current_state: 'escalation',
      escalations: [
        { id: 'e1', status: 'pending' },
        { id: 'e2', status: 'resolved', classification: 'test_integrity' },
      ],
    };
    const result = validate('state.json', state, 'unit test');
    assert.equal(result.valid, true);
  });
});
