const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// GC.2 — MCP vs CLI boundary enforcement at the prompt level.
//
// The policy: AI uses MCPs for inspection (list, fetch, read), CLIs
// for mutation (deploy, migrate, push, delete). Mutating via an MCP
// loses the Bash-tool audit trail and creates a side channel through
// which destructive ops can happen invisibly.
//
// This test fails any prompt that pairs an MCP mention with a
// mutating verb in close proximity. Today's prompts mention "MCP"
// only as a product shape (CLI / MCP server / web app) — no
// instructions to use MCPs at all. The test starts clean and
// prevents future drift.
//
// Boundary doc: docs/design/mcp-vs-cli-boundary.md.

const PROMPT_ROOTS = [
  path.join(__dirname, '..', '..', 'src', 'prompts', 'loop'),
  path.join(__dirname, '..', '..', 'src', 'prompts', 'seeding'),
];

const MUTATING_VERBS = [
  'deploy',
  'migrate',
  'force-push',
  'force push',
  'drop table',
  'truncate',
  'delete table',
  'rm -rf',
];

const PROXIMITY_WINDOW = 200; // chars

function listPromptFiles() {
  const files = [];
  for (const root of PROMPT_ROOTS) {
    if (!fs.existsSync(root)) continue;
    for (const f of fs.readdirSync(root).filter((x) => x.endsWith('.md'))) {
      files.push({ root, file: f, full: path.join(root, f) });
    }
  }
  return files;
}

function findMcpMentions(text) {
  const offsets = [];
  // Match "MCP" / "MCPs" / "MCP server" / "the X MCP" — but only when
  // followed/preceded by tooling context, not the product-shape sense.
  // We scan for any \bMCP\b and rely on the proximity check + verbs to
  // gate violations; the "MCP server" product-shape mentions are NOT
  // violations because the mutating verbs nearby are talking about
  // shipping the MCP server, not using one.
  const re = /\bMCPs?\b/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    offsets.push(m.index);
  }
  return offsets;
}

function nearbyContainsMutatingVerb(text, offset) {
  const lo = Math.max(0, offset - PROXIMITY_WINDOW);
  const hi = Math.min(text.length, offset + PROXIMITY_WINDOW);
  const window = text.slice(lo, hi).toLowerCase();
  // A "violation" is the AI being told to use an MCP for a mutating
  // op. Specifically: the window must contain BOTH a directive verb
  // pattern like "use the X MCP to deploy" / "deploy via MCP" AND
  // imply MCP is the actor of the mutation. Naive proximity has too
  // many false positives ("MCP server" appearing in a paragraph that
  // mentions "deploy"). We narrow to phrases that pair the MCP with
  // the verb directly:
  for (const verb of MUTATING_VERBS) {
    const patterns = [
      new RegExp(`use the [\\w-]+ mcp to ${verb}`, 'i'),
      new RegExp(`via the [\\w-]+ mcp.{0,40}${verb}`, 'i'),
      new RegExp(`mcp.{0,30}\\b${verb}\\b.{0,30}via mcp`, 'i'),
      new RegExp(`${verb}.{0,40}via the [\\w-]+ mcp`, 'i'),
      new RegExp(`${verb}.{0,40}using the [\\w-]+ mcp`, 'i'),
    ];
    for (const p of patterns) {
      if (p.test(window)) return { verb, window: text.slice(lo, hi) };
    }
  }
  return null;
}

describe('GC.2 — MCP-mutate verb pairings forbidden in prompts', () => {
  const files = listPromptFiles();

  test('every prompt scanned (sanity check)', () => {
    assert.ok(files.length > 0, 'no prompt files found — paths broken?');
  });

  for (const { full, file } of files) {
    test(file, () => {
      const text = fs.readFileSync(full, 'utf8');
      const offsets = findMcpMentions(text);
      const violations = [];
      for (const off of offsets) {
        const hit = nearbyContainsMutatingVerb(text, off);
        if (hit) {
          violations.push({
            verb: hit.verb,
            offset: off,
            excerpt: hit.window.replace(/\s+/g, ' ').trim().slice(0, 160),
          });
        }
      }
      assert.equal(violations.length, 0,
        `${file}: ${violations.length} MCP-mutate-verb pairing(s) found:\n` +
        violations.map((v) => `  • ${v.verb} near MCP @${v.offset}: "${v.excerpt}"`).join('\n'));
    });
  }
});
