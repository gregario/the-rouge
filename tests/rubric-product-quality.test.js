'use strict';

/**
 * Tests the Rouge-native product-quality rubric (P1.14).
 *
 * The rubric is a measurement instrument — per GC.1 it's not editable by
 * Rouge's self-improve pipeline. These tests assert its structural
 * invariants so prompt/launcher consumers can rely on the shape:
 *   - file exists at the expected path
 *   - declares the 6 v1 dimensions
 *   - each dimension has 0/1/2/3 anchors
 *   - frontmatter declares version, status, authored metadata
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RUBRIC_PATH = path.join(__dirname, '..', 'library', 'rubrics', 'product-quality-v1.md');

const EXPECTED_DIMENSIONS = [
  'Journey completeness',
  'Interaction fidelity',
  'Visual coherence',
  'Content grounding',
  'Edge resilience',
  'Vision fit',
];

test('product-quality-v1 rubric exists at expected path', () => {
  assert.ok(fs.existsSync(RUBRIC_PATH), `rubric missing at ${RUBRIC_PATH}`);
});

test('rubric declares frontmatter with required metadata', () => {
  const content = fs.readFileSync(RUBRIC_PATH, 'utf8');
  assert.match(content, /^---\n/);
  assert.match(content, /\nid: product-quality\n/);
  assert.match(content, /\nname: Product Quality Rubric\n/);
  assert.match(content, /\nversion: 1\n/);
  assert.match(content, /\nstatus: active\n/);
  assert.match(content, /\nauthored: human\n/);
  assert.match(content, /\norigin: Rouge\n/);
});

test('rubric contains all 6 expected dimensions', () => {
  const content = fs.readFileSync(RUBRIC_PATH, 'utf8');
  for (const dim of EXPECTED_DIMENSIONS) {
    const rx = new RegExp(`## Dimension \\d+ — ${dim.replace(/\s/g, '\\s')}`, 'i');
    assert.match(content, rx, `dimension missing: ${dim}`);
  }
});

test('each dimension has 0/1/2/3 anchors in a score table', () => {
  const content = fs.readFileSync(RUBRIC_PATH, 'utf8');
  // Dimensions are separated by `## Dimension N — ...` headers.
  const sections = content.split(/(?=^## Dimension \d+ — )/gm).slice(1);
  assert.equal(sections.length, 6, `expected 6 dimension sections, got ${sections.length}`);
  for (const sec of sections) {
    for (const score of ['**3**', '**2**', '**1**', '**0**']) {
      assert.ok(sec.includes(score), `section missing ${score}:\n${sec.slice(0, 200)}`);
    }
  }
});

test('rubric declares verdict aggregation rule (PRODUCTION_READY / NEEDS_IMPROVEMENT / NOT_READY)', () => {
  const content = fs.readFileSync(RUBRIC_PATH, 'utf8');
  assert.match(content, /PRODUCTION_READY/);
  assert.match(content, /NEEDS_IMPROVEMENT/);
  assert.match(content, /NOT_READY/);
});

test('rubric documents confidence calculation', () => {
  const content = fs.readFileSync(RUBRIC_PATH, 'utf8');
  assert.match(content, /confidence\s*=\s*\(sum of dimension scores\)\s*\/\s*\(6 dimensions × 3 max\)/);
});

test('rubric file is in self-improve blocklist', () => {
  const config = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'rouge.config.json'),
    'utf8'
  ));
  const blocklist = config.self_improvement.blocklist;
  // library/rubrics/** is the expected block pattern
  assert.ok(
    blocklist.includes('library/rubrics/**'),
    `library/rubrics/** missing from self-improve blocklist: ${JSON.stringify(blocklist)}`
  );
});

test('02e-evaluation.md references the rubric', () => {
  const prompt = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'prompts', 'loop', '02e-evaluation.md'),
    'utf8'
  );
  assert.match(prompt, /library\/rubrics\/product-quality-v1\.md/);
  // The PO lens should call out scoring against the rubric
  assert.match(prompt, /rubric_scores/);
});

test('rubric output shape documents evidence_ref (P1.16b)', () => {
  const content = fs.readFileSync(RUBRIC_PATH, 'utf8');
  assert.match(content, /evidence_ref/);
  // Structured reference shape
  assert.match(content, /"type":\s*"cycle_context"/);
});

test('rubric preserves the "strong opinions" taste ethos — anchors contain visceral language', () => {
  const content = fs.readFileSync(RUBRIC_PATH, 'utf8').toLowerCase();
  // Presence of specific opinionated phrases (vs a bland checklist rubric).
  // Case-insensitive because the rubric uses natural prose capitalization.
  const visceralPhrases = [
    "don't soften",             // discipline note
    'visceral',                  // discipline note
    'what a 3 feels like',       // per-dimension "what greatness feels like"
    'close the tab',             // vivid anchor language (visual coherence)
  ];
  for (const phrase of visceralPhrases) {
    assert.ok(content.includes(phrase), `missing visceral phrase: "${phrase}"`);
  }
});
