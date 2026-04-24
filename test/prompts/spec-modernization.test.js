const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// P1.19 PR 15 on seeding/04-spec.md.
//
// Longest seeding prompt touched in this sweep (620 lines). Carries the
// P1.5R PR 5 tier-aware depth contract (already covered by
// spec-tier-aware.test.js), plus significant Rouge-taste-voice density:
// "Override: Depth Over Brevity," Boil-the-Lake mandate, "You are not
// writing documentation. You are programming the quality bar." This
// modernization softens stylistic caps while keeping:
//   (a) the 7-section depth structure + self-check invariants,
//   (b) the 3-click rule tied to DESIGN loop-back,
//   (c) the two preserved-by-design Beat 3 emphases ("Do NOT emit chat
//       prose," "Do NOT gate") — beat-discipline rules load-bearing
//       for dashboard UX,
//   (d) the Anti-Patterns list (reject-on-sight specificity rules),
//   (e) the Story / Milestone decomposition shape the launcher reads.

const SPEC_PATH = path.join(__dirname, '..', '..', 'src', 'prompts', 'seeding', '04-spec.md');
const SPEC = fs.readFileSync(SPEC_PATH, 'utf8');

describe('04-spec.md behavioral contract', () => {
  test('writes seed_spec/milestones.json (V3 schema migration reads from this path)', () => {
    assert.ok(SPEC.includes('seed_spec/milestones.json'));
    assert.ok(/dashboard verifies the artifact at this location/.test(SPEC));
  });

  test('emits [DISCIPLINE_COMPLETE: spec] marker', () => {
    assert.ok(/\[DISCIPLINE_COMPLETE:\s*spec\]/.test(SPEC));
  });

  test('uses the orchestrator marker vocabulary', () => {
    assert.ok(SPEC.includes('[GATE:]'));
    assert.ok(SPEC.includes('[DECISION:]'));
    assert.ok(SPEC.includes('[WROTE:]'));
    assert.ok(SPEC.includes('[HEARTBEAT:]'));
  });

  test('declares gate IDs (H1-decomposition, S1-shape-ambiguous, S2-paid-integration-flag)', () => {
    assert.ok(/spec\/H1-decomposition/.test(SPEC));
    assert.ok(/spec\/S1-shape-ambiguous/.test(SPEC));
    assert.ok(/spec\/S2-paid-integration-flag/.test(SPEC));
  });

  test('preserves the four-beat interaction shape', () => {
    assert.ok(/### Beat 1 — Decomposition/.test(SPEC));
    assert.ok(/### Beat 2 — Shape/.test(SPEC));
    assert.ok(/### Beat 3 — Deep work/.test(SPEC));
    assert.ok(/### Beat 4 — Sign-off/.test(SPEC));
  });

  test('preserves the seven mandatory per-FA sections', () => {
    for (const section of [
      '### 1. User Journeys', '### 2. Acceptance Criteria',
      '### 3. Data Model Sketch', '### 4. Error States and Recovery Paths',
      '### 5. Interaction Patterns', '### 6. Security Considerations',
      '### 7. Edge Cases',
    ]) {
      assert.ok(SPEC.includes(section), `missing per-FA section: ${section}`);
    }
  });

  test('preserves Rouge taste ethos: Boil-the-Lake mandate + depth-over-brevity override', () => {
    assert.ok(/Your mandate: Boil the Lake/.test(SPEC));
    assert.ok(/## Override: Depth Over Brevity/.test(SPEC));
    assert.ok(/Ignore that instruction for seed specs/.test(SPEC));
    assert.ok(/3-8 pages/.test(SPEC));
  });

  test('preserves the "programming the quality bar" identity directive', () => {
    assert.ok(/## The Standard You Are Setting/.test(SPEC));
    assert.ok(/You are not writing documentation\. You are programming the quality bar/.test(SPEC));
  });

  test('preserves the 3-click rule + DESIGN loop-back trigger', () => {
    assert.ok(/3-click rule/.test(SPEC));
    assert.ok(/DESIGN triggers a loop-back to SPEC/.test(SPEC),
      'the loop-back-on-violation trigger must be named on-site so the rule is operational');
  });

  test('preserves WHEN/THEN acceptance-criterion format', () => {
    assert.ok(/WHEN\/THEN format/.test(SPEC));
    assert.ok(/GIVEN/.test(SPEC));
    assert.ok(/WHEN/.test(SPEC));
    assert.ok(/THEN/.test(SPEC));
    assert.ok(/MEASUREMENT:/.test(SPEC),
      'MEASUREMENT line is how the Evaluator verifies — must stay mandatory');
  });

  test('preserves AC-count ladders (8-15 / 15-25 / 25-40)', () => {
    assert.ok(/8-15 acceptance criteria/.test(SPEC));
    assert.ok(/15-25 acceptance criteria/.test(SPEC));
    assert.ok(/25-40 acceptance criteria/.test(SPEC));
  });

  test('preserves Story + Milestone schema (launcher reads these exact fields)', () => {
    // rouge-loop.js + state-transitions.js read this shape. Any rename
    // breaks the V3 schema migration.
    for (const field of ['"id":', '"name":', '"feature_area":', '"acceptance_criteria":', '"user_journeys":', '"depends_on":', '"affected_entities":', '"affected_screens":']) {
      assert.ok(SPEC.includes(field), `missing story field: ${field}`);
    }
    assert.ok(/3-8 stories/.test(SPEC));
  });

  test('preserves OpenSpec CLI tool contract', () => {
    assert.ok(/openspec new change/.test(SPEC));
    assert.ok(/openspec instructions/.test(SPEC));
    assert.ok(/openspec spec/.test(SPEC));
    assert.ok(/openspec update/.test(SPEC));
    assert.ok(/openspec list/.test(SPEC));
  });

  test('preserves Anti-Patterns list (reject-on-sight specificity rules)', () => {
    assert.ok(/## Anti-Patterns/.test(SPEC));
    for (const ap of [
      'Handle errors gracefully', 'Standard CRUD operations',
      'Responsive design', 'Secure authentication', 'Good UX',
      'Similar to \\[competitor\\]', 'Intuitive navigation', 'etc\\.',
    ]) {
      const re = new RegExp(ap);
      assert.ok(re.test(SPEC), `missing anti-pattern: ${ap}`);
    }
  });

  test('preserves complexity-profile enum (5 profiles)', () => {
    for (const profile of ['single-page', 'multi-route', 'stateful', 'api-first', 'full-stack']) {
      assert.ok(SPEC.includes(`\`${profile}\``), `missing complexity profile: ${profile}`);
    }
  });

  test('preserves deployment-target list (aligns with DEPLOY_HANDLERS)', () => {
    for (const slug of ['cloudflare', 'cloudflare-workers', 'vercel', 'docker-compose', 'github-pages', 'none']) {
      assert.ok(SPEC.includes(slug), `missing deploy-target: ${slug}`);
    }
  });

  test('preserves three loop-back triggers (COMPETITION / TASTE / BRAINSTORMING)', () => {
    assert.ok(/→ COMPETITION/.test(SPEC));
    assert.ok(/→ TASTE/.test(SPEC));
    assert.ok(/→ BRAINSTORMING/.test(SPEC));
  });

  test('preserves cross-feature consistency check', () => {
    assert.ok(/## Cross-Feature Consistency Check/.test(SPEC));
    for (const check of ['Shared entities', 'Navigation consistency', 'Error handling consistency', 'Terminology consistency', 'Auth boundary consistency']) {
      assert.ok(SPEC.includes(check), `missing cross-feature check: ${check}`);
    }
  });

  test('preserves the write-artifact-before-presenting integrity rule', () => {
    // Links to the swarm-orchestrator's integrity spine.
    assert.ok(/write the decomposition to `seed_spec\/milestones\.json`/i.test(SPEC));
    assert.ok(/don't make it|false claim/i.test(SPEC));
  });
});

describe('04-spec.md Opus 4.7 modernization', () => {
  test('no "think step by step" scaffolding', () => {
    assert.ok(!/think step by step/i.test(SPEC));
  });

  test('no "reason carefully" scaffolding', () => {
    assert.ok(!/reason carefully/i.test(SPEC));
  });

  test('no "CRITICAL:" / "IMPORTANT:" / "URGENT:" / "YOU MUST" emphatic prefixes', () => {
    assert.ok(!/\bCRITICAL:/.test(SPEC));
    assert.ok(!/\bIMPORTANT:/.test(SPEC));
    assert.ok(!/\bURGENT:/.test(SPEC));
    assert.ok(!/YOU MUST/.test(SPEC));
  });

  test('no "MUST" all-caps emphasis in prose', () => {
    assert.ok(!/\bMUST\b/.test(SPEC));
  });

  test('stylistic NOT-contrasts softened (not-decisions / not-story-level / not-as-a-gate / not-ceremonial)', () => {
    assert.ok(!/NOT story-level detail/.test(SPEC));
    assert.ok(!/NOT as a gate/.test(SPEC));
    assert.ok(!/NOT ceremonial content/.test(SPEC));
    assert.ok(!/Per-FA writes are NOT decisions/.test(SPEC));
    assert.ok(!/Foundation work .* is NOT in stories/.test(SPEC));
    assert.ok(!/A story is NOT:/.test(SPEC));
    assert.ok(!/it does NOT weaken/.test(SPEC));
  });

  test('QUIET all-caps softened (Beat 3 header)', () => {
    assert.ok(!/autonomous, QUIET/.test(SPEC));
    assert.ok(/autonomous, quiet/.test(SPEC));
  });

  test('"Every feature area ... MUST contain all seven sections" reframed positively', () => {
    assert.ok(!/MUST contain all seven sections/.test(SPEC));
    assert.ok(/carries all seven sections/.test(SPEC));
    // The "no TBD, no handwaving" spine is preserved.
    assert.ok(/no "TBD" placeholders|no omissions/.test(SPEC));
    assert.ok(/"handle appropriately"/.test(SPEC));
  });

  test('"core tasks MUST complete in 3 clicks" softened to lowercase + rationale', () => {
    assert.ok(!/core tasks MUST complete in 3 clicks/.test(SPEC));
    assert.ok(/core tasks must complete in 3 clicks/.test(SPEC));
    // Rationale-on-site now names the downstream consumer.
    assert.ok(/DESIGN triggers a loop-back to SPEC when this rule is violated/.test(SPEC));
  });

  test('"You MUST trigger a loop-back" reframed as positive directive', () => {
    assert.ok(!/You MUST trigger a loop-back/.test(SPEC));
    assert.ok(/^Trigger a loop-back to another discipline when:/m.test(SPEC));
  });

  test('preserved-by-design "Do NOT" count is exactly 2 (Beat 3 chat-prose + no-gate)', () => {
    // The two load-bearing Beat 3 interaction-shape rules stay emphatic —
    // they defend the quiet-beat dashboard UX contract.
    const hits = SPEC.match(/\b[dD]o NOT\b/g) || [];
    assert.equal(hits.length, 2,
      'exactly 2 preserved-by-design "Do NOT" emphases expected');
    assert.ok(/\*\*Do NOT emit chat-style prose during Beat 3\*\*/.test(SPEC),
      'Beat 3 chat-prose ban must stay emphatic');
    assert.ok(/\*\*Do NOT gate\.\*\*/.test(SPEC),
      'Beat 3 no-gate rule must stay emphatic');
  });

  test('P1.5R PR 5 tier-aware block is untouched by modernization', () => {
    // spec-tier-aware.test.js is the authoritative guarantee, but re-
    // assert the load-bearing phrases here too so any future modernize
    // pass that accidentally drops them fires both tests.
    assert.ok(/## Tier-aware depth \(P1.5R\)/.test(SPEC));
    assert.ok(/Tier reduces scope, never rigor/.test(SPEC));
    assert.ok(/iterative per-FA/.test(SPEC));
    assert.ok(/mandatory cross-cut pass/.test(SPEC));
  });
});
