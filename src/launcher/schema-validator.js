/**
 * Shared schema validator.
 *
 * Two modes:
 *
 * - Warn (default) — violation logs + returns `{valid: false, errors}`,
 *   caller decides. Used by reads where a bad shape on disk shouldn't
 *   block forward progress.
 *
 * - Strict — violation throws a `SchemaViolationError`. Used by writes
 *   where letting the bad shape land would corrupt state for later
 *   readers. Callers opt in via `{strict: true}` or the env var
 *   `ROUGE_STRICT_SCHEMA=1`.
 *
 * Rationale: stack-rank looped foundation-eval 94× because a write of
 * `foundation.status='evaluating'` (not in the schema enum) was logged
 * as a warn and proceeded, and no downstream reader could distinguish
 * "schema-violating state" from "normal state." Strict-mode writes
 * surface the drift immediately at the site of introduction, which is
 * where the stack trace is useful.
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

class SchemaViolationError extends Error {
  constructor(schemaName, context, errors) {
    super(`[schema:${schemaName}] ${context}: ${errors[0] || 'unknown violation'}`);
    this.name = 'SchemaViolationError';
    this.schemaName = schemaName;
    this.context = context;
    this.errors = errors;
  }
}

/**
 * Validate a JSON value against a schema file.
 *
 * @param {string} schemaName — filename inside `schemas/` (e.g. 'state.json').
 * @param {unknown} data — value to validate.
 * @param {string} context — for log tag ('state.json write', 'cycle_context read', etc).
 * @param {{ strict?: boolean }} [opts] — strict mode throws on violation.
 *   Env var `ROUGE_STRICT_SCHEMA=1` promotes all calls to strict.
 * @returns {{ valid: boolean, errors: string[] }}
 * @throws {SchemaViolationError} when strict mode is on and validation fails.
 */
function validate(schemaName, data, context, opts) {
  const v = loadValidator(schemaName);
  if (!v) return { valid: true, errors: [] };
  const ok = v(data);
  if (ok) return { valid: true, errors: [] };
  const errors = (v.errors || []).map((e) => `${e.instancePath || '<root>'} ${e.message}`);
  const strict = (opts && opts.strict) || process.env.ROUGE_STRICT_SCHEMA === '1';
  if (strict) {
    // No warn log — the thrown error carries the same payload and the
    // caller's stack is more useful than a stray warn line.
    throw new SchemaViolationError(schemaName, context, errors);
  }
  const first = errors[0] || 'unknown violation';
  console.warn(`[schema:${schemaName}] ${context}: ${first}`);
  return { valid: false, errors };
}

module.exports = { validate, SchemaViolationError };
