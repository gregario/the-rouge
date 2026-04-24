const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// P1.19 PR 20 on 06-vision-check.md.
//
// Judge-side: strategic-alignment phase. This is where auto-scope-
// expansion can happen (confidence > 0.8 adds capabilities to the
// queue autonomously) AND where pivot proposals are surfaced to the
// human. The confidence thresholds are calibration surfaces — drift
// here changes how autonomously Rouge expands scope and how often it
// escalates pivots. Modernization softens stylistic emphasis while
// keeping:
//   (a) Bezos + Chesky Latent Space Activation (Rouge taste ethos),
//   (b) the 3-tier confidence ladder for scope expansion,
//   (c) the trajectory enum (converging / stable / drifting /
//       diverging),
//   (d) the trend-tracking rules (3-cycle decline + 5-cycle plateau
//       bands),
//   (e) the "pivot ALWAYS human decision" rule, preserved emphatic
//       twice (main phase + scope boundary) on purpose.

const VC_PATH = path.join(__dirname, '..', '..', 'src', 'prompts', 'loop', '06-vision-check.md');
const VC = fs.readFileSync(VC_PATH, 'utf8');

describe('06-vision-check.md Rouge taste ethos + identity', () => {
  test('preserves Latent Space Activation with Bezos + Chesky', () => {
    assert.ok(/Jeff Bezos writing the 6-page memo|work backward from the customer/i.test(VC),
      'Bezos framing');
    assert.ok(/Brian Chesky.*11-star experience|11-star experience/.test(VC),
      'Chesky framing');
  });

  test('preserves strategic-compass identity', () => {
    assert.ok(/strategic compass that catches drift/.test(VC));
    assert.ok(/trajectory/.test(VC));
    assert.ok(/converging on the vision or drifting away/.test(VC));
  });

  test('differentiates from PO-reviewer role explicitly', () => {
    // Rubric-calibration: vision-check is NOT quality review. This
    // differentiation prevents scope creep where vision-check starts
    // judging quality and shadowing the PO reviewer.
    assert.ok(/that is the PO reviewer's job/.test(VC));
  });
});

describe('06-vision-check.md behavioral contract (calibration surfaces)', () => {
  test('writes vision_check_results with full alignment-assessment shape', () => {
    assert.ok(VC.includes('vision_check_results'));
    assert.ok(VC.includes('vision_alignment'));
    for (const dim of ['core_promise_delivery', 'persona_fit', 'identity_consistency']) {
      assert.ok(VC.includes(dim), `missing alignment dimension: ${dim}`);
    }
    for (const field of ['score', 'evidence', 'overall_confidence', 'trajectory', 'summary']) {
      assert.ok(VC.includes(field), `missing alignment field: ${field}`);
    }
  });

  test('trajectory enum: converging | stable | drifting | diverging', () => {
    // This 4-state enum is calibration — any drift in the labels
    // silently changes how trend decline is classified.
    assert.ok(/converging \| stable \| drifting \| diverging/.test(VC));
  });

  test('preserves the three-tier scope-expansion confidence ladder', () => {
    // These thresholds control whether vision-check can auto-add to
    // the feature queue. Calibration drift here changes how aggressive
    // Rouge is about autonomous scope expansion.
    assert.ok(/Confidence > 0\.8.*automatically|automatically.*Confidence > 0\.8/is.test(VC));
    assert.ok(/Confidence 0\.7[–-]0\.8.*Flag in `cycle_context\.json`/.test(VC));
    assert.ok(/Confidence < 0\.7.*Escalate|Escalate.*Confidence < 0\.7/is.test(VC));
    // Names the specific output fields each tier writes to.
    assert.ok(VC.includes('vision_check_additions'));
    assert.ok(VC.includes('vision_check_flagged'));
  });

  test('preserves the scope-expansion-vs-quality-gap distinction', () => {
    // Rubric-definition: scope expansion is for MISSING capabilities,
    // not polish. If this softens, vision-check starts injecting
    // polish items into the feature queue.
    assert.ok(/Scope expansion is for MISSING capabilities, not polish/.test(VC),
      'MISSING-vs-polish calibration rule stays emphatic');
    assert.ok(/log it in `evaluator_observations`, not here/.test(VC));
  });

  test('preserves pivot_proposal shape with all seven fields', () => {
    // The pivot-proposal contract is what the human reviews.
    for (const field of ['trigger', 'evidence', 'original_premise', 'challenge', 'suggested_direction', 'confidence', 'urgency']) {
      assert.ok(VC.includes(field), `missing pivot_proposal field: ${field}`);
    }
    assert.ok(/"immediate \| next_cycle \| when_convenient"/.test(VC));
  });

  test('pivot is ALWAYS a human decision (rule preserved twice — main + scope boundary)', () => {
    // Load-bearing: any drift here lets vision-check auto-pivot,
    // which would be catastrophic. Stated twice on purpose.
    const hits = VC.match(/A pivot is ALWAYS a human decision/g) || [];
    assert.equal(hits.length, 2,
      'the pivot-human-gating rule is preserved in both the main phase prose and the Scope Boundary');
    assert.ok(/needs_human_review: true/.test(VC));
  });

  test('preserves the trend-tracking bands (3-cycle decline + 5-cycle plateau)', () => {
    // These are the trend calibration windows. Widening them reduces
    // sensitivity to quality drift; narrowing them increases false
    // positives.
    assert.ok(/3-cycle declining trend/.test(VC));
    assert.ok(/5-cycle plateau/.test(VC));
    assert.ok(/within ±0\.05 for 5 consecutive checks/.test(VC));
    // Plateau tier-bands:
    assert.ok(/plateau at high confidence \(>0\.85\)/.test(VC));
    assert.ok(/plateau at medium confidence \(0\.6[–-]0\.85\)/.test(VC));
    assert.ok(/plateau at low confidence \(<0\.6\)/.test(VC));
  });

  test('preserves confidence_history append-only contract', () => {
    assert.ok(VC.includes('confidence_history'));
    assert.ok(/Append to `confidence_history` array/.test(VC));
  });

  test('reads the full cycle_context input set', () => {
    for (const field of ['vision', 'implemented', 'previous_cycles', 'factory_decisions', 'factory_questions', 'evaluator_observations']) {
      assert.ok(VC.includes(field), `missing cycle_context input: ${field}`);
    }
    // Evaluation-report subfields.
    assert.ok(/evaluation_report\.po\.confidence/.test(VC));
    assert.ok(/evaluation_report\.po\.quality_gaps/.test(VC));
  });

  test('reads journey.json + global_improvements.json from project root', () => {
    assert.ok(VC.includes('journey.json'));
    assert.ok(VC.includes('global_improvements.json'));
    assert.ok(/File may not exist if no global improvements have been identified yet/.test(VC));
  });

  test('V3 Phase Contract marker present', () => {
    assert.ok(/V3 Phase Contract/.test(VC));
  });
});

describe('06-vision-check.md Opus 4.7 modernization', () => {
  test('no "think step by step" scaffolding', () => {
    assert.ok(!/think step by step/i.test(VC));
  });

  test('no "reason carefully" scaffolding', () => {
    assert.ok(!/reason carefully/i.test(VC));
  });

  test('no "CRITICAL:" / "IMPORTANT:" / "URGENT:" / "YOU MUST" emphatic prefixes', () => {
    assert.ok(!/\bCRITICAL:/.test(VC));
    assert.ok(!/\bIMPORTANT:/.test(VC));
    assert.ok(!/\bURGENT:/.test(VC));
    assert.ok(!/YOU MUST/.test(VC));
  });

  test('no "MUST" all-caps / non-negotiable emphasis', () => {
    assert.ok(!/\bMUST\b/.test(VC));
    assert.ok(!/non-negotiable/.test(VC));
  });

  test('"Do NOT try to fix global improvements" softened to positive framing', () => {
    assert.ok(!/Do NOT try to fix global improvements/.test(VC));
    assert.ok(/Surface them as alignment evidence rather than attempting fixes/.test(VC));
    // Rationale preserved: final-review addresses improvements, this
    // phase reports strategic impact.
    assert.ok(/the final-review phase addresses the improvements themselves, this phase reports the strategic impact/.test(VC));
  });

  test('uses "Scope Boundary" framing (renamed from "What You Do NOT Do")', () => {
    assert.ok(/## Scope Boundary/.test(VC));
    assert.ok(!/## What You Do NOT Do/.test(VC));
    const section = VC.split('## Scope Boundary')[1];
    // Five positive-lead bullets covering the original five "You do
    // not X" rules.
    assert.ok(/PO reviewer owns quality/.test(section),
      'PO-quality-ownership boundary preserved');
    assert.ok(/surface evidence|Surface evidence/.test(section));
    assert.ok(/never auto-pivots|the human decides/i.test(section));
    assert.ok(/CLI tools directly|slash commands belong to interactive skills/.test(section));
    assert.ok(/launcher handles phase routing/.test(section));
    assert.ok(!/You do not/.test(section),
      'no leftover "You do not" bullets after reframe');
  });

  test('"pivot is ALWAYS a human decision" emphasis preserved by design', () => {
    // This is the only ALWAYS caps surviving — it's the pivot-human-
    // gating rule, tied to preventing autonomous pivots. Preserved
    // emphatic like other incident-tied integrity rules across the
    // sweep (e.g. ISOLATION RULES in the building prompt).
    assert.ok(/ALWAYS a human decision/.test(VC));
  });

  test('preserved-by-design Do-NOT count == 0 (global-improvements "Do NOT" softened)', () => {
    const hits = VC.match(/\b[dD]o NOT\b/g) || [];
    assert.equal(hits.length, 0,
      'no "Do NOT" emphasis survives — global-improvements rule softened, ALWAYS caps on pivot survives separately');
  });
});
