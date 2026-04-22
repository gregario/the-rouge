/**
 * Self-heal planner.
 *
 * Given triage evidence, produces a fix plan the applier can execute.
 * Plans are bounded, single-purpose, deterministic — no LLM calls.
 *
 * Plan shape:
 *   {
 *     kind: string,        // e.g. 'add-enum-value'
 *     description: string, // human-readable one-liner
 *     files: [
 *       {
 *         path: string,        // repo-relative
 *         added_lines: number, // approximate
 *         removed_lines: number,
 *         patch: { kind, ...args } // how to apply
 *       }
 *     ],
 *     rationale: string,
 *     evidence: object, // forwarded from triage
 *   }
 *
 * Current fix kinds:
 *
 *   add-enum-value — a literal-string assignment in src/launcher/*.js
 *     writes a value not in the target schema's enum. The evidence
 *     from triage (schema, instance_path) points at the schema; the
 *     planner finds the offending assignment in source, reads the
 *     literal value, and proposes adding it to the enum. This is the
 *     stack-rank fix pattern.
 *
 * Return value:
 *   - { ok: true, plan } — when a concrete plan was built
 *   - { ok: false, reason } — when the evidence doesn't match any
 *     plan kind; the applier falls through and the original
 *     escalation stays pending for human review.
 */

const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const ROOT = path.resolve(__dirname, '../..');

/**
 * Walk src/launcher/*.js, find literal-string assignments whose
 * member-expression suffix matches `instancePath` (e.g.
 * '/foundation/status' → suffix 'foundation.status'). Returns the
 * first non-conforming assignment found as { file, line, value,
 * suffix } or null.
 */
function findOffendingAssignment(instancePath, allowedValues) {
  const suffix = instancePath.replace(/^\//, '').replace(/\//g, '.');
  const launcherDir = path.join(ROOT, 'src/launcher');
  const files = fs.readdirSync(launcherDir).filter((f) => f.endsWith('.js'));
  for (const f of files) {
    const filePath = path.join(launcherDir, f);
    const src = fs.readFileSync(filePath, 'utf8');
    let ast;
    try {
      ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true });
    } catch {
      continue;
    }
    const hit = findInAst(ast, suffix, allowedValues);
    if (hit) return { file: path.relative(ROOT, filePath), ...hit };
  }
  return null;
}

function findInAst(ast, suffix, allowedValues) {
  let found = null;
  function walk(node) {
    if (found || !node || typeof node !== 'object') return;
    if (node.type === 'AssignmentExpression' && node.operator === '=' && node.left && node.left.type === 'MemberExpression') {
      const nodeSuffix = memberSuffix(node.left);
      if (nodeSuffix && (nodeSuffix === suffix || nodeSuffix.endsWith('.' + suffix))) {
        if (node.right && node.right.type === 'Literal' && typeof node.right.value === 'string') {
          if (!allowedValues.includes(node.right.value)) {
            found = {
              line: node.loc.start.line,
              value: node.right.value,
              suffix: nodeSuffix,
            };
            return;
          }
        }
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;
      const child = node[key];
      if (Array.isArray(child)) { for (const c of child) walk(c); }
      else if (child && typeof child === 'object') walk(child);
    }
  }
  walk(ast);
  return found;
}

function memberSuffix(node) {
  const parts = [];
  let n = node;
  while (n && n.type === 'MemberExpression') {
    if (n.computed) return null;
    if (n.property.type !== 'Identifier') return null;
    parts.unshift(n.property.name);
    n = n.object;
  }
  if (!n || n.type !== 'Identifier') return null;
  return parts.join('.');
}

/**
 * Navigate schema to locate the enum at a given instance path.
 * `/foundation/status` → schema.properties.foundation.properties.status.enum
 */
function enumAtPath(schema, instancePath) {
  const segments = instancePath.split('/').filter(Boolean);
  let node = schema;
  for (const seg of segments) {
    if (!node) return null;
    if (node.properties && node.properties[seg]) {
      node = node.properties[seg];
    } else if (node.items && node.items.properties && node.items.properties[seg]) {
      node = node.items.properties[seg];
    } else {
      return null;
    }
  }
  return node && Array.isArray(node.enum) ? node.enum : null;
}

/**
 * Plan an add-enum-value fix from triage schema-enum-drift evidence.
 * Conservative: only proposes a plan if we can positively identify
 * the offending assignment in the launcher source AND the schema
 * has an existing enum at that path.
 */
function planAddEnumValue(evidence) {
  const schemaPath = path.join(ROOT, 'schemas', evidence.schema);
  if (!fs.existsSync(schemaPath)) {
    return { ok: false, reason: `schema file not found: schemas/${evidence.schema}` };
  }
  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  } catch (err) {
    return { ok: false, reason: `schema parse failed: ${err.message}` };
  }
  const existingEnum = enumAtPath(schema, evidence.instance_path);
  if (!existingEnum) {
    return { ok: false, reason: `no enum at ${evidence.instance_path} in schemas/${evidence.schema}` };
  }
  const offender = findOffendingAssignment(evidence.instance_path, existingEnum);
  if (!offender) {
    return { ok: false, reason: `no literal assignment found in src/launcher/*.js that violates ${evidence.instance_path} enum` };
  }
  const newEnum = [...existingEnum, offender.value];
  return {
    ok: true,
    plan: {
      kind: 'add-enum-value',
      description: `Add '${offender.value}' to ${evidence.instance_path} enum in schemas/${evidence.schema}`,
      files: [
        {
          path: `schemas/${evidence.schema}`,
          added_lines: 0,
          removed_lines: 0,
          patch: {
            kind: 'json-enum-append',
            instance_path: evidence.instance_path,
            new_value: offender.value,
            new_enum: newEnum,
          },
        },
      ],
      rationale:
        `${offender.file}:${offender.line} writes '${offender.value}' to ${offender.suffix}, which is not in ` +
        `the schema enum [${existingEnum.join(', ')}]. Every write triggers a schema warning and the state ` +
        `persists anyway — but this is the stack-rank failure mode (94 identical foundation-eval cycles). ` +
        `Adding '${offender.value}' to the enum both matches the launcher's intent and prevents the warn ` +
        `from continuing to fire. Schema edit is yellow-zone; the applier will route this to a draft PR.`,
      evidence,
    },
  };
}

/**
 * Build a fix plan from triage evidence, or return { ok: false }
 * if the triage kind doesn't match any known planner.
 */
function planFix(triage) {
  if (!triage || !triage.evidence) {
    return { ok: false, reason: 'no triage evidence' };
  }
  const kind = triage.evidence.kind;
  if (kind === 'schema-enum-drift') {
    return planAddEnumValue(triage.evidence);
  }
  return { ok: false, reason: `no planner for evidence kind: ${kind}` };
}

module.exports = { planFix, planAddEnumValue, findOffendingAssignment, enumAtPath };
