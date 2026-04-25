/**
 * catalogue.js — single source of truth for the integration catalogue.
 *
 * Phase 1 of the grand unified reconciliation. Reads the three on-disk
 * registries:
 *
 *   1. library/integrations/tier-2/<slug>.yaml         (28 flat-YAML services)
 *   2. library/integrations/tier-2/<slug>/manifest.json (4 directory-shaped deploy targets)
 *   3. library/integrations/mcp-configs/<slug>.json    (8 MCP server manifests)
 *
 * and returns a unified array of entries. Each entry is the tier-2
 * record with an optional `mcp:` block folded in when a same-id MCP
 * config exists.
 *
 *   const { loadCatalogue } = require('./catalogue.js');
 *   const all = loadCatalogue();
 *   //=> [
 *   //     { id: 'supabase', name: 'Supabase', tier: 2, ..., mcp: { ... } },
 *   //     { id: 'stripe',   name: 'Stripe',   tier: 2, ... },              // no mcp block
 *   //     { id: 'github',   name: 'GitHub',   tier: 2, ..., mcp: { ... } },
 *   //   ]
 *
 * Consumers (post-Phase-1):
 *   - secrets.js — derives INTEGRATION_KEYS from catalogue + override map
 *   - mcp-health-check.js — reads MCP block from catalogue
 *   - profile-loader.js — reads MCP availability from catalogue
 *   - feasibility.js — reads service env-var requirements from catalogue
 *
 * Why a single module: three callsites today read three different
 * shapes of the same conceptual data. The Phase 1 mandate is "one
 * source of truth"; this module is that source.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseFlatYaml } = require('./yaml-parser.js');

const ROOT = path.resolve(__dirname, '..', '..');
const TIER2_DIR = path.join(ROOT, 'library', 'integrations', 'tier-2');
const MCP_DIR = path.join(ROOT, 'library', 'integrations', 'mcp-configs');

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`catalogue: invalid JSON in ${file}: ${e.message}`);
  }
}

/**
 * Load all flat-yaml tier-2 entries.
 */
function loadFlatYamlEntries(tier2Dir) {
  if (!fs.existsSync(tier2Dir)) return [];
  return fs.readdirSync(tier2Dir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map((f) => {
      const full = path.join(tier2Dir, f);
      const raw = fs.readFileSync(full, 'utf8');
      const parsed = parseFlatYaml(raw);
      return { ...parsed, _shape: 'flat-yaml', _file: full };
    });
}

/**
 * Load all directory-shaped tier-2 entries (manifest.json inside).
 *
 * The directory shape is a different schema (target/kind/version/...).
 * We surface the same minimal fields — id (= target), name (= human_name
 * or target), tier (= 2), category (derived from kind), description
 * (= summary) — so callers can iterate uniformly.
 */
function loadDirectoryEntries(tier2Dir) {
  if (!fs.existsSync(tier2Dir)) return [];
  return fs.readdirSync(tier2Dir)
    .filter((slug) => {
      const full = path.join(tier2Dir, slug);
      return fs.statSync(full).isDirectory()
        && fs.existsSync(path.join(full, 'manifest.json'));
    })
    .map((slug) => {
      const file = path.join(tier2Dir, slug, 'manifest.json');
      const m = readJsonSafe(file);
      return {
        id: m.target || slug,
        name: m.human_name || m.target || slug,
        tier: 2,
        category: m.kind || 'deploy',
        description: m.summary || '',
        cost_tier: m.cost_tier || 'free-to-start',
        requires: {
          env_vars: (m.env_vars || []).map((e) => e.name).filter(Boolean),
          packages: m.packages || [],
          cli_tools: m.cli_tools || [],
        },
        prerequisites: m.prerequisites || [],
        notes: m.notes_for_prompt || '',
        _shape: 'directory-manifest',
        _file: file,
      };
    });
}

/**
 * Load all MCP configs, keyed by name.
 */
function loadMcpConfigs(mcpDir) {
  if (!fs.existsSync(mcpDir)) return {};
  const out = {};
  for (const f of fs.readdirSync(mcpDir).filter((x) => x.endsWith('.json'))) {
    const file = path.join(mcpDir, f);
    const data = readJsonSafe(file);
    if (data && data.name) out[data.name] = { ...data, _file: file };
  }
  return out;
}

/**
 * Load the unified catalogue.
 *
 * Each entry includes the tier-2 record. If an MCP config exists with
 * a matching id, its data is folded into the entry's `mcp` field.
 *
 * @param {object} [opts]
 *   - tier2Dir / mcpDir — override roots for testing
 * @returns {Array<object>} unified entries; never null.
 */
function loadCatalogue(opts = {}) {
  const tier2Dir = opts.tier2Dir || TIER2_DIR;
  const mcpDir = opts.mcpDir || MCP_DIR;

  const flat = loadFlatYamlEntries(tier2Dir);
  const dirs = loadDirectoryEntries(tier2Dir);
  const mcps = loadMcpConfigs(mcpDir);

  const merged = [...flat, ...dirs].map((entry) => {
    const id = entry.id;
    const mcp = id && mcps[id];
    if (mcp) {
      // Strip the internal _file marker from the public shape.
      const { _file, ...mcpPublic } = mcp;
      return { ...entry, mcp: mcpPublic };
    }
    return entry;
  });

  return merged;
}

/**
 * Convenience: get a single entry by id, or null.
 */
function getEntry(id, opts = {}) {
  const all = loadCatalogue(opts);
  return all.find((e) => e.id === id) || null;
}

/**
 * Convenience: get the env-var list declared by an entry's `requires.env_vars`.
 * Used by secrets.js to derive the INTEGRATION_KEYS dictionary.
 */
function getEnvVarsFor(id, opts = {}) {
  const entry = getEntry(id, opts);
  if (!entry || !entry.requires) return [];
  return Array.isArray(entry.requires.env_vars) ? entry.requires.env_vars : [];
}

/**
 * Convenience: list MCPs whose `wire_into_phases` includes a given phase.
 */
function mcpsForPhase(phase, opts = {}) {
  const all = loadCatalogue(opts);
  return all
    .filter((e) => e.mcp && Array.isArray(e.mcp.wire_into_phases) && e.mcp.wire_into_phases.includes(phase))
    .map((e) => e.mcp);
}

module.exports = {
  loadCatalogue,
  getEntry,
  getEnvVarsFor,
  mcpsForPhase,
  TIER2_DIR,
  MCP_DIR,
};
