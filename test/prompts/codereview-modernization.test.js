const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// P1.19 PR 23 on 02c-code-review.md.
//
// Judge-side engineering lens. Seven-dimension rubric + weights is the
// scoring instrument — any drift in weights or dimension definitions
// silently changes how code quality scores. Plus integrates the full
// Rouge judgment stack: P0.4 language review dispatch, P1.15 three-
// tier confidence, P1.16 quote-before-score, P1.16b structured
// evidence_ref. This prompt is dense with calibration surfaces;
// modernization is minimal, test coverage is maximal.

const CR_PATH = path.join(__dirname, '..', '..', 'src', 'prompts', 'loop', '02c-code-review.md');
const CR = fs.readFileSync(CR_PATH, 'utf8');

describe('02c-code-review.md seven-dimension rubric (primary calibration surface)', () => {
  test('all seven dimensions named with exact labels', () => {
    // If a label drifts, the launcher / evaluation phase can't parse
    // the dimension scores.
    for (const dim of [
      'Architecture', 'Consistency', 'Robustness', 'Production Risks',
      'Security', 'Dead/Hallucinated Code', 'Tech Debt',
    ]) {
      assert.ok(CR.includes(dim), `missing rubric dimension: ${dim}`);
    }
  });

  test('dimension weights preserved (Architecture 20 / Consistency 10 / Robustness 15 / Production 15 / Security 20 / Dead 10 / Debt 10)', () => {
    // These weights determine the overall score. Drift here changes
    // what "high quality" means silently.
    const weightRow = CR.match(/\| 1 \| Architecture \| 20%.*\n\| 2 \| Consistency \| 10%.*\n\| 3 \| Robustness \| 15%.*\n\| 4 \| Production Risks \| 15%.*\n\| 5 \| Security \| 20%.*\n\| 6 \| Dead\/Hallucinated Code \| 10%.*\n\| 7 \| Tech Debt \| 10%/);
    assert.ok(weightRow, 'rubric weights must preserve the exact distribution (total 100%)');
  });

  test('dimension score range 0-100 preserved', () => {
    assert.ok(/Score each 0-100 with concrete findings/.test(CR));
  });

  test('overall score rule: weighted average of dimension scores', () => {
    assert.ok(/Overall score:.*Weighted average of dimension scores/.test(CR));
  });

  test('critical_findings extracted with explicit definition', () => {
    assert.ok(/critical_findings.*severity CRITICAL|Extract `critical_findings`/.test(CR));
    assert.ok(/security holes, data loss risks, auth bypasses/.test(CR));
  });
});

describe('02c-code-review.md OWASP security review (calibration surface)', () => {
  test('five OWASP-derived categories with exact labels', () => {
    for (const cat of ['Input Validation', 'Auth & Authorization', 'Data Exposure', 'Dependencies', 'Configuration']) {
      assert.ok(CR.includes(cat), `missing OWASP category: ${cat}`);
    }
  });

  test('security-review scope rule: only runs when diff_scope.backend == true', () => {
    assert.ok(/Only when `diff_scope\.backend == true`/.test(CR));
    assert.ok(/Security review: SKIPPED \(frontend-only change\)/.test(CR));
  });

  test('overall verdict rule: PASS if zero CRITICAL findings', () => {
    assert.ok(/Overall verdict: PASS if zero CRITICAL findings/.test(CR));
  });

  test('skipped-security carried forward with previous-cycle reference', () => {
    assert.ok(/carried_forward_from_cycle/.test(CR));
    assert.ok(/"ran": false/.test(CR));
    assert.ok(/"verdict": "SKIPPED"/.test(CR));
  });
});

describe('02c-code-review.md static-analysis toolchain', () => {
  test('names six tools with exact commands', () => {
    assert.ok(/npx eslint/.test(CR));
    assert.ok(/npx jscpd/.test(CR));
    assert.ok(/npx madge --circular/.test(CR));
    assert.ok(/npx knip/.test(CR));
    assert.ok(/npm audit/.test(CR));
    assert.ok(/File Size Analysis/.test(CR));
  });

  test('thresholds preserved (duplication >5%, files >300 lines)', () => {
    assert.ok(/Flag if >5%/.test(CR));
    assert.ok(/Flag files over 300 lines/.test(CR));
    assert.ok(/files_over_300_lines/.test(CR));
  });

  test('degradation thresholds preserved exactly (coverage -2% / duplication +1% / dead code +5)', () => {
    // These thresholds control the degraded: true flag. Drift here
    // silently changes what "regression" means cycle-over-cycle.
    assert.ok(/coverage -2%/.test(CR));
    assert.ok(/duplication \+1%/.test(CR));
    assert.ok(/dead code \+5 items/.test(CR));
  });

  test('degradation comparison against project OWN previous cycle', () => {
    assert.ok(/Compare against the project's OWN previous cycle/.test(CR));
    assert.ok(/Improvement is relative to self/.test(CR));
  });
});

describe('02c-code-review.md P0.4 language-review dispatch boundary', () => {
  test('ownership rule: dispatch lives in the orchestrator, not this prompt', () => {
    // Load-bearing: double-invocation write race on language_review
    // field if this softens.
    assert.ok(/ownership: orchestrator/.test(CR));
    assert.ok(/Do NOT dispatch from inside 02c/.test(CR),
      'dispatch-boundary emphasis stays preserved by design');
    assert.ok(/double-invocation and a write race/.test(CR));
  });

  test('language_review shape documented for consumers', () => {
    for (const field of ['language', 'agent', 'rules_loaded', 'blocking', 'warnings', 'informational', 'uncertain']) {
      assert.ok(CR.includes(field), `missing language_review field: ${field}`);
    }
  });

  test('skipped-language fallback shape preserved', () => {
    assert.ok(/"skipped_reason": "no agent for language '<lang>'"/.test(CR));
  });

  test('Step 2 always runs regardless of language review', () => {
    // Calibration: language review is extra signal, never a
    // replacement. If this softens, missing-agent languages skip AI
    // code audit.
    assert.ok(/Step 2 below\) \*\*always runs regardless\*\*/.test(CR));
    assert.ok(/Language review is extra signal, never a replacement/.test(CR));
  });
});

describe('02c-code-review.md P1.15 / P1.16 / P1.16b evidence discipline', () => {
  test('P1.15 three-tier confidence enum: high | moderate | low', () => {
    assert.ok(/`high \| moderate \| low`/.test(CR));
  });

  test('P1.16 quote-before-score discipline preserved (G-Eval citation)', () => {
    assert.ok(/Quote-before-score discipline \(P1\.16\)/.test(CR));
    assert.ok(/Pattern from G-Eval \(Liu et al\., EMNLP 2023\)/.test(CR));
    assert.ok(/evidence_span.*Verbatim, ≤50 words/.test(CR));
  });

  test('P1.16b structured evidence_ref shape preserved', () => {
    assert.ok(/evidence_ref/.test(CR));
    for (const field of ['"type":', '"path":', '"quote":']) {
      assert.ok(CR.includes(field), `missing evidence_ref field: ${field}`);
    }
    // Two type variants.
    assert.ok(/type: "file"|"type": "file"/.test(CR));
    assert.ok(/type: "cycle_context"/.test(CR));
    // Quote length cap.
    assert.ok(/≤ 250 chars/.test(CR));
  });

  test('fabricated-evidence auto-downgrade rule preserved', () => {
    // Anti-gaming rule: if the launcher can't resolve evidence_ref,
    // it auto-downgrades to moderate. Must stay on-site so the judge
    // doesn't try to game it.
    assert.ok(/Fabricated or mislocated refs auto-downgrade to `moderate`/.test(CR));
    assert.ok(/don't try to sneak a plausible-looking ref past it/.test(CR));
  });

  test('low-confidence-doesnt-deduct rule preserved', () => {
    // P1.15 rule: low confidence is advisory, doesn't subtract from
    // score. Without this rule, judges feel pressure to inflate
    // confidence to "make the finding count."
    assert.ok(/advisory only, doesn't deduct from health score/.test(CR));
  });

  test('evidence_span deprecated but back-compat accepted', () => {
    assert.ok(/Deprecated:.*free-form `evidence_span`/.test(CR));
  });
});

describe('02c-code-review.md behavioral contract', () => {
  test('writes code_review_report (not evaluation_report)', () => {
    assert.ok(CR.includes('code_review_report'));
    // Rule stated explicitly + in Anti-Pattern.
    assert.ok(/not `evaluation_report`/.test(CR));
    assert.ok(/Never write to `evaluation_report`/.test(CR));
  });

  test('code_review_report shape preserves all keys the launcher reads', () => {
    for (const field of [
      'code_quality_baseline', 'ai_code_audit', 'security_review',
      'language_review', 'changed_files', 'evaluator_observations',
    ]) {
      assert.ok(CR.includes(field), `missing code_review_report field: ${field}`);
    }
  });

  test('code_quality_baseline carries all seven metric fields', () => {
    for (const field of ['eslint_errors', 'eslint_warnings', 'duplication_pct', 'circular_deps', 'dead_code_items', 'files_over_300_lines', 'npm_audit']) {
      assert.ok(CR.includes(field), `missing baseline field: ${field}`);
    }
    // npm_audit sub-fields.
    assert.ok(/"critical":/.test(CR));
    assert.ok(/"high":/.test(CR));
    assert.ok(/"moderate":/.test(CR));
    assert.ok(/"low":/.test(CR));
  });

  test('reads cycle_context inputs', () => {
    for (const field of ['active_spec', 'diff_scope', 'implemented', 'previous_cycles', '_cycle_number']) {
      assert.ok(CR.includes(field), `missing cycle_context input: ${field}`);
    }
  });

  test('incremental-scope rule: Step 1 always full-project, Steps 2+3 diff-scoped', () => {
    assert.ok(/scope the AI audit \(Step 2\) and security review \(Step 3\) to changed files only/.test(CR));
    assert.ok(/Step 1 \(static tools\) always runs full-project/.test(CR));
  });

  test('commit template names cycle + score', () => {
    assert.ok(/eval\(code-review\): cycle <N> — audit <score>\/100/.test(CR));
  });

  test('V3 Phase Contract marker present', () => {
    assert.ok(/V3 Phase Contract/.test(CR));
  });
});

describe('02c-code-review.md Anti-Patterns (calibration-drift catchers)', () => {
  test('preserves six "Never" rules verbatim', () => {
    for (const rule of [
      'Never modify production code',
      'Never inflate scores',
      'Never run security review on frontend-only changes',
      'Never write to `evaluation_report`',
      'Never skip the degradation comparison',
      'Never compare against arbitrary baselines',
    ]) {
      assert.ok(CR.includes(rule), `missing Anti-Pattern rule: ${rule}`);
    }
  });

  test('Anti-Pattern "Never" count asserted == 6 (regression catcher)', () => {
    const hits = CR.match(/- \*\*Never /g) || [];
    assert.equal(hits.length, 6);
  });

  test('"Dishonest scores waste cycles" rationale preserved', () => {
    // Calibration integrity: this rule is tied to the downstream
    // routing consequence — scores route cycles.
    assert.ok(/Dishonest scores waste cycles/.test(CR));
    assert.ok(/Downstream phases make routing decisions from your numbers/.test(CR));
  });
});

describe('02c-code-review.md Opus 4.7 modernization', () => {
  test('no "think step by step" scaffolding', () => {
    assert.ok(!/think step by step/i.test(CR));
  });

  test('no "reason carefully" scaffolding', () => {
    assert.ok(!/reason carefully/i.test(CR));
  });

  test('no "CRITICAL:" / "IMPORTANT:" / "URGENT:" / "YOU MUST" emphatic prefixes', () => {
    // "CRITICAL" as a severity-level enum is valid; the shouty-prefix
    // form with colon is not.
    assert.ok(!/\bCRITICAL:\s/.test(CR));
    assert.ok(!/\bIMPORTANT:/.test(CR));
    assert.ok(!/\bURGENT:/.test(CR));
    assert.ok(!/YOU MUST/.test(CR));
  });

  test('no "MUST" all-caps emphasis in prose (enum MUST stays when inside example JSON / code blocks)', () => {
    assert.ok(!/\bMUST\b/.test(CR));
  });

  test('stylistic "ANY metric" / "ALL changed files" softened', () => {
    assert.ok(!/if ANY metric worsened/.test(CR));
    assert.ok(!/Audit ALL changed files/.test(CR));
  });

  test('"(NOT `evaluation_report`)" reframed with on-site rationale', () => {
    assert.ok(!/\(NOT `evaluation_report`\)/.test(CR));
    assert.ok(/not `evaluation_report`, which belongs to the downstream evaluation phase/.test(CR));
  });

  test('preserved-by-design "Do NOT" count is exactly 1 (dispatch-boundary for double-invocation guard)', () => {
    const hits = CR.match(/\b[dD]o NOT\b/g) || [];
    assert.equal(hits.length, 1);
    assert.ok(/Do NOT dispatch from inside 02c/.test(CR));
  });
});
