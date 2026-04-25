const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Architecture invariant tests for the four GC boundaries.
//
// Phase 7 of the grand unified reconciliation. These tests are the
// CI gate — they run as a separate exit code (npm run test:boundaries)
// so a failure here can block merge regardless of whether the regular
// test suite passes. The intent is "architectural invariants we never
// break" get more weight than "tests we run."
//
// Boundaries:
//   GC.1 — Judge vs Pipeline: covered by test/launcher/self-improve-safety.test.js
//   GC.2 — MCP vs CLI: covered by test/prompts/gc2-mcp-vs-cli-boundary.test.js
//   GC.3 — Determination vs Judgment: this file (AI dispatch sites)
//   GC.4 — Entry vs Core: this file (state writes + event emission)
//
// FORK D: warn-then-enforce. Tests start as warnings (skipped + logged)
// during the Phase 5 migration window; they FLIP to hard failures
// after one release cycle so late migrations get caught. Toggle via
// ROUGE_BOUNDARY_ENFORCE env var.

const ENFORCE = process.env.ROUGE_BOUNDARY_ENFORCE === 'true'
  || process.env.ROUGE_BOUNDARY_ENFORCE === '1';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function readSourceFile(rel) {
  const full = path.join(REPO_ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}

function listSources(dirRel, exts) {
  const root = path.join(REPO_ROOT, dirRel);
  if (!fs.existsSync(root)) return [];
  const out = [];
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (exts.some((e) => entry.name.endsWith(e))) out.push(full);
    }
  }
  walk(root);
  return out;
}

// Strip comments from a JS/TS source so grep patterns ignore JSDoc /
// inline rationale that mentions the boundary literals. Conservative —
// we want comments removed, but strings and code preserved.
function stripComments(text) {
  // Remove /* ... */ blocks (greedy on `*/`).
  let out = text.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove `// ...` line tails. Use a global replace; this is not a
  // perfect parser (won't notice `//` inside strings) but the
  // boundary patterns we look for don't appear inside strings, so
  // false negatives here are acceptable.
  out = out.split('\n').map((line) => line.replace(/\s*\/\/.*$/, '')).join('\n');
  return out;
}

// ---------------------------------------------------------------------------
// GC.3 — AI dispatch sites
// ---------------------------------------------------------------------------

describe('GC.3 — AI dispatch is bounded to known sites', () => {
  const knownDispatchSites = new Set([
    // Spawn / SDK invocation sites that ARE allowed (they sit at or
    // beneath the facade dispatch boundary).
    path.join(REPO_ROOT, 'src/launcher/rouge-loop.js'),
    path.join(REPO_ROOT, 'src/launcher/self-improve.js'),
    path.join(REPO_ROOT, 'src/launcher/harness/sdk-adapter.js'),
    path.join(REPO_ROOT, 'src/launcher/facade.js'),
    path.join(REPO_ROOT, 'src/launcher/facade/dispatch/subprocess.js'),
    path.join(REPO_ROOT, 'src/launcher/facade/dispatch/sdk.js'),
    path.join(REPO_ROOT, 'src/launcher/facade/dispatch/mcp-config.js'),
    path.join(REPO_ROOT, 'dashboard/src/bridge/claude-runner.ts'),
    path.join(REPO_ROOT, 'dashboard/src/bridge/facade.ts'),
  ]);

  // Patterns that indicate AI dispatch — spawning claude, calling
  // messages.create, or otherwise invoking a model.
  const DISPATCH_PATTERNS = [
    /spawn\(\s*['"]claude['"]/,
    /spawnSync\(\s*['"]claude['"]/,
    /\.messages\.create\(/,
  ];

  test('AI dispatch only happens in known sites', () => {
    const violations = [];
    const sources = [
      ...listSources('src/launcher', ['.js']),
      ...listSources('src/slack', ['.js']),
      ...listSources('dashboard/src', ['.ts']),
    ];
    for (const file of sources) {
      if (knownDispatchSites.has(file)) continue;
      // Skip test files — tests legitimately mock spawn and may
      // pattern-match the dispatch literals.
      if (file.includes('__tests__') || file.includes('/test/')) continue;
      const text = stripComments(fs.readFileSync(file, 'utf8'));
      for (const pat of DISPATCH_PATTERNS) {
        const m = pat.exec(text);
        if (m) {
          violations.push({
            file: path.relative(REPO_ROOT, file),
            pattern: pat.source,
            snippet: text.slice(Math.max(0, m.index - 30), m.index + 60).replace(/\s+/g, ' '),
          });
        }
      }
    }

    if (violations.length === 0) return;
    const msg = `GC.3 violations — AI dispatch outside known facade sites:\n` +
      violations.map((v) => `  • ${v.file}: /${v.pattern}/ → "${v.snippet}"`).join('\n');
    if (ENFORCE) assert.fail(msg);
    else console.warn(`[GC.3 WARN] ${violations.length} site(s):\n${msg}`);
  });
});

// ---------------------------------------------------------------------------
// GC.4 — Direct state.json writes outside facade
// ---------------------------------------------------------------------------

describe('GC.4 — state.json writes go through the facade', () => {
  // These files are allowed to write state.json directly because
  // they are the facade itself, the launcher loop's commit helper,
  // or migration tooling.
  const knownStateWriters = new Set([
    path.join(REPO_ROOT, 'src/launcher/facade.js'),
    path.join(REPO_ROOT, 'src/launcher/rouge-loop.js'), // commitState helper
    path.join(REPO_ROOT, 'src/launcher/state-migration.js'),
    path.join(REPO_ROOT, 'src/launcher/migrate-state-to-rouge-dir.js'),
    path.join(REPO_ROOT, 'src/launcher/journey-log.js'),
    path.join(REPO_ROOT, 'src/launcher/checkpoint.js'),
    // Dashboard's writeStateJson is the dashboard-side write helper.
    // It does the atomic write at the byte level + emits a facade
    // event afterward; Phase 5b documents why it doesn't itself
    // call facade.writeState (reentrancy with withStateLock).
    path.join(REPO_ROOT, 'dashboard/src/bridge/state-path.ts'),
  ]);

  // Patterns that look like a direct write to a state file. The
  // signal is the pairing of writeFileSync/fs.writeFile with the
  // string 'state.json' or a stateFile/statePath variable.
  const STATE_WRITE_PATTERNS = [
    /writeFileSync\([^,]+state\.json/,
    /writeJson\(\s*stateFile/,
  ];

  test('no direct state.json writes outside known sites', () => {
    const violations = [];
    const sources = [
      ...listSources('src/launcher', ['.js']),
      ...listSources('src/slack', ['.js']),
      ...listSources('dashboard/src', ['.ts']),
    ];
    for (const file of sources) {
      if (knownStateWriters.has(file)) continue;
      if (file.includes('__tests__') || file.includes('/test/')) continue;
      const text = stripComments(fs.readFileSync(file, 'utf8'));
      for (const pat of STATE_WRITE_PATTERNS) {
        const m = pat.exec(text);
        if (m) {
          violations.push({
            file: path.relative(REPO_ROOT, file),
            pattern: pat.source,
            snippet: text.slice(Math.max(0, m.index - 30), m.index + 80).replace(/\s+/g, ' '),
          });
        }
      }
    }

    if (violations.length === 0) return;
    const msg = `GC.4 violations — direct state writes outside facade:\n` +
      violations.map((v) => `  • ${v.file}: /${v.pattern}/ → "${v.snippet}"`).join('\n');
    if (ENFORCE) assert.fail(msg);
    else console.warn(`[GC.4 WARN] ${violations.length} site(s):\n${msg}`);
  });
});

// ---------------------------------------------------------------------------
// GC.4 — Facade source-tag distribution
// ---------------------------------------------------------------------------

describe('GC.4 — facade source tags reach every adapter', () => {
  // Smoke check: every entry adapter (loop, cli, dashboard, slack,
  // self-improve) appears at least once as a source: 'X' literal in
  // the codebase. If a source is never used, the migration is
  // incomplete OR the source value is dead.
  const VALID_SOURCES = ['loop', 'cli', 'dashboard', 'slack', 'self-improve'];

  test('every valid source tag is used somewhere', () => {
    const sources = [
      ...listSources('src/launcher', ['.js']),
      ...listSources('src/slack', ['.js']),
      ...listSources('dashboard/src', ['.ts']),
    ];
    const usage = new Map();
    for (const tag of VALID_SOURCES) usage.set(tag, []);

    for (const file of sources) {
      const text = stripComments(fs.readFileSync(file, 'utf8'));
      for (const tag of VALID_SOURCES) {
        const re = new RegExp(`source:\\s*['\"]${tag}['\"]`);
        if (re.test(text)) usage.get(tag).push(path.relative(REPO_ROOT, file));
      }
    }

    const unused = VALID_SOURCES.filter((t) => usage.get(t).length === 0);
    if (unused.length === 0) return;
    const msg = `GC.4: source tag(s) never used: ${unused.join(', ')}`;
    if (ENFORCE) assert.fail(msg);
    else console.warn(`[GC.4 WARN] ${msg}`);
  });
});
