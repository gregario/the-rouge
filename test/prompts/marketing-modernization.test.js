const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// P1.19 PR 12 on seeding/07-marketing.md.
//
// Seeding discipline — copywriting + landing scaffold + README +
// Product Hunt launch copy. No incident-tied safety blocks; the
// integrity rule that IS load-bearing ("no fabricated proof") sits
// inside the Writing Rules list and is preserved there rather than
// shouted. Modernization softens stylistic caps while keeping the 8
// Writing Rules + 4-artifact contract intact.

const MKT_PATH = path.join(__dirname, '..', '..', 'src', 'prompts', 'seeding', '07-marketing.md');
const MKT = fs.readFileSync(MKT_PATH, 'utf8');

describe('07-marketing.md behavioral contract', () => {
  test('emits [DISCIPLINE_COMPLETE: marketing] marker', () => {
    assert.ok(/\[DISCIPLINE_COMPLETE:\s*marketing\]/.test(MKT));
  });

  test('declares no hard gates / no soft gates (fully autonomous)', () => {
    assert.ok(/\*\*Hard gates:\*\*\s*none/i.test(MKT));
    assert.ok(/\*\*Soft gates:\*\*\s*none/i.test(MKT));
  });

  test('uses orchestrator narration vocabulary', () => {
    assert.ok(MKT.includes('[DECISION:]'));
  });

  test('writes four artifacts to the correct paths', () => {
    for (const p of [
      'marketing/landing-page-copy.md',
      'marketing/landing-page.html',
      'marketing/product-hunt-launch.md',
      'README.md',
    ]) {
      assert.ok(MKT.includes(p), `missing artifact path: ${p}`);
    }
  });

  test('handoff JSON names every field the orchestrator consumes', () => {
    for (const field of ['discipline', 'status', 'artifacts', 'copy_sections', 'social_proof_status', 'readme_badge_type', 'loop_back_triggers', 'notes']) {
      assert.ok(MKT.includes(field), `missing handoff field: ${field}`);
    }
  });

  test('copy_sections enum covers all eight landing-page blocks', () => {
    for (const section of ['hero', 'problem', 'solution', 'features', 'social_proof', 'pricing', 'faq', 'footer_cta']) {
      assert.ok(MKT.includes(`"${section}"`), `missing copy_section enum: ${section}`);
    }
  });

  test('declares inputs from five upstream disciplines', () => {
    for (const disc of ['BRAINSTORMING', 'TASTE', 'SPEC', 'DESIGN', 'LEGAL/PRIVACY']) {
      assert.ok(MKT.includes(disc), `missing upstream discipline: ${disc}`);
    }
  });

  test('declares four loop-back trigger classes', () => {
    assert.ok(/SPEC gap/.test(MKT));
    assert.ok(/DESIGN gap/.test(MKT));
    assert.ok(/TASTE conflict/.test(MKT));
    assert.ok(/BRAINSTORMING gap/.test(MKT));
  });

  test('preserves the eight Writing Rules (discipline identity)', () => {
    // These are Rouge's opinionated marketing rules — they define what
    // the discipline IS. Dropping or softening any of them produces
    // generic AI slop copy.
    assert.ok(/Benefits over features/.test(MKT));
    assert.ok(/Specific over vague/.test(MKT));
    assert.ok(/No fabricated proof/.test(MKT));
    assert.ok(/Lead with the user's problem/.test(MKT));
    assert.ok(/One CTA per context/.test(MKT));
    assert.ok(/No superlatives without evidence/.test(MKT));
    assert.ok(/Match the product's voice/.test(MKT));
    assert.ok(/Disclose AI/.test(MKT));
  });

  test('preserves the no-fabricated-proof integrity rule with placeholder pattern', () => {
    // This is the integrity rule of the discipline. Any future edit
    // that softens "never invent testimonials" drops a load-bearing
    // guard.
    assert.ok(/Never invent testimonials/.test(MKT));
    assert.ok(/SOCIAL PROOF: Replace/.test(MKT),
      'the placeholder comment pattern must survive so no-fabricated-proof is operational');
    assert.ok(/Placeholder is better than fiction/.test(MKT));
  });

  test('preserves four-artifact structure with section headings', () => {
    assert.ok(/### Artifact 1: Landing Page Copy/.test(MKT));
    assert.ok(/### Artifact 2: Landing Page Scaffold/.test(MKT));
    assert.ok(/### Artifact 3: README\.md Content/.test(MKT));
    assert.ok(/### Artifact 4: Product Hunt Launch Copy/.test(MKT));
  });

  test('preserves README badge-selection rules (npm / MCP / web / basic)', () => {
    assert.ok(/MCP Compatible/.test(MKT));
    assert.ok(/Glama score/.test(MKT));
    assert.ok(/npm version/.test(MKT));
    assert.ok(/License badge/.test(MKT));
  });

  test('preserves advancing-to-INFRASTRUCTURE handoff check', () => {
    assert.ok(/INFRASTRUCTURE/.test(MKT));
  });
});

describe('07-marketing.md Opus 4.7 modernization', () => {
  test('no "think step by step" scaffolding', () => {
    assert.ok(!/think step by step/i.test(MKT));
  });

  test('no "reason carefully" scaffolding', () => {
    assert.ok(!/reason carefully/i.test(MKT));
  });

  test('no "think deeply" scaffolding', () => {
    // Softened to "sit with" — fewer scaffolding phrases + more specific
    // attentional verb.
    assert.ok(!/think deeply/i.test(MKT));
  });

  test('no "CRITICAL:" / "IMPORTANT:" / "URGENT:" / "YOU MUST" emphatic prefixes', () => {
    assert.ok(!/\bCRITICAL:/.test(MKT));
    assert.ok(!/\bIMPORTANT:/.test(MKT));
    assert.ok(!/\bURGENT:/.test(MKT));
    assert.ok(!/YOU MUST/.test(MKT));
  });

  test('no "do NOT" / "Do NOT" / "DO NOT" emphasis', () => {
    const hits = MKT.match(/\b[dD]o NOT\b/g) || [];
    assert.equal(hits.length, 0);
  });

  test('no "MUST" all-caps or "non-negotiable" emphasis', () => {
    assert.ok(!/\bMUST\b/.test(MKT));
    assert.ok(!/non-negotiable/.test(MKT));
  });

  test('no purely-stylistic caps (THEM / ONE / RIGHT NOW / FOR / WHAT / FOUR / ALL / IS NOT)', () => {
    assert.ok(!/changes for THEM/.test(MKT));
    assert.ok(!/What is the ONE thing/.test(MKT));
    assert.ok(!/RIGHT NOW/.test(MKT));
    assert.ok(!/What it does FOR/.test(MKT));
    assert.ok(!/want to know WHAT it does/.test(MKT));
    assert.ok(!/produce FOUR artifacts/.test(MKT));
    assert.ok(!/Write ALL of them/.test(MKT));
    assert.ok(!/the product IS and IS NOT/.test(MKT));
  });

  test('has a positive-framed Scope Boundary section (renamed from "What You Do NOT Do")', () => {
    assert.ok(/## Scope Boundary/.test(MKT));
    assert.ok(!/## What You Do NOT Do/.test(MKT));
    const section = MKT.split('## Scope Boundary')[1].split('##')[0];
    // Ceding rules preserved: publishing, image generation, engineering
    // handoff, placeholder integrity.
    assert.ok(/publishing|ship-promote|human/i.test(section),
      'scope boundary should cede publishing to human / ship-promote');
    assert.ok(/alt text|camera direction|describe.*visuals/i.test(section),
      'scope boundary should cede visual generation and require alt-text / camera-direction description');
    assert.ok(/engineering turns the scaffold/i.test(section));
    assert.ok(/no-fabricated-proof rule|fabricated metrics/i.test(section),
      'scope boundary should tie back to the Writing Rules no-fabricated-proof rule');
    assert.ok(!/You do not/i.test(section));
  });

  test('Writing Rules intro softened from "non-negotiable" to positive framing', () => {
    assert.ok(!/These rules are non-negotiable/.test(MKT));
    assert.ok(/they define what marketing means in this discipline/.test(MKT));
  });
});
