const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// P1.19 PR 25 on seeding/03-taste.md.
//
// Highest Rouge-taste-voice density in the entire codebase. The
// EXPANSION / HOLD / REDUCTION framing + Chesky / Graham / Altman
// thinker voices + kill-bad-ideas-fast identity + Boil-the-Lake
// expand-scope ethos are ALL in one prompt. Rouge taste ethos memory
// explicitly names this prompt as the surface where rubric-ification
// is the anti-pattern.
//
// Modernization: minimal stylistic softening + exhaustive voice +
// calibration-surface lock-in. Five caps softened, one "Do NOT"
// preserved (beat-discipline), all thinker voices + all expand-
// contract-hold framings preserved.

const T_PATH = path.join(__dirname, '..', '..', 'src', 'prompts', 'seeding', '03-taste.md');
const T = fs.readFileSync(T_PATH, 'utf8');

describe('03-taste.md Rouge taste ethos (Gary Tan voice)', () => {
  test('identity: kill bad ideas fast, sharpen good ones', () => {
    assert.ok(/kill bad ideas fast and sharpen good ones/.test(T));
    assert.ok(/Pure product thinking/.test(T));
    assert.ok(/no architecture, no code, no technical feasibility/.test(T));
  });

  test('preserves EXPANSION / HOLD / REDUCTION triplet as the core framing', () => {
    // This is THE expand/contract/hold framing the Rouge taste ethos
    // memory names as load-bearing. Not a spectrum — a crisp
    // trichotomy.
    assert.ok(/### A\) EXPANSION/.test(T));
    assert.ok(/### B\) HOLD/.test(T));
    assert.ok(/### C\) REDUCTION/.test(T));
    // Signature one-liners for each mode.
    assert.ok(/Push scope UP\. Dream big/.test(T),
      'EXPANSION voice with "UP" preserved by design (directional voice)');
    assert.ok(/Rigor within current scope\. Validate what's proposed/.test(T));
    assert.ok(/Strip to essentials\. Cut ruthlessly/.test(T));
  });

  test('preserves Chesky 10-star framing with all five star ratings', () => {
    assert.ok(/Chesky 10-star experience/.test(T));
    // Each rating labeled.
    assert.ok(/1-star: It exists but barely works/.test(T));
    assert.ok(/3-star: It works, nothing special/.test(T));
    assert.ok(/5-star: It's good, you'd recommend it/.test(T));
    assert.ok(/7-star: It's remarkable, you tell everyone/.test(T));
    assert.ok(/10-star: It's transformative/.test(T));
  });

  test('preserves Graham do-things-that-dont-scale framing', () => {
    assert.ok(/Graham "do things that don't scale"/.test(T));
    assert.ok(/first 10 users that we'd never do for 10,000/.test(T));
  });

  test('preserves Altman leverage-obsession framing', () => {
    assert.ok(/Altman leverage obsession/.test(T));
    assert.ok(/highest-leverage intervention/.test(T));
  });

  test('preserves Boil-the-Lake + dual time estimates', () => {
    assert.ok(/## Boil the Lake: Dual Time Estimates/.test(T));
    assert.ok(/Human team estimate/.test(T));
    assert.ok(/Rouge estimate/.test(T));
    assert.ok(/Never recommend cutting scope because "it's a lot of work\."/.test(T),
      'expand-scope Never-scope-down-for-effort rule stays emphatic');
    assert.ok(/Cut scope because the product doesn't need it, not because the builder can't handle it/.test(T));
  });

  test('preserves voice-guidance interaction rules', () => {
    assert.ok(/Don't manufacture doubt/.test(T));
    assert.ok(/Don't soften bad news/.test(T));
    assert.ok(/Momentum matters/.test(T));
    assert.ok(/Speed is a feature/.test(T));
  });

  test('preserves killer-edge framing', () => {
    // The "killer edge" concept — what this product does that nothing
    // else does — recurs in EXPANSION, HOLD, and Sharpened Brief.
    assert.ok(/killer edge/.test(T));
    assert.ok(/If you cannot name it, that is a KILL signal/.test(T),
      'killer-edge-missing → KILL calibration rule preserved');
  });

  test('preserves dream-state-mapping three-state table', () => {
    assert.ok(/\*\*Current\*\*/.test(T));
    assert.ok(/\*\*After ship\*\*/.test(T));
    assert.ok(/\*\*12-month vision\*\*/.test(T));
    // Vision-drift KILL signal.
    assert.ok(/moves away from the vision, that is a strong KILL signal/.test(T));
  });
});

describe('03-taste.md verdict + calibration surfaces', () => {
  test('binary verdict enum: pass | kill (no weasel states)', () => {
    // Calibration: conditional-pass and maybe would break downstream
    // routing. Asserted in both markdown and JSON forms.
    assert.ok(/"verdict": "pass" \| "kill"/.test(T));
    assert.ok(/VERDICT: PASS/.test(T));
    assert.ok(/VERDICT: KILL/.test(T));
    assert.ok(/No "maybe\." No "conditional pass\.\"/.test(T),
      'no-weasel-verdicts rule preserved');
    assert.ok(/binary outcome is load-bearing/.test(T),
      'binary-verdict rationale added on-site');
  });

  test('mode enum: expansion | hold | reduction', () => {
    assert.ok(/"mode": "expansion" \| "hold" \| "reduction"/.test(T));
  });

  test('preserves Sharpened Brief schema (8 required fields)', () => {
    assert.ok(/## Sharpened Brief/.test(T));
    for (const field of [
      'One-liner', 'Persona', 'Problem', 'Killer edge',
      'Mode applied', 'Scope boundaries', 'Vision alignment',
    ]) {
      assert.ok(T.includes(`**${field}`), `missing Sharpened Brief field: ${field}`);
    }
    // Scope boundaries sub-structure.
    assert.ok(/- IN:/.test(T));
    assert.ok(/- OUT:/.test(T));
    assert.ok(/- DEFERRED:/.test(T));
  });

  test('preserves graveyard entry schema', () => {
    assert.ok(/## Graveyard entry|graveyard entry/.test(T));
    assert.ok(/\*\*Killed because:\*\*/.test(T));
    assert.ok(/\*\*Salvageable kernel:\*\*/.test(T));
  });

  test('kill-signal calibration list (named-explicitly taxonomy)', () => {
    // The five failure modes a KILL verdict can name. Calibration
    // rule: killed_because must name one, not be vague.
    assert.ok(/wrong premise, no persona, no killer edge, scope impossible, competition unbeatable, vision misalignment/.test(T));
  });
});

describe('03-taste.md behavioral contract', () => {
  test('writes seed_spec/taste.md (dashboard verifies this path)', () => {
    assert.ok(/seed_spec\/taste\.md/.test(T));
    assert.ok(/dashboard verifies the artifact at this location/.test(T));
  });

  test('emits [DISCIPLINE_COMPLETE: taste] marker', () => {
    assert.ok(/\[DISCIPLINE_COMPLETE:\s*taste\]/.test(T));
  });

  test('uses orchestrator marker vocabulary', () => {
    assert.ok(T.includes('[GATE:]'));
    assert.ok(T.includes('[DECISION:]'));
    assert.ok(T.includes('[HEARTBEAT:]'));
  });

  test('declares one hard gate + two soft gates by exact ID', () => {
    assert.ok(/taste\/H1-verdict-signoff/.test(T));
    assert.ok(/taste\/S1-kill-ack/.test(T));
    assert.ok(/taste\/S2-premise-challenge/.test(T));
  });

  test('one-gate collapsed-architecture rationale preserved', () => {
    assert.ok(/one gate, not two/.test(T));
    assert.ok(/same decision dressed two ways/.test(T));
  });

  test('seven-step process preserved', () => {
    for (const step of ['## Step 1: Quick Triage', '## Step 2: Premise Challenge', '## Step 3: Who Is This For', '## Step 4: Mode Selection', '## Step 5: Mode-Specific Analysis', '## Step 6: Dream State Mapping', '## Step 7: Verdict']) {
      assert.ok(T.includes(step), `missing step: ${step}`);
    }
  });

  test('re-invocation contract preserved (not one-shot, flip allowed)', () => {
    assert.ok(/## Re-Invocation Contract/.test(T));
    assert.ok(/This discipline is not one-shot/.test(T));
    assert.ok(/A re-invocation CAN flip a previous PASS to KILL or vice versa/.test(T),
      'flip-allowed rule preserved');
    assert.ok(/Do not anchor on prior verdicts/.test(T));
  });

  test('output JSON carries loop_back_triggers for cross-discipline signals', () => {
    assert.ok(T.includes('loop_back_triggers'));
    assert.ok(/target_discipline/.test(T));
    assert.ok(/human_questions_asked/.test(T));
    assert.ok(/re_invocation_count/.test(T));
  });

  test('quick-triage two-path rule preserved', () => {
    assert.ok(/Small enhancement \/ bugfix.*Light pass|Light pass.*Step 2.*Step 7/.test(T));
    assert.ok(/New product \/ significant feature.*Full 7-step/.test(T));
  });

  test('re-invocation always uses full path regardless of scope', () => {
    assert.ok(/On re-invocation, always use the full path regardless of scope/.test(T));
  });
});

describe('03-taste.md Opus 4.7 modernization', () => {
  test('no "think step by step" scaffolding', () => {
    assert.ok(!/think step by step/i.test(T));
  });

  test('no "reason carefully" scaffolding', () => {
    assert.ok(!/reason carefully/i.test(T));
  });

  test('no "CRITICAL:" / "IMPORTANT:" / "URGENT:" / "YOU MUST" emphatic prefixes', () => {
    assert.ok(!/\bCRITICAL:/.test(T));
    assert.ok(!/\bIMPORTANT:/.test(T));
    assert.ok(!/\bURGENT:/.test(T));
    assert.ok(!/YOU MUST/.test(T));
  });

  test('soft-gate ONLY caps softened (taste/S1 + taste/S2)', () => {
    assert.ok(!/fires ONLY if the verdict is KILL/.test(T));
    assert.ok(!/Fire ONLY if brainstorming didn't resolve/.test(T));
    assert.ok(/fires only when the verdict is KILL/.test(T));
    assert.ok(/Fires only when brainstorming didn't resolve/.test(T));
  });

  test('re-invocation "NOT one-shot" softened', () => {
    assert.ok(!/This discipline is NOT one-shot/.test(T));
    assert.ok(/This discipline is not one-shot/.test(T));
  });

  test('"only do ONE thing" softened to "only do one thing"', () => {
    assert.ok(!/only do ONE thing/.test(T));
    assert.ok(/only do one thing/.test(T));
  });

  test('"You MUST produce one of two verdicts" reframed + binary-outcome rationale added', () => {
    assert.ok(!/You MUST produce one of two verdicts/.test(T));
    assert.ok(/^Produce one of two verdicts\./m.test(T));
    assert.ok(/No "maybe\." No "conditional pass\.\"/.test(T));
    assert.ok(/binary outcome is load-bearing/.test(T));
  });

  test('no "MUST" all-caps emphasis', () => {
    assert.ok(!/\bMUST\b/.test(T));
  });

  test('uses "Scope Boundary" framing (renamed from "What This Discipline Does NOT Cover")', () => {
    assert.ok(/## Scope Boundary/.test(T));
    assert.ok(!/## What This Discipline Does NOT Cover/.test(T));
    const section = T.split('## Scope Boundary')[1];
    // Cedes architecture, security, legal, design to their
    // respective disciplines.
    assert.ok(/architecture and technical feasibility/i.test(section));
    assert.ok(/06-legal-privacy\.md/.test(section));
    assert.ok(/05-design\.md/.test(section));
    // Pure-product-thinking identity tag preserved.
    assert.ok(/pure product thinking/i.test(section));
  });

  test('preserved-by-design "Do NOT" count == 1 (beat-discipline one-gate rule)', () => {
    const hits = T.match(/\b[dD]o NOT\b/g) || [];
    assert.equal(hits.length, 1);
    assert.ok(/\*\*Do NOT gate here\.\*\*/.test(T));
  });

  test('preserved-by-design "UP" directional emphasis in EXPANSION', () => {
    // "Push scope UP" is Gary Tan voice — the caps create the
    // expand-scope imperative. Preserved per Rouge taste ethos.
    assert.ok(/Push scope UP/.test(T));
  });
});
