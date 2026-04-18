/**
 * Shared schema validator (warn-only).
 *
 * ajv + the JSON Schemas in `schemas/` catch shape violations that
 * silent-swallow catches in readers couldn't. The violation surfaces
 * as a warn log (with file path + first error) so the operator has a
 * trail — but the read/write still proceeds so a bad shape on disk
 * can't take the whole loop down.
 *
 * Scope: used from launcher paths that read/write state.json,
 * cycle_context.json, task_ledger.json, and checkpoint entries.
 * The dashboard has its own wrapper at
 * `dashboard/src/lib/safe-read-json.ts` that stays JSON-only; the
 * validator is launcher-side by design so a crashed launcher doesn't
 * take the dashboard down too.
 */

const fs = require('fs');
const path = require('path');

let AjvCtor = null;
try {
  // Lazy-load ajv. If ajv isn't installed (fresh checkout, skipped
  // `npm install`), the validator no-ops rather than crashing the
  // loop — we never want validation overhead to block forward
  // progress.
  // eslint-disable-next-line global-require
  AjvCtor = require('ajv');
} catch {
  AjvCtor = null;
}

const SCHEMAS_DIR = path.resolve(__dirname, '../../schemas');
const ajv = AjvCtor ? new AjvCtor({ allErrors: false, strict: false }) : null;

// Cache compiled validators by schema filename.
const validators = new Map();

function loadValidator(schemaName) {
  if (!ajv) return null;
  if (validators.has(schemaName)) return validators.get(schemaName);
  const schemaPath = path.join(SCHEMAS_DIR, schemaName);
  if (!fs.existsSync(schemaPath)) {
    validators.set(schemaName, null);
    return null;
  }
  try {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const validate = ajv.compile(schema);
    validators.set(schemaName, validate);
    return validate;
  } catch (err) {
    console.warn(`[schema-validator] compile ${schemaName} failed: ${err.message}`);
    validators.set(schemaName, null);
    return null;
  }
}

/**
 * Validate a JSON value against a schema file. Warn-only.
 *
 * @param {string} schemaName — filename inside `schemas/` (e.g. 'state.json').
 * @param {unknown} data — value to validate.
 * @param {string} context — for log tag ('state.json write', 'cycle_context read', etc).
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validate(schemaName, data, context) {
  const v = loadValidator(schemaName);
  if (!v) return { valid: true, errors: [] };
  const ok = v(data);
  if (ok) return { valid: true, errors: [] };
  const errors = (v.errors || []).map((e) => `${e.instancePath || '<root>'} ${e.message}`);
  const first = errors[0] || 'unknown violation';
  console.warn(`[schema:${schemaName}] ${context}: ${first}`);
  return { valid: false, errors };
}

module.exports = { validate };
