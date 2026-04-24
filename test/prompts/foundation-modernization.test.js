const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// P1.19 PR 7 on 00-foundation-building.md.
//
// Design note: this prompt carries THREE safety blocks where emphatic
// register ("CRITICAL", "NEVER", "Do NOT") is intentionally preserved
// because each is tied to a specific destroyed-production or integrity
// incident. The modernization softens stylistic emphasis elsewhere
// while keeping the three load-bearing blocks intact:
//
//   1. ISOLATION RULES (destroyed mtgordle — force-push / resource adoption)
//   2. HARD BLOCK rule + silent-degradation list (Capability Avoidance Problem)
//   3. "Do NOT delete failing tests. That is fraud." (integrity rule)

const FN_PATH = path.join(__dirname, '..', '..', 'src', 'prompts', 'loop', '00-foundation-building.md');
const FN = fs.readFileSync(FN_PATH, 'utf8');

describe('00-foundation-building.md behavioral contract', () => {
  test('writes every required output field', () => {
    for (const field of ['deployment_url', 'implemented', 'skipped', 'divergences', 'factory_decisions', 'factory_questions', 'foundation_completion']) {
      assert.ok(FN.includes(field), `missing required output field: ${field}`);
    }
  });

  test('reads foundation_spec with scope + acceptance_criteria + integration_manifest', () => {
    assert.ok(FN.includes('foundation_spec'));
    assert.ok(/foundation_spec\.scope/.test(FN));
    assert.ok(/foundation_spec\.acceptance_criteria/.test(FN));
    assert.ok(/foundation_spec\.integration_manifest/.test(FN));
  });

  test('preserves silent-degradation list (Capability Avoidance Problem)', () => {
    assert.ok(/Capability Avoidance Problem/.test(FN));
    for (const substitution of ['map with a table', 'photos with emoji', 'OAuth flow with a hardcoded token', 'payment integration with a "pretend to charge"']) {
      assert.ok(FN.includes(substitution), `missing silent-degradation anti-pattern: ${substitution}`);
    }
  });

  test('preserves HARD BLOCK rule (emphatic by design)', () => {
    // This safety rule keeps its emphatic register — tied to the
    // Capability Avoidance Problem, a documented failure class.
    assert.ok(/HARD BLOCK\. Do NOT substitute\. Do NOT degrade\./.test(FN),
      'HARD BLOCK line must stay emphatic — it\'s a load-bearing safety rule');
  });

  test('preserves integrity rule: "Do NOT delete failing tests. That is fraud."', () => {
    assert.ok(/Do NOT delete failing tests\. That is fraud\./.test(FN),
      'test-deletion integrity rule must stay emphatic');
  });

  test('preserves ISOLATION RULES block with destroyed-mtgordle context', () => {
    // Emphatic register here is load-bearing — the rules prevented a
    // real production-destroying incident and must continue to trigger
    // maximum caution.
    assert.ok(/## CRITICAL: ISOLATION RULES \(NEVER VIOLATE\)/.test(FN),
      'ISOLATION RULES heading must stay emphatic');
    assert.ok(/destroyed a shipped product's infrastructure|destroyed mtgordle's history/i.test(FN),
      'must retain the destroyed-mtgordle context so the rules\'s rationale is on-site');
    assert.ok(/NEVER adopt existing Vercel/.test(FN));
    assert.ok(/NEVER run `git push --force`/.test(FN));
    assert.ok(/ALWAYS create NEW infrastructure/.test(FN));
  });

  test('preserves foundation scope boundary rule (scope creep → 0 delta spin)', () => {
    assert.ok(/0 delta|spin detection|scope creep/i.test(FN));
    assert.ok(/NEVER implement stories from the task ledger/.test(FN),
      'scope-creep rule stays emphatic — tied to documented spin-detector incidents');
  });

  test('preserves production-deploys-are-out-of-scope guarantee', () => {
    assert.ok(/Staging only|staging only|production deploys|Deploying to production\.? Never/i.test(FN));
  });

  test('preserves factory_questions escalation path for blockers', () => {
    assert.ok(/factory_questions/.test(FN));
    assert.ok(/"severity":\s*"blocking"|severity.*blocking/.test(FN));
  });
});

describe('00-foundation-building.md Opus 4.7 modernization', () => {
  test('no "think step by step" scaffolding', () => {
    assert.ok(!/think step by step/i.test(FN));
  });

  test('no "reason carefully" scaffolding', () => {
    assert.ok(!/reason carefully/i.test(FN));
  });

  test('no "YOU MUST" emphatic directives', () => {
    assert.ok(!/YOU MUST/.test(FN));
  });

  test('purely stylistic "MUST NOT" / emphatic capitals softened', () => {
    // The safety-block MUST NOT / NEVER / "Do NOT" usages are preserved
    // intentionally. Stylistic ones (static-export scaffold list, "do
    // not assume Supabase", step 11 operational list, Scope Boundary
    // section heading) should be reframed.
    assert.ok(!/MUST NOT scaffold for a static-export target/.test(FN),
      '"MUST NOT scaffold" → "skips" should be softened');
  });

  test('uses "Foundation Scope Boundary" framing (renamed from "What You Do NOT Build")', () => {
    assert.ok(/## Foundation Scope Boundary/.test(FN));
    assert.ok(!/## What You Do NOT Build/.test(FN));
  });

  test('Step 11 operational items reframed to positive directives', () => {
    // Items 5/6/7 of Step 11 were three "Do NOT" directives; modernized
    // to positive leads.
    assert.ok(/Write only to `cycle_context\.json` for state/.test(FN),
      'Step 11 item 5 should be positive framing');
    assert.ok(/Skip PR creation|PR creation.*ship-promote/.test(FN),
      'Step 11 item 6 should be positive framing');
    assert.ok(/Report results;|Runner's job|phase routing is the Runner/.test(FN),
      'Step 11 item 7 should be positive framing');
  });

  test('anti-patterns section preserved (list of named failure modes)', () => {
    assert.ok(/## Anti-Patterns/.test(FN));
    for (const ap of ['while I\'m in the neighbourhood', 'simpler integration', 'add auth later', 'add tests later', 'Mega-commits']) {
      assert.ok(FN.includes(ap), `missing anti-pattern: ${ap}`);
    }
  });

  test('Supabase-default-assumption line reframed to provider-agnostic', () => {
    // "Do NOT assume Supabase" → "each project names its own provider"
    assert.ok(/each project names its own provider|provider-appropriate commands/i.test(FN),
      'Supabase-default line must be reframed to provider-agnostic guidance');
  });

  test('branch-creation instruction reframed', () => {
    assert.ok(/launcher has already checked out/.test(FN));
    assert.ok(!/Do NOT create a new branch/.test(FN),
      'branch instruction should be softened (safety isn\'t tied to a specific incident here)');
  });
});
