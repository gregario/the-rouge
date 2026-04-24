const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

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

const CATALOG_DIR = path.join(__dirname, '..', '..', 'library', 'integrations', 'tier-2');

// Minimal YAML parser sufficient for the tier-2 flat format — scalar
// fields, one-level nested objects (requires.*, free_tier_limits.*),
// and string-list arrays (setup_steps, teardown_steps, etc.). The
// suite avoids a yaml runtime dependency to keep the test harness
// thin; if a future entry needs richer YAML, swap in js-yaml.
function parseFlatYaml(text) {
  const out = {};
  const lines = text.split('\n');
  let currentKey = null;
  let currentList = null;
  let currentMap = null;
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/, '');
    if (!line || line.startsWith('#')) { i++; continue; }

    // Top-level scalar: `key: value`
    const topScalar = /^([a-z_][a-z0-9_]*):\s*(.*)$/.exec(line);
    if (topScalar && !raw.startsWith(' ') && !raw.startsWith('\t')) {
      const [, key, rest] = topScalar;
      currentKey = key;
      currentList = null;
      currentMap = null;

      if (rest === '' || rest === undefined) {
        // value on following lines — peek next line to decide list vs map
        const next = lines[i + 1] || '';
        if (/^\s+-\s*/.test(next)) {
          currentList = [];
          out[key] = currentList;
        } else if (/^\s+[a-zA-Z_]/.test(next)) {
          currentMap = {};
          out[key] = currentMap;
        } else {
          out[key] = null;
        }
      } else if (rest === '>') {
        // folded scalar — concatenate following indented lines
        const folded = [];
        i++;
        while (i < lines.length && /^\s/.test(lines[i])) {
          folded.push(lines[i].trim());
          i++;
        }
        out[key] = folded.join(' ');
        continue;
      } else {
        out[key] = stripQuotes(rest);
      }
      i++;
      continue;
    }

    // List item: `  - value`
    const listItem = /^\s+-\s*(.*)$/.exec(line);
    if (listItem && currentList) {
      currentList.push(stripQuotes(listItem[1]));
      i++;
      continue;
    }

    // Nested map field: `  key: value`
    const nestedScalar = /^\s+([a-z_][a-z0-9_]*):\s*(.*)$/.exec(line);
    if (nestedScalar && currentMap) {
      const [, nkey, nrest] = nestedScalar;
      if (nrest === '' || nrest === undefined) {
        // nested list inside a map: `packages:` then `    - foo`
        const inner = [];
        let j = i + 1;
        while (j < lines.length && /^\s+-\s*/.test(lines[j])) {
          inner.push(stripQuotes(/^\s+-\s*(.*)$/.exec(lines[j])[1]));
          j++;
        }
        currentMap[nkey] = inner;
        i = j;
        continue;
      }
      currentMap[nkey] = stripQuotes(nrest);
    }
    i++;
  }
  return out;
}

function stripQuotes(s) {
  if (typeof s !== 'string') return s;
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

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
