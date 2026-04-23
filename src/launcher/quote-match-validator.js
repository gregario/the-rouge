/**
 * quote-match-validator.js — P1.16b structured-reference validator.
 *
 * The P1.16 prompt discipline tells judges to quote verbatim evidence
 * before writing a verdict. This module makes that discipline enforceable
 * by requiring structured references: instead of a free-form evidence_span
 * string, findings carry an evidence_ref object pointing to the specific
 * location that grounds the finding.
 *
 * Shape the judge must emit on high-confidence findings:
 *
 *   evidence_ref: {
 *     type: 'cycle_context' | 'file',
 *     path: string,    // JSONPath into cycle_context, OR 'file.ext:START-END'
 *     quote: string    // verbatim text from the resolved field
 *   }
 *
 * The validator:
 *   1. Resolves the path. If it doesn't resolve → invalid.
 *   2. Compares the quote against the resolved text:
 *      - exact substring match → valid (similarity: 1.0)
 *      - trigram similarity ≥ 0.85 within the single resolved field → valid
 *        (legitimate paraphrase within one field is bounded, unlike the
 *        whole-haystack paraphrase problem that killed the fuzzy-match
 *        design)
 *      - below threshold → invalid
 *
 * Callers (finding-validator.js) use the result to downgrade confidence
 * from 'high' to 'moderate' when evidence_ref is absent or doesn't resolve.
 *
 * Pure (no external dependencies beyond node:fs for file-type refs).
 * Never throws on bad input.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------------
// JSONPath resolution (cycle_context type)
// ---------------------------------------------------------------------------
//
// Supports dot-notation keys and bracketed array indices. Does NOT support
// keys containing dots or brackets — by convention cycle_context keys are
// simple identifiers.
//
// Grammar (informal): `identifier (('.' identifier) | ('[' number ']'))*`
// Examples:
//   product_walk.screens[2].interactive_elements[1].result
//   code_review_report.ai_code_audit.dimensions.architecture.findings[0].description

function tokenizePath(path) {
  if (typeof path !== 'string' || !path) return null;
  const tokens = [];
  let i = 0;
  // State machine: `expectingToken` is true when the next char must
  // start a key or an [N] index (i.e. the path starts, or we just saw
  // a dot separator). This catches trailing dots, double dots, and
  // dots at the start.
  let expectingToken = true;
  const KEY_RX = /^[A-Za-z_][A-Za-z0-9_-]*/;

  while (i < path.length) {
    const c = path[i];
    if (c === '.') {
      if (expectingToken) return null;  // leading dot, double dot, or ".[" gap
      expectingToken = true;
      i++;
      continue;
    }
    if (c === '[') {
      const end = path.indexOf(']', i);
      if (end === -1) return null;
      const num = path.slice(i + 1, end);
      if (!/^\d+$/.test(num)) return null;
      tokens.push({ type: 'index', value: parseInt(num, 10) });
      i = end + 1;
      expectingToken = false;
      continue;
    }
    // Identifier / key
    const m = path.slice(i).match(KEY_RX);
    if (!m) return null;
    // If we didn't expect a token here (previous token was a key/index
    // with no intervening dot or bracket), that's malformed.
    if (!expectingToken && tokens.length > 0 && tokens[tokens.length - 1].type === 'key') {
      return null;
    }
    tokens.push({ type: 'key', value: m[0] });
    i += m[0].length;
    expectingToken = false;
  }
  if (expectingToken) return null;  // trailing dot
  if (tokens.length === 0) return null;
  return tokens;
}

function resolveCycleContextPath(ctx, pathStr) {
  if (ctx === null || ctx === undefined) return undefined;
  const tokens = tokenizePath(pathStr);
  if (!tokens) return undefined;
  let current = ctx;
  for (const t of tokens) {
    if (current === null || current === undefined) return undefined;
    if (t.type === 'index') {
      if (!Array.isArray(current)) return undefined;
      current = current[t.value];
    } else {
      if (typeof current !== 'object' || Array.isArray(current)) return undefined;
      current = current[t.value];
    }
  }
  return current;
}

// ---------------------------------------------------------------------------
// File range resolution (file type)
// ---------------------------------------------------------------------------
//
// Path form: 'relative/path/to/file.ext:START[-END]' (1-based line numbers)
//
// Returns the concatenated lines at [START, END] inclusive, or undefined
// if the file doesn't exist or the range is invalid.

function parseFilePathSpec(pathSpec) {
  if (typeof pathSpec !== 'string') return null;
  const m = pathSpec.match(/^(.+?):(\d+)(?:-(\d+))?$/);
  if (!m) return null;
  const file = m[1];
  const start = parseInt(m[2], 10);
  const end = m[3] === undefined ? start : parseInt(m[3], 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start) return null;
  return { file, start, end };
}

function resolveFilePath(projectDir, pathSpec) {
  const parsed = parseFilePathSpec(pathSpec);
  if (!parsed) return undefined;
  if (!projectDir || typeof projectDir !== 'string') return undefined;
  const full = path.resolve(projectDir, parsed.file);
  // Contain within projectDir — refuse to resolve paths that escape it.
  if (!full.startsWith(path.resolve(projectDir) + path.sep) && full !== path.resolve(projectDir)) {
    return undefined;
  }
  if (!fs.existsSync(full)) return undefined;
  let text;
  try {
    text = fs.readFileSync(full, 'utf8');
  } catch {
    return undefined;
  }
  const lines = text.split('\n');
  // 1-based inclusive slice
  if (parsed.start > lines.length) return undefined;
  const endClamped = Math.min(parsed.end, lines.length);
  return lines.slice(parsed.start - 1, endClamped).join('\n');
}

// ---------------------------------------------------------------------------
// Trigram similarity (used for near-match within a single resolved field)
// ---------------------------------------------------------------------------

function normalize(s) {
  return String(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

function trigrams(s) {
  const n = normalize(s);
  if (n.length < 3) {
    // Short strings: fall back to full-string equality as a single trigram.
    return new Set([`  ${n}  `]);
  }
  const padded = `  ${n}  `;
  const out = new Set();
  for (let i = 0; i <= padded.length - 3; i++) out.add(padded.slice(i, i + 3));
  return out;
}

function trigramSimilarity(a, b) {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  // Jaccard-ish over larger set (conservative for the "quote within field" case)
  return inter / Math.max(ta.size, tb.size);
}

// ---------------------------------------------------------------------------
// Quote comparison
// ---------------------------------------------------------------------------

const SIMILARITY_THRESHOLD = 0.85;

function compareQuote(quote, resolved) {
  if (typeof resolved !== 'string') {
    return { matched: false, reason: 'resolved target is not a string', similarity: 0 };
  }
  if (typeof quote !== 'string' || !quote.trim()) {
    return { matched: false, reason: 'empty or non-string quote', similarity: 0 };
  }
  const q = quote.trim();
  if (resolved.includes(q)) {
    return { matched: true, reason: 'substring match', similarity: 1.0 };
  }
  const sim = trigramSimilarity(q, resolved);
  if (sim >= SIMILARITY_THRESHOLD) {
    return { matched: true, reason: `near-match (similarity ${sim.toFixed(3)})`, similarity: sim };
  }
  return {
    matched: false,
    reason: `similarity ${sim.toFixed(3)} below threshold ${SIMILARITY_THRESHOLD}`,
    similarity: sim,
  };
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/**
 * Validate a finding's evidence_ref against cycle_context (or files).
 *
 * @param {object} finding - with evidence_ref: { type, path, quote }
 * @param {object} cycleContext - for type='cycle_context' resolution
 * @param {string} projectDir - for type='file' resolution
 * @returns {{
 *   valid: boolean,
 *   reason: string,
 *   similarity?: number,
 *   resolved_path?: string
 * }}
 */
function validateEvidenceRef(finding, cycleContext, projectDir) {
  if (!finding || typeof finding !== 'object') {
    return { valid: false, reason: 'finding is not an object' };
  }
  const ref = finding.evidence_ref;
  if (!ref || typeof ref !== 'object') {
    return { valid: false, reason: 'evidence_ref missing or not an object' };
  }
  if (typeof ref.path !== 'string' || !ref.path) {
    return { valid: false, reason: 'evidence_ref.path missing or not a string' };
  }
  if (typeof ref.quote !== 'string' || !ref.quote) {
    return { valid: false, reason: 'evidence_ref.quote missing or not a string' };
  }

  let resolved;
  if (ref.type === 'cycle_context') {
    resolved = resolveCycleContextPath(cycleContext, ref.path);
  } else if (ref.type === 'file') {
    resolved = resolveFilePath(projectDir, ref.path);
  } else {
    return { valid: false, reason: `unknown evidence_ref.type '${ref.type}' (expected cycle_context or file)` };
  }

  if (resolved === null || resolved === undefined) {
    return {
      valid: false,
      reason: `evidence_ref.path did not resolve: ${ref.path}`,
      resolved_path: ref.path,
    };
  }

  const cmp = compareQuote(ref.quote, resolved);
  return {
    valid: cmp.matched,
    reason: cmp.reason,
    similarity: cmp.similarity,
    resolved_path: ref.path,
  };
}

module.exports = {
  validateEvidenceRef,
  resolveCycleContextPath,
  resolveFilePath,
  tokenizePath,
  parseFilePathSpec,
  trigrams,
  trigramSimilarity,
  compareQuote,
  normalize,
  SIMILARITY_THRESHOLD,
};
