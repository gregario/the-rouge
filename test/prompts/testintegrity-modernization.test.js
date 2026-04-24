const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// P1.19 PR 22 on 02a-test-integrity.md.
//
// Judge-side pre-gate for QA. Verifies test suite is a faithful mirror
// of the spec. Every calibration surface is load-bearing:
//   - 100% coverage verdict rule (hard floor)
//   - four test categories (coverage-gap / orphaned / stale / healthy)
//   - rename-detection fuzzy match threshold (>80% text similarity)
//   - two-pass remediation limit
//   - annotation format variants
//   - five Anti-Pattern "Never" rules
// Modernization is minimal: one "NOT optional" hedge softened to
// positive framing + hard-floor rationale on-site.

const TI_PATH = path.join(__dirname, '..', '..', 'src', 'prompts', 'loop', '02a-test-integrity.md');
const TI = fs.readFileSync(TI_PATH, 'utf8');

describe('02a-test-integrity.md identity + integrity voice', () => {
  test('preserves "Staleness is decay. Orphans are lies." voice', () => {
    // Character-defining integrity voice; rubric-ifying this to a bland
    // checklist would lose the discipline's spine.
    assert.ok(/Staleness is decay\. Orphans are lies\./.test(TI));
    assert.ok(/You enforce truth between what the product promises and what the tests verify/.test(TI));
  });

  test('no-test-without-spec / no-spec-without-test rule', () => {
    assert.ok(/No test can exist without a spec criterion/.test(TI));
    assert.ok(/No spec criterion can exist without a test/.test(TI));
  });
});

describe('02a-test-integrity.md four-category traceability (calibration instrument)', () => {
  test('all four categories named with exact headings', () => {
    assert.ok(/#### 3a: Coverage Gaps/.test(TI));
    assert.ok(/#### 3b: Orphaned Tests/.test(TI));
    assert.ok(/#### 3c: Stale Tests/.test(TI));
    assert.ok(/#### 3d: Healthy Tests/.test(TI));
  });

  test('category definitions preserve detection algorithms', () => {
    // Coverage gap — criterion with no matching test.
    assert.ok(/if no test has criterion\.criterion_id in its criterion_ids:\s*\n\s*→ COVERAGE GAP/.test(TI));
    // Orphan — test with criterion_id NOT in spec.
    assert.ok(/if criterion_id NOT in spec_criteria:\s*\n\s*→ ORPHANED TEST/.test(TI));
    // Stale — hash changed.
    assert.ok(/if test\.last_criterion_hash != criterion\.text_hash:\s*\n\s*→ STALE TEST/.test(TI));
  });

  test('category rationales preserve "why it matters" (calibration anchors)', () => {
    // These are what a rubric-ification pass would strip; they're the
    // meaning behind each category.
    assert.ok(/the product can violate its own spec without anyone noticing/.test(TI));
    assert.ok(/Orphaned tests are lies/.test(TI));
    assert.ok(/They pass silently, giving false confidence/.test(TI));
    assert.ok(/Stale tests test an outdated version of the criterion/.test(TI));
  });
});

describe('02a-test-integrity.md remediation contract', () => {
  test('three remediation paths: generate / regenerate / remove', () => {
    assert.ok(/#### 4a: Generate Tests for Coverage Gaps/.test(TI));
    assert.ok(/#### 4b: Regenerate Stale Tests/.test(TI));
    assert.ok(/#### 4c: Remove Orphaned Tests/.test(TI));
  });

  test('canonical @criterion annotation format + three accepted variants', () => {
    assert.ok(/\/\/ @criterion: auth-login-001/.test(TI),
      'canonical annotation form');
    // Multi-criterion annotation.
    assert.ok(/@criterion: auth-login-001, auth-login-002/.test(TI));
    // PO check annotation.
    assert.ok(/@po-check: auth-ux-001/.test(TI));
    // JSDoc form.
    assert.ok(/\/\*\* @criterion auth-login-001 \*\//.test(TI));
  });

  test('rename-detection fuzzy-match threshold preserved (>80% text similarity)', () => {
    // If this threshold drifts lower, real removals get treated as
    // renames → stale tests accumulate. If it drifts higher, real
    // renames trigger deletes → test suite loses coverage.
    assert.ok(/>80% text similarity/.test(TI));
    assert.ok(/renamed, not removed/.test(TI));
  });

  test('rename-then-delete ordering rule preserved emphatic (data-loss guard)', () => {
    // Load-bearing: checking rename BEFORE delete prevents losing
    // valid tests that were simply re-IDed.
    assert.ok(/If renamed: update the `@criterion` annotation to the new ID, update hash\. Do NOT delete\./.test(TI),
      'Do-NOT-delete emphasis on rename-detected tests stays emphatic — data-loss guard');
  });

  test('two-pass remediation limit preserved', () => {
    assert.ok(/attempt one more remediation pass/.test(TI));
    assert.ok(/If after 2 passes coverage is still not 100%, mark as FAIL/.test(TI));
  });

  test('test-generation guidelines preserved (one-file-per-FA, independently-runnable, descriptive-names)', () => {
    assert.ok(/One test file per feature area/.test(TI));
    assert.ok(/independently runnable/.test(TI));
    assert.ok(/\[auth-login-001\] should validate email format/.test(TI),
      'descriptive-name pattern with criterion ID in brackets');
    assert.ok(/@criterion-hash: a1b2c3d4e5f6/.test(TI),
      'hash-metadata comment format');
  });
});

describe('02a-test-integrity.md behavioral contract', () => {
  test('writes test_integrity_report with every field downstream reads', () => {
    for (const field of [
      'spec_coverage_pct', 'po_check_coverage_pct',
      'total_criteria', 'total_po_checks', 'total_tests',
      'orphaned_count', 'orphaned_removed', 'orphaned_renamed',
      'stale_regenerated_count', 'newly_generated_count',
      'test_suite_pass', 'verdict',
    ]) {
      assert.ok(TI.includes(field), `missing report field: ${field}`);
    }
  });

  test('verdict rule: PASS requires all three 100%-equivalents', () => {
    // Hard-floor calibration: spec coverage AND po coverage AND test
    // suite pass. Any dropping to AND-OR loosens the gate.
    assert.ok(/`PASS`:\s*spec_coverage_pct == 100 AND po_check_coverage_pct == 100 AND test_suite_pass == true/.test(TI));
    assert.ok(/`FAIL`:\s*anything else/.test(TI));
  });

  test('SpecCriterion interface preserved (five fields)', () => {
    for (const field of ['criterion_id', 'text', 'text_hash', 'source', 'feature_area']) {
      assert.ok(TI.includes(field), `missing SpecCriterion field: ${field}`);
    }
    // text_hash is SHA-256 first 12 chars — calibration detail.
    assert.ok(/SHA-256 of the criterion text \(first 12 chars\)/.test(TI));
  });

  test('TestEntry interface preserved (four fields)', () => {
    for (const field of ['file', 'criterion_ids', 'test_name', 'last_criterion_hash']) {
      assert.ok(TI.includes(field), `missing TestEntry field: ${field}`);
    }
  });

  test('test-file glob matches both TS and JS with spec/test variants', () => {
    // If the globs drift, integrity-check misses files.
    assert.ok(/\*\*\/\*\.test\.ts/.test(TI));
    assert.ok(/\*\*\/\*\.test\.tsx/.test(TI));
    assert.ok(/\*\*\/\*\.spec\.ts/.test(TI));
    assert.ok(/\*\*\/\*\.spec\.tsx/.test(TI));
    assert.ok(/\*\*\/\*\.test\.js/.test(TI));
    assert.ok(/\*\*\/\*\.spec\.js/.test(TI));
  });

  test('reads cycle_context inputs: active_spec / _cycle_number / retry_counts', () => {
    assert.ok(/active_spec/.test(TI));
    assert.ok(/_cycle_number/.test(TI));
    assert.ok(/retry_counts/.test(TI));
  });

  test('commit-message template names summary counts', () => {
    assert.ok(/test\(integrity\): cycle <N> — <summary of changes>/.test(TI));
    assert.ok(/Generated: <N> new tests/.test(TI));
    assert.ok(/Regenerated: <N> stale tests/.test(TI));
    assert.ok(/Removed: <N> orphaned tests/.test(TI));
  });

  test('V3 Phase Contract marker present', () => {
    assert.ok(/V3 Phase Contract/.test(TI));
  });
});

describe('02a-test-integrity.md Anti-Patterns (calibration-drift catchers)', () => {
  test('preserves five "Never" Anti-Pattern rules verbatim', () => {
    for (const rule of [
      'Never skip orphan removal',
      'Never generate tests without the `@criterion` annotation',
      'Never generate trivial/tautological tests',
      'Never modify production code in this phase',
      'Never claim 100% coverage if any criterion lacks a test',
    ]) {
      assert.ok(TI.includes(rule), `missing Anti-Pattern rule: ${rule}`);
    }
  });

  test('Anti-Pattern "Never" count asserted == 5 (regression catcher)', () => {
    const hits = TI.match(/- \*\*Never /g) || [];
    assert.equal(hits.length, 5);
  });

  test('"expect(true).toBe(true) is not a test" example preserved', () => {
    // Concrete anti-tautology example. Calibration: without this, the
    // no-tautology rule is abstract.
    assert.ok(/`expect\(true\)\.toBe\(true\)` is not a test/.test(TI));
  });

  test('"Round nothing" exact-number rule preserved', () => {
    // Calibration hardening: 99.9% ≠ 100%. Prevents rounding drift.
    assert.ok(/The numbers must be exact\. Round nothing\./.test(TI));
  });
});

describe('02a-test-integrity.md Opus 4.7 modernization', () => {
  test('no "think step by step" scaffolding', () => {
    assert.ok(!/think step by step/i.test(TI));
  });

  test('no "reason carefully" scaffolding', () => {
    assert.ok(!/reason carefully/i.test(TI));
  });

  test('no "CRITICAL:" / "IMPORTANT:" / "URGENT:" / "YOU MUST" emphatic prefixes', () => {
    assert.ok(!/\bCRITICAL:/.test(TI));
    assert.ok(!/\bIMPORTANT:/.test(TI));
    assert.ok(!/\bURGENT:/.test(TI));
    assert.ok(!/YOU MUST/.test(TI));
  });

  test('"This is NOT optional" softened to positive framing + on-site rationale', () => {
    assert.ok(!/This is NOT optional/.test(TI));
    assert.ok(/Test integrity reaches 100% before QA proceeds; partial coverage is not accepted/.test(TI));
    assert.ok(/the verdict rule below enforces this as a hard floor/.test(TI));
  });

  test('no "MUST" all-caps / non-negotiable emphasis', () => {
    assert.ok(!/\bMUST\b/.test(TI));
    assert.ok(!/non-negotiable/.test(TI));
  });

  test('preserved-by-design "Do NOT" count is exactly 1 (rename-vs-delete data-loss guard)', () => {
    const hits = TI.match(/\b[dD]o NOT\b/g) || [];
    assert.equal(hits.length, 1);
    assert.ok(/Do NOT delete/.test(TI));
  });

  test('pseudocode "NOT" (code-semantic) preserved inside detection algorithms', () => {
    // The "NOT in spec" inside pseudocode snippets is code syntax for
    // set-membership. Not a modernization target.
    assert.ok(/if criterion_id NOT in spec_criteria/.test(TI));
    assert.ok(/criteria NOT in spec/.test(TI));
  });
});
