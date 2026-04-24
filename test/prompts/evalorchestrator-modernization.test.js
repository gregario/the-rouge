const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// P1.19 PR 24 on 02-evaluation-orchestrator.md.
//
// Judge-side meta-orchestrator. Coordinates five sub-phases and routes
// failures to one of three downstream phases (milestone-fix /
// analyzing / escalation). Every classification and routing rule is a
// calibration surface. Modernization softens two stylistic patterns
// (MILESTONE caps, IMPORTANT prefix + ALL caps) while keeping the
// six Anti-Pattern "Never" routing rules + three preserved-by-design
// "Do NOT" boundary rules.

const EO_PATH = path.join(__dirname, '..', '..', 'src', 'prompts', 'loop', '02-evaluation-orchestrator.md');
const EO = fs.readFileSync(EO_PATH, 'utf8');

describe('02-evaluation-orchestrator.md identity + scope', () => {
  test('identity: orchestrator, not evaluator', () => {
    assert.ok(/Evaluation Orchestrator/.test(EO));
    assert.ok(/You do NOT evaluate anything yourself/.test(EO),
      'scope-boundary emphasis preserved by design');
    assert.ok(/You sequence four evidence-and-judgment sub-phases/.test(EO));
  });

  test('foundation-vs-milestone routing boundary preserved', () => {
    // The launcher routes between this orchestrator (milestone eval)
    // and 00-foundation-evaluating.md. If this boundary drifts,
    // someone might add foundation logic to this orchestrator.
    assert.ok(/milestone evaluation only/.test(EO));
    assert.ok(/00-foundation-evaluating\.md/.test(EO));
    assert.ok(/launcher routes between/.test(EO));
  });

  test('runs at milestone boundaries, not every cycle', () => {
    assert.ok(/milestone boundaries.*after a batch of stories completes/.test(EO));
  });
});

describe('02-evaluation-orchestrator.md sub-phase architecture (calibration instrument)', () => {
  test('five sub-phases with exact order + prompt-file references', () => {
    // The five rows of the sub-phase table define the evaluation
    // sequence. Any reordering changes evidence→judgment flow.
    assert.ok(/\| 0 \| Test Integrity \| `02a-test-integrity\.md`/.test(EO));
    assert.ok(/\| 1 \| Code Review \| `02c-code-review\.md`/.test(EO));
    assert.ok(/\| 2 \| Product Walk \| `02d-product-walk\.md`/.test(EO));
    assert.ok(/\| 3 \| Evaluation \| `02e-evaluation\.md`/.test(EO));
    assert.ok(/\| 4 \(optional\) \| Re-Walk \| `02f-re-walk\.md`/.test(EO));
  });

  test('evidence-first / judgment-second architecture principle preserved', () => {
    // Philosophy-level calibration. If this softens, the orchestrator
    // could start running the judgment phase before collecting
    // evidence.
    assert.ok(/evidence first, judgment second/.test(EO));
    assert.ok(/Three evidence-collection phases run first/.test(EO));
    assert.ok(/three lenses \(QA \/ Design \/ PO\)/.test(EO));
  });

  test('re-walk triggers only on non-empty re_walk_requests[]', () => {
    assert.ok(/re_walk_requests.*is non-empty/.test(EO));
    assert.ok(/Cap at one re-walk iteration per evaluation run/.test(EO),
      'anti-loop cap preserves the re-walk sub-phase from spinning');
  });

  test('P0.4 language-review dispatch sub-phase (1.5) preserved', () => {
    assert.ok(/#### Sub-Phase 1\.5: Language-specific review/.test(EO));
    assert.ok(/active_spec\.infrastructure\.primary_language/.test(EO));
    assert.ok(/library\/agents\/<primary_language>-reviewer\.md/.test(EO));
    // Four currently-supported languages.
    assert.ok(/typescript.*python.*rust.*golang|typescript.*python.*rust.*golang/.test(EO));
  });
});

describe('02-evaluation-orchestrator.md cycle-type classification (calibration surface)', () => {
  test('four cycle types with exact labels', () => {
    for (const type of ['initial-build', 'feature-build', 'qa-fix', 're-evaluation']) {
      assert.ok(EO.includes(type), `missing cycle_type: ${type}`);
    }
  });

  test('evaluation-tier enum: full | gate', () => {
    assert.ok(/"evaluation_tier": "full \| gate"/.test(EO));
  });

  test('gate-tier PO lens carry-forward rule preserved', () => {
    // Calibration: qa-fix cycles don't re-judge PO; they carry
    // forward. If this softens, qa-fix cycles re-waste full PO
    // judgment.
    assert.ok(/PO lens is skipped.*`evaluation_tier === 'gate'`|evaluation_tier === 'gate'/.test(EO));
    assert.ok(/carries forward `evaluation_report\.po` from the previous full-tier cycle/.test(EO));
  });

  test('qa-fix override rule: >10 files OR non-fix-task modification → upgrade to full', () => {
    assert.ok(/more than 10 files/.test(EO));
    assert.ok(/modifies any file not mentioned in the fix tasks/.test(EO));
    assert.ok(/upgrade to `full` tier/.test(EO));
  });

  test('QA and Design lenses still run in gate tier', () => {
    // Even in qa-fix cycles — functional correctness always matters.
    assert.ok(/QA and Design lenses still run/.test(EO));
    assert.ok(/regardless of cycle type/.test(EO));
  });
});

describe('02-evaluation-orchestrator.md diff-scope + dashboard gates', () => {
  test('diff_scope carries six scope fields', () => {
    for (const field of ['frontend', 'backend', 'prompts', 'tests', 'docs', 'config']) {
      assert.ok(EO.includes(`"${field}":`), `missing diff_scope field: ${field}`);
    }
  });

  test('scope-conditional gate resets preserved (frontend → qa/a11y/design; backend → security)', () => {
    // review-readiness.sh gates re-earn based on diff scope.
    assert.ok(/\[\[ "\$SCOPE_FRONTEND" == "true" \]\] && src\/review-readiness\.sh fail qa_gate/.test(EO));
    assert.ok(/\[\[ "\$SCOPE_FRONTEND" == "true" \]\] && src\/review-readiness\.sh fail a11y_review/.test(EO));
    assert.ok(/\[\[ "\$SCOPE_FRONTEND" == "true" \]\] && src\/review-readiness\.sh fail design_review/.test(EO));
    assert.ok(/\[\[ "\$SCOPE_BACKEND" == "true" \]\] && src\/review-readiness\.sh fail security_review/.test(EO));
  });

  test('gate-tier does NOT reset po_review (carry-forward)', () => {
    assert.ok(/Gate-tier cycles do NOT reset po_review/.test(EO),
      'gate-tier po_review carry-forward emphasis preserved by design');
  });

  test('always-re-earn gates: test_integrity + ai_code_audit', () => {
    assert.ok(/Always re-earn these on every cycle:/.test(EO));
    assert.ok(/for gate in test_integrity ai_code_audit/.test(EO));
  });
});

describe('02-evaluation-orchestrator.md failure-routing table (the core calibration)', () => {
  test('seven routing rules preserved in the Failure Routing table', () => {
    // This is THE routing instrument. Any rule changing destination
    // silently reroutes failure classes.
    assert.ok(/Test Integrity.*milestone-fix/.test(EO));
    assert.ok(/CRITICAL security finding.*milestone-fix/.test(EO));
    assert.ok(/Functional bugs.*milestone-fix/.test(EO));
    assert.ok(/a11y failures.*milestone-fix/.test(EO));
    assert.ok(/Quality gaps \(NEEDS_IMPROVEMENT\).*analyzing/.test(EO));
    assert.ok(/NOT_READY \+ rollback.*analyzing/.test(EO));
    assert.ok(/NOT_READY \+ notify-human.*escalation/.test(EO));
  });

  test('next_phase routing rules preserved with matching output shapes', () => {
    assert.ok(/next_phase: "analyzing"/.test(EO));
    assert.ok(/next_phase: "milestone-fix"/.test(EO));
    assert.ok(/next_phase: "escalation"/.test(EO));
    // fix_tasks extraction source.
    assert.ok(/fix_tasks.*evaluation_report\.qa\.fix_tasks|fix_tasks.*evaluation_report\.design\.fix_tasks/.test(EO));
    // quality_gaps extraction source.
    assert.ok(/quality_gaps.*evaluation_report\.po\.quality_gaps/.test(EO));
  });

  test('NEVER routes to shipping or final-review (load-bearing routing boundary)', () => {
    // If this drifts, an evaluator could route around the analyzing
    // phase and ship without analysis.
    assert.ok(/NEVER routes to .shipping. or .final-review./.test(EO),
      'NEVER emphasis preserved by design');
    assert.ok(/the analyzing phase makes, not the evaluator/i.test(EO));
  });
});

describe('02-evaluation-orchestrator.md behavioral contract', () => {
  test('writes diff_scope / evaluation_tier / cycle_type / review_readiness_dashboard / evaluator_observations', () => {
    for (const field of ['diff_scope', 'evaluation_tier', 'cycle_type', 'tier_rationale', 'review_readiness_dashboard', 'evaluator_observations']) {
      assert.ok(EO.includes(field), `missing output field: ${field}`);
    }
  });

  test('reads milestone_context.json primary, cycle_context.json fallback', () => {
    assert.ok(/milestone_context\.json/.test(EO));
    assert.ok(/cycle_context\.json/.test(EO));
    assert.ok(/If it does not exist, fall back to `cycle_context\.json`/.test(EO));
  });

  test('names every milestone_context field downstream reads', () => {
    for (const field of ['milestone', 'deployment_url', 'diff_scope', 'active_spec', 'vision', 'factory_decisions', 'factory_questions', 'divergences', 'previous_milestones']) {
      assert.ok(EO.includes(field), `missing milestone_context field: ${field}`);
    }
  });

  test('evaluation_report output shape with per-lens verdicts', () => {
    assert.ok(/"qa": \{ "verdict": "PASS\|FAIL"/.test(EO));
    assert.ok(/"design": \{ "verdict": "PASS\|FAIL"/.test(EO));
    assert.ok(/"po": \{ "verdict": "PRODUCTION_READY\|NEEDS_IMPROVEMENT\|NOT_READY"/.test(EO));
    assert.ok(/recommended_action.*continue\|deepen\|broaden\|rollback\|notify-human/.test(EO));
    assert.ok(/"health_score"/.test(EO));
    assert.ok(/"re_walk_requests"/.test(EO));
  });

  test('dashboard gate update rules preserved (5 gate sources)', () => {
    // Specific nested-path reads.
    assert.ok(/qa_gate.*evaluation_report\.qa\.verdict/.test(EO));
    assert.ok(/design_review.*evaluation_report\.design\.verdict/.test(EO));
    assert.ok(/a11y_review.*evaluation_report\.design\.a11y_review\.verdict.*nested/.test(EO));
    assert.ok(/security_review.*code_review_report\.security/.test(EO));
    assert.ok(/po_review.*evaluation_report\.po\.verdict.*PRODUCTION_READY.*pass/.test(EO));
  });

  test('V3 Phase Contract marker present', () => {
    assert.ok(/V3 Phase Contract/.test(EO));
  });
});

describe('02-evaluation-orchestrator.md Anti-Patterns (routing-drift catchers)', () => {
  test('preserves six "Never" Anti-Pattern rules verbatim', () => {
    for (const rule of [
      'Never skip Sub-Phase 0',
      'Never skip Sub-Phase 3',
      'Never route PO quality gaps to milestone-fix',
      'Never route QA/Design bugs to analyzing',
      'Never mark a gate as passed if the sub-phase didn\'t explicitly produce a PASS verdict',
      'Never loop re-walk more than once per evaluation',
    ]) {
      assert.ok(EO.includes(rule), `missing Anti-Pattern rule: ${rule}`);
    }
  });

  test('Anti-Pattern "Never" count asserted == 6 (regression catcher)', () => {
    const hits = EO.match(/- \*\*Never /g) || [];
    assert.equal(hits.length, 6);
  });

  test('"Quality gaps are not bugs" routing rationale preserved', () => {
    // Calibration: distinguishes analyzing-eligible (needs new specs)
    // from milestone-fix-eligible (needs patches).
    assert.ok(/Quality gaps are not bugs\. They need re-specification, not patching/.test(EO));
    assert.ok(/Bugs don't need new specs\. They need fixes/.test(EO));
  });

  test('"Absence of failure is not success" gate-passing rule preserved', () => {
    assert.ok(/Absence of failure is not success/.test(EO));
  });
});

describe('02-evaluation-orchestrator.md Opus 4.7 modernization', () => {
  test('no "think step by step" scaffolding', () => {
    assert.ok(!/think step by step/i.test(EO));
  });

  test('no "reason carefully" scaffolding', () => {
    assert.ok(!/reason carefully/i.test(EO));
  });

  test('no "CRITICAL:" / "IMPORTANT:" / "URGENT:" / "YOU MUST" emphatic prefixes', () => {
    // "CRITICAL" as severity enum stays; shouty-prefix form with
    // colon removed.
    assert.ok(!/\bCRITICAL:\s/.test(EO));
    assert.ok(!/\bIMPORTANT:/.test(EO));
    assert.ok(!/\bURGENT:/.test(EO));
    assert.ok(!/YOU MUST/.test(EO));
  });

  test('"NOTE: This orchestrator handles MILESTONE evaluation only" softened', () => {
    assert.ok(!/\bNOTE:\*\* This orchestrator handles MILESTONE/.test(EO));
    assert.ok(/Routing note:/.test(EO));
    assert.ok(/milestone evaluation only/.test(EO));
  });

  test('"Those only happen after ALL milestones" / IMPORTANT prefix softened', () => {
    assert.ok(!/\*\*IMPORTANT:\*\*/.test(EO));
    assert.ok(!/Those only happen after ALL milestones are complete/.test(EO));
    assert.ok(/only after every milestone is complete/.test(EO));
    // Rationale for the preserved NEVER on-site.
    assert.ok(/This routing boundary is load-bearing: the NEVER here guards/.test(EO));
  });

  test('no "MUST" all-caps emphasis', () => {
    assert.ok(!/\bMUST\b/.test(EO));
  });

  test('preserved-by-design "Do NOT" count == 3 (identity-boundary + gate-tier-comment + re-walk-rule)', () => {
    const hits = EO.match(/\b[dD]o NOT\b/g) || [];
    assert.equal(hits.length, 3,
      'three preserved-by-design "do NOT" emphases: identity ("you do NOT evaluate"), gate-tier po_review comment, re-walk Code-Review skip');
    assert.ok(/You do NOT evaluate anything yourself/.test(EO));
    assert.ok(/Gate-tier cycles do NOT reset po_review/.test(EO));
    assert.ok(/Do NOT re-run Code Review or the initial walk/.test(EO));
  });

  test('preserved-by-design NEVER emphasis on routing boundary', () => {
    assert.ok(/NEVER routes to .shipping. or .final-review./.test(EO));
  });
});
