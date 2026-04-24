const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// P1.19 PR 14 on seeding/02-competition.md.
//
// Medium-size research discipline (market landscape + design
// intelligence). Gary-Tan-voice density: Latent Space Activation names
// five product thinkers (Bezos, Chesky, Graham, Altman, Porter); the
// advisory-only scope-boundary rule is load-bearing (cedes verdicts to
// TASTE). Boil-the-Lake + dual time estimate preserved per Rouge taste
// ethos.

const COMP_PATH = path.join(__dirname, '..', '..', 'src', 'prompts', 'seeding', '02-competition.md');
const COMP = fs.readFileSync(COMP_PATH, 'utf8');

describe('02-competition.md behavioral contract', () => {
  test('writes seed_spec/competition.md (the dashboard verifies this path)', () => {
    assert.ok(COMP.includes('seed_spec/competition.md'));
  });

  test('emits [DISCIPLINE_COMPLETE: competition] marker', () => {
    assert.ok(/\[DISCIPLINE_COMPLETE:\s*competition\]/.test(COMP));
  });

  test('declares one soft gate + no hard gates', () => {
    assert.ok(/\*\*Hard gates:\*\*\s*none/i.test(COMP));
    assert.ok(/competition\/S1-domain-classification/.test(COMP));
  });

  test('uses orchestrator narration vocabulary', () => {
    assert.ok(COMP.includes('[DECISION:]'));
    assert.ok(COMP.includes('[HEARTBEAT:]'));
  });

  test('declares swarm position BRAINSTORMING → COMPETITION → TASTE', () => {
    assert.ok(/BRAINSTORMING\s*->\s*\*\*COMPETITION\*\*\s*->\s*TASTE/.test(COMP));
    assert.ok(/mandatory before TASTE/.test(COMP));
  });

  test('preserves Latent Space Activation with five thinkers', () => {
    // Rouge taste ethos — Gary Tan voice. Dropping any of these
    // converts the discipline into a generic competitor search.
    for (const thinker of ['Bezos', 'Chesky', 'Graham', 'Altman', 'Porter']) {
      assert.ok(COMP.includes(thinker), `missing thinker: ${thinker}`);
    }
    // Signature framings.
    assert.ok(/Work backward from the customer/i.test(COMP), 'Bezos framing');
    assert.ok(/11-star experience/.test(COMP), 'Chesky framing');
    assert.ok(/schlep/i.test(COMP), 'Graham framing');
    assert.ok(/Five forces|rivalry.*moat|Where is the moat/i.test(COMP), 'Porter framing');
  });

  test('preserves market-density enum (Blue / Contested / Red)', () => {
    assert.ok(/Blue ocean/.test(COMP));
    assert.ok(/Contested/.test(COMP));
    assert.ok(/Red ocean/.test(COMP));
  });

  test('preserves advisory-verdict enum', () => {
    assert.ok(/Clear lane/.test(COMP));
    assert.ok(/Contested but winnable/.test(COMP));
    assert.ok(/Crowded/.test(COMP));
  });

  test('preserves advisory-only scope-boundary rule (cedes verdicts to TASTE)', () => {
    // This is the load-bearing boundary — if this softens, COMPETITION
    // starts recommending go/no-go, which is TASTE's job.
    assert.ok(/Advisory only/.test(COMP));
    assert.ok(/Never recommend killing, parking, or pivoting/.test(COMP));
    assert.ok(/TASTE'?s job/.test(COMP));
    assert.ok(/you produce findings, never verdicts/.test(COMP));
  });

  test('preserves orchestrator-owns-sequencing boundary rule', () => {
    // Scope-boundary emphasis preserved by design.
    assert.ok(/Do NOT decide what discipline runs next — the orchestrator handles sequencing/.test(COMP));
  });

  test('preserves WebSearch + $B browse tool contract', () => {
    assert.ok(/Use WebSearch/.test(COMP));
    assert.ok(/\$B browse|\$B goto/.test(COMP));
    assert.ok(/\$B snapshot -i/.test(COMP));
    assert.ok(/\$B screenshot/.test(COMP));
  });

  test('preserves screenshot path convention (/tmp/rouge-seed/competition/)', () => {
    assert.ok(/\/tmp\/rouge-seed\/competition\//.test(COMP));
    assert.ok(/kebab-case/.test(COMP));
  });

  test('preserves reference_products shape for EVALUATOR', () => {
    assert.ok(/reference_products/.test(COMP));
    assert.ok(/EVALUATOR/.test(COMP));
    // Fields the orchestrator merges into cycle_context.json.
    assert.ok(/"name":/.test(COMP));
    assert.ok(/"url":/.test(COMP));
    assert.ok(/"dimensions":/.test(COMP));
    // Public-facing UI preference for pairwise quality.
    assert.ok(/public-facing UI|no auth wall/i.test(COMP));
  });

  test('preserves per-competitor design-extraction schema', () => {
    for (const field of ['Layout', 'Typography', 'Color', 'Primary CTA', 'Onboarding', 'Accessibility', 'Performance', 'Design philosophy']) {
      assert.ok(COMP.includes(field), `missing design-extraction field: ${field}`);
    }
  });

  test('preserves the ten numbered Rules section', () => {
    assert.ok(/## Rules/.test(COMP));
    // Spot-check the load-bearing rules.
    assert.ok(/1\. \*\*Use WebSearch for all market research/.test(COMP));
    assert.ok(/2\. \*\*Use \$B browse for all design intelligence/.test(COMP));
    assert.ok(/3\. \*\*Advisory only/.test(COMP));
    assert.ok(/Reference products are for the EVALUATOR/.test(COMP));
  });

  test('preserves Boil-the-Lake taste-voice directive', () => {
    assert.ok(/## Boil the Lake/.test(COMP));
    assert.ok(/marginal cost of checking 3 more competitors/.test(COMP));
    assert.ok(/Human team.*Rouge seeding|Rouge seeding.*Human team/is.test(COMP));
  });

  test('preserves the chunk-aggressively + <45s-heartbeat rule', () => {
    assert.ok(/Chunk aggressively/.test(COMP));
    assert.ok(/45s/.test(COMP));
  });

  test('preserves the 0 / 1-3 / 4-8 / 8+ competitor-count ladder', () => {
    assert.ok(/0 found.*Blue ocean|Blue ocean.*0 found/is.test(COMP));
    assert.ok(/1-3 found.*Light competition|Light competition.*1-3/is.test(COMP));
    assert.ok(/4-8 found/.test(COMP));
    assert.ok(/8\+ found|8\+/.test(COMP));
  });

  test('preserves competition-brief structure (8 main headings)', () => {
    for (const h of [
      '### Market Landscape', '### Competitors',
      '### Competitive Design Patterns', '### Gap Analysis',
      '### Differentiation Angle', '### Advisory Verdict',
      '### Reference Products for Evaluator', '### Screenshots',
    ]) {
      assert.ok(COMP.includes(h), `missing brief section: ${h}`);
    }
  });
});

describe('02-competition.md Opus 4.7 modernization', () => {
  test('no "think step by step" scaffolding', () => {
    assert.ok(!/think step by step/i.test(COMP));
  });

  test('no "reason carefully" scaffolding', () => {
    assert.ok(!/reason carefully/i.test(COMP));
  });

  test('no "CRITICAL:" / "IMPORTANT:" / "URGENT:" / "YOU MUST" emphatic prefixes', () => {
    assert.ok(!/\bCRITICAL:/.test(COMP));
    assert.ok(!/\bIMPORTANT:/.test(COMP));
    assert.ok(!/\bURGENT:/.test(COMP));
    assert.ok(!/YOU MUST/.test(COMP));
  });

  test('no "MUST" / "non-negotiable" emphasis', () => {
    assert.ok(!/\bMUST\b/.test(COMP));
    assert.ok(!/non-negotiable/.test(COMP));
  });

  test('VISIBLE all-caps softened (autonomous-first line)', () => {
    assert.ok(!/work must be VISIBLE/.test(COMP));
    assert.ok(/stay visible on the dashboard/.test(COMP));
  });

  test('CAN-ask all-caps softened (interaction-model line)', () => {
    assert.ok(!/You CAN ask questions/.test(COMP));
    assert.ok(/Ask questions when the domain classification is genuinely contested/.test(COMP));
  });

  test('preserved-by-design "Do NOT" count is exactly 1 (orchestrator-owns-sequencing)', () => {
    // Only one emphatic "Do NOT" survives: the advisory-only scope-
    // boundary rule that cedes phase routing to the orchestrator.
    // Everything else softened.
    const hits = COMP.match(/\b[dD]o NOT\b/g) || [];
    assert.equal(hits.length, 1,
      'exactly 1 preserved-by-design "Do NOT" emphasis expected');
    assert.ok(/Do NOT decide what discipline runs next/.test(COMP));
  });
});
