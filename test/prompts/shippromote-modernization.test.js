const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// P1.19 PR 6 on 07-ship-promote.md.

const SP_PATH = path.join(__dirname, '..', '..', 'src', 'prompts', 'loop', '07-ship-promote.md');
const SP = fs.readFileSync(SP_PATH, 'utf8');

describe('07-ship-promote.md behavioral contract', () => {
  test('writes ship_result (required by launcher)', () => {
    assert.ok(SP.includes('ship_result'));
  });

  test('writes ship_error on failure', () => {
    assert.ok(SP.includes('ship_error'));
  });

  test('writes ship_blocked on pre-check failure', () => {
    assert.ok(SP.includes('ship_blocked'));
  });

  test('preserves Gate 1 escalation short-circuit', () => {
    assert.ok(/Gate 1|escalation.*short-circuit/i.test(SP));
    assert.ok(/escalation_needed === true/.test(SP));
    assert.ok(/analysis_recommendation === "notify-human"/.test(SP));
    assert.ok(/analysis_recommendation === "rollback"/.test(SP));
    assert.ok(/evaluation_report\.po\.verdict === "NOT_READY"/.test(SP));
  });

  test('preserves Gate 2 review-readiness dashboard (five required gates)', () => {
    for (const gate of ['test_integrity', 'qa_gate', 'ai_code_audit', 'security_review', 'po_review']) {
      assert.ok(SP.includes(gate), `missing required gate: ${gate}`);
    }
  });

  test('preserves optional gates (a11y, design)', () => {
    assert.ok(/a11y_review/.test(SP));
    assert.ok(/design_review/.test(SP));
  });

  test('preserves deploy-target dispatch (all supported platforms)', () => {
    for (const target of ['Cloudflare', 'Vercel', 'Docker Compose', 'GitHub Pages', 'npm publish']) {
      assert.ok(SP.includes(target), `missing deploy target: ${target}`);
    }
  });

  test('preserves one-attempt-then-escalate rule on promotion failure', () => {
    assert.ok(
      /one.*attempt.*escalate|One attempt|escalat|ship_error/i.test(SP),
      'must preserve the one-attempt-then-escalate rule'
    );
  });

  test('preserves rollback-via-vendor-handler path', () => {
    assert.ok(/pending-action\.json|vendor handler|rollback-production/.test(SP));
  });

  test('preserves version-bump semver classification (patch/minor/major)', () => {
    assert.ok(/\*\*patch\*\*/.test(SP));
    assert.ok(/\*\*minor\*\*/.test(SP));
    assert.ok(/\*\*major\*\*/.test(SP));
  });
});

describe('07-ship-promote.md Opus 4.7 modernization', () => {
  test('no "think step by step" scaffolding', () => {
    assert.ok(!/think step by step/i.test(SP));
  });

  test('no "reason carefully" scaffolding', () => {
    assert.ok(!/reason carefully/i.test(SP));
  });

  test('no shouty prefixes (CRITICAL: / IMPORTANT: / URGENT: / YOU MUST)', () => {
    assert.ok(!/\bCRITICAL:/.test(SP));
    assert.ok(!/\bIMPORTANT:/.test(SP));
    assert.ok(!/\bURGENT:/.test(SP));
    assert.ok(!/YOU MUST/.test(SP));
  });

  test('no "do NOT" / "Do NOT" / "DO NOT" emphasis', () => {
    const shouty = SP.match(/\bdo NOT\b|\bDo NOT\b|\bDO NOT\b/g) || [];
    assert.equal(shouty.length, 0);
  });

  test('no "ANYTHING" / "ANY" all-caps emphasis', () => {
    assert.ok(!/\bANYTHING\b/.test(SP), 'ANYTHING emphasis should be softened');
    assert.ok(!/If ANY gate/.test(SP), 'ANY emphasis in pre-checks should be softened');
  });

  test('uses "Scope Boundary" framing (renamed from "What You Do NOT Do")', () => {
    assert.ok(/## Scope Boundary/.test(SP));
    assert.ok(!/## What You Do NOT Do/.test(SP));
  });

  test('scope boundary keeps "run both pre-checks" rule', () => {
    assert.ok(
      /Run both pre-checks|both pre-checks before any|pre-check.*run|Gate 1.*Gate 2/i.test(SP),
      'scope boundary must preserve the both-pre-checks-run rule'
    );
  });

  test('scope boundary keeps "one deploy attempt; failure escalates" rule', () => {
    assert.ok(
      /One production-deploy attempt|one attempt.*escalate|attempt per cycle|failure escalates/i.test(SP),
      'scope boundary must preserve the one-attempt-then-escalate rule'
    );
  });

  test('scope boundary keeps "no git history rewrite" rule', () => {
    assert.ok(
      /don't rewrite commits|don.t rewrite|history stays as-is|existing loop-branch history|rewriting commits|rewrite git history/i.test(SP),
      'scope boundary must preserve the no-history-rewrite rule'
    );
  });

  test('scope boundary keeps "promote only when every gate passed" rule', () => {
    assert.ok(
      /only when every required gate passed|every required gate|review_readiness_dashboard|required gate/i.test(SP),
      'scope boundary must preserve the gates-required rule'
    );
  });
});
