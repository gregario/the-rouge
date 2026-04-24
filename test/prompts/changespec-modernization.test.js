const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// P1.19 PR 5 on 05-change-spec-generation.md.

const CS_PATH = path.join(__dirname, '..', '..', 'src', 'prompts', 'loop', '05-change-spec-generation.md');
const CS = fs.readFileSync(CS_PATH, 'utf8');

describe('05-change-spec-generation.md behavioral contract', () => {
  test('writes change_specs_pending output field (launcher reads this)', () => {
    assert.ok(CS.includes('change_specs_pending'));
  });

  test('reads analysis_result.change_spec_briefs', () => {
    assert.ok(CS.includes('change_spec_briefs'));
  });

  test('reads do_not_repeat field for each brief', () => {
    assert.ok(CS.includes('do_not_repeat'));
  });

  test('preserves task_ledger.json append-only write rule', () => {
    assert.ok(/task_ledger\.json/.test(CS));
    assert.ok(/append|Append/.test(CS));
    assert.ok(/never overwrite|not overwrite/i.test(CS));
  });

  test('preserves six-section Depth Standards', () => {
    for (const section of ['Gap Evidence', 'Target State', 'Design Requirements', 'Acceptance Criteria', 'Scope Boundary', 'Root Cause Context']) {
      assert.ok(CS.includes(section), `missing depth-standards section: ${section}`);
    }
  });

  test('preserves OpenSpec CLI usage', () => {
    assert.ok(/openspec new change|openspec instructions/.test(CS));
  });

  test('preserves priority classification (Critical / High / Medium / Low)', () => {
    for (const p of ['Critical', 'High', 'Medium', 'Low']) {
      assert.ok(CS.includes(`**${p}**`), `missing priority: ${p}`);
    }
  });

  test('preserves requires_design_mode signal', () => {
    assert.ok(CS.includes('requires_design_mode'));
  });

  test('preserves state transition to story-building', () => {
    assert.ok(/story-building/.test(CS));
  });
});

describe('05-change-spec-generation.md Opus 4.7 modernization', () => {
  test('no "think step by step" scaffolding', () => {
    assert.ok(!/think step by step/i.test(CS));
  });

  test('no "reason carefully" scaffolding', () => {
    assert.ok(!/reason carefully/i.test(CS));
  });

  test('no shouty prefixes (IMPORTANT: / URGENT: / YOU MUST / MUST NOT)', () => {
    assert.ok(!/\bIMPORTANT:/.test(CS));
    assert.ok(!/\bURGENT:/.test(CS));
    assert.ok(!/YOU MUST/.test(CS));
    assert.ok(!/MUST NOT/.test(CS));
  });

  test('no "do NOT" / "Do NOT" / "DO NOT" emphasis', () => {
    const shouty = CS.match(/\bdo NOT\b|\bDo NOT\b|\bDO NOT\b/g) || [];
    assert.equal(shouty.length, 0);
  });

  test('no "ANY" / "SINGLE" / "ONE" all-caps emphasis for single-word stress', () => {
    // Allow "ONE" as part of proper nouns or code constants — check bare
    // standalone emphasis patterns.
    assert.ok(!/\bin a SINGLE\b/.test(CS), 'SINGLE emphasis should be softened');
    assert.ok(!/\bif ANY\b/.test(CS), 'ANY emphasis should be softened');
  });

  test('uses "Scope Boundary" framing (renamed from "What You Do NOT Do")', () => {
    assert.ok(/## Scope Boundary/.test(CS));
    assert.ok(!/## What You Do NOT Do/.test(CS));
  });

  test('scope boundary keeps "write specs, don\'t implement" rule', () => {
    assert.ok(
      /Write specs;? (the )?building phase writes code|write specs.*not code|specs.*building phase implements/i.test(CS),
      'scope boundary must keep specs-not-code rule'
    );
  });

  test('scope boundary keeps "vision conflicts escalate" rule', () => {
    assert.ok(
      /Operate within the vision|Fundamental vision conflicts escalate|within the vision.*escalate|vision changes.*human/i.test(CS),
      'scope boundary must keep vision-conflicts-escalate rule'
    );
  });

  test('scope boundary keeps do_not_repeat enforcement', () => {
    const scopeIdx = CS.indexOf('## Scope Boundary');
    const endIdx = CS.indexOf('---', scopeIdx);
    const scopeSection = CS.slice(scopeIdx, endIdx > -1 ? endIdx : undefined);
    assert.ok(
      /do_not_repeat|failed approach|approaches that already failed|skip the ones that already failed/i.test(scopeSection),
      'scope boundary must explicitly handle do_not_repeat'
    );
  });

  test('anti-patterns section preserved', () => {
    assert.ok(/## Anti-Patterns/.test(CS));
    for (const ap of ['Copy-pasting', 'MEASUREMENT', 'do_not_repeat', 'giant change spec', 'Underspecifying']) {
      assert.ok(CS.includes(ap), `missing anti-pattern reference: ${ap}`);
    }
  });
});
