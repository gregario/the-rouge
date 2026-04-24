const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// P1.19 PR 19 on 00-foundation-evaluating.md.
//
// Judge-side: foundation pre-gate. If this phase passes broken
// foundation, every downstream feature builds on sand. Silent
// degradation is a named failure class here (same integrity rule
// class as the building prompt's Capability Avoidance). Modernization
// softens three stylistic caps while keeping:
//   (a) the six rubric dimensions + PASS|FAIL|SKIP enum,
//   (b) the silent-degradation check as a named step,
//   (c) the five Anti-Pattern "Never" rules,
//   (d) the foundation-vs-feature-eval scope boundary,
//   (e) the "NEVER hardcoded" security rule (incident-tied class).

const FE_PATH = path.join(__dirname, '..', '..', 'src', 'prompts', 'loop', '00-foundation-evaluating.md');
const FE = fs.readFileSync(FE_PATH, 'utf8');

describe('00-foundation-evaluating.md judge-boundary (calibration surface)', () => {
  test('identity: foundation-evaluator differentiates from feature-evaluator', () => {
    assert.ok(/## Key Difference from Feature Evaluation/.test(FE));
    assert.ok(/Does this feel like a good product\?/.test(FE),
      'feature-eval framing preserved for contrast');
    assert.ok(/Can features be built on top of this without rework\?/.test(FE),
      'foundation-eval framing preserved as the discipline question');
  });

  test('scope boundary: foundation-eval does NOT evaluate user journeys', () => {
    assert.ok(/You do NOT evaluate user journeys/.test(FE));
    assert.ok(/There are none\. Foundation has no end users yet/.test(FE));
  });

  test('routing boundary: orchestrator does NOT evaluate foundation', () => {
    // Load-bearing: the launcher routes between foundation-eval and
    // feature-eval. If this boundary softens, someone might add
    // foundation logic to the orchestrator.
    assert.ok(/does NOT evaluate foundation/.test(FE),
      'routing-boundary emphasis stays preserved by design');
    assert.ok(/launcher routes|Routing.*handled.*by the launcher/i.test(FE));
  });

  test('preserves the NEVER-hardcoded security rule', () => {
    // Security-integrity class (same emphatic register as the
    // ISOLATION RULES in the building prompt).
    assert.ok(/Are env vars referenced by name \(NEVER hardcoded\)/.test(FE));
  });
});

describe('00-foundation-evaluating.md six-dimension rubric (calibration instrument)', () => {
  test('preserves all six rubric dimensions with their exact numbered headings', () => {
    for (const heading of [
      '### 1. Schema Completeness',
      '### 2. Integration Scaffold Quality',
      '### 3. Auth Flow Completeness',
      '### 4. Shared Component Quality',
      '### 5. Deployment Pipeline',
      '### 6. Test Fixture Quality',
    ]) {
      assert.ok(FE.includes(heading), `missing dimension: ${heading}`);
    }
  });

  test('each dimension declares a FAIL criterion (rubric anchor)', () => {
    // The FAIL lines are the calibration anchors. If any drifts, the
    // rubric shifts silently.
    const failLines = FE.match(/\*\*FAIL if:\*\*/g) || [];
    assert.ok(failLines.length >= 4,
      `expected at least 4 explicit "FAIL if" anchors, got ${failLines.length}`);
  });

  test('dimensions 4 + 5 explicitly declare SKIP conditions (applicability rule)', () => {
    // Shared components and deployment are conditional on foundation_spec.
    const skipLines = FE.match(/\*\*SKIP if:\*\*/g) || [];
    assert.equal(skipLines.length, 2,
      'exactly 2 SKIP-if rules expected (shared components + deployment)');
  });

  test('preserves the schema-completeness ALTER-TABLE anchor', () => {
    // The FAIL condition is specific: any feature area needing to
    // ALTER TABLE = foundation failed its job.
    assert.ok(/Any feature area would need to ALTER TABLE/.test(FE));
  });

  test('preserves the test-fixture placeholder-data anchor', () => {
    // The FAIL condition names specific placeholder patterns that
    // would trigger it — calibration-level detail.
    assert.ok(/"test123"|"foo@bar\.com"/.test(FE));
  });
});

describe('00-foundation-evaluating.md behavioral contract', () => {
  test('writes foundation_eval_report with full schema', () => {
    assert.ok(FE.includes('foundation_eval_report'));
    // All six dimension keys the launcher reads.
    for (const key of [
      'schema_completeness', 'integration_scaffolds', 'auth_flows',
      'shared_components', 'deployment_pipeline', 'test_fixtures',
    ]) {
      assert.ok(FE.includes(key), `missing report dimension key: ${key}`);
    }
    // Top-level fields.
    for (const field of ['verdict', 'silent_degradation_check', 'structural_gaps', 'integration_gaps', 'recommendations']) {
      assert.ok(FE.includes(field), `missing top-level field: ${field}`);
    }
  });

  test('verdict enum: PASS | FAIL (binary gate)', () => {
    assert.ok(/"PASS \| FAIL"/.test(FE));
  });

  test('per-dimension status enum: PASS | FAIL | SKIP', () => {
    assert.ok(/"PASS\|FAIL\|SKIP"/.test(FE));
  });

  test('preserves the silent-degradation detection checklist', () => {
    // This is THE critical check — builders under pressure substitute
    // real work with mocks/TODOs. If this softens, silent degradation
    // becomes ungated.
    assert.ok(/## Step 3: Check for Silent Degradation/.test(FE));
    assert.ok(/This is the critical check/.test(FE));
    for (const pattern of [
      'substituted with simpler alternatives',
      'JSON blobs where they should be typed columns',
      'Mock services pretending to be real integrations',
      'TODO',
      'Test stubs that always return true',
    ]) {
      assert.ok(FE.includes(pattern), `missing silent-degradation pattern: ${pattern}`);
    }
  });

  test('preserves verdict logic: any FAIL dimension OR silent degradation → FAIL', () => {
    assert.ok(/FAIL if any dimension is FAIL or if silent degradation is detected/.test(FE));
    assert.ok(/PASS only if all non-skipped dimensions pass AND no silent degradation/.test(FE));
  });

  test('reads cycle_context inputs named explicitly', () => {
    for (const field of ['foundation_spec.acceptance_criteria', 'implemented', 'skipped', 'vision']) {
      assert.ok(FE.includes(field), `missing input field: ${field}`);
    }
  });

  test('commit message template names verdict', () => {
    assert.ok(/eval\(foundation\): foundation evaluation — <verdict>/.test(FE));
  });

  test('V3 Phase Contract marker present', () => {
    assert.ok(/V3 Phase Contract/.test(FE));
  });
});

describe('00-foundation-evaluating.md Anti-Patterns (calibration-drift catchers)', () => {
  test('preserves all five "Never" Anti-Pattern rules verbatim', () => {
    for (const rule of [
      'Never evaluate user journeys',
      'Never skip the silent degradation check',
      'Never PASS a dimension you cannot verify',
      'Never modify production code',
      'Never accept "will be added later"',
    ]) {
      assert.ok(FE.includes(rule), `missing Anti-Pattern rule: ${rule}`);
    }
  });

  test('Anti-Pattern "Never" count asserted == 5 (regression catcher)', () => {
    const hits = FE.match(/- \*\*Never /g) || [];
    assert.equal(hits.length, 5);
  });

  test('preserves "builders under pressure take shortcuts" rationale', () => {
    // This is the rationale for why silent-degradation check exists.
    // If it softens, the judge might skip the check.
    assert.ok(/Builders under pressure take shortcuts — your job is to catch them/.test(FE));
  });

  test('preserves "SKIP is only for dimensions explicitly out of scope" rule', () => {
    // Calibration rule: SKIP is not the default for "couldn't verify."
    // Unverifiable is FAIL, not SKIP.
    assert.ok(/If tests don't run, that's a FAIL, not a SKIP/.test(FE));
    assert.ok(/SKIP is only for dimensions explicitly out of scope/.test(FE));
  });

  test('preserves "Foundation exists so features don\'t have to add shared infrastructure later" rationale', () => {
    assert.ok(/Foundation exists so features don't have to add shared infrastructure later/.test(FE));
  });
});

describe('00-foundation-evaluating.md Opus 4.7 modernization', () => {
  test('no "think step by step" scaffolding', () => {
    assert.ok(!/think step by step/i.test(FE));
  });

  test('no "reason carefully" scaffolding', () => {
    assert.ok(!/reason carefully/i.test(FE));
  });

  test('no "CRITICAL:" / "IMPORTANT:" / "URGENT:" / "YOU MUST" emphatic prefixes', () => {
    assert.ok(!/\bCRITICAL:/.test(FE));
    assert.ok(!/\bIMPORTANT:/.test(FE));
    assert.ok(!/\bURGENT:/.test(FE));
    assert.ok(!/YOU MUST/.test(FE));
  });

  test('no "MUST" all-caps emphasis', () => {
    assert.ok(!/\bMUST\b/.test(FE));
  });

  test('stylistic caps softened (ALL entities / ONLY / ANY dimension / STRUCTURALLY SOUND)', () => {
    assert.ok(!/include ALL entities/.test(FE));
    assert.ok(!/foundation evaluation ONLY/.test(FE));
    assert.ok(!/FAIL if ANY dimension/.test(FE));
    assert.ok(!/STRUCTURALLY SOUND/.test(FE));
  });

  test('preserved-by-design "NOT/NEVER" emphasis: each incident-tied instance survives', () => {
    // Judge surfaces stay emphatic where it's calibration-load-bearing.
    // Expected survivors:
    //   1. "you do NOT evaluate user journeys" (scope boundary)
    //   2. "does NOT evaluate foundation" (routing boundary)
    //   3. "NEVER hardcoded" (security integrity)
    //   4. five Anti-Pattern "Never X" rules
    assert.ok(/You do NOT evaluate user journeys/.test(FE));
    assert.ok(/does NOT evaluate foundation/.test(FE));
    assert.ok(/NEVER hardcoded/.test(FE));
    // Anti-Pattern "Never" block count asserted separately above.
  });
});
