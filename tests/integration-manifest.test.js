#!/usr/bin/env node
/**
 * Tests for schemas/integration-manifest.json
 *
 * The schema itself should compile cleanly, and the example manifest
 * we ship for github-pages should validate. Wave 2 will add the four
 * real manifests (github-pages, vercel, cloudflare-pages, docker-compose)
 * and these same shape tests cover them.
 *
 * Usage: node tests/integration-manifest.test.js
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA_PATH = path.join(ROOT, 'schemas/integration-manifest.json');

let failures = 0;
let checks = 0;

function assert(condition, message) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${message}`);
  }
}

const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

function testMinimalManifestValidates() {
  const m = { target: 'none', kind: 'deploy', version: 1 };
  const ok = validate(m);
  assert(ok, `minimal manifest rejected: ${ajv.errorsText(validate.errors)}`);
}

function testGithubPagesExampleValidates() {
  // Shape that Wave 2's github-pages manifest will take. Validating
  // now so the schema supports it end-to-end before we author it.
  const m = {
    target: 'github-pages',
    aliases: ['gh-pages'],
    kind: 'deploy',
    version: 1,
    human_name: 'GitHub Pages',
    summary: 'Static site hosting on the gh-pages branch of the project repo.',
    prerequisites: [
      {
        id: 'pages-enabled',
        label: 'GitHub Pages is enabled on the repo',
        check: { kind: 'gh-api', endpoint: 'repos/{owner}/{repo}/pages' },
        auto_remediate: {
          kind: 'gh-api-post',
          endpoint: 'repos/{owner}/{repo}/pages',
          body: { source: { branch: 'gh-pages', path: '/' } },
          grace_seconds: 30
        }
      }
    ],
    build_output_dirs: ['dist', 'build', 'out', 'public'],
    env_vars: [],
    secrets_required: [],
    health_check: {
      kind: 'http-200',
      url_template: 'https://{owner}.github.io/{repo}/',
      timeout_ms: 10000,
      first_deploy_grace_ms: 30000,
      first_deploy_poll_window_ms: 150000,
      poll_interval_ms: 15000
    },
    notes_for_prompt: 'Static-only. No API routes, no server components that read secrets at request time.'
  };
  const ok = validate(m);
  assert(ok, `github-pages example rejected: ${ajv.errorsText(validate.errors)}`);
}

function testSupabaseExampleValidates() {
  // Database kind — different shape. Ensures the schema isn't secretly
  // deploy-only.
  const m = {
    target: 'supabase',
    kind: 'database',
    version: 1,
    human_name: 'Supabase',
    summary: 'Hosted Postgres with a generous free tier.',
    prerequisites: [
      {
        id: 'supabase-token',
        label: 'Supabase access token is configured',
        check: { kind: 'secret-present', secret_key: 'SUPABASE_ACCESS_TOKEN' }
      }
    ],
    env_vars: [
      { name: 'SUPABASE_URL', required: true, secret_provider: 'supabase' },
      { name: 'SUPABASE_ANON_KEY', required: true, secret_provider: 'supabase' },
      { name: 'SUPABASE_SERVICE_KEY', required: false, secret_provider: 'supabase' }
    ],
    secrets_required: [
      { provider: 'supabase', key: 'SUPABASE_ACCESS_TOKEN' }
    ]
  };
  const ok = validate(m);
  assert(ok, `supabase example rejected: ${ajv.errorsText(validate.errors)}`);
}

function testRejectsMissingRequiredFields() {
  const m = { kind: 'deploy', version: 1 }; // no target
  const ok = validate(m);
  assert(!ok, 'missing target is rejected');
}

function testRejectsInvalidTargetPattern() {
  const m = { target: 'Not Valid', kind: 'deploy', version: 1 };
  const ok = validate(m);
  assert(!ok, 'target with spaces/caps is rejected');
}

function testRejectsUnknownKind() {
  const m = { target: 'x', kind: 'nonsense', version: 1 };
  const ok = validate(m);
  assert(!ok, 'unknown kind is rejected');
}

function testRejectsUnknownPrerequisiteCheckKind() {
  const m = {
    target: 'x',
    kind: 'deploy',
    version: 1,
    prerequisites: [{ id: 'p', label: 'x', check: { kind: 'mystery-method' } }]
  };
  const ok = validate(m);
  assert(!ok, 'unknown prerequisite check kind is rejected');
}

function testAdditionalPropertiesAreRejected() {
  const m = { target: 'x', kind: 'deploy', version: 1, rogueField: 'oops' };
  const ok = validate(m);
  assert(!ok, 'extra top-level field is rejected');
}

function main() {
  console.log('integration-manifest schema');
  testMinimalManifestValidates();
  testGithubPagesExampleValidates();
  testSupabaseExampleValidates();
  testRejectsMissingRequiredFields();
  testRejectsInvalidTargetPattern();
  testRejectsUnknownKind();
  testRejectsUnknownPrerequisiteCheckKind();
  testAdditionalPropertiesAreRejected();
  console.log(`  ${checks} checks, ${failures} failures`);
  if (failures > 0) {
    console.error('FAIL');
    process.exit(1);
  }
  console.log('PASS');
}

main();
