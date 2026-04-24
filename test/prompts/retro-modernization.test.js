const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// P1.19 on 09-cycle-retrospective.md (Opus 4.7 modernization pass).
// Locks in (a) the behavioral contract the launcher's post-retrospective
// hook depends on (still produces structured_retro + amendments_proposed
// + journey_entry + retro_metrics + trend_snapshot + prompt_improvement
// _proposals) AND (b) the modernization patterns from the roadmap
// (scaffolding phrases absent, shouty language absent, system-actor
// phrasing present).

const RETRO_PATH = path.join(__dirname, '..', '..', 'src', 'prompts', 'loop', '09-cycle-retrospective.md');
const RETRO = fs.readFileSync(RETRO_PATH, 'utf8');

describe('09-cycle-retrospective.md behavioral contract', () => {
  test('still writes structured_retro block', () => {
    assert.ok(RETRO.includes('structured_retro'), 'missing structured_retro — launcher hook reads this');
  });

  test('still emits amendments_proposed', () => {
    assert.ok(RETRO.includes('amendments_proposed'), 'missing amendments_proposed');
  });

  test('still writes journey_entry for the post-retrospective hook', () => {
    assert.ok(RETRO.includes('journey_entry'), 'missing journey_entry write');
  });

  test('still emits retro_metrics', () => {
    assert.ok(RETRO.includes('retro_metrics'));
  });

  test('still writes trend_snapshot for cross-cycle analysis', () => {
    assert.ok(RETRO.includes('trend_snapshot'));
  });

  test('still emits prompt_improvement_proposals (Level 3 learning)', () => {
    assert.ok(RETRO.includes('prompt_improvement_proposals'));
  });

  test('still honors the "write to cycle_context only" contract', () => {
    // CLAUDE.md says loop prompts may only write cycle_context.json.
    // journey.json is the launcher's responsibility. The retro must state
    // this contract explicitly.
    assert.ok(
      /journey\.json.*launcher|launcher.*journey\.json/is.test(RETRO),
      'must document that journey.json is owned by the launcher, not this prompt'
    );
  });

  test('structured_retro taxonomy preserved (worked / failed / untried)', () => {
    assert.ok(RETRO.includes('worked'));
    assert.ok(RETRO.includes('failed'));
    assert.ok(RETRO.includes('untried'));
  });

  test('failed root_cause taxonomy preserved', () => {
    assert.ok(/missing_context/.test(RETRO));
    assert.ok(/spec_ambiguity/.test(RETRO));
    assert.ok(/impl_bug/.test(RETRO));
    assert.ok(/design_gap/.test(RETRO));
  });

  test('evidence-gated amendment rule preserved (≥3 cycles)', () => {
    assert.ok(/≥3 cycles|>= ?3 cycles|3\+ cycles/i.test(RETRO), 'missing the 3-cycle evidence gate');
  });

  test('shadow-promotion-never-autonomous rule preserved', () => {
    // The specific guarantee: amendments cannot be promoted to active
    // without human review. Wording may vary post-modernization; check
    // for the intent.
    assert.ok(
      /shadow.*proposed|proposed.*shadow|human[- ]reviewed PR|never an autonomous/i.test(RETRO),
      'missing the shadow-only / human-review-required guarantee for amendments'
    );
  });
});

describe('09-cycle-retrospective.md Opus 4.7 modernization', () => {
  test('no "think step by step" scaffolding', () => {
    assert.ok(!/think step by step/i.test(RETRO), 'remove "think step by step" scaffolding');
  });

  test('no "reason carefully" scaffolding', () => {
    assert.ok(!/reason carefully/i.test(RETRO), 'remove "reason carefully" scaffolding');
  });

  test('no shouty "CRITICAL:" / "URGENT:" / "IMPORTANT:" headers', () => {
    // Allow "Important" in natural prose; flag the all-caps-colon form.
    assert.ok(!/\bCRITICAL:/.test(RETRO), 'remove "CRITICAL:" emphasis');
    assert.ok(!/\bURGENT:/.test(RETRO), 'remove "URGENT:" emphasis');
    assert.ok(!/\bIMPORTANT:/.test(RETRO), 'remove "IMPORTANT:" emphasis');
  });

  test('no "YOU MUST" all-caps directives', () => {
    assert.ok(!/YOU MUST/.test(RETRO), 'remove "YOU MUST" emphasis');
  });

  test('uses system-actor language (not "the team", "we")', () => {
    // Calls out the no-team-language rule explicitly.
    assert.ok(
      /system-actor language|Rouge is a solo autonomous system/.test(RETRO),
      'should direct the writer to use system-actor language'
    );
  });

  test('uses "Scope Boundary" framing for what the phase does NOT do', () => {
    // Modernization reframed "What You Do NOT Do" to "Scope Boundary" with
    // positive-alternative leads.
    assert.ok(/Scope Boundary/.test(RETRO), 'scope-boundary section renamed in modernization');
  });

  test('retains explicit anti-implementation guard', () => {
    // Positive phrasing now, but the scope boundary must still say "this
    // phase records; the next cycle implements." Otherwise a future edit
    // could silently let the retro write code.
    assert.ok(
      /next cycle implements|Implementation happens in the analyzing|records findings|Record findings/i.test(RETRO),
      'scope boundary must keep "retro records, next cycle implements" clear'
    );
  });
});
