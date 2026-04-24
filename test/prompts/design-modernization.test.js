const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// P1.19 PR 16 on seeding/05-design.md.
//
// Largest seeding prompt (855 lines). High Rouge-taste-voice density
// (Rams / Norman / Zhuo / Gebbia / Ive) and an incident-tied
// three-pass-file integrity rule (the Praise session shipped only
// Pass 1 and emitted [DISCIPLINE_COMPLETE: design]). Modernization
// softens stylistic caps while keeping:
//   (a) the five designer voices + signature framings,
//   (b) the 8-item AI Slop Detection taxonomy + slop_detected hard-
//       block rule,
//   (c) the beat-discipline "Do NOT gate between passes" rule
//       (three-pass / one-gate interaction shape),
//   (d) the orchestrator-owns-sequencing boundary ("does NOT decide
//       what runs next"),
//   (e) the Praise-session-incident ≥300-byte / ≥2000-byte
//       verification rule that defends against truncated handoffs.

const DESIGN_PATH = path.join(__dirname, '..', '..', 'src', 'prompts', 'seeding', '05-design.md');
const DESIGN = fs.readFileSync(DESIGN_PATH, 'utf8');

describe('05-design.md behavioral contract', () => {
  test('writes all three pass YAMLs + combined design.yaml', () => {
    assert.ok(DESIGN.includes('design/pass-1-ux-architecture.yaml'));
    assert.ok(DESIGN.includes('design/pass-2-component-design.yaml'));
    assert.ok(DESIGN.includes('design/pass-3-visual-design.yaml'));
    assert.ok(DESIGN.includes('design/design.yaml'));
  });

  test('emits [DISCIPLINE_COMPLETE: design] marker', () => {
    assert.ok(/\[DISCIPLINE_COMPLETE:\s*design\]/.test(DESIGN));
  });

  test('uses orchestrator marker vocabulary', () => {
    assert.ok(DESIGN.includes('[GATE:]'));
    assert.ok(DESIGN.includes('[DECISION:]'));
    assert.ok(DESIGN.includes('[WROTE:]'));
    assert.ok(DESIGN.includes('[HEARTBEAT:]'));
  });

  test('declares the one hard gate (H1-direction-signoff) at the end', () => {
    assert.ok(/design\/H1-direction-signoff/.test(DESIGN));
    // Interaction-shape: passes autonomous, one gate at end.
    assert.ok(/three passes, one sign-off|one gate.*end|gate.*after.*three passes/is.test(DESIGN));
  });

  test('preserves Praise-session integrity rule (≥300-byte / ≥2000-byte verification)', () => {
    // Incident-tied: the Praise session shipped only Pass 1 and emitted
    // [DISCIPLINE_COMPLETE: design]. Dashboard now blocks this.
    assert.ok(/Praise session/.test(DESIGN),
      'incident context must stay on-site so the ≥300-byte rule has its rationale');
    assert.ok(/≥300 bytes/.test(DESIGN));
    assert.ok(/≥2000 bytes/.test(DESIGN));
    assert.ok(/are not optional/.test(DESIGN),
      '"Pass 2 and Pass 3 are not optional" rule must survive');
  });

  test('preserves write-before-presenting integrity rule', () => {
    // Ties back to the swarm-orchestrator's artifact-first spine.
    assert.ok(/Write before presenting scores|write.*YAML to disk.*before asking/is.test(DESIGN));
    assert.ok(/cross-check a YAML they cannot read|conversation-only score does not satisfy/.test(DESIGN));
  });

  test('preserves Latent Space Activation with five designers', () => {
    // Rouge taste ethos. Each name + signature framing locked in.
    for (const designer of ['Dieter Rams', 'Don Norman', 'Julie Zhuo', 'Joe Gebbia', 'Jony Ive']) {
      assert.ok(DESIGN.includes(designer), `missing designer: ${designer}`);
    }
    assert.ok(/subtraction.*earn its place|Every element must earn its place/i.test(DESIGN),
      'Rams framing');
    assert.ok(/Progressive disclosure bridges the gap|first 10 seconds/i.test(DESIGN),
      'Norman framing');
    assert.ok(/principled taste|traces to a principle/i.test(DESIGN),
      'Zhuo framing');
    assert.ok(/trust through design|products that feel considered/i.test(DESIGN),
      'Gebbia framing');
    assert.ok(/care is visible|quality of what you cannot see/i.test(DESIGN),
      'Ive framing');
  });

  test('preserves the 8 AI Slop Detection anti-patterns', () => {
    for (const slop of [
      'Purple gradients', '3-column icon grid', 'Generic hero copy',
      'Decorative blobs', 'Emoji bullets', 'Equal-weight everything',
      'Stock photo hero', 'Startup-speak copy',
    ]) {
      assert.ok(DESIGN.includes(slop), `missing slop anti-pattern: ${slop}`);
    }
  });

  test('preserves slop_detected hard-block rule', () => {
    assert.ok(/slop_detected: true/.test(DESIGN));
    assert.ok(/hard block on \[DISCIPLINE_COMPLETE\]|orchestrator marks this discipline complete/i.test(DESIGN));
  });

  test('preserves the three-pass execution structure', () => {
    assert.ok(/### PASS 1: UX Architecture/.test(DESIGN));
    assert.ok(/### PASS 2: Component Design/.test(DESIGN));
    assert.ok(/### PASS 3: Visual Design/.test(DESIGN));
  });

  test('preserves per-pass scoring dimensions', () => {
    // Pass 1 — 5 dimensions.
    assert.ok(/sitemap_completeness/.test(DESIGN));
    assert.ok(/journey_efficiency/.test(DESIGN));
    assert.ok(/hierarchy_clarity/.test(DESIGN));
    assert.ok(/error_coverage/.test(DESIGN));
    assert.ok(/task_flow_completeness/.test(DESIGN));
    // Pass 2 — 6 dimensions.
    assert.ok(/component_coverage/.test(DESIGN));
    assert.ok(/five_state_coverage/.test(DESIGN));
    assert.ok(/progressive_disclosure/.test(DESIGN));
    assert.ok(/data_mapping_clarity/.test(DESIGN));
    assert.ok(/interaction_completeness/.test(DESIGN));
    assert.ok(/chart_spec_quality/.test(DESIGN));
    // Pass 3 — 7 dimensions.
    assert.ok(/color_intentionality/.test(DESIGN));
    assert.ok(/typography_hierarchy/.test(DESIGN));
    assert.ok(/spacing_consistency/.test(DESIGN));
    assert.ok(/accessibility_coverage/.test(DESIGN));
    assert.ok(/mobile_adaptation/.test(DESIGN));
    assert.ok(/slop_free/.test(DESIGN));
  });

  test('preserves minimum-threshold rule (dimensions < 8 trigger improvement)', () => {
    assert.ok(/minimum_threshold: 8/.test(DESIGN));
    assert.ok(/If any dimension scores below 8/.test(DESIGN));
  });

  test('preserves the five-state design coverage (empty / loading / populated / error / overflow)', () => {
    for (const state of ['empty', 'loading', 'populated', 'error', 'overflow']) {
      assert.ok(DESIGN.includes(`${state}:`), `missing state: ${state}`);
    }
  });

  test('preserves PO-checkable design outputs shape', () => {
    assert.ok(/design_po_checks/.test(DESIGN));
    for (const cat of ['hierarchy_checks', 'five_state_checks', 'component_checks', 'style_token_checks', 'interaction_checks', 'slop_checks']) {
      assert.ok(DESIGN.includes(cat), `missing PO check category: ${cat}`);
    }
  });

  test('preserves loop-back triggers (to SPEC + to Pass 1)', () => {
    assert.ok(/Loop-back triggers to SPEC/.test(DESIGN));
    assert.ok(/Loop-back triggers to Pass 1/.test(DESIGN));
  });

  test('preserves 3-click rule + three_click_violations structure', () => {
    assert.ok(/three_click_compliant/.test(DESIGN));
    assert.ok(/three_click_violations/.test(DESIGN));
  });

  test('preserves combined design_artifact shape', () => {
    for (const field of ['design_artifact', 'discipline', 'status', 'loop_back_triggers', 'passes', 'quality_summary', 'overall_design_score', 'dimensions_rated', 'all_above_threshold', 'slop_detected', 'po_checks', 'estimates', 'invalidates_previous_disciplines', 'questions_for_human']) {
      assert.ok(DESIGN.includes(field), `missing design_artifact field: ${field}`);
    }
  });

  test('preserves orchestrator interface routing rules', () => {
    assert.ok(/Orchestrator Interface/.test(DESIGN));
    assert.ok(/status: "complete"/.test(DESIGN));
    assert.ok(/status: "needs-loop-back"/.test(DESIGN));
    assert.ok(/invalidates_previous_disciplines: \["spec"\]/.test(DESIGN));
  });

  test('preserves Boil-the-Lake dual estimate per pass', () => {
    assert.ok(/pass_1_estimate/.test(DESIGN));
    assert.ok(/pass_2_estimate/.test(DESIGN));
    assert.ok(/pass_3_estimate/.test(DESIGN));
    assert.ok(/human_team/.test(DESIGN));
    assert.ok(/rouge_cycles/.test(DESIGN));
  });
});

describe('05-design.md Opus 4.7 modernization', () => {
  test('no "think step by step" scaffolding', () => {
    assert.ok(!/think step by step/i.test(DESIGN));
  });

  test('no "reason carefully" scaffolding', () => {
    assert.ok(!/reason carefully/i.test(DESIGN));
  });

  test('no "CRITICAL:" / "IMPORTANT:" / "URGENT:" / "YOU MUST" emphatic prefixes', () => {
    assert.ok(!/\bCRITICAL:/.test(DESIGN));
    assert.ok(!/\bIMPORTANT:/.test(DESIGN));
    assert.ok(!/\bURGENT:/.test(DESIGN));
    assert.ok(!/YOU MUST/.test(DESIGN));
  });

  test('no "MUST" all-caps emphasis in prose', () => {
    assert.ok(!/\bMUST\b/.test(DESIGN));
  });

  test('stylistic "ANY" caps softened', () => {
    assert.ok(!/Before finalizing ANY visual design output/.test(DESIGN));
    assert.ok(!/If ANY slop pattern is detected/.test(DESIGN));
  });

  test('opening "You do NOT produce design prose" reframed positively', () => {
    // Identity directive preserved — same ruling, positive voice.
    assert.ok(!/You do NOT produce design prose/.test(DESIGN));
    assert.ok(/design prose, mood boards, and subjective commentary fail this discipline/.test(DESIGN),
      'the "no prose" identity rule should survive in positive framing');
  });

  test('slop-detection revision rule softened + rationale clarified', () => {
    assert.ok(!/The design MUST be revised/.test(DESIGN));
    assert.ok(/must be revised before the orchestrator marks this discipline complete/.test(DESIGN));
    assert.ok(/`slop_detected: true` is a hard block on \[DISCIPLINE_COMPLETE\]/.test(DESIGN),
      'rationale tying the rule to the completion marker should be on-site');
  });

  test('preserved-by-design emphatic NOTs: exactly one "Do NOT" + one "does NOT"', () => {
    // Two distinct preserved emphases, different verb forms.
    const doNotHits = DESIGN.match(/\b[dD]o NOT\b/g) || [];
    assert.equal(doNotHits.length, 1,
      'exactly 1 "Do NOT" emphasis expected — the beat-discipline rule');
    // Beat-discipline: three-pass / one-gate rule.
    assert.ok(/\*\*Do NOT gate between passes\.\*\*/.test(DESIGN));
    // Scope boundary — orchestrator owns sequencing. Different verb
    // form ("does NOT" rather than "Do NOT"), same preservation intent.
    const doesNotHits = DESIGN.match(/\bdoes NOT\b/g) || [];
    assert.equal(doesNotHits.length, 1,
      'exactly 1 "does NOT" emphasis expected — the orchestrator-sequencing boundary');
    assert.ok(/does NOT decide what runs next/.test(DESIGN));
  });
});
