const { test, describe } = require('node:test');
const assert = require('node:assert');

const {
  validateHumanResponse,
  VALID_HUMAN_RESPONSE_TYPES,
} = require('../../src/launcher/rouge-loop.js');

describe('validateHumanResponse', () => {
  test('accepts a minimal valid response with just type', () => {
    const r = validateHumanResponse({ type: 'guidance' });
    assert.equal(r.ok, true);
  });

  test('accepts a full response with type + submitted_at + text', () => {
    const r = validateHumanResponse({
      type: 'manual-fix-applied',
      submitted_at: '2026-04-18T12:00:00Z',
      text: 'patched the regex',
    });
    assert.equal(r.ok, true);
  });

  test('accepts every enum value in VALID_HUMAN_RESPONSE_TYPES', () => {
    for (const t of VALID_HUMAN_RESPONSE_TYPES) {
      const r = validateHumanResponse({ type: t });
      assert.equal(r.ok, true, `expected "${t}" to validate`);
    }
  });

  test('accepts the hand-off + resume-after-handoff pair', () => {
    // These drive the direct Claude Code hand-off flow — the user
    // runs `rouge resume-escalation <slug>` in their terminal and
    // works through the problem there. The enum pair is load-bearing.
    assert.equal(validateHumanResponse({ type: 'hand-off' }).ok, true);
    assert.equal(validateHumanResponse({ type: 'resume-after-handoff' }).ok, true);
    assert.equal(
      validateHumanResponse({
        type: 'resume-after-handoff',
        text: 'Fixed the regex; see commit abc1234',
        submitted_at: '2026-04-18T12:00:00Z',
      }).ok,
      true,
    );
  });

  test('rejects null and undefined', () => {
    assert.equal(validateHumanResponse(null).ok, false);
    assert.equal(validateHumanResponse(undefined).ok, false);
  });

  test('rejects arrays (not an object)', () => {
    const r = validateHumanResponse(['guidance']);
    assert.equal(r.ok, false);
    assert.match(r.reason, /object/);
  });

  test('rejects strings and numbers', () => {
    assert.equal(validateHumanResponse('guidance').ok, false);
    assert.equal(validateHumanResponse(42).ok, false);
  });

  test('rejects missing type', () => {
    const r = validateHumanResponse({ text: 'no type' });
    assert.equal(r.ok, false);
    assert.match(r.reason, /type/);
  });

  test('rejects non-string type', () => {
    const r = validateHumanResponse({ type: 123 });
    assert.equal(r.ok, false);
    assert.match(r.reason, /type/);
  });

  test('rejects unknown type', () => {
    const r = validateHumanResponse({ type: 'made-up-action' });
    assert.equal(r.ok, false);
    assert.match(r.reason, /made-up-action/);
  });

  test('rejects non-ISO submitted_at', () => {
    const r = validateHumanResponse({ type: 'guidance', submitted_at: 'not a date' });
    assert.equal(r.ok, false);
    assert.match(r.reason, /submitted_at/);
  });

  test('rejects numeric submitted_at', () => {
    const r = validateHumanResponse({ type: 'guidance', submitted_at: 1700000000 });
    assert.equal(r.ok, false);
  });

  test('rejects non-string text', () => {
    const r = validateHumanResponse({ type: 'guidance', text: { body: 'no' } });
    assert.equal(r.ok, false);
    assert.match(r.reason, /text/);
  });
});
