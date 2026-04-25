const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { parseFlatYaml } = require('../../src/launcher/yaml-parser.js');

// Schema test for tier-2 service manifests in the flat *.yaml format.
//
// Two tier-2 formats coexist in library/integrations/tier-2/:
//   (a) directory-based `<slug>/manifest.json` for deploy targets
//       (github-pages, vercel, cloudflare-pages, docker-compose).
//       Validated by tests/integration-catalog.test.js.
//   (b) flat `<slug>.yaml` for services (database, auth, payments,
//       email, analytics, etc.) consumed by feasibility.js.
//       This test covers that second format.
//
// Every flat YAML service manifest must declare: id (kebab-case), name,
// tier (== 2), category, description, cost_tier, requires (env_vars
// SCREAMING_SNAKE_CASE + packages + cli_tools), setup_steps,
// teardown_steps, tested_with, free_tier_limits, staleness_date.
//
// This lock-in prevents silent drift as the catalogue grows (P4.1).
// Parser shared with src/launcher/catalogue.js via yaml-parser.js so
// the test harness and runtime see the same shape.

const CATALOG_DIR = path.join(__dirname, '..', '..', 'library', 'integrations', 'tier-2');

const REQUIRED_TOP_LEVEL = [
  'id', 'name', 'tier', 'category', 'description', 'cost_tier',
  'requires', 'setup_steps', 'teardown_steps', 'tested_with',
  'free_tier_limits', 'staleness_date',
];

function loadYamlManifests() {
  const files = fs.readdirSync(CATALOG_DIR)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  return files.map((file) => {
    const full = path.join(CATALOG_DIR, file);
    const raw = fs.readFileSync(full, 'utf8');
    return { file, raw, parsed: parseFlatYaml(raw) };
  });
}

describe('tier-2 flat YAML service manifests — schema', () => {
  const manifests = loadYamlManifests();

  test('catalogue contains at least four baseline services (stripe, supabase, sentry, counterscale)', () => {
    const ids = manifests.map((m) => m.parsed.id);
    for (const baseline of ['stripe', 'supabase', 'sentry', 'counterscale']) {
      assert.ok(ids.includes(baseline), `baseline service '${baseline}' missing from catalogue`);
    }
  });

  for (const { file, parsed, raw } of manifests) {
    describe(file, () => {
      test('declares every required top-level field', () => {
        for (const field of REQUIRED_TOP_LEVEL) {
          assert.ok(parsed[field] !== undefined && parsed[field] !== null,
            `${file}: missing required field '${field}'`);
        }
      });

      test('tier is literal value 2', () => {
        assert.equal(String(parsed.tier), '2',
          `${file}: tier must be 2, got '${parsed.tier}'`);
      });

      test('id is kebab-case', () => {
        assert.ok(/^[a-z0-9][a-z0-9-]*$/.test(parsed.id),
          `${file}: id '${parsed.id}' is not kebab-case`);
      });

      test('id matches filename slug', () => {
        const slug = file.replace(/\.(yaml|yml)$/, '');
        assert.equal(parsed.id, slug,
          `${file}: id '${parsed.id}' does not match filename slug '${slug}'`);
      });

      test('cost_tier is one of the allowed values', () => {
        const allowed = ['free', 'free-to-start', 'usage-based', 'paid'];
        assert.ok(allowed.includes(parsed.cost_tier),
          `${file}: cost_tier '${parsed.cost_tier}' not in ${allowed.join('|')}`);
      });

      test('requires.env_vars / packages / cli_tools must be lists when present', () => {
        // Tightened from earlier short-circuit: an entry that wrote
        // `env_vars: "FOO_BAR"` (string instead of list) would have
        // silently passed. Assert the shape strictly.
        if (parsed.requires && parsed.requires.env_vars !== undefined) {
          assert.ok(Array.isArray(parsed.requires.env_vars),
            `${file}: requires.env_vars must be a list (got ${typeof parsed.requires.env_vars})`);
        }
        if (parsed.requires && parsed.requires.packages !== undefined) {
          assert.ok(Array.isArray(parsed.requires.packages),
            `${file}: requires.packages must be a list (got ${typeof parsed.requires.packages})`);
        }
        if (parsed.requires && parsed.requires.cli_tools !== undefined) {
          assert.ok(Array.isArray(parsed.requires.cli_tools),
            `${file}: requires.cli_tools must be a list (got ${typeof parsed.requires.cli_tools})`);
        }
      });

      test('env_vars (when present) are SCREAMING_SNAKE_CASE', () => {
        const envVars = parsed.requires && parsed.requires.env_vars;
        if (!Array.isArray(envVars)) return;
        for (const v of envVars) {
          assert.ok(/^[A-Z][A-Z0-9_]*$/.test(v),
            `${file}: env_var '${v}' is not SCREAMING_SNAKE_CASE`);
        }
      });

      test('staleness_date is ISO YYYY-MM-DD', () => {
        assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(String(parsed.staleness_date).trim()),
          `${file}: staleness_date '${parsed.staleness_date}' is not YYYY-MM-DD`);
      });

      test('setup_steps + teardown_steps are non-empty arrays', () => {
        assert.ok(Array.isArray(parsed.setup_steps) && parsed.setup_steps.length > 0,
          `${file}: setup_steps must be a non-empty list`);
        assert.ok(Array.isArray(parsed.teardown_steps) && parsed.teardown_steps.length > 0,
          `${file}: teardown_steps must be a non-empty list`);
      });

      test('description is substantive (≥ 20 words)', () => {
        // Enough to actually describe the service; not a placeholder.
        const wordCount = String(parsed.description || '').trim().split(/\s+/).length;
        assert.ok(wordCount >= 20,
          `${file}: description is only ${wordCount} words — should be ≥ 20`);
      });

      test('file ends with trailing newline', () => {
        assert.ok(raw.endsWith('\n'),
          `${file}: missing trailing newline`);
      });
    });
  }
});
