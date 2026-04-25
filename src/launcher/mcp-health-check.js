/**
 * mcp-health-check.js
 *
 * Additive, non-gating MCP manifest validator.
 * Does NOT invoke MCP servers — only inspects manifest shape and env presence.
 *
 * Usage:
 *   const { checkAll, checkOne } = require('./mcp-health-check');
 *   const report = checkAll();          // validates every MCP in catalogue
 *   const single = checkOne('supabase'); // single MCP by id
 *
 * Phase 1 of the grand unified reconciliation: this module now reads
 * MCP definitions from the unified catalogue (`./catalogue.js`)
 * instead of walking the mcp-configs/ directory directly. The disk
 * shape is unchanged — catalogue.js still loads from
 * library/integrations/mcp-configs/ — but every consumer now uses
 * loadCatalogue() so future moves stay transparent.
 *
 * For integration with `rouge doctor`, see docs/design/mcp-integration.md.
 * This module never throws; failures are reported via the return value.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadCatalogue } = require('./catalogue.js');

function missingEnv(manifest, env = process.env) {
  const required = Array.isArray(manifest.env_required) ? manifest.env_required : [];
  return required.filter((k) => !env[k]);
}

function readManifestFile(file) {
  try {
    return { ok: true, data: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (e) {
    return { ok: false, error: `invalid JSON: ${e.message}` };
  }
}

/**
 * Resolve an MCP manifest by name. Two paths:
 *
 *   1. opts.root present (legacy / unit-test mode): walk
 *      `${root}/${name}.json` directly. Used by isolated tests that
 *      stage temp dirs of MCP manifests with no parent tier-2 entries.
 *
 *   2. opts.root absent (production mode): read from the unified
 *      catalogue. The MCP's parent tier-2 entry must exist.
 *
 * Both paths share the same shape contract so callers can ignore the
 * difference.
 */
function resolveManifest(name, opts) {
  if (opts && opts.root) {
    const file = path.join(opts.root, `${name}.json`);
    if (!fs.existsSync(file)) {
      return { ok: false, reason: `no manifest at ${file}` };
    }
    const parsed = readManifestFile(file);
    if (!parsed.ok) return { ok: false, reason: parsed.error };
    return { ok: true, manifest: parsed.data };
  }
  const all = loadCatalogue(opts);
  const entry = all.find((e) => e.id === name && e.mcp);
  if (!entry) {
    return { ok: false, reason: `no MCP manifest for '${name}' in catalogue` };
  }
  return { ok: true, manifest: entry.mcp };
}

/**
 * Check a single MCP by name (= catalogue entry id).
 *
 * @param {string} name — MCP id (e.g. 'supabase', 'github')
 * @param {object} [opts]
 *   - env: env-var bag (default process.env)
 *   - root: legacy mcp-configs directory for unit tests
 *   - tier2Dir / mcpDir: passed through to loadCatalogue
 */
function checkOne(name, opts = {}) {
  const env = opts.env || process.env;
  const resolved = resolveManifest(name, opts);
  if (!resolved.ok) return { name, ok: false, reason: resolved.reason };

  const manifest = resolved.manifest;
  const missing = missingEnv(manifest, env);
  const status = manifest.status || 'unknown';

  return {
    name,
    ok: missing.length === 0 && status !== 'retired',
    manifest_status: status,
    missing_env: missing,
    env_required: manifest.env_required || [],
    command: manifest.command,
    http_url: manifest.http_url,
    read_only_recommended: manifest.read_only_recommended,
    note: missing.length > 0
      ? `missing env vars: ${missing.join(', ')}`
      : (status === 'retired' ? 'retired MCP' : 'ready'),
  };
}

/**
 * Check every MCP — catalogue path by default, directory walk if
 * opts.root is supplied (legacy / unit-test mode).
 */
function checkAll(opts = {}) {
  if (opts && opts.root) {
    if (!fs.existsSync(opts.root)) {
      return { ok: false, reason: `no mcp-configs directory at ${opts.root}`, results: [] };
    }
    const files = fs.readdirSync(opts.root).filter((f) => f.endsWith('.json'));
    const results = files.map((f) => checkOne(f.replace(/\.json$/, ''), opts));
    return {
      ok: results.every((r) => r.ok),
      count: results.length,
      results,
    };
  }
  const all = loadCatalogue(opts);
  const mcpEntries = all.filter((e) => e.mcp);
  if (mcpEntries.length === 0) {
    return { ok: false, reason: 'no MCP entries in catalogue', results: [] };
  }
  const results = mcpEntries.map((e) => checkOne(e.id, opts));
  return {
    ok: results.every((r) => r.ok),
    count: results.length,
    results,
  };
}

module.exports = { checkOne, checkAll, missingEnv };
