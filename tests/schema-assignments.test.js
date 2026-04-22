#!/usr/bin/env node
/**
 * Schema/code alignment invariant.
 *
 * Walks every JS file in src/launcher/, finds string-literal assignments
 * to enum-constrained properties (e.g. `state.foundation.status = 'X'`),
 * and asserts the value is in the schema enum.
 *
 * Catches drift like the 2026-04-21 `state.foundation.status = 'evaluating'`
 * bug where the launcher wrote a value the schema didn't allow — every
 * write logged a warn, the state persisted anyway, and foundation-eval
 * looped 94 times on stack-rank before the budget cap finally fired.
 *
 * Scope: static analysis. Dynamic assignments (variables, computed
 * expressions) are out of scope — the test only catches literal-to-enum
 * drift, which is 80% of the failure mode. Full enforcement at runtime
 * is the job of schema-validator.js in strict mode.
 *
 * Usage: node tests/schema-assignments.test.js
 */

const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const ROOT = path.resolve(__dirname, '..');
const LAUNCHER_DIR = path.join(ROOT, 'src/launcher');
const SCHEMAS_DIR = path.join(ROOT, 'schemas');

let failures = 0;
let checks = 0;

function assert(condition, message) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${message}`);
  }
}

// Enum targets — (property-path-suffix → allowed-values). Property path
// suffix matches the tail of the member-expression chain, so we catch
// whether the root variable is `state`, `phaseState`, `s`, etc.
function loadEnumTargets() {
  const stateSchema = JSON.parse(
    fs.readFileSync(path.join(SCHEMAS_DIR, 'state.json'), 'utf8'),
  );
  const targets = new Map();
  targets.set('current_state', {
    schemaPath: 'properties.current_state.enum',
    values: new Set(stateSchema.properties.current_state.enum),
  });
  targets.set('foundation.status', {
    schemaPath: 'properties.foundation.properties.status.enum',
    values: new Set(stateSchema.properties.foundation.properties.status.enum),
  });
  targets.set('costs.phase_cost_source', {
    schemaPath: 'properties.costs.properties.phase_cost_source.enum',
    values: new Set(stateSchema.properties.costs.properties.phase_cost_source.enum),
  });
  return targets;
}

// Walk a MemberExpression chain top-down and emit the dotted suffix if
// the chain is static. `state.foundation.status` → `foundation.status`.
// `state.milestones[i].status` → null (has computed index, non-static).
function memberSuffix(node) {
  // Collect property names in order, innermost-first.
  const parts = [];
  let n = node;
  while (n && n.type === 'MemberExpression') {
    if (n.computed) return null; // foo[bar] — not a static path
    if (n.property.type !== 'Identifier') return null;
    parts.unshift(n.property.name);
    n = n.object;
  }
  // The root (innermost object) is an Identifier; we don't constrain its
  // name — works for `state.X`, `phaseState.X`, `s.X` alike.
  if (!n || n.type !== 'Identifier') return null;
  return parts.join('.');
}

function checkFile(filePath, targets) {
  const src = fs.readFileSync(filePath, 'utf8');
  let ast;
  try {
    ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true });
  } catch (err) {
    console.error(`  ! failed to parse ${path.relative(ROOT, filePath)}: ${err.message}`);
    failures++;
    return;
  }

  // Minimal recursive walker — no dep on acorn-walk.
  const assignments = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'AssignmentExpression' && node.operator === '=') {
      if (node.left && node.left.type === 'MemberExpression') {
        const suffix = memberSuffix(node.left);
        if (suffix && node.right && node.right.type === 'Literal' && typeof node.right.value === 'string') {
          assignments.push({ suffix, value: node.right.value, loc: node.loc });
        }
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach(walk);
      else if (child && typeof child === 'object') walk(child);
    }
  }
  walk(ast);

  for (const { suffix, value, loc } of assignments) {
    // Match the longest suffix that registers as an enum target. e.g.
    // `phaseState.foundation.status` has suffix 'foundation.status';
    // `ctx.costs.phase_cost_source` has 'costs.phase_cost_source'.
    for (const [key, target] of targets) {
      if (suffix === key || suffix.endsWith('.' + key)) {
        const rel = path.relative(ROOT, filePath);
        assert(
          target.values.has(value),
          `${rel}:${loc.start.line} assigns ${suffix}='${value}' — not in schema enum (allowed: ${[...target.values].join(', ')})`,
        );
      }
    }
  }
}

function main() {
  console.log('schema-assignments invariant');
  const targets = loadEnumTargets();
  const files = fs
    .readdirSync(LAUNCHER_DIR)
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join(LAUNCHER_DIR, f));

  for (const f of files) checkFile(f, targets);

  console.log(`  ${checks} checks, ${failures} failures`);
  if (failures > 0) {
    console.error('FAIL — schema/code drift detected');
    process.exit(1);
  }
  console.log('PASS');
}

main();
