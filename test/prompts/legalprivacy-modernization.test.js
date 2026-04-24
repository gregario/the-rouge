const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// P1.19 PR 10 on seeding/06-legal-privacy.md.
//
// Medium-size technical seeding prompt — GC review + boilerplate
// generation. No incident-tied safety blocks. All emphatic register is
// stylistic and softens cleanly. Taste-adjacent content (the Lessig
// "code is law" latent-space activation) is preserved by design.

const LP_PATH = path.join(__dirname, '..', '..', 'src', 'prompts', 'seeding', '06-legal-privacy.md');
const LP = fs.readFileSync(LP_PATH, 'utf8');

describe('06-legal-privacy.md behavioral contract', () => {
  test('declares hard gate H1-jurisdiction + two soft gates', () => {
    assert.ok(/legal-privacy\/H1-jurisdiction/.test(LP));
    assert.ok(/legal-privacy\/S1-regulated-domain/.test(LP));
    assert.ok(/legal-privacy\/S2-trademark-conflict/.test(LP));
  });

  test('uses orchestrator gate vocabulary', () => {
    assert.ok(LP.includes('[GATE:]'));
    assert.ok(LP.includes('[DECISION:]'));
    assert.ok(LP.includes('[HEARTBEAT:]'));
  });

  test('preserves the six regulated-domain categories', () => {
    for (const domain of ['Fintech', 'Health', 'Children', 'Gambling', 'Education', 'Employment']) {
      assert.ok(LP.includes(domain), `missing regulated-domain category: ${domain}`);
    }
  });

  test('preserves the loop-back-to-TASTE rule for regulated_domain_flags / BLOCKED trademark', () => {
    // Load-bearing: orchestrator routing depends on this explicit rule.
    assert.ok(/regulated_domain_flags.*loop.?back.*TASTE|loop.?back to TASTE.*regulated_domain_flags/is.test(LP) ||
      /loop-back to TASTE/.test(LP),
      'loop-back-to-TASTE on regulated domain rule must survive');
    assert.ok(/regulated_domain_flags.*non-empty.*TASTE|trademark_status.*BLOCKED.*TASTE/is.test(LP),
      'explicit orchestrator routing sentence must survive');
  });

  test('writes legal status object with every field downstream reads', () => {
    for (const field of [
      'gc_review_done', 'trademark_status', 'trademark_notes',
      'ip_risk', 'license_compliance', 'license_flags',
      'regulated_domain_flags', 'data_handling_baseline',
      'terms_generated', 'privacy_policy_generated',
      'cookie_policy_generated', 'cookie_policy_reason_skipped',
      'files_written', 'blocking_issues', 'warnings',
    ]) {
      assert.ok(LP.includes(field), `missing output field: ${field}`);
    }
  });

  test('preserves verdict enums (CLEAR/WARNING/BLOCKED, CLEAR/CAUTION/BLOCKED, GDPR/CCPA/MINIMAL)', () => {
    assert.ok(/CLEAR\|WARNING\|BLOCKED/.test(LP));
    assert.ok(/CLEAR\|CAUTION\|BLOCKED/.test(LP));
    assert.ok(/CLEAR\|WARNING\b/.test(LP));
    assert.ok(/GDPR\|CCPA\|MINIMAL/.test(LP));
  });

  test('preserves the three output file paths', () => {
    assert.ok(LP.includes('legal/terms.md'));
    assert.ok(LP.includes('legal/privacy.md'));
    assert.ok(LP.includes('legal/cookies.md'));
  });

  test('preserves Part A / Part B split', () => {
    assert.ok(/## Part A/.test(LP));
    assert.ok(/## Part B/.test(LP));
    assert.ok(/### A\.1/.test(LP));
    assert.ok(/### B\.1/.test(LP));
  });

  test('preserves Lessig "code is law" latent-space activation (Gary-Tan-equivalent voice)', () => {
    // This is the character-defining voice of this discipline. Soften
    // the language and you lose the discipline's perspective — privacy-
    // by-design-as-architecture-not-policy-language.
    assert.ok(/Lawrence Lessig/.test(LP));
    assert.ok(/code is law/.test(LP));
    assert.ok(/Privacy by design|privacy by design/.test(LP));
  });

  test('emits [DISCIPLINE_COMPLETE: legal-privacy] marker', () => {
    assert.ok(/\[DISCIPLINE_COMPLETE:\s*legal-privacy\]/.test(LP));
  });

  test('preserves the advancing-to-MARKETING handoff check', () => {
    assert.ok(/MARKETING/.test(LP),
      'handler-verifies-files-before-MARKETING rule keeps the swarm sequence correct');
  });

  test('preserves data-minimisation / retention / third-party recommendations', () => {
    assert.ok(/Data minimization|data minimisation|data minimization/i.test(LP));
    assert.ok(/[Rr]etention/.test(LP));
    assert.ok(/[Tt]hird-party processors/.test(LP));
  });

  test('preserves "one question at a time" human-interaction discipline', () => {
    assert.ok(/One question at a time/.test(LP));
  });
});

describe('06-legal-privacy.md Opus 4.7 modernization', () => {
  test('no "think step by step" scaffolding', () => {
    assert.ok(!/think step by step/i.test(LP));
  });

  test('no "reason carefully" scaffolding', () => {
    assert.ok(!/reason carefully/i.test(LP));
  });

  test('no "CRITICAL:" / "IMPORTANT:" / "URGENT:" / "YOU MUST" emphatic prefixes', () => {
    assert.ok(!/\bCRITICAL:/.test(LP));
    assert.ok(!/\bIMPORTANT:/.test(LP));
    assert.ok(!/\bURGENT:/.test(LP));
    assert.ok(!/YOU MUST/.test(LP));
  });

  test('no "do NOT" / "Do NOT" / "DO NOT" emphasis (no incident-tied rules here)', () => {
    const hits = LP.match(/\b[dD]o NOT\b/g) || [];
    assert.equal(hits.length, 0);
  });

  test('no "MUST" all-caps emphasis in prose', () => {
    // Soften all caps "MUST" to ordinary "must" — procedural rules, not
    // incident-tied.
    assert.ok(!/\bMUST\b/.test(LP),
      'all-caps MUST should be softened to "must"');
  });

  test('no "ALL that apply" / "ANY regulated" all-caps emphasis', () => {
    assert.ok(!/Flag ALL that apply/.test(LP));
    assert.ok(!/If ANY regulated domain/.test(LP));
  });

  test('no "NOT generic" / "ONLY if" all-caps emphasis', () => {
    assert.ok(!/These are NOT generic templates/.test(LP));
    assert.ok(!/Generate ONLY if/.test(LP));
  });

  test('"This is not optional" softened to "hard gate, not a soft recommendation"', () => {
    assert.ok(!/This is not optional\./.test(LP));
    assert.ok(/hard gate, not a soft recommendation/.test(LP));
  });

  test('has a positive-framed Scope Boundary section', () => {
    assert.ok(/## Scope Boundary/.test(LP),
      'modernization adds the scope-boundary framing used in other P1.19 PRs');
    const section = LP.split('## Scope Boundary')[1].split('##')[0];
    // Must cede implementation to foundation/building.
    assert.ok(/foundation.*building|consent banners|CSP|retention jobs/i.test(section),
      'scope boundary should cede implementation to downstream phases');
    // Must preserve "not regulated legal advice" boundary.
    assert.ok(/not regulated legal advice|real counsel/i.test(section),
      'scope boundary should keep the "not substitute for counsel" line');
    // No "You do not" anti-pattern leads.
    assert.ok(!/You do not/i.test(section));
  });
});
