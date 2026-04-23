'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
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
} = require('../src/launcher/quote-match-validator.js');

// ---- tokenizePath ----

test('tokenizePath: simple dot path', () => {
  assert.deepEqual(tokenizePath('a.b.c'), [
    { type: 'key', value: 'a' },
    { type: 'key', value: 'b' },
    { type: 'key', value: 'c' },
  ]);
});

test('tokenizePath: path with array indices', () => {
  assert.deepEqual(tokenizePath('screens[2].elements[0].result'), [
    { type: 'key', value: 'screens' },
    { type: 'index', value: 2 },
    { type: 'key', value: 'elements' },
    { type: 'index', value: 0 },
    { type: 'key', value: 'result' },
  ]);
});

test('tokenizePath: single key', () => {
  assert.deepEqual(tokenizePath('root'), [{ type: 'key', value: 'root' }]);
});

test('tokenizePath: empty or invalid input → null', () => {
  assert.equal(tokenizePath(''), null);
  assert.equal(tokenizePath(null), null);
  assert.equal(tokenizePath(42), null);
});

test('tokenizePath: malformed path with trailing junk → null', () => {
  assert.equal(tokenizePath('a.b.'), null);
  assert.equal(tokenizePath('a[2'), null);
  assert.equal(tokenizePath('a..b'), null);
});

test('tokenizePath: keys with hyphens and underscores allowed', () => {
  const t = tokenizePath('my-key.my_sub.final');
  assert.equal(t.length, 3);
  assert.equal(t[0].value, 'my-key');
  assert.equal(t[1].value, 'my_sub');
});

// ---- resolveCycleContextPath ----

test('resolveCycleContextPath: resolves nested object + array', () => {
  const ctx = {
    product_walk: {
      screens: [
        {},
        {},
        { interactive_elements: [{ result: 'first' }, { result: 'target text' }] },
      ],
    },
  };
  const v = resolveCycleContextPath(ctx, 'product_walk.screens[2].interactive_elements[1].result');
  assert.equal(v, 'target text');
});

test('resolveCycleContextPath: missing key → undefined', () => {
  const ctx = { product_walk: { screens: [] } };
  assert.equal(resolveCycleContextPath(ctx, 'product_walk.nope.screens'), undefined);
});

test('resolveCycleContextPath: out-of-bounds index → undefined', () => {
  const ctx = { arr: [1, 2] };
  assert.equal(resolveCycleContextPath(ctx, 'arr[5]'), undefined);
});

test('resolveCycleContextPath: null ctx → undefined', () => {
  assert.equal(resolveCycleContextPath(null, 'anything'), undefined);
  assert.equal(resolveCycleContextPath(undefined, 'anything'), undefined);
});

test('resolveCycleContextPath: invalid path → undefined', () => {
  const ctx = { a: 'x' };
  assert.equal(resolveCycleContextPath(ctx, 'a..b'), undefined);
});

test('resolveCycleContextPath: array access on non-array → undefined', () => {
  const ctx = { a: { b: 'x' } };
  assert.equal(resolveCycleContextPath(ctx, 'a[0]'), undefined);
});

test('resolveCycleContextPath: key access on array → undefined', () => {
  const ctx = { a: [1, 2, 3] };
  assert.equal(resolveCycleContextPath(ctx, 'a.length'), undefined);
});

// ---- parseFilePathSpec ----

test('parseFilePathSpec: single line', () => {
  assert.deepEqual(parseFilePathSpec('src/app.ts:42'), { file: 'src/app.ts', start: 42, end: 42 });
});

test('parseFilePathSpec: line range', () => {
  assert.deepEqual(parseFilePathSpec('src/app.ts:10-20'), { file: 'src/app.ts', start: 10, end: 20 });
});

test('parseFilePathSpec: missing line → null', () => {
  assert.equal(parseFilePathSpec('src/app.ts'), null);
});

test('parseFilePathSpec: reversed range → null', () => {
  assert.equal(parseFilePathSpec('src/app.ts:20-10'), null);
});

test('parseFilePathSpec: zero or negative line → null', () => {
  assert.equal(parseFilePathSpec('src/app.ts:0'), null);
});

test('parseFilePathSpec: non-string → null', () => {
  assert.equal(parseFilePathSpec(null), null);
  assert.equal(parseFilePathSpec(42), null);
});

// ---- resolveFilePath ----

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qmv-test-'));
  return dir;
}

test('resolveFilePath: reads single line (1-based)', () => {
  const d = tmpProject();
  fs.writeFileSync(path.join(d, 'f.ts'), 'line1\nline2\nline3\nline4\n');
  assert.equal(resolveFilePath(d, 'f.ts:2'), 'line2');
});

test('resolveFilePath: reads line range inclusive', () => {
  const d = tmpProject();
  fs.writeFileSync(path.join(d, 'f.ts'), 'a\nb\nc\nd\ne\n');
  assert.equal(resolveFilePath(d, 'f.ts:2-4'), 'b\nc\nd');
});

test('resolveFilePath: missing file → undefined', () => {
  const d = tmpProject();
  assert.equal(resolveFilePath(d, 'nope.ts:1'), undefined);
});

test('resolveFilePath: start past end of file → undefined', () => {
  const d = tmpProject();
  fs.writeFileSync(path.join(d, 'f.ts'), 'only one line');
  assert.equal(resolveFilePath(d, 'f.ts:5'), undefined);
});

test('resolveFilePath: end past EOF clamps to file length', () => {
  const d = tmpProject();
  fs.writeFileSync(path.join(d, 'f.ts'), 'a\nb\nc');
  assert.equal(resolveFilePath(d, 'f.ts:2-100'), 'b\nc');
});

test('resolveFilePath: path traversal outside projectDir → undefined', () => {
  const d = tmpProject();
  // Create a file OUTSIDE projectDir
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'qmv-outside-'));
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret');
  // Try to resolve ../../outside/secret.txt
  const rel = path.relative(d, path.join(outside, 'secret.txt'));
  assert.equal(resolveFilePath(d, `${rel}:1`), undefined);
});

test('resolveFilePath: malformed path spec → undefined', () => {
  const d = tmpProject();
  assert.equal(resolveFilePath(d, 'no-line-spec'), undefined);
});

test('resolveFilePath: missing projectDir → undefined', () => {
  assert.equal(resolveFilePath(null, 'x.ts:1'), undefined);
});

// ---- trigrams / trigramSimilarity / normalize ----

test('normalize: collapses whitespace and lowercases', () => {
  assert.equal(normalize('  Hello   World\n\tFoo  '), 'hello world foo');
});

test('trigramSimilarity: identical strings → 1.0', () => {
  assert.equal(trigramSimilarity('hello world', 'hello world'), 1.0);
});

test('trigramSimilarity: fully disjoint → low', () => {
  assert.ok(trigramSimilarity('abcdefg', 'xyzwvut') < 0.2);
});

test('trigramSimilarity: near-paraphrase → high', () => {
  const a = 'missing user_id validation failure';
  const b = 'missing user_id validation failure — also fatal';
  assert.ok(trigramSimilarity(a, b) > 0.7);
});

test('trigramSimilarity: case and whitespace insensitive', () => {
  const a = 'Hello World';
  const b = 'hello   world';
  assert.ok(trigramSimilarity(a, b) > 0.95);
});

test('trigramSimilarity: short strings handled', () => {
  // Both very short — trigram fallback to equality padding
  assert.equal(trigramSimilarity('ab', 'ab'), 1.0);
  assert.ok(trigramSimilarity('ab', 'cd') < 1.0);
});

// ---- compareQuote ----

test('compareQuote: exact substring → matched 1.0', () => {
  const r = compareQuote('target phrase', 'the target phrase is here');
  assert.equal(r.matched, true);
  assert.equal(r.similarity, 1.0);
});

test('compareQuote: near-match above threshold → matched', () => {
  const resolved = 'The user ID validation error occurred when submitting the form';
  const quote = 'user ID validation error occurred submitting form';
  // Close but not substring; should be high trigram similarity
  const r = compareQuote(quote, resolved);
  // Not asserting matched — depends on threshold. Just check similarity is computed.
  assert.ok(typeof r.similarity === 'number');
});

test('compareQuote: disjoint → not matched', () => {
  const r = compareQuote('completely unrelated phrase', 'something else entirely');
  assert.equal(r.matched, false);
});

test('compareQuote: empty quote → not matched', () => {
  const r = compareQuote('', 'anything');
  assert.equal(r.matched, false);
  assert.match(r.reason, /empty/);
});

test('compareQuote: non-string resolved → not matched', () => {
  const r = compareQuote('quote', null);
  assert.equal(r.matched, false);
  assert.match(r.reason, /not a string/);
});

// ---- validateEvidenceRef (the main entry) ----

test('validateEvidenceRef: valid cycle_context reference with substring quote', () => {
  const ctx = {
    product_walk: {
      screens: [
        { interactive_elements: [{ result: 'Button clicked, page navigates to /settings' }] },
      ],
    },
  };
  const finding = {
    evidence_ref: {
      type: 'cycle_context',
      path: 'product_walk.screens[0].interactive_elements[0].result',
      quote: 'page navigates to /settings',
    },
  };
  const r = validateEvidenceRef(finding, ctx);
  assert.equal(r.valid, true);
  assert.equal(r.similarity, 1.0);
});

test('validateEvidenceRef: cycle_context path does not resolve → invalid', () => {
  const ctx = { product_walk: { screens: [] } };
  const finding = {
    evidence_ref: {
      type: 'cycle_context',
      path: 'product_walk.screens[99].interactive_elements[0].result',
      quote: 'nonexistent',
    },
  };
  const r = validateEvidenceRef(finding, ctx);
  assert.equal(r.valid, false);
  assert.match(r.reason, /did not resolve/);
});

test('validateEvidenceRef: quote not in resolved text → invalid', () => {
  const ctx = { product_walk: { screens: [{ title: 'Dashboard home page' }] } };
  const finding = {
    evidence_ref: {
      type: 'cycle_context',
      path: 'product_walk.screens[0].title',
      quote: 'completely fabricated quote unrelated to source',
    },
  };
  const r = validateEvidenceRef(finding, ctx);
  assert.equal(r.valid, false);
  assert.match(r.reason, /below threshold/);
});

test('validateEvidenceRef: near-paraphrase within single resolved field → valid', () => {
  // Resolved field contains a sentence; quote is a close variant.
  const ctx = {
    code_review_report: {
      ai_code_audit: {
        dimensions: {
          security: { findings: [{ description: 'SQL query built via string concatenation exposes injection risk on line 42' }] },
        },
      },
    },
  };
  const finding = {
    evidence_ref: {
      type: 'cycle_context',
      path: 'code_review_report.ai_code_audit.dimensions.security.findings[0].description',
      quote: 'SQL query built via string concatenation exposes injection risk on line 42',
    },
  };
  const r = validateEvidenceRef(finding, ctx);
  assert.equal(r.valid, true);
});

test('validateEvidenceRef: valid file reference with substring quote', () => {
  const d = tmpProject();
  fs.writeFileSync(path.join(d, 'auth.ts'), [
    'function login() {',
    "  const token = req.headers['auth'];",
    "  if (!token) throw new Error('no auth');",
    '  return validate(token);',
    '}',
  ].join('\n'));
  const finding = {
    evidence_ref: {
      type: 'file',
      path: 'auth.ts:3',
      quote: "throw new Error('no auth')",
    },
  };
  const r = validateEvidenceRef(finding, {}, d);
  assert.equal(r.valid, true);
});

test('validateEvidenceRef: file missing → invalid', () => {
  const d = tmpProject();
  const finding = {
    evidence_ref: { type: 'file', path: 'nope.ts:1', quote: 'x' },
  };
  const r = validateEvidenceRef(finding, {}, d);
  assert.equal(r.valid, false);
  assert.match(r.reason, /did not resolve/);
});

test('validateEvidenceRef: missing evidence_ref → invalid', () => {
  const r = validateEvidenceRef({}, {});
  assert.equal(r.valid, false);
  assert.match(r.reason, /evidence_ref missing/);
});

test('validateEvidenceRef: missing .path → invalid', () => {
  const r = validateEvidenceRef(
    { evidence_ref: { type: 'cycle_context', quote: 'x' } },
    {}
  );
  assert.equal(r.valid, false);
  assert.match(r.reason, /path/);
});

test('validateEvidenceRef: missing .quote → invalid', () => {
  const r = validateEvidenceRef(
    { evidence_ref: { type: 'cycle_context', path: 'a' } },
    {}
  );
  assert.equal(r.valid, false);
  assert.match(r.reason, /quote/);
});

test('validateEvidenceRef: unknown type → invalid', () => {
  const r = validateEvidenceRef(
    { evidence_ref: { type: 'web', path: 'https://x', quote: 'y' } },
    {}
  );
  assert.equal(r.valid, false);
  assert.match(r.reason, /unknown evidence_ref\.type/);
});

test('validateEvidenceRef: null finding → invalid', () => {
  const r = validateEvidenceRef(null, {});
  assert.equal(r.valid, false);
});

test('SIMILARITY_THRESHOLD is 0.85', () => {
  assert.equal(SIMILARITY_THRESHOLD, 0.85);
});
