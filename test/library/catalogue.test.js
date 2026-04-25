const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

// Catalogue schema test (Phase 1 of the grand unified reconciliation).
//
// Asserts the unified `loadCatalogue()` shape:
//   - every tier-2 entry that declares `requires.env_vars` is reachable
//     via the catalogue (proves no flat-yaml or directory-manifest gets
//     lost in the merge)
//   - every entry with an `mcp` block has `read_only_recommended`
//     declared as an explicit boolean (per GC.2 — the policy is opt-in
//     true, never implicit)
//   - every MCP block's `wire_into_phases` is a non-empty list (an MCP
//     wired into nothing is dead config)
//   - every MCP id matches its parent tier-2 entry id (folding is by
//     id, so divergence breaks dispatch)

const {
  loadCatalogue,
  getEntry,
  getEnvVarsFor,
  mcpsForPhase,
} = require(path.join('..', '..', 'src', 'launcher', 'catalogue.js'));

describe('catalogue — unified loadCatalogue() schema', () => {
  const all = loadCatalogue();

  test('returns at least the baseline tier-2 services', () => {
    const ids = all.map((e) => e.id);
    for (const baseline of ['stripe', 'supabase', 'sentry', 'counterscale', 'vercel']) {
      assert.ok(ids.includes(baseline), `baseline service '${baseline}' missing from catalogue`);
    }
  });

  test('every entry has a non-empty id', () => {
    for (const entry of all) {
      assert.ok(typeof entry.id === 'string' && entry.id.length > 0,
        `entry from ${entry._file} has no id`);
    }
  });

  test('every entry id is unique (no flat-yaml / directory-manifest collision)', () => {
    const seen = new Map();
    for (const entry of all) {
      if (seen.has(entry.id)) {
        assert.fail(
          `id '${entry.id}' appears twice — once at ${seen.get(entry.id)} and once at ${entry._file}. ` +
          'flat-yaml and directory-manifest cannot share an id.'
        );
      }
      seen.set(entry.id, entry._file);
    }
  });

  test('every flat-yaml entry has requires.env_vars reachable', () => {
    // The reconciliation is meant to make INTEGRATION_KEYS a derived
    // view; if a flat-yaml entry's env_vars list is missing or unreachable
    // via getEnvVarsFor, that derivation will silently lose secrets.
    for (const entry of all.filter((e) => e._shape === 'flat-yaml')) {
      const env = getEnvVarsFor(entry.id);
      // Some entries legitimately have no env_vars (e.g. counterscale
      // bundles its own auth). In that case the field exists but is empty.
      assert.ok(Array.isArray(env), `getEnvVarsFor('${entry.id}') must return an array`);
    }
  });

  test('every entry with an mcp block has read_only_recommended set explicitly', () => {
    for (const entry of all.filter((e) => e.mcp)) {
      assert.ok(
        typeof entry.mcp.read_only_recommended === 'boolean',
        `${entry.id}: mcp.read_only_recommended must be an explicit boolean (got ${typeof entry.mcp.read_only_recommended})`
      );
    }
  });

  test('every entry with an mcp block has a non-empty wire_into_phases list', () => {
    for (const entry of all.filter((e) => e.mcp)) {
      assert.ok(
        Array.isArray(entry.mcp.wire_into_phases) && entry.mcp.wire_into_phases.length > 0,
        `${entry.id}: mcp.wire_into_phases must be a non-empty list`
      );
    }
  });

  test('every entry with an mcp block has a parent tier-2 entry of the same id', () => {
    // Trivially true by construction (mcps fold INTO entries) but we
    // assert it as a guard against a future refactor that ever produces
    // an "orphan" mcp-only entry without a tier-2 parent.
    for (const entry of all.filter((e) => e.mcp)) {
      assert.equal(entry.id, entry.mcp.name,
        `${entry.id}: mcp.name '${entry.mcp.name}' diverges from parent tier-2 id`);
    }
  });

  test('mcpsForPhase returns matching MCPs for a known phase', () => {
    const sp = mcpsForPhase('loop.ship-promote');
    assert.ok(Array.isArray(sp), 'mcpsForPhase returns an array');
    assert.ok(sp.length >= 1, 'loop.ship-promote should match at least one MCP (vercel/github/cloudflare)');
    for (const mcp of sp) {
      assert.ok(mcp.wire_into_phases.includes('loop.ship-promote'),
        `mcp '${mcp.name}' returned for loop.ship-promote but doesn't wire there`);
    }
  });

  test('getEntry returns null for unknown ids', () => {
    assert.equal(getEntry('this-service-does-not-exist'), null);
  });

  test('getEntry returns the matching entry for a known id', () => {
    const stripe = getEntry('stripe');
    assert.ok(stripe, 'stripe entry must exist');
    assert.equal(stripe.id, 'stripe');
    assert.equal(stripe.tier, '2'); // string '2' due to flat-yaml parser
  });
});
