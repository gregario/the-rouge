const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// P1.19 PR 18 on 10-final-review.md.
//
// Judge-side prompt. Final ship-gate — the recommendation enum
// directly decides whether a build ships, refines, or major-reworks.
// This prompt was already written in an Opus-4.7-friendly register
// (no shouty prefixes, no "MUST" caps, no "think step by step"
// scaffolding, Rouge-taste customer-voice throughout). So this PR is
// test-only: zero file changes, comprehensive calibration-surface
// lock-in. Every enum, threshold, Anti-Pattern rule, and output field
// the launcher reads is asserted.

const FR_PATH = path.join(__dirname, '..', '..', 'src', 'prompts', 'loop', '10-final-review.md');
const FR = fs.readFileSync(FR_PATH, 'utf8');

describe('10-final-review.md customer-identity (Rouge taste ethos)', () => {
  test('preserves "You are not a QA engineer" / designer / PO identity triad', () => {
    // This is the customer-voice character of the Final Review.
    // Rubric-ification would convert it back into a QA checklist.
    assert.ok(/You are not a QA engineer/.test(FR));
    assert.ok(/You are not a designer/.test(FR));
    assert.ok(/You are not a product owner/.test(FR));
    assert.ok(/You are a person who found this product/.test(FR));
  });

  test('preserves "Forget the specs. Forget the criteria." poetic framing', () => {
    assert.ok(/Forget the specs\. Forget the criteria\./.test(FR));
  });

  test('preserves no-checklist / no-script directive at review opener', () => {
    assert.ok(/There is no checklist\. There is no script/.test(FR));
  });

  test('preserves the four observation categories with exact labels', () => {
    // The launcher reads these as structured output field names.
    for (const label of ['Polish gaps', 'Rough edges', 'Moments of delight', 'Moments of confusion']) {
      assert.ok(FR.includes(`**${label}**`), `missing observation category: ${label}`);
    }
  });
});

describe('10-final-review.md behavioral contract (calibration surface)', () => {
  test('writes final_review_report (the field the launcher routes on)', () => {
    assert.ok(FR.includes('final_review_report'));
  });

  test('final_review_report carries every field downstream reads', () => {
    for (const field of [
      'production_ready', 'confidence', 'polish_gaps', 'delight_moments',
      'rough_edges', 'overall_impression', 'recommendation',
      'human_feedback_incorporated', 'human_feedback_summary',
      'global_improvements_observed', 'global_improvements_resolved',
    ]) {
      assert.ok(FR.includes(field), `missing final_review_report field: ${field}`);
    }
  });

  test('recommendation enum: ship | refine | major-rework (the three ship-gate states)', () => {
    // rouge-loop.js routes on this — any drift changes what happens
    // after final review.
    assert.ok(/`ship`/.test(FR));
    assert.ok(/`refine`/.test(FR));
    assert.ok(/`major-rework`/.test(FR));
  });

  test('recommendation definitions preserve calibration semantics', () => {
    // The definitions are themselves calibration instruments — the
    // judge uses them to pick the right verdict.
    assert.ok(/ready for production\. Polish gaps are minor and can ship as-is/.test(FR));
    assert.ok(/close but not there\. Specific rough edges need one more pass/.test(FR));
    assert.ok(/fundamental problems with the core experience/.test(FR));
  });

  test('confidence threshold ladder (0.9+ / 0.7-0.9 / below 0.7) preserved', () => {
    // The threshold anchors are the calibration instrument. Drifting
    // them means the same-shaped judgment emits different confidence
    // numbers cycle-over-cycle.
    assert.ok(/0\.9\+ — clearly ready or clearly not/.test(FR));
    assert.ok(/0\.7-0\.9 — ready with reservations, or not ready but close/.test(FR));
    assert.ok(/Below 0\.7 — genuinely uncertain, probably needs human judgment/.test(FR));
  });

  test('reads feedback.json with human-voice framing preserved', () => {
    assert.ok(/feedback\.json/.test(FR));
    assert.ok(/Product Owner's voice|Product Owner's perspective/.test(FR),
      'PO-voice framing defines how human feedback outranks model opinion');
    // Integrity: if feedback.json is absent, the flag must be set
    // false rather than silently assumed true.
    assert.ok(/human_feedback_incorporated: false/.test(FR));
  });

  test('reads global_improvements.json but does not treat it as a checklist', () => {
    // Load-bearing judge-identity rule. If the reviewer starts
    // copy-pasting from global_improvements.json, the phase drifts
    // from customer-voice into auditor-voice.
    assert.ok(/global_improvements\.json/.test(FR));
    assert.ok(/do NOT treat them as a checklist/.test(FR),
      'checklist-avoidance rule stays emphatic — identity-tied');
    assert.ok(/You are still a customer, not an auditor/.test(FR));
  });

  test('reads cycle_context inputs: vision / deployment_url / evaluation_report / previous_cycles / _cycle_number', () => {
    for (const field of ['vision', 'deployment_url', 'evaluation_report', 'previous_cycles', '_cycle_number']) {
      assert.ok(FR.includes(field), `missing input field: ${field}`);
    }
  });

  test('preserves screenshot-cleanliness rule ($B snapshot --reset before capture)', () => {
    // Calibration-adjacent: annotated screenshots bias the review
    // toward seeing what the annotator flagged. Clean screenshots
    // preserve customer-eye observation.
    assert.ok(/All screenshots must be clean/.test(FR));
    assert.ok(/no element annotations, no red bounding boxes/.test(FR));
    assert.ok(/\$B snapshot --reset/.test(FR));
  });

  test('preserves screenshot directory convention', () => {
    assert.ok(/screenshots\/cycle-\$\{CYCLE\}\/final-review/.test(FR));
  });

  test('commit message template names recommendation inline', () => {
    assert.ok(/eval\(final-review\): production readiness — \$\{RECOMMENDATION\}/.test(FR));
  });

  test('V3 Phase Contract marker present', () => {
    assert.ok(/V3 Phase Contract/.test(FR));
  });
});

describe('10-final-review.md Anti-Patterns (calibration-drift regression catchers)', () => {
  test('preserves all six "Never" rules verbatim', () => {
    // Every rule here defends a specific calibration-drift mode.
    // Softening any of them weakens the judgment instrument.
    for (const rule of [
      'Never follow a checklist',
      'Never reference spec criteria by ID',
      'Never be mechanical',
      'Never modify production code',
      'Never ignore human feedback',
      'Never inflate confidence',
    ]) {
      assert.ok(FR.includes(rule), `missing Anti-Pattern rule: ${rule}`);
    }
  });

  test('Anti-Pattern "Never" count asserted == 6 (regression catcher)', () => {
    const hits = FR.match(/- \*\*Never /g) || [];
    assert.equal(hits.length, 6,
      'exactly 6 "Never X" Anti-Pattern rules expected');
  });

  test('preserves confidence-asymmetry reasoning', () => {
    // Specific incident-class rationale: overconfident ship wastes a
    // production deploy; cautious refine wastes only one cycle. The
    // asymmetry is what makes "err toward honesty" calibratable.
    assert.ok(/A confident "ship" on a product that needs work wastes a production deploy/.test(FR));
    assert.ok(/A cautious "refine" on a ready product wastes one cycle/.test(FR));
    assert.ok(/asymmetry favors honesty/.test(FR));
  });

  test('preserves customer-vs-auditor language guidance', () => {
    // Concrete calibration example: "Criterion QA-3 fails" (auditor) vs
    // "I couldn't figure out how to save my settings" (customer).
    assert.ok(/Criterion QA-3 fails/.test(FR));
    assert.ok(/I couldn't figure out how to save my settings/.test(FR));
    assert.ok(/Be the customer/.test(FR));
  });
});

describe('10-final-review.md Opus 4.7 modernization (already-modern: test-only PR)', () => {
  test('no "think step by step" scaffolding', () => {
    assert.ok(!/think step by step/i.test(FR));
  });

  test('no "reason carefully" scaffolding', () => {
    assert.ok(!/reason carefully/i.test(FR));
  });

  test('no "CRITICAL:" / "IMPORTANT:" / "URGENT:" / "YOU MUST" emphatic prefixes', () => {
    assert.ok(!/\bCRITICAL:/.test(FR));
    assert.ok(!/\bIMPORTANT:/.test(FR));
    assert.ok(!/\bURGENT:/.test(FR));
    assert.ok(!/YOU MUST/.test(FR));
  });

  test('no "MUST" all-caps / non-negotiable emphasis', () => {
    assert.ok(!/\bMUST\b/.test(FR));
    assert.ok(!/non-negotiable/.test(FR));
  });

  test('preserved-by-design "do NOT" count is exactly 1 (customer-identity rule)', () => {
    // The single Do NOT in the prompt is the checklist-avoidance rule
    // tied to the customer-not-auditor identity. Anti-Patterns list
    // carries the six "Never" emphases separately.
    const hits = FR.match(/\b[dD]o NOT\b/g) || [];
    assert.equal(hits.length, 1,
      'exactly 1 preserved-by-design "do NOT" emphasis expected (checklist-avoidance)');
    assert.ok(/do NOT treat them as a checklist/.test(FR));
  });
});
