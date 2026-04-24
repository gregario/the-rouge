const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// P1.19 PR 3 on 04-analyzing.md. Higher stakes than retro/docrelease:
// the analyzer routes every cycle. Tests lock in the behavioral contract
// the launcher + audit-recommender depend on.

const ANALYZER_PATH = path.join(__dirname, '..', '..', 'src', 'prompts', 'loop', '04-analyzing.md');
const ANALYZER = fs.readFileSync(ANALYZER_PATH, 'utf8');

describe('04-analyzing.md behavioral contract', () => {
  test('writes analysis_recommendation', () => {
    assert.ok(ANALYZER.includes('analysis_recommendation'));
  });

  test('preserves capability-check integration (Step 0, P1.21)', () => {
    assert.ok(/Step 0|Capability screen/i.test(ANALYZER));
    assert.ok(/capability_assessments/.test(ANALYZER));
    assert.ok(/capability_feasible/.test(ANALYZER));
    assert.ok(/capability_gap_findings/.test(ANALYZER));
  });

  test('preserves the five capability signals', () => {
    for (const signal of ['Stack capability', 'Integration availability', 'File surface', 'Budget remaining', 'Recurrence']) {
      assert.ok(ANALYZER.includes(signal), `missing capability signal: ${signal}`);
    }
  });

  test('preserves the capability-gap routing rule (→ notify-human, not milestone-fix)', () => {
    // Hard-failure-to-preserve: if this rule gets softened, capability-
    // gap findings leak into milestone-fix → endless-loop regressions.
    assert.ok(
      /notify-human.*capability-gap|capability-gap.*notify-human/is.test(ANALYZER),
      'capability-gap findings must still route to notify-human'
    );
    // The specific instruction that milestone-fix cannot take these must
    // survive in some form.
    assert.ok(
      /milestone-fix cannot route|stop at notify-human|do not route to milestone-fix/i.test(ANALYZER),
      'must explicitly block capability-gap findings from reaching milestone-fix'
    );
  });

  test('preserves confidence_adjusted threshold rule', () => {
    assert.ok(/confidence_adjusted/.test(ANALYZER));
    assert.ok(/env_limited/.test(ANALYZER));
  });

  test('preserves root-cause classification + recommendation verbs', () => {
    // These are the discrete recommendation options the launcher routes on.
    for (const verb of ['PROMOTE', 'DEEPEN', 'BROADEN', 'NOTIFY-HUMAN', 'ROLLBACK', 'INSERT-FOUNDATION', 'PARTIAL-SHIP']) {
      assert.ok(ANALYZER.includes(verb), `missing recommendation verb: ${verb}`);
    }
  });

  test('preserves audit-recommender fallback field (root_cause)', () => {
    // audit-recommender.js reads analysis_recommendation.root_cause as
    // fallback; if the prompt stops producing it, the backstop breaks.
    assert.ok(/root_cause/.test(ANALYZER));
  });

  test('preserves mid-loop diagnostic + circuit breaker', () => {
    assert.ok(/mid_loop_correction|MID-LOOP DIAGNOSTIC|circuit breaker/i.test(ANALYZER));
  });

  test('preserves foundation-scope output for insert-foundation path', () => {
    assert.ok(/foundation_scope/.test(ANALYZER));
  });
});

describe('04-analyzing.md Opus 4.7 modernization', () => {
  test('no "think step by step" scaffolding', () => {
    assert.ok(!/think step by step/i.test(ANALYZER));
  });

  test('no "reason carefully" scaffolding', () => {
    assert.ok(!/reason carefully/i.test(ANALYZER));
  });

  test('no "IMPORTANT:" / "CRITICAL:" / "URGENT:" / "YOU MUST" as emphatic prefixes', () => {
    // "CRITICAL" still appears as a severity level (valid). Test the
    // shouty-prefix form specifically: the word followed by colon.
    assert.ok(!/\bIMPORTANT:/.test(ANALYZER), 'remove IMPORTANT: prefix');
    assert.ok(!/\bURGENT:/.test(ANALYZER), 'remove URGENT: prefix');
    assert.ok(!/YOU MUST/.test(ANALYZER), 'remove YOU MUST directive');
  });

  test('no "do NOT" all-caps hedges in prose', () => {
    // Allow "Do NOT" inside guard clauses (contract-validation test
    // allows these), but flag when the rest of the prose uses capitalised
    // NOT for emphasis. Search for "do NOT" with any case-sensitive NOT.
    // Two known instances were rewritten in this PR; regression would
    // re-introduce them.
    const shouty = ANALYZER.match(/\bdo NOT\b/g) || [];
    // The legitimate survivors are guard clauses in contract-skip lines
    // which the contract-validation test allows. For this prompt, zero
    // is fine after modernization.
    assert.equal(shouty.length, 0, 'no "do NOT" emphasis should remain');
  });

  test('uses "Scope Boundary" framing (renamed from "What You Do NOT Do")', () => {
    assert.ok(/Scope Boundary/.test(ANALYZER));
    assert.ok(!/## What You Do NOT Do/.test(ANALYZER), 'old heading should be gone');
  });

  test('scope boundary keeps "recommend, don\'t execute" guarantee', () => {
    // Load-bearing: if a future edit softens this, the analyzer could
    // drift into committing code.
    assert.ok(
      /Recommend; don't execute|Recommend, don't execute|analyze and recommend|recommend.*downstream|downstream phases? execute/i.test(ANALYZER),
      'must keep recommend-not-execute scope'
    );
  });

  test('scope boundary keeps vision-flag-not-rewrite rule', () => {
    assert.ok(
      /Flag vision|vision concerns|vision.*notify-human|don't rewrite the vision/i.test(ANALYZER),
      'must keep "flag vision via notify-human, not rewrite" rule'
    );
  });

  test('scope boundary keeps "classify every gap" rule', () => {
    assert.ok(
      /Classify every gap|Every quality gap|nothing gets silently dropped|every gap.*classification/i.test(ANALYZER),
      'must keep "classify every gap, silent omission erases signal" rule'
    );
  });

  test('anti-patterns section preserved (this is legitimately negative prose)', () => {
    // Anti-patterns are a list of things-to-avoid. Reframing them to
    // positive framings would lose their purpose. Ensure the section
    // is still there and still contains its load-bearing warnings.
    assert.ok(/## Anti-Patterns/.test(ANALYZER));
    assert.ok(/Surface-level classification/i.test(ANALYZER));
    assert.ok(/Optimistic promotion/i.test(ANALYZER));
  });
});
