const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// P1.19 PR 11 on seeding/01-brainstorming.md.
//
// Highest taste-voice density in the seeding set. Carries the Gary-Tan /
// expand-scope ethos explicitly. Rouge taste ethos memory:
// "PRESERVE the Gary Tan voice and expand/contract/hold framing.
// Rubric-ification is the anti-pattern." Modernization here softens
// purely-stylistic caps while keeping:
//   (a) the Latent Space Activation block (Bezos/Chesky/Graham/Altman/
//       Horowitz by name + their specific framings)
//   (b) the expand-scope identity directives ("You do not fight depth,
//       You do not invoke YAGNI, You do not say 'that's a lot'")
//   (c) the 10-star Chesky framing
//   (d) Boil-the-Lake — "never scope down because it's a lot of work"
//   (e) Premise Challenge / Dream State Mapping / Temporal Interrogation
//       GStack CEO Review techniques

const BS_PATH = path.join(__dirname, '..', '..', 'src', 'prompts', 'seeding', '01-brainstorming.md');
const BS = fs.readFileSync(BS_PATH, 'utf8');

describe('01-brainstorming.md behavioral contract', () => {
  test('writes seed_spec/brainstorming.md (the dashboard verifies this path)', () => {
    assert.ok(BS.includes('seed_spec/brainstorming.md'));
  });

  test('emits [DISCIPLINE_COMPLETE: brainstorming] marker', () => {
    assert.ok(/\[DISCIPLINE_COMPLETE:\s*brainstorming\]/.test(BS));
  });

  test('declares three hard gates + two soft gates by exact ID', () => {
    assert.ok(/brainstorming\/H1-premise-persona/.test(BS));
    assert.ok(/brainstorming\/H2-north-star/.test(BS));
    assert.ok(/brainstorming\/H3-scope-summary/.test(BS));
    assert.ok(/brainstorming\/S1-scope-bounds/.test(BS));
    assert.ok(/brainstorming\/S2-opinionation-level/.test(BS));
  });

  test('uses orchestrator gate vocabulary', () => {
    assert.ok(BS.includes('[GATE:]'));
    assert.ok(BS.includes('[DECISION:]'));
    assert.ok(BS.includes('[HEARTBEAT:]'));
  });

  test('preserves the five classifier signals SIZING consumes (exact field names)', () => {
    // project-sizer.js parses these from the brainstorming output. Any
    // rename breaks sizing.
    for (const signal of ['entity_count', 'integration_count', 'role_count', 'journey_count', 'screen_count']) {
      assert.ok(BS.includes(signal), `missing sizing signal: ${signal}`);
    }
  });

  test('preserves the "Classifier Signals" section heading feeding SIZING', () => {
    assert.ok(/## Classifier Signals/.test(BS));
    assert.ok(/project-sizer\.js/.test(BS),
      'section should still name the consumer module for future maintainers');
  });

  test('preserves the design-document structure (nine required sections)', () => {
    for (const section of [
      '## The Problem', '## The User', '## The Emotional North Star',
      '## The 10-Star Experience', '## Feature Areas',
      '## What Makes This Different', '## Temporal Arc',
      '## Open Questions', '## Scope Summary',
    ]) {
      assert.ok(BS.includes(section), `missing design-doc section: ${section}`);
    }
  });

  test('preserves Latent Space Activation naming five thinkers + their specific framings', () => {
    // Rouge taste ethos: Gary Tan voice. These five voices are the
    // character-defining prompt surface.
    for (const thinker of ['Bezos', 'Chesky', 'Graham', 'Altman', 'Horowitz']) {
      assert.ok(BS.includes(thinker), `missing thinker: ${thinker}`);
    }
    // Signature framings must also survive — name-drop alone isn't enough.
    assert.ok(/One-way door vs two-way door|Day 1 thinking/i.test(BS),
      'Bezos framing signature missing');
    assert.ok(/11-star experience|11-star/.test(BS),
      'Chesky 11-star framing missing');
    assert.ok(/Do things that don't scale|schlep filter|Make something people want/i.test(BS),
      'Graham framing signature missing');
    assert.ok(/silver bullets.*lead bullets|lead bullets/i.test(BS),
      'Horowitz framing signature missing');
  });

  test('preserves the expand-scope identity directives (Rouge taste ethos)', () => {
    // These three lines are the heart of Rouge's expand-scope voice.
    // feedback_rouge_taste_ethos memory: "if the prompt reads like a
    // spreadsheet, it's lost the ethos." These phrasings are what keeps
    // it from spreadsheet-shaped.
    assert.ok(/You do not fight depth/.test(BS));
    assert.ok(/You do not invoke YAGNI/.test(BS));
    assert.ok(/that's a lot.*we could start smaller|start smaller/i.test(BS));
    assert.ok(/opposite of a cautious advisor|expansive product thinker/i.test(BS),
      'the expansive-product-thinker self-description survives');
  });

  test('preserves the 10-star / sweet-spot / 7-8 Chesky framing', () => {
    assert.ok(/10-star version|10-Star Experience/.test(BS));
    assert.ok(/sweet spot/.test(BS));
    assert.ok(/7-8/.test(BS));
  });

  test('preserves Boil-the-Lake + dual time estimates (Human team / Rouge cycles)', () => {
    assert.ok(/## Boil the Lake/.test(BS));
    assert.ok(/Never scope down/.test(BS));
    assert.ok(/Human team.*Rouge.*cycles|Rouge.*cycles.*Human team/is.test(BS));
  });

  test('preserves the three GStack CEO Review techniques as exploration integrations', () => {
    assert.ok(/Premise Challenge/.test(BS));
    assert.ok(/Dream State/.test(BS));
    assert.ok(/Temporal Interrogation/.test(BS));
  });

  test('preserves the loop-back triggers from downstream disciplines', () => {
    for (const disc of ['TASTE', 'COMPETITION', 'SPEC', 'DESIGN']) {
      assert.ok(BS.includes(disc), `missing loop-back source: ${disc}`);
    }
    assert.ok(/Loop-Back Triggers/.test(BS));
  });

  test('preserves one-question-at-a-time interaction discipline', () => {
    assert.ok(/One question at a time/.test(BS));
    assert.ok(/lettered approaches|lettered options|A\).*B\).*C\)/is.test(BS));
  });
});

describe('01-brainstorming.md Opus 4.7 modernization', () => {
  test('no "think step by step" scaffolding', () => {
    assert.ok(!/think step by step/i.test(BS));
  });

  test('no "reason carefully" scaffolding', () => {
    assert.ok(!/reason carefully/i.test(BS));
  });

  test('no "CRITICAL:" / "IMPORTANT:" / "URGENT:" / "YOU MUST" emphatic prefixes', () => {
    assert.ok(!/\bCRITICAL:/.test(BS));
    assert.ok(!/\bIMPORTANT:/.test(BS));
    assert.ok(!/\bURGENT:/.test(BS));
    assert.ok(!/YOU MUST/.test(BS));
  });

  test('no "do NOT" / "Do NOT" / "DO NOT" all-caps emphasis', () => {
    const hits = BS.match(/\b[dD]o NOT\b/g) || [];
    assert.equal(hits.length, 0,
      'no "Do NOT" emphasis should survive (taste-ethos "you do not X" uses lowercase "not")');
  });

  test('no "MUST" all-caps emphasis', () => {
    // "You MUST ask questions" softened to "Ask questions".
    assert.ok(!/\bMUST\b/.test(BS));
  });

  test('no purely-stylistic all-caps emphases (DEEPLY / DEEP / DELIBERATE / NOTABLY / ALWAYS / ONE / GOOD / WORTH)', () => {
    // These were all stylistic caps on ordinary adjectives / adverbs,
    // not incident-tied or identity-defining.
    assert.ok(!/\bDEEPLY\b/.test(BS),
      '"DEEPLY" softened to "deeply"');
    assert.ok(!/go DEEP on/.test(BS));
    assert.ok(!/Go deep on ONE area/.test(BS));
    assert.ok(!/DELIBERATE/.test(BS));
    assert.ok(!/NOTABLY/.test(BS));
    assert.ok(!/ALWAYS include dual/.test(BS));
    assert.ok(!/feature GOOD for the product/.test(BS));
    assert.ok(!/feature WORTH the work/.test(BS));
  });

  test('no "This is NOT" / "This is not a X — it IS a Y" shouty emphasis', () => {
    assert.ok(!/This is NOT a/.test(BS));
    assert.ok(!/This is NOT a linear march/.test(BS));
  });

  test('H3 batched-gate directive softened from "Do NOT fire one gate per feature area"', () => {
    assert.ok(!/Do NOT fire one gate per feature area/.test(BS));
    assert.ok(/one batched gate here rather than one gate per feature area/.test(BS));
  });

  test('has a positive-framed Scope Boundary section (renamed from "What You Do NOT Do")', () => {
    assert.ok(/## Scope Boundary/.test(BS));
    assert.ok(!/## What You Do NOT Do/.test(BS));
    const section = BS.split('## Scope Boundary')[1].split('##')[0];
    // Still cedes to TASTE / SPEC / COMPETITION explicitly.
    assert.ok(/TASTE/.test(section));
    assert.ok(/SPEC/.test(section));
    assert.ok(/COMPETITION/.test(section));
    // Still cedes technology choice to foundation/building.
    assert.ok(/Foundation and building|foundation.*building/i.test(section));
    // Flat-feature-list anti-pattern still called out positively.
    assert.ok(/Flat feature lists fail/i.test(section));
  });

  test('chunked-turn + heartbeat contract preserved for dashboard pacing', () => {
    assert.ok(/chunked-turn|chunked turn/i.test(BS));
    assert.ok(/heartbeats|heartbeat/i.test(BS));
  });
});
