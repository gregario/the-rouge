const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// P1.19 PR 2 on 08-document-release.md. Same pattern as retro: lock in
// the behavioral contract (output fields) AND the modernization
// invariants (no scaffolding, no shouty emphasis, positive-lead scope
// boundary).

const DOCREL_PATH = path.join(__dirname, '..', '..', 'src', 'prompts', 'loop', '08-document-release.md');
const DOCREL = fs.readFileSync(DOCREL_PATH, 'utf8');

describe('08-document-release.md behavioral contract', () => {
  test('writes doc_release_result to cycle_context', () => {
    assert.ok(DOCREL.includes('doc_release_result'));
  });

  test('writes doc_subjective_changes for human review', () => {
    assert.ok(DOCREL.includes('doc_subjective_changes'));
  });

  test('writes doc_consistency_fixes', () => {
    assert.ok(DOCREL.includes('doc_consistency_fixes'));
  });

  test('still reads ship_result', () => {
    assert.ok(/ship_result/.test(DOCREL));
  });

  test('still reads implemented + divergences + factory_decisions', () => {
    assert.ok(/`implemented`/.test(DOCREL));
    assert.ok(/`divergences`/.test(DOCREL));
    assert.ok(/`factory_decisions`/.test(DOCREL));
  });

  test('preserves the factual vs subjective distinction', () => {
    assert.ok(/Factual|factual/.test(DOCREL));
    assert.ok(/Subjective|subjective/.test(DOCREL));
    assert.ok(
      /subjective (changes?|improvements?|edits?).*(are logged|go into|logged for|doc_subjective_changes)/i.test(DOCREL),
      'must preserve "subjective → logged, not auto-applied" rule'
    );
  });

  test('keeps the one-commit-per-phase instruction', () => {
    assert.ok(/One commit|one commit/.test(DOCREL));
  });

  test('keeps per-file audit sections (README, ARCHITECTURE, CONTRIBUTING, CLAUDE, CHANGELOG, TODOS)', () => {
    for (const f of ['README.md', 'ARCHITECTURE.md', 'CONTRIBUTING.md', 'CLAUDE.md', 'CHANGELOG.md', 'TODOS.md']) {
      assert.ok(DOCREL.includes(f), `missing audit section for ${f}`);
    }
  });
});

describe('08-document-release.md Opus 4.7 modernization', () => {
  test('no "think step by step" scaffolding', () => {
    assert.ok(!/think step by step/i.test(DOCREL));
  });

  test('no "reason carefully" scaffolding', () => {
    assert.ok(!/reason carefully/i.test(DOCREL));
  });

  test('no shouty "CRITICAL:" / "URGENT:" / "IMPORTANT:" / "YOU MUST"', () => {
    assert.ok(!/\bCRITICAL:/.test(DOCREL));
    assert.ok(!/\bURGENT:/.test(DOCREL));
    assert.ok(!/\bIMPORTANT:/.test(DOCREL));
    assert.ok(!/YOU MUST/.test(DOCREL));
  });

  test('uses "Scope Boundary" framing (renamed from "What You Do NOT Do")', () => {
    assert.ok(/Scope Boundary/.test(DOCREL), 'scope section must be renamed');
    assert.ok(!/What You Do NOT Do/.test(DOCREL), 'old heading should be gone');
  });

  test('scope boundary keeps docs-only guarantee', () => {
    // Docs-only is load-bearing — if a future edit softens this, the
    // phase could silently start editing code.
    assert.ok(
      /Stay in docs|documentation only|documentation-only|docs only|doc.only/i.test(DOCREL),
      'must keep the docs-only scope guarantee'
    );
  });

  test('scope boundary keeps "subjective changes go to review, not inline"', () => {
    // This is the taste-safety rule — without it, the phase could
    // auto-apply subjective edits that should be a human call.
    assert.ok(
      /subjective (improvements|changes).*(log|review|doc_subjective_changes)|log.*subjective/i.test(DOCREL),
      'must keep the "log subjective changes, don\'t auto-apply" rule'
    );
  });

  test('scope boundary keeps "update the delta, not a rewrite"', () => {
    assert.ok(
      /delta|keep prose that is still accurate|update what.*changed|not a full rewrite|don.t rewrite/i.test(DOCREL),
      'must keep the "edit the delta, not a full rewrite" instruction'
    );
  });
});
