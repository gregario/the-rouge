/**
 * Per-spawn MCP config builder.
 *
 * Phase 6 of the grand unified reconciliation. Reads the catalogue
 * (loadCatalogue) for MCP entries whose `wire_into_phases` includes
 * the target phase, filters to those whose `env_required` is
 * satisfied by the current env, and emits both:
 *
 *   1. The structured config object suitable for `claude -p`'s
 *      `--mcp-config <path>` arg (the {mcpServers: {...}} shape).
 *
 *   2. A spawn-args helper that writes the config to a tempfile and
 *      returns the `['--mcp-config', tmpPath]` array (plus a cleanup
 *      function the caller invokes after the subprocess exits).
 *
 * Honors the GC.2 boundary: every entry in the emitted config has
 * `read_only_recommended: true` per the catalogue (Phase 1 made this
 * a required field). Entries that need write capability through an
 * MCP must be flagged read_only_recommended:false in the catalogue
 * with a per-case justification — the catalogue test prevents
 * implicit-true silent drift.
 *
 * Design note: this module produces the config; the rouge-loop spawn
 * site decides whether to use it. Phase 4 already migrated the
 * state-write boundary; full per-spawn MCP wiring of the launcher's
 * existing spawn site is a Phase 6b / 7 concern. The builder is
 * standalone-testable and independently shippable.
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { mcpsForPhase } = require('../../catalogue.js');

/**
 * Determine which MCPs from the catalogue should be wired into a
 * given phase, filtering out entries whose env_required is not
 * satisfied.
 *
 * @param {string} phase — e.g. 'loop.ship-promote', 'seeding.brainstorm'
 * @param {object} [opts]
 *   - env: env-var bag (default process.env)
 *   - tier2Dir / mcpDir: forwarded to loadCatalogue for testing
 * @returns {Array<object>} resolved MCP manifests (with name preserved)
 */
function resolveMcpsForPhase(phase, opts = {}) {
  if (!phase || typeof phase !== 'string') {
    throw new Error('mcp-config.resolveMcpsForPhase: phase (string) required');
  }
  const env = opts.env || process.env;
  const candidates = mcpsForPhase(phase, opts);
  const ready = [];
  const skipped = [];
  for (const mcp of candidates) {
    const required = Array.isArray(mcp.env_required) ? mcp.env_required : [];
    const missing = required.filter((k) => !env[k]);
    if (missing.length > 0) {
      skipped.push({ name: mcp.name, missing });
      continue;
    }
    if (mcp.status === 'retired') {
      skipped.push({ name: mcp.name, reason: 'retired' });
      continue;
    }
    ready.push(mcp);
  }
  return { ready, skipped };
}

/**
 * Build the structured config object for `claude -p --mcp-config`.
 *
 * Output shape (matches Claude Code's expected mcp config file):
 *
 *   {
 *     "mcpServers": {
 *       "supabase": { "command": "npx", "args": [...], "env": {...} },
 *       ...
 *     }
 *   }
 *
 * Env-vars from the manifest's env_required are included in the per-
 * server `env` block so the MCP subprocess inherits them. Values are
 * picked from opts.env (default process.env).
 */
function buildMcpConfig(phase, opts = {}) {
  const env = opts.env || process.env;
  const { ready, skipped } = resolveMcpsForPhase(phase, opts);
  const mcpServers = {};
  for (const mcp of ready) {
    const entry = {
      command: mcp.command,
      args: Array.isArray(mcp.args) ? mcp.args : [],
    };
    if (mcp.http_url) {
      // HTTP-shape MCP — Claude Code accepts a `url` key for these.
      entry.url = mcp.http_url;
      delete entry.command;
      delete entry.args;
    }
    const required = Array.isArray(mcp.env_required) ? mcp.env_required : [];
    const optional = Array.isArray(mcp.env_optional) ? mcp.env_optional : [];
    const envBlock = {};
    for (const k of [...required, ...optional]) {
      if (env[k] != null) envBlock[k] = String(env[k]);
    }
    if (Object.keys(envBlock).length > 0) entry.env = envBlock;
    mcpServers[mcp.name] = entry;
  }
  return { config: { mcpServers }, ready, skipped };
}

/**
 * Build the spawn-arg array + cleanup function for a phase.
 *
 * Writes the config to a uniquely-named tempfile and returns the
 * `['--mcp-config', tmpPath]` arg array. Caller invokes `cleanup()`
 * after the subprocess exits to remove the tempfile.
 *
 * If no MCPs are wired (or no env satisfied), returns an empty args
 * array and a no-op cleanup so callers can blindly spread the args.
 *
 * @param {string} phase
 * @param {object} [opts] — forwarded to buildMcpConfig + tempDir override
 * @returns {{ args: string[], cleanup: () => void, config: object, ready: Array, skipped: Array }}
 */
function buildSpawnArgsForPhase(phase, opts = {}) {
  const { config, ready, skipped } = buildMcpConfig(phase, opts);
  if (ready.length === 0) {
    return { args: [], cleanup: () => {}, config, ready, skipped };
  }
  const tmpDir = opts.tmpDir || os.tmpdir();
  const tmpFile = path.join(
    tmpDir,
    `rouge-mcp-${phase.replace(/[^a-z0-9.-]/gi, '_')}-${process.pid}-${Date.now()}.json`
  );
  fs.writeFileSync(tmpFile, JSON.stringify(config, null, 2) + '\n');
  return {
    args: ['--mcp-config', tmpFile],
    cleanup: () => {
      try { fs.unlinkSync(tmpFile); } catch (_e) { /* already gone */ }
    },
    config,
    ready,
    skipped,
    tmpFile,
  };
}

module.exports = {
  resolveMcpsForPhase,
  buildMcpConfig,
  buildSpawnArgsForPhase,
};
