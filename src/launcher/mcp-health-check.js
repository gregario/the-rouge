/**
 * mcp-health-check.js
 *
 * Additive, non-gating MCP manifest validator.
 * Does NOT invoke MCP servers — only inspects manifest shape and env presence.
 *
 * Usage:
 *   const { checkAll, checkOne } = require('./mcp-health-check');
 *   const report = checkAll();   // validates every manifest in mcp-configs/
 *   const single = checkOne('supabase');
 *
 * For integration with `rouge doctor`, see docs/design/mcp-integration.md.
 * This module never throws; failures are reported via the return value.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_ROOT = path.resolve(__dirname, '..', '..', 'mcp-configs');

function readManifest(file) {
  try {
    return { ok: true, data: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (e) {
    return { ok: false, error: `invalid JSON: ${e.message}` };
  }
}

function missingEnv(manifest, env = process.env) {
  const required = Array.isArray(manifest.env_required) ? manifest.env_required : [];
  return required.filter((k) => !env[k]);
}

function checkOne(name, opts = {}) {
  const root = opts.root || DEFAULT_ROOT;
  const env = opts.env || process.env;
  const file = path.join(root, `${name}.json`);
  if (!fs.existsSync(file)) {
    return { name, ok: false, reason: `no manifest at ${file}` };
  }
  const parsed = readManifest(file);
  if (!parsed.ok) return { name, ok: false, reason: parsed.error };

  const manifest = parsed.data;
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
    note: missing.length > 0
      ? `missing env vars: ${missing.join(', ')}`
      : (status === 'retired' ? 'retired MCP' : 'ready'),
  };
}

function checkAll(opts = {}) {
  const root = opts.root || DEFAULT_ROOT;
  if (!fs.existsSync(root)) {
    return { ok: false, reason: `no mcp-configs directory at ${root}`, results: [] };
  }
  const files = fs.readdirSync(root).filter((f) => f.endsWith('.json'));
  const results = files.map((f) => checkOne(f.replace(/\.json$/, ''), opts));
  return {
    ok: results.every((r) => r.ok),
    count: results.length,
    results,
  };
}

module.exports = { checkOne, checkAll, missingEnv };
