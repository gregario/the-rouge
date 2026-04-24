const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// P1.19 PR 4 on 03-qa-fixing.md.

const QAFIX_PATH = path.join(__dirname, '..', '..', 'src', 'prompts', 'loop', '03-qa-fixing.md');
const QAFIX = fs.readFileSync(QAFIX_PATH, 'utf8');

describe('03-qa-fixing.md behavioral contract', () => {
  test('writes qa_fix_results to cycle_context', () => {
    assert.ok(QAFIX.includes('qa_fix_results'));
  });

  test('qa_fix_results includes criteria_fixed / criteria_escalated / criteria_skipped', () => {
    assert.ok(QAFIX.includes('criteria_fixed'));
    assert.ok(QAFIX.includes('criteria_escalated'));
    assert.ok(QAFIX.includes('criteria_skipped'));
  });

  test('writes escalation_needed flag', () => {
    assert.ok(QAFIX.includes('escalation_needed'));
  });

  test('updates retry_counts with per-attempt history', () => {
    assert.ok(QAFIX.includes('retry_counts'));
    assert.ok(QAFIX.includes('attempts'));
    assert.ok(/what_tried/.test(QAFIX));
  });

  test('three-strikes escalation rule preserved (attempts >= 3)', () => {
    assert.ok(/attempts >= 3|3 times|Three strikes|3 attempts/i.test(QAFIX));
  });

  test('preserves TDD contract (test fails before fix, passes after)', () => {
    assert.ok(
      /test that fails before the fix and passes after|fails before the fix|TDD/i.test(QAFIX),
      'must keep the "fix ships with a test that failed before" TDD contract'
    );
  });

  test('preserves atomic-commit-per-criterion rule', () => {
    assert.ok(/single atomic commit|atomic commit|Each (?:fix|criterion) (?:is|gets) (?:its own|atomic)/i.test(QAFIX));
  });

  test('preserves regression-test auto-generation', () => {
    assert.ok(/regression_test|regression test/i.test(QAFIX));
    assert.ok(/REGRESSION:/.test(QAFIX));
  });

  test('preserves blast-radius-check step', () => {
    assert.ok(/Blast Radius|blast radius/i.test(QAFIX));
  });

  test('preserves staging-only deploy guarantee', () => {
    assert.ok(
      /Staging only|staging only|staging-only|deploy to staging.*production|ship-promote|[sS]taging/.test(QAFIX),
      'must preserve staging-only deploy rule'
    );
  });
});

describe('03-qa-fixing.md Opus 4.7 modernization', () => {
  test('no "think step by step" scaffolding', () => {
    assert.ok(!/think step by step/i.test(QAFIX));
  });

  test('no "reason carefully" scaffolding', () => {
    assert.ok(!/reason carefully/i.test(QAFIX));
  });

  test('no shouty prefixes (IMPORTANT: / CRITICAL: / URGENT: / YOU MUST)', () => {
    assert.ok(!/\bIMPORTANT:/.test(QAFIX));
    assert.ok(!/\bURGENT:/.test(QAFIX));
    assert.ok(!/YOU MUST/.test(QAFIX));
  });

  test('no "do NOT" all-caps emphasis in prose', () => {
    const shouty = QAFIX.match(/\bdo NOT\b|\bDo NOT\b|\bDO NOT\b/g) || [];
    assert.equal(shouty.length, 0, 'all "do NOT" emphasis should be softened to "don\'t"');
  });

  test('uses "Scope Boundary" framing (renamed from "What You Do NOT Do")', () => {
    assert.ok(/## Scope Boundary/.test(QAFIX));
    assert.ok(!/## What You Do NOT Do/.test(QAFIX));
  });

  test('scope boundary keeps "fix what QA flagged; new work elsewhere" rule', () => {
    assert.ok(
      /Fix bugs QA flagged|fix.*QA flagged|new work belongs|log.*factory_question|new features.*other phases/i.test(QAFIX),
      'must keep "fix QA issues only, route new work elsewhere" rule'
    );
  });

  test('scope boundary keeps "restore specified behaviour, no refactoring" rule', () => {
    assert.ok(
      /Restore specified behaviour|don't refactor|No refactoring|correct-but-ugly|refactor/i.test(QAFIX),
      'must keep "no refactoring; PO Review handles quality" rule'
    );
  });

  test('scope boundary keeps staging-only deploy rule', () => {
    // Already asserted at contract level; also assert the scope-
    // boundary section specifically calls it out.
    const scopeIdx = QAFIX.indexOf('## Scope Boundary');
    const endIdx = QAFIX.indexOf('## State Transition', scopeIdx);
    const scopeSection = QAFIX.slice(scopeIdx, endIdx > -1 ? endIdx : undefined);
    assert.ok(
      /staging|production deploys belong|ship-promote/i.test(scopeSection),
      'scope boundary must explicitly limit deploys to staging'
    );
  });

  test('anti-patterns section preserved', () => {
    assert.ok(/## Anti-Patterns/.test(QAFIX));
    for (const ap of ['Shotgun debugging', 'Symptom chasing', 'Scope creep', 'Test-after', 'Mega-commits']) {
      assert.ok(QAFIX.includes(ap), `missing anti-pattern: ${ap}`);
    }
  });
});
