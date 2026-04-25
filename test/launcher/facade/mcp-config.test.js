const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  resolveMcpsForPhase,
  buildMcpConfig,
  buildSpawnArgsForPhase,
} = require('../../../src/launcher/facade/dispatch/mcp-config.js');

describe('mcp-config — resolveMcpsForPhase', () => {
  test('returns matching MCPs for loop.ship-promote when env present', () => {
    const env = {
      VERCEL_API_TOKEN: 'x',
      CLOUDFLARE_API_TOKEN: 'y',
      GITHUB_PERSONAL_ACCESS_TOKEN: 'z',
    };
    const { ready, skipped } = resolveMcpsForPhase('loop.ship-promote', { env });
    const names = ready.map((m) => m.name).sort();
    assert.ok(names.includes('vercel'), `expected vercel, got: ${names.join(',')}`);
    assert.ok(names.includes('cloudflare-workers'));
    assert.ok(names.includes('github'));
    // Non-ship-promote MCPs (exa, firecrawl) should not appear.
    assert.ok(!names.includes('exa'));
    assert.ok(!names.includes('firecrawl'));
    // skipped should be empty since all ship-promote MCPs have env satisfied here.
    assert.equal(skipped.length, 0, `unexpected skipped: ${JSON.stringify(skipped)}`);
  });

  test('skips MCPs whose env_required is not satisfied', () => {
    const env = {}; // no env vars at all
    const { ready, skipped } = resolveMcpsForPhase('loop.ship-promote', { env });
    assert.equal(ready.length, 0, `expected no ready MCPs, got: ${ready.map((m) => m.name).join(',')}`);
    const skippedNames = skipped.map((s) => s.name).sort();
    assert.ok(skippedNames.includes('vercel'));
    assert.ok(skippedNames.includes('cloudflare-workers'));
    // github also requires GITHUB_PERSONAL_ACCESS_TOKEN
    assert.ok(skippedNames.includes('github'));
    // Each skipped entry includes the missing env vars.
    const vercelSkip = skipped.find((s) => s.name === 'vercel');
    assert.ok(Array.isArray(vercelSkip.missing));
    assert.ok(vercelSkip.missing.includes('VERCEL_API_TOKEN'));
  });

  test('returns empty for a phase with no wired MCPs', () => {
    const { ready, skipped } = resolveMcpsForPhase('loop.no-such-phase', { env: process.env });
    assert.deepEqual(ready, []);
    assert.deepEqual(skipped, []);
  });

  test('throws on missing phase', () => {
    assert.throws(() => resolveMcpsForPhase(undefined), /phase \(string\) required/);
    assert.throws(() => resolveMcpsForPhase(123), /phase \(string\) required/);
  });

  test('seeding.brainstorm matches exa, firecrawl, github', () => {
    const env = { EXA_API_KEY: 'a', FIRECRAWL_API_KEY: 'b', GITHUB_PERSONAL_ACCESS_TOKEN: 'c' };
    const { ready } = resolveMcpsForPhase('seeding.brainstorm', { env });
    const names = ready.map((m) => m.name).sort();
    assert.deepEqual(names, ['exa', 'firecrawl', 'github']);
  });
});

describe('mcp-config — buildMcpConfig', () => {
  test('emits the mcpServers shape with command + args + env', () => {
    const env = { SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 'k' };
    const { config } = buildMcpConfig('loop.building', { env });
    assert.ok(config.mcpServers);
    assert.ok(config.mcpServers.supabase, 'supabase MCP should be in config');
    const supa = config.mcpServers.supabase;
    assert.equal(supa.command, 'npx');
    assert.ok(Array.isArray(supa.args));
    assert.equal(supa.env.SUPABASE_URL, 'u');
    assert.equal(supa.env.SUPABASE_SERVICE_ROLE_KEY, 'k');
  });

  test('emits url shape (not command/args) for HTTP MCPs', () => {
    const env = { VERCEL_API_TOKEN: 'tok' };
    const { config } = buildMcpConfig('loop.ship-promote', { env });
    const vercel = config.mcpServers.vercel;
    assert.ok(vercel, 'vercel MCP should be present');
    assert.equal(vercel.url, 'https://mcp.vercel.com/');
    assert.equal(vercel.command, undefined, 'HTTP MCP should not have command');
    assert.equal(vercel.args, undefined, 'HTTP MCP should not have args');
  });

  test('emits empty mcpServers when no env is satisfied', () => {
    const { config } = buildMcpConfig('loop.ship-promote', { env: {} });
    assert.deepEqual(config.mcpServers, {});
  });
});

describe('mcp-config — buildSpawnArgsForPhase', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-mcp-test-'));
  });
  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_e) {}
  });

  test('writes a tempfile and returns --mcp-config args + cleanup', () => {
    const env = { GITHUB_PERSONAL_ACCESS_TOKEN: 'tok' };
    const result = buildSpawnArgsForPhase('seeding.brainstorm', { env, tmpDir });
    assert.equal(result.args[0], '--mcp-config');
    assert.ok(result.args[1]);
    assert.ok(fs.existsSync(result.args[1]));
    const content = JSON.parse(fs.readFileSync(result.args[1], 'utf8'));
    assert.ok(content.mcpServers);
    assert.ok(content.mcpServers.github);
    // Cleanup removes the tempfile.
    result.cleanup();
    assert.equal(fs.existsSync(result.args[1]), false);
  });

  test('returns empty args + no-op cleanup when nothing to wire', () => {
    const result = buildSpawnArgsForPhase('seeding.brainstorm', { env: {}, tmpDir });
    assert.deepEqual(result.args, []);
    // Cleanup is safe to call even when no file was written.
    result.cleanup();
  });

  test('cleanup is idempotent', () => {
    const env = { CONTEXT7_API_KEY: 'k' };
    const result = buildSpawnArgsForPhase('loop.building', { env, tmpDir });
    if (result.args.length > 0) {
      result.cleanup();
      result.cleanup(); // does not throw
    }
  });
});
