/**
 * config-protection.js
 *
 * Stateless config-protection check. Given a file path and a diff/new content,
 * decides whether the factory is attempting to weaken a linter/type/test/CI
 * config — a common silent-failure pattern where the factory "fixes" errors
 * by disabling the rule rather than the code.
 *
 * Status: designed and tested, NOT yet wired into rouge-safety-check.sh.
 * See docs/design/config-protection.md for the rollout plan.
 *
 * Return shape:
 *   { allow: boolean, reason: string, severity: "ok"|"warn"|"block" }
 *
 * This module never throws on unknown input; unknown files return allow:true.
 */

'use strict';

const path = require('node:path');

// File patterns that signal a config file. Matched against the basename
// OR the full path segment for nested configs (e.g. .github/workflows/*.yml).
const PROTECTED_PATTERNS = [
  /^\.eslintrc/i,
  /^eslint\.config\./i,
  /^\.prettierrc/i,
  /^prettier\.config\./i,
  /^tsconfig(\..*)?\.json$/i,
  /^jsconfig(\..*)?\.json$/i,
  /^pyproject\.toml$/i,
  /^ruff\.toml$/i,
  /^mypy\.ini$/i,
  /^pytest\.ini$/i,
  /^pyrightconfig\.json$/i,
  /^\.rustfmt\.toml$/i,
  /^clippy\.toml$/i,
  /^\.golangci\.(yml|yaml)$/i,
  /^\.c8rc/i,
  /^jest\.config\./i,
  /^vitest\.config\./i,
];

// Keywords in a diff that indicate weakening (not strengthening).
// "new"/"add" terms are permissive; these are specifically about downgrades.
const WEAKENING_SIGNALS = [
  /"?strict"?\s*:\s*false/i,                 // TS strict mode off
  /"?noImplicitAny"?\s*:\s*false/i,
  /"?strictNullChecks"?\s*:\s*false/i,
  /^\s*\/\*\s*eslint-disable/m,              // blanket eslint-disable
  /"?rules"?\s*:\s*\{[^}]*"off"/i,           // eslint rule set to "off"
  /--coverage\s+0/i,                          // coverage gate dropped
  /["']?(lines|branches|functions|statements)["']?\s*:\s*[0-7]\d\b/i,  // coverage threshold dropped below 80
  /skip:\s*true/i,                            // tests skipped
  /'@typescript-eslint\/no-explicit-any'\s*:\s*['"]off['"]/i,
];

function isProtectedFile(filePath) {
  const base = path.basename(filePath);
  if (PROTECTED_PATTERNS.some((rx) => rx.test(base))) return true;
  // Nested CI workflow files
  if (/\.github\/workflows\/.+\.ya?ml$/.test(filePath)) return true;
  // pyproject.toml: only flag if tool.ruff / tool.mypy / tool.pytest sections exist in the diff (caller passes diff; we check later)
  return false;
}

function hasRationaleMarker(diff) {
  if (!diff) return false;
  return /\/\/\s*rationale:/i.test(diff) || /#\s*rationale:/i.test(diff);
}

function findWeakeningSignals(diff) {
  if (!diff) return [];
  return WEAKENING_SIGNALS.filter((rx) => rx.test(diff)).map((rx) => rx.source);
}

/**
 * @param {{filePath: string, diff?: string, newContent?: string, mode?: "off"|"warn"|"block"}} args
 * @returns {{allow: boolean, reason: string, severity: "ok"|"warn"|"block", signals?: string[]}}
 */
function check(args) {
  const { filePath, diff = '', newContent = '', mode = 'warn' } = args;
  if (!filePath) return { allow: true, reason: 'no file path provided', severity: 'ok' };
  if (mode === 'off') return { allow: true, reason: 'config-protection disabled', severity: 'ok' };

  if (!isProtectedFile(filePath)) {
    return { allow: true, reason: 'not a protected config file', severity: 'ok' };
  }

  const haystack = diff || newContent;
  const signals = findWeakeningSignals(haystack);

  if (signals.length === 0) {
    return { allow: true, reason: 'protected file edit, no weakening signals detected', severity: 'ok' };
  }

  if (hasRationaleMarker(haystack)) {
    return {
      allow: true,
      reason: `protected file edit with weakening signals (${signals.length}) but rationale marker present`,
      severity: 'ok',
      signals,
    };
  }

  if (mode === 'block') {
    return {
      allow: false,
      reason: `config-protection: refusing to weaken ${filePath} (${signals.length} signal(s), no rationale marker)`,
      severity: 'block',
      signals,
    };
  }

  // mode: warn (default)
  return {
    allow: true,
    reason: `config-protection WARNING: weakening ${filePath} (${signals.length} signal(s)); add '// rationale: ...' comment to acknowledge`,
    severity: 'warn',
    signals,
  };
}

module.exports = { check, isProtectedFile, findWeakeningSignals, hasRationaleMarker };
