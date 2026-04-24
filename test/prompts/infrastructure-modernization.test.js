const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// P1.19 PR 9 on seeding/08-infrastructure.md.
//
// Small, technical seeding prompt. Scope: resolve infra decisions before
// the build loop starts. Low Gary-Tan-voice risk (no product-taste
// content). No incident-tied safety blocks to preserve — all emphatic
// register is stylistic and softens cleanly.

const INFRA_PATH = path.join(__dirname, '..', '..', 'src', 'prompts', 'seeding', '08-infrastructure.md');
const INFRA = fs.readFileSync(INFRA_PATH, 'utf8');

describe('08-infrastructure.md behavioral contract', () => {
  test('writes infrastructure_manifest.json (the launcher + provisioner read this)', () => {
    assert.ok(INFRA.includes('infrastructure_manifest.json'));
  });

  test('manifest carries the full field set consumers expect', () => {
    // rouge-loop.js, deploy-to-staging.js, dependency-resolver.js all read
    // from this manifest. The output example must still name every field.
    for (const field of ['database', 'deploy', 'auth', 'data_sources', 'incompatibilities_resolved', 'depends_on_projects']) {
      assert.ok(INFRA.includes(field), `missing manifest field: ${field}`);
    }
  });

  test('database subshape names the fields downstream phases expect', () => {
    for (const field of ['type', 'provider', 'client', 'reason']) {
      // All four are inside the database example block.
      assert.ok(INFRA.includes(`"${field}"`), `missing database.${field}`);
    }
  });

  test('deploy subshape names target / staging_env / production_env', () => {
    assert.ok(/"target":/.test(INFRA));
    assert.ok(/"staging_env":/.test(INFRA));
    assert.ok(/"production_env":/.test(INFRA));
  });

  test('deploy-target options align with DEPLOY_HANDLERS in deploy-to-staging.js', () => {
    // The launcher's handler registry accepts these slugs. The prompt must
    // keep naming them so the analyst doesn't invent a new one.
    for (const slug of ['vercel', 'cloudflare', 'cloudflare-workers', 'github-pages', 'gh-pages', 'docker-compose', 'docker', 'none']) {
      assert.ok(INFRA.includes(slug), `missing deploy-target slug: ${slug}`);
    }
  });

  test('emits [DISCIPLINE_COMPLETE: infrastructure] marker (bot.js parses this)', () => {
    assert.ok(/\[DISCIPLINE_COMPLETE:\s*infrastructure\]/.test(INFRA),
      'marker must match the regex in src/slack/bot.js');
  });

  test('uses the orchestrator gate vocabulary', () => {
    assert.ok(INFRA.includes('[GATE:]'));
    assert.ok(INFRA.includes('[DECISION:]'));
    assert.ok(INFRA.includes('[HEARTBEAT:]'));
  });

  test('declares gate IDs infrastructure/S1-deploy-target + infrastructure/S2-project-dependency', () => {
    assert.ok(/infrastructure\/S1-deploy-target/.test(INFRA));
    assert.ok(/infrastructure\/S2-project-dependency/.test(INFRA));
  });

  test('declares no hard gates', () => {
    assert.ok(/\*\*Hard gates:\*\*\s*none/i.test(INFRA));
  });

  test('preserves the known-bad-combinations list', () => {
    // These are the historical incompatibilities the discipline exists
    // to prevent. Dropping any lets the failure class recur.
    for (const combo of ['WebGL', 'headless browser', 'WebSocket', 'serverless', 'file upload', 'edge function', 'PDF', 'Cloudflare Workers']) {
      assert.ok(INFRA.includes(combo), `missing known-bad-combo keyword: ${combo}`);
    }
  });

  test('preserves database-compatibility matrix rows (three deploy targets)', () => {
    assert.ok(/Cloudflare Workers/.test(INFRA));
    assert.ok(/Vercel Edge/.test(INFRA));
    assert.ok(/Node\.js server/.test(INFRA));
  });

  test('preserves incompatibilities_resolved-must-be-empty gate before DESIGN', () => {
    assert.ok(/incompatibilities_resolved.*empty|empty.*incompatibilities_resolved/is.test(INFRA),
      'empty-incompatibilities gate is load-bearing — SPEC → INFRASTRUCTURE → DESIGN ordering depends on it');
    assert.ok(/DESIGN/.test(INFRA));
  });

  test('preserves project-registry lookup path', () => {
    assert.ok(INFRA.includes('~/.rouge/registry.json'));
  });

  test('preserves V2-incident rationale (why this discipline exists)', () => {
    // The "Why This Discipline Exists" block names three specific V2
    // failures. If someone softens it to a generic statement, future
    // edits lose the ground truth.
    assert.ok(/Prisma.*Cloudflare|WebGL.*headless|Docker Compose vs cloud/i.test(INFRA),
      'at least one of the three V2 incidents must remain named');
  });
});

describe('08-infrastructure.md Opus 4.7 modernization', () => {
  test('no "think step by step" scaffolding', () => {
    assert.ok(!/think step by step/i.test(INFRA));
  });

  test('no "reason carefully" scaffolding', () => {
    assert.ok(!/reason carefully/i.test(INFRA));
  });

  test('no "CRITICAL:" / "IMPORTANT:" / "URGENT:" / "YOU MUST" emphatic prefixes', () => {
    assert.ok(!/\bCRITICAL:/.test(INFRA));
    assert.ok(!/\bIMPORTANT:/.test(INFRA));
    assert.ok(!/\bURGENT:/.test(INFRA));
    assert.ok(!/YOU MUST/.test(INFRA));
  });

  test('no "do NOT" / "Do NOT" / "DO NOT" emphasis (no incident-tied rules in this prompt)', () => {
    const hits = INFRA.match(/\b[dD]o NOT\b/g) || [];
    assert.equal(hits.length, 0,
      'infrastructure is purely technical; no Do NOT emphasis should survive');
  });

  test('no stylistic all-caps emphasis on "ALL" / "BEFORE"', () => {
    // Opening line had "resolve ALL infrastructure decisions BEFORE the
    // build loop starts." Softened to sentence case.
    assert.ok(!/resolve ALL infrastructure decisions BEFORE/.test(INFRA));
  });

  test('uses "Scope Boundary" framing (renamed from "What You Do NOT Do")', () => {
    assert.ok(/## Scope Boundary/.test(INFRA));
    assert.ok(!/## What You Do NOT Do/.test(INFRA));
  });

  test('scope boundary bullets are positive-lead', () => {
    // Each bullet starts with a positive verb, not "You do not …".
    const boundarySection = INFRA.split('## Scope Boundary')[1].split('[DISCIPLINE_COMPLETE')[0];
    assert.ok(!/You do not/i.test(boundarySection),
      'scope boundary bullets should not start with "You do not"');
    // Must still cede execution to foundation-building.
    assert.ok(/foundation phase|foundation-building/i.test(boundarySection),
      'scope boundary must still cede execution to foundation');
    // Must still say "no code / no scaffolding / no provisioning" in some
    // positive form.
    assert.ok(/code, scaffolding, and provisioning|decisions.*manifest/i.test(boundarySection));
  });
});
