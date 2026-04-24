const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// P1.19 PR 26 on 02e-evaluation.md — the final judge prompt.
//
// The judgment synthesizer where every calibration feature in the
// Rouge judgment layer converges:
//   - P1.14 product-quality rubric (6 dimensions, ordinal 0-3)
//   - P1.15 three-tier confidence (high | moderate | low)
//   - P1.16 quote-before-score discipline (G-Eval pattern)
//   - P1.16b structured evidence_ref
//   - P1.20 unknown verdict escape hatch
//   - P1.21 capability-check routing
//   - P0.9 variant tracker (heuristic_runs[])
//
// Calibration drift here propagates into every cycle's verdict. The
// modernization approach: minimum viable softening (5 caps), maximum
// test coverage across every calibration surface.

const E_PATH = path.join(__dirname, '..', '..', 'src', 'prompts', 'loop', '02e-evaluation.md');
const E = fs.readFileSync(E_PATH, 'utf8');

describe('02e-evaluation.md judge identity', () => {
  test('judge, not executor', () => {
    assert.ok(/You are the \*\*Evaluation phase\*\* — the judge/.test(E));
    assert.ok(/You do NOT open a browser\. You do NOT run CLI tools/.test(E),
      'identity boundaries stay emphatic — judge reads evidence, never produces it');
    assert.ok(/You read, analyze, and judge/.test(E));
  });

  test('every claim references specific observation', () => {
    // Anti-hallucination calibration rule.
    assert.ok(/Every claim you make must reference specific observations by screen route, element, or finding ID/.test(E));
  });

  test('three-lens structure preserved (QA / Design / PO) with one-liner questions', () => {
    assert.ok(/### Lens 1: QA \(Spec Compliance\)/.test(E));
    assert.ok(/### Lens 2: Design \(UI\/UX Quality\)/.test(E));
    assert.ok(/### Lens 3: PO \(Product Quality\)/.test(E));
    assert.ok(/"Did the devs deliver what was asked\?"/.test(E));
    assert.ok(/"Does this look and feel like a real product\?"/.test(E));
    assert.ok(/"Would you put this in front of a real user without hedging\?"/.test(E));
  });
});

describe('02e-evaluation.md P1.16 quote-before-score discipline', () => {
  test('G-Eval citation preserved with Anthropic long-document grounding', () => {
    assert.ok(/Quote-before-score discipline \(P1\.16\)/.test(E));
    assert.ok(/Pattern from G-Eval \(Liu et al\., EMNLP 2023\)/.test(E));
    assert.ok(/Anthropic's long-document guidance/.test(E));
  });

  test('three-step discipline preserved', () => {
    assert.ok(/First collect verbatim quotes/.test(E));
    assert.ok(/Then write the verdict grounded only in what you quoted/.test(E));
    assert.ok(/must reference one or more of these quoted spans/.test(E));
  });

  test('50-word quote cap preserved', () => {
    assert.ok(/Each quote ≤50 words/.test(E));
  });

  test('anti-pattern: verdict-first / back-fill-evidence preserved', () => {
    assert.ok(/writing a verdict first and then back-filling evidence/.test(E));
    assert.ok(/the mechanism by which judges hallucinate specific-sounding findings/.test(E));
  });
});

describe('02e-evaluation.md P1.20 unknown verdict escape hatch', () => {
  test('unknown verdict enum member preserved', () => {
    assert.ok(/`unknown`/.test(E));
    assert.ok(/pass.*fail.*partial.*env_limited.*unknown|pass\/fail\/partial\/env_limited\/unknown/.test(E));
  });

  test('unknown-vs-env_limited distinction preserved (critical calibration rule)', () => {
    // If these two concepts blur, the pass-rate calculation drifts.
    assert.ok(/`env_limited` = code exists and is structurally correct/.test(E));
    assert.ok(/Counts as passed/.test(E));
    assert.ok(/`unknown` = evidence was not produced/.test(E));
    assert.ok(/Counts as neither/.test(E));
  });

  test('unknown rule: no guessing + excluded from denominator + re-walk required', () => {
    assert.ok(/Do NOT guess/.test(E),
      'no-guess integrity rule on unknown verdict stays emphatic');
    assert.ok(/excluded from the denominator/.test(E));
    assert.ok(/add a `re_walk_requests` entry/.test(E));
  });

  test('env_limited anti-abuse rule: applies only when three conditions hold', () => {
    assert.ok(/Do NOT use `env_limited` as an escape hatch for real failures/.test(E),
      'env_limited anti-abuse rule stays emphatic');
    // Three specific conditions.
    assert.ok(/test environment inherently cannot verify/.test(E));
    assert.ok(/code path exists and is structurally correct/.test(E));
    assert.ok(/limitation is environmental, not a product bug/.test(E));
  });

  test('common env_limited scenarios taxonomy preserved', () => {
    for (const scenario of [
      'MapLibre/Mapbox/Leaflet map rendering',
      'Canvas-based visualisations',
      'WebSocket/SSE real-time updates',
      'GPS/geolocation features',
      'Camera/media capture',
      'Web Audio API',
    ]) {
      assert.ok(E.includes(scenario), `missing env_limited scenario: ${scenario}`);
    }
  });

  test('infrastructure-limitation respect rule (story builder classifications)', () => {
    // Calibration: the story builder classified env_limitations with
    // full code context; the judge shouldn't second-guess.
    assert.ok(/the story builder already classified these during building/.test(E));
    assert.ok(/Respect those classifications/.test(E));
  });
});

describe('02e-evaluation.md P1.14 product-quality rubric integration', () => {
  test('rubric file referenced (not duplicated inline)', () => {
    // GC.1: judge surfaces are human-authored. The prompt references
    // library/rubrics/product-quality-v1.md; drift in either file
    // without the other would break calibration.
    assert.ok(/library\/rubrics\/product-quality-v1\.md/.test(E));
    assert.ok(/Primary rubric/.test(E));
  });

  test('six rubric dimensions named', () => {
    for (const dim of [
      'Journey completeness', 'Interaction fidelity',
      'Visual coherence', 'Content grounding',
      'Edge resilience', 'Vision fit',
    ]) {
      assert.ok(E.includes(dim), `missing rubric dimension: ${dim}`);
    }
  });

  test('ordinal scale 0-3 + per-dimension output shape preserved', () => {
    assert.ok(/0–3 ordinal scale|0-3 ordinal/.test(E));
    assert.ok(/`score`: 0 \| 1 \| 2 \| 3/.test(E));
    assert.ok(/`rationale`/.test(E));
    assert.ok(/`evidence_ref`: structured reference per P1\.15 \+ P1\.16b/.test(E));
    assert.ok(/rubric_scores\[<dimension_snake_case>\]/.test(E));
  });

  test('rationale must cite product_walk, not restate the anchor', () => {
    assert.ok(/one sentence citing specific product_walk evidence — NOT a restatement of the anchor/.test(E),
      'anti-checklist calibration rule — rationale must be observation, not anchor paraphrase');
  });

  test('PO verdict aggregation rules preserved verbatim', () => {
    // These are the binary rules that determine whether a product
    // ships. Drift here changes what "ready" means.
    assert.ok(/every dimension ≥ 2, at least one at 3, zero dimensions at 0/.test(E),
      'PRODUCTION_READY aggregation rule');
    assert.ok(/NEEDS_IMPROVEMENT.*any dimension at 1, none at 0/.test(E));
    assert.ok(/NOT_READY.*any dimension at 0/.test(E));
  });

  test('confidence formulas preserved (raw = sum/18, adjusted excludes env_limited)', () => {
    assert.ok(/\(sum of rubric_scores\) \/ \(6 × 3\)/.test(E));
    assert.ok(/excluding dimensions that are entirely env_limited/.test(E));
    assert.ok(/Shrink the denominator accordingly/.test(E));
  });

  test('capability-check escalation routing for NOT_READY preserved (P1.21)', () => {
    assert.ok(/escalate via capability-check \(P1\.21\)/.test(E));
    assert.ok(/out of Rouge's capability surface/.test(E));
  });

  test('analyzing threshold cuts preserved (≥0.7 deepen, ≥0.9 promote)', () => {
    assert.ok(/≥ 0\.7 for deepen, ≥ 0\.9 for promote/.test(E));
  });

  test('verdict-vs-confidence authority rule preserved', () => {
    assert.ok(/authoritative signal for routing/.test(E));
    assert.ok(/downstream phases route on the verdict, not the float/.test(E));
  });
});

describe('02e-evaluation.md P1.15 + P1.16b confidence + evidence_ref', () => {
  test('closed confidence vocabulary with exact definitions + examples', () => {
    assert.ok(/\bhigh \| moderate \| low\b/.test(E));
    // Per-tier definition rules.
    assert.ok(/Direct observation in product_walk \+ specific screen:element reference/.test(E));
    assert.ok(/Inferred from code_review_report without direct walk evidence/.test(E));
    assert.ok(/Pattern-matched but without structural confirmation/.test(E));
  });

  test('evidence_ref shape preserved (two type variants + 250-char quote cap)', () => {
    assert.ok(/"type": "cycle_context" \| "file"/.test(E));
    assert.ok(/"path":/.test(E));
    assert.ok(/"quote":/.test(E));
    assert.ok(/≤ 250 chars/.test(E));
    // Both path variants named.
    assert.ok(/product_walk\.screens\[2\]\.interactive_elements\[1\]\.result/.test(E));
    assert.ok(/src\/auth\.ts:42-48/.test(E));
  });

  test('launcher-resolves-path-and-verifies-quote rule preserved', () => {
    // Anti-gaming: fabricated refs auto-downgrade.
    assert.ok(/the launcher resolves `path` and verifies `quote`/.test(E));
    assert.ok(/confidence automatically downgrades to `moderate`/.test(E));
    assert.ok(/Fabricated references cannot survive this check/.test(E));
  });

  test('fuzzy-match-within-one-field rule preserved (prevents whole-haystack paraphrase)', () => {
    assert.ok(/high-threshold fuzzy match within the one field, not the whole haystack/.test(E));
  });

  test('low-confidence-doesnt-deduct rule preserved', () => {
    assert.ok(/`low` findings are informational only/.test(E));
    assert.ok(/applies to findings with `confidence: high` OR `moderate`/.test(E));
  });

  test('five finding arrays require confidence field', () => {
    for (const arr of ['fix_tasks', 'critical_findings', 'improvement_items', 'copy_findings', 'a11y_review.findings']) {
      assert.ok(E.includes(`\`${arr}[]\``) || E.includes(`${arr}`), `confidence required on ${arr}`);
    }
    assert.ok(/carries a `confidence` field/.test(E));
  });

  test('deprecated evidence_span back-compat preserved', () => {
    assert.ok(/Deprecated:.*`evidence_span` free-form field/.test(E));
  });
});

describe('02e-evaluation.md P0.9 variant tracker (heuristic_runs)', () => {
  test('heuristic_runs output shape preserved (entry_id / variant_id / outcome / evidence)', () => {
    for (const field of ['entry_id', 'variant_id', 'outcome', 'evidence']) {
      assert.ok(E.includes(field), `missing heuristic_runs field: ${field}`);
    }
  });

  test('outcome enum preserved: pass | fail | env_limited', () => {
    assert.ok(/"outcome": "pass" \| "fail" \| "env_limited"/.test(E));
  });

  test('active-vs-shadow routing rule preserved', () => {
    assert.ok(/Only the `active` variant counts toward the heuristic pass\/fail verdict/.test(E));
    assert.ok(/Shadow variant outcomes.*recorded alongside.*do not affect routing/.test(E));
  });

  test('evidence.measured_value + threshold let aggregation tools recompute', () => {
    assert.ok(/evidence\.measured_value.*evidence\.threshold/.test(E));
    assert.ok(/recompute outcomes against proposed amendments/.test(E));
  });

  test('v1-shape back-compat: empty variants[] emits baseline', () => {
    assert.ok(/If an entry has no `variants\[\]` \(v1 shape\), emit a single entry with `variant_id: "baseline"`/.test(E));
  });

  test('heuristic_runs written at top level of cycle_context.json', () => {
    // NOT inside evaluation_report — launcher reads it separately.
    assert.ok(/at the top level of cycle_context\.json \(not inside evaluation_report\)/.test(E));
    assert.ok(/\.rouge\/heuristic-runs\.jsonl/.test(E));
  });
});

describe('02e-evaluation.md QA lens verdict rules (routing calibration)', () => {
  test('criteria_pass_rate formula: (pass + env_limited) / (total - unknown)', () => {
    assert.ok(/Numerator: `pass \+ env_limited`/.test(E));
    assert.ok(/Denominator: `total - unknown`/.test(E));
  });

  test('div-by-zero guard preserved (null rate → FAIL with insufficient-evidence)', () => {
    assert.ok(/if denominator is 0.*emit `criteria_pass_rate: null` and \*\*do NOT divide\*\*/.test(E),
      'div-by-zero guard stays emphatic');
    assert.ok(/verdict_reason: "insufficient-evidence"/.test(E));
    // Every unknown must have a re_walk_requests entry.
    assert.ok(/every `unknown` criterion MUST have a corresponding entry in `re_walk_requests`/.test(E));
  });

  test('QA PASS verdict requires six conditions (all AND)', () => {
    assert.ok(/\*\*PASS:\*\* zero CRITICAL findings AND `criteria_pass_rate` is numeric AND `criteria_pass_rate >= 0\.9` AND health >= 70 AND security PASS AND a11y PASS/.test(E));
  });

  test('QA FAIL verdict conditions preserved (any OR triggers FAIL)', () => {
    assert.ok(/\*\*FAIL:\*\* any CRITICAL finding OR `criteria_pass_rate` is null OR `criteria_pass_rate < 0\.9` OR health < 70 OR security FAIL OR a11y FAIL/.test(E));
  });
});

describe('02e-evaluation.md Design lens', () => {
  test('eight design categories with exact labels', () => {
    for (const cat of ['Typography', 'Color', 'Spacing', 'Layout', 'Components', 'Interaction', 'Content & Copy', 'Polish']) {
      assert.ok(E.includes(cat), `missing design category: ${cat}`);
    }
  });

  test('copy-quality sub-check preserved (AI-voice detection)', () => {
    assert.ok(/Copy quality sub-check/.test(E));
    assert.ok(/sound human or AI-generated/.test(E));
    assert.ok(/copy_findings/.test(E));
  });

  test('AI slop detection rubric preserved with signature red flags', () => {
    assert.ok(/AI slop detection/.test(E));
    for (const slop of ['Next-generation', 'AI-powered', 'Seamlessly integrated', 'Lorem Ipsum', 'gratuitous gradients']) {
      assert.ok(E.includes(slop), `missing slop flag: ${slop}`);
    }
  });

  test('a11y review verdict rule: PASS if zero CRITICAL findings', () => {
    assert.ok(/Verdict: PASS if zero CRITICAL a11y findings/.test(E));
  });
});

describe('02e-evaluation.md health score + WTF heuristic', () => {
  test('severity deduction table preserved (CRITICAL -10 / HIGH -5 / MEDIUM -2 / LOW -1 cap -10)', () => {
    assert.ok(/CRITICAL \| -10 each \| none/.test(E));
    assert.ok(/HIGH \| -5 each \| none/.test(E));
    assert.ok(/MEDIUM \| -2 each \| none/.test(E));
    assert.ok(/LOW \| -1 each \| max -10 total from LOW/.test(E));
  });

  test('WTF-likelihood heuristic bands preserved', () => {
    assert.ok(/WTF-likelihood heuristic/.test(E));
    assert.ok(/0 WTF\/min: no deduction/.test(E));
    assert.ok(/1-2 WTF\/min: -5/.test(E));
    assert.ok(/3-5 WTF\/min: -10/.test(E));
    assert.ok(/>5 WTF\/min: -20/.test(E));
  });
});

describe('02e-evaluation.md improvement_items (product-completeness observations)', () => {
  test('improvement_item shape preserved (id/description/evidence/scope/severity/grounding)', () => {
    for (const field of ['"id":', '"description":', '"evidence":', '"scope":', '"severity":', '"grounding":']) {
      assert.ok(E.includes(field), `missing improvement_item field: ${field}`);
    }
  });

  test('scope enum: this-milestone | global | future-milestone', () => {
    assert.ok(/`this-milestone`/.test(E));
    assert.ok(/`global`/.test(E));
    assert.ok(/`future-milestone`/.test(E));
  });

  test('severity clamped to low | medium (high/critical = quality gap, not improvement)', () => {
    assert.ok(/`severity`: `low \| medium`/.test(E));
    assert.ok(/if it were high\/critical, it would be a quality gap dragging down confidence/.test(E));
  });

  test('grounding rule preserved (must-reference AC / vision / heuristic)', () => {
    assert.ok(/Every improvement item MUST reference a specific acceptance criterion/.test(E),
      'grounding rule stays emphatic — prevents scope creep / designed-by-committee');
    assert.ok(/"It would be nice if\.\.\." is not grounded/.test(E));
    assert.ok(/If you cannot ground it, do not emit it/.test(E));
  });
});

describe('02e-evaluation.md behavioral contract', () => {
  test('writes evaluation_report with three lens keys + health_score + re_walk_requests', () => {
    for (const key of ['evaluation_report', 'qa', 'design', 'po', 'health_score', 're_walk_requests']) {
      assert.ok(E.includes(key), `missing output key: ${key}`);
    }
  });

  test('verdict enums preserved: QA PASS|FAIL, PO PRODUCTION_READY|NEEDS_IMPROVEMENT|NOT_READY', () => {
    assert.ok(/"verdict": "PASS\|FAIL"/.test(E));
    assert.ok(/"verdict": "PRODUCTION_READY\|NEEDS_IMPROVEMENT\|NOT_READY"/.test(E));
  });

  test('recommended_action enum preserved (5 values)', () => {
    for (const action of ['continue', 'deepen:<area>', 'broaden', 'rollback', 'notify-human']) {
      assert.ok(E.includes(action), `missing recommended_action: ${action}`);
    }
  });

  test('data-provenance rules preserved (who produces which output field)', () => {
    assert.ok(/code_quality_baseline`, `ai_code_audit`, `security_review` → copied from `code_review_report`/.test(E));
    assert.ok(/performance_baseline\.lighthouse_scores` → aggregated from `product_walk/.test(E));
    assert.ok(/criteria_results`, `functional_correctness` → produced by QA lens/.test(E));
    assert.ok(/journey_quality`, `screen_quality`, `heuristic_results` → produced by PO lens/.test(E));
  });

  test('fix_tasks shape preserved (id/source/description/evidence/severity/suggested_fix)', () => {
    for (const field of ['fix-<lens>-<short-description>', '"source"', '"severity"', '"suggested_fix"']) {
      assert.ok(E.includes(field), `missing fix_task field: ${field}`);
    }
  });

  test('re_walk_requests shape preserved (screen/need/lens triplet matches 02f contract)', () => {
    // Must match the read-shape in 02f-re-walk.md: {screen, need, lens}.
    assert.ok(/"screen":\s*"\/settings",\s*"need":\s*"modal state after clicking Delete Account",\s*"lens":\s*"qa"/.test(E));
  });

  test('V3 Phase Contract marker present', () => {
    assert.ok(/V3 Phase Contract/.test(E));
  });
});

describe('02e-evaluation.md Anti-Patterns (judge-discipline catchers)', () => {
  test('preserves six "Never" Anti-Pattern rules verbatim', () => {
    for (const rule of [
      'Never open a browser or run `$B` commands',
      'Never run CLI tools',
      'Never skip the `evaluation_report` write',
      'Never hallucinate observations',
      'Never modify production code',
      'Never inflate or deflate scores',
    ]) {
      assert.ok(E.includes(rule), `missing Anti-Pattern rule: ${rule}`);
    }
  });

  test('Anti-Pattern "Never" count asserted == 6 (regression catcher)', () => {
    const hits = E.match(/- \*\*Never /g) || [];
    assert.equal(hits.length, 6);
  });

  test('"Downstream phases route on your numbers" calibration integrity rationale', () => {
    assert.ok(/Downstream phases route on your numbers\. Dishonest scores waste cycles or ship broken products/.test(E));
  });

  test('launcher-reads-specific-keys rule preserved (transition integrity)', () => {
    assert.ok(/launcher reads `evaluation_report\.qa\.verdict` and `evaluation_report\.po\.recommended_action`/.test(E));
    assert.ok(/Missing keys break transitions/.test(E));
  });
});

describe('02e-evaluation.md Opus 4.7 modernization', () => {
  test('no "think step by step" scaffolding', () => {
    assert.ok(!/think step by step/i.test(E));
  });

  test('no "reason carefully" scaffolding', () => {
    assert.ok(!/reason carefully/i.test(E));
  });

  test('no "CRITICAL:" / "IMPORTANT:" / "URGENT:" / "YOU MUST" emphatic prefixes', () => {
    // CRITICAL stays as severity enum; shouty-prefix colon form is
    // separate.
    assert.ok(!/\bCRITICAL:\s/.test(E));
    assert.ok(!/\bIMPORTANT:/.test(E));
    assert.ok(!/\bURGENT:/.test(E));
    assert.ok(!/YOU MUST/.test(E));
  });

  test('stylistic MUST caps softened: P1.16 + P1.15 + P1.16b field-required rules', () => {
    assert.ok(!/MUST reference one or more of these quoted spans/.test(E));
    assert.ok(/must reference one or more of these quoted spans/.test(E));
    assert.ok(!/MUST have a `confidence` field/.test(E));
    assert.ok(/carries a `confidence` field/.test(E));
    assert.ok(!/MUST include an `evidence_ref`/.test(E));
    assert.ok(/must include an `evidence_ref`/.test(E));
    assert.ok(!/MUST migrate to `evidence_ref`/.test(E));
    assert.ok(/must migrate to `evidence_ref`/.test(E));
  });

  test('env_limited stylistic caps softened (NOT fail, ALL findings, AUTHORITATIVE)', () => {
    assert.ok(!/verdict is `env_limited` — NOT `fail`/.test(E));
    assert.ok(/verdict is `env_limited` — not `fail`/.test(E));
    assert.ok(!/Collect ALL findings from all three lenses/.test(E));
    assert.ok(/Collect every finding from all three lenses/.test(E));
    assert.ok(!/AUTHORITATIVE signal/.test(E));
    assert.ok(/authoritative signal/.test(E));
    assert.ok(!/It applies ONLY when:/.test(E));
    assert.ok(/It applies only when:/.test(E));
  });

  test('preserved-by-design "MUST" count == 3 (shadow-variant + grounding + re-walk)', () => {
    // Three preserved "MUST" emphases, each load-bearing:
    //   1. Shadow variant outcomes MUST be recorded alongside (P0.9)
    //   2. Every improvement item MUST reference an AC (grounding)
    //   3. Every unknown criterion MUST have a re_walk_requests entry
    const hits = E.match(/\bMUST\b/g) || [];
    assert.equal(hits.length, 3,
      'exactly 3 preserved-by-design MUST emphases expected');
    assert.ok(/Shadow variant outcomes MUST be recorded alongside/.test(E));
    assert.ok(/Every improvement item MUST reference a specific acceptance criterion/.test(E));
    assert.ok(/every `unknown` criterion MUST have a corresponding entry in `re_walk_requests`/.test(E));
  });

  test('preserved-by-design "do NOT" count == 7 (identity + integrity stack)', () => {
    // All seven "do NOT" / "Do NOT" emphases are preserved by design
    // because each guards a specific calibration mode:
    //   1. "You do NOT open a browser" — judge identity
    //   2. "You do NOT run CLI tools" — judge identity
    //   3. "Do NOT guess" — unknown verdict integrity
    //   4. "Do NOT use `env_limited` as an escape hatch" — env_limited
    //      anti-abuse
    //   5. "they do NOT replace the rubric score" — heuristics
    //      informational only
    //   6. "`unknown` criteria route to re-walk, not fix" / "do NOT
    //      block QA verdict" — routing rule
    //   7. "do NOT divide" — div-by-zero guard
    //   8. "do NOT hallucinate them" — re-walk integrity
    const hits = E.match(/\b[dD]o NOT\b/g) || [];
    assert.equal(hits.length, 8,
      'exactly 8 preserved-by-design "do NOT" emphases expected');
  });
});
