const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { parseFlatYaml } = require('../../src/launcher/yaml-parser.js');

// Schema test for tier-3 pattern manifests in the flat *.yaml format.
//
// Tier-3 patterns describe a specific code pattern used with a tier-2
// service (e.g. "Stripe webhook handler" uses the tier-2 "stripe"
// service). Required shape: id (kebab-case, matches filename), name,
// tier (literal 3), service (id of the parent tier-2 service),
// category, tags (non-empty list), description, applies_when,
// requires, code_patterns, tested_with, scale_considerations.
//
// Parser shared with the tier-2 test + src/launcher/catalogue.js via
// yaml-parser.js — one implementation, three callers.

const TIER3_DIR = path.join(__dirname, '..', '..', 'library', 'integrations', 'tier-3');
const TIER2_DIR = path.join(__dirname, '..', '..', 'library', 'integrations', 'tier-2');

const REQUIRED_TOP_LEVEL = [
  'id', 'name', 'tier', 'service', 'category', 'tags',
  'description', 'applies_when', 'requires', 'code_patterns',
  'tested_with', 'scale_considerations',
];

function loadTier2Ids() {
  if (!fs.existsSync(TIER2_DIR)) return new Set();
  const ids = new Set();
  const files = fs.readdirSync(TIER2_DIR).filter((f) => f.endsWith('.yaml'));
  for (const file of files) {
    const raw = fs.readFileSync(path.join(TIER2_DIR, file), 'utf8');
    const parsed = parseFlatYaml(raw);
    if (parsed.id) ids.add(parsed.id);
  }
  return ids;
}

function loadTier3Manifests() {
  const files = fs.readdirSync(TIER3_DIR).filter((f) => f.endsWith('.yaml'));
  return files.map((file) => {
    const raw = fs.readFileSync(path.join(TIER3_DIR, file), 'utf8');
    return { file, raw, parsed: parseFlatYaml(raw) };
  });
}

describe('tier-3 flat YAML pattern manifests — schema', () => {
  const manifests = loadTier3Manifests();
  const tier2Ids = loadTier2Ids();

  test('catalogue contains at least the baseline five patterns', () => {
    const ids = manifests.map((m) => m.parsed.id);
    for (const baseline of [
      'supabase-auth-nextjs', 'supabase-rls-pattern',
      'stripe-checkout-session', 'stripe-webhook-handler',
      'sentry-react-boundary',
    ]) {
      assert.ok(ids.includes(baseline), `baseline pattern '${baseline}' missing from catalogue`);
    }
  });

  for (const { file, parsed } of manifests) {
    describe(file, () => {
      test('declares every required top-level field', () => {
        for (const field of REQUIRED_TOP_LEVEL) {
          assert.ok(parsed[field] !== undefined && parsed[field] !== null,
            `${file}: missing required field '${field}'`);
        }
      });

      test('tier is literal value 3', () => {
        assert.equal(String(parsed.tier), '3',
          `${file}: tier must be 3, got '${parsed.tier}'`);
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

      test('service references an existing tier-2 entry', () => {
        // The `service` field must point to a real tier-2 service id.
        // Prevents orphaned patterns after a tier-2 rename or delete.
        assert.ok(tier2Ids.has(parsed.service),
          `${file}: service '${parsed.service}' does not match any tier-2 id in [${[...tier2Ids].sort().join(', ')}]`);
      });

      test('tags is a non-empty array', () => {
        assert.ok(Array.isArray(parsed.tags) && parsed.tags.length > 0,
          `${file}: tags must be a non-empty list`);
      });

      test('code_patterns is a non-empty array', () => {
        // code_patterns is what makes a tier-3 entry useful — it's the
        // actual file-to-description mapping. Empty means the pattern
        // isn't documented yet.
        assert.ok(Array.isArray(parsed.code_patterns) && parsed.code_patterns.length > 0,
          `${file}: code_patterns must be a non-empty list`);
      });

      test('description is substantive (≥ 20 words)', () => {
        const wordCount = String(parsed.description || '').trim().split(/\s+/).length;
        assert.ok(wordCount >= 20,
          `${file}: description is only ${wordCount} words — should be ≥ 20`);
      });

      test('applies_when is substantive (≥ 15 words)', () => {
        // applies_when is the "should I use this pattern?" answer.
        // Too short = not useful for pattern selection.
        const wordCount = String(parsed.applies_when || '').trim().split(/\s+/).length;
        assert.ok(wordCount >= 15,
          `${file}: applies_when is only ${wordCount} words — should be ≥ 15`);
      });

      test('scale_considerations is substantive (≥ 25 words)', () => {
        // scale_considerations is where the pattern signals the real
        // production trade-offs. Abbreviated scale_considerations =
        // undocumented gotchas.
        const wordCount = String(parsed.scale_considerations || '').trim().split(/\s+/).length;
        assert.ok(wordCount >= 25,
          `${file}: scale_considerations is only ${wordCount} words — should be ≥ 25`);
      });
    });
  }
});
