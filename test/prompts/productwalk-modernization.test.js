const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// P1.19 PR 21 on 02d-product-walk.md.
//
// Judge-side observation sub-phase. Raw evidence collector — produces
// the product_walk bundle the three evaluation lenses (QA, Design, PO)
// read. If this phase starts judging or filtering, every lens
// downstream receives contaminated input. Modernization softens three
// stylistic caps + one IMPORTANT prefix while keeping the six Anti-
// Pattern "Never" rules that define the observer role.

const PW_PATH = path.join(__dirname, '..', '..', 'src', 'prompts', 'loop', '02d-product-walk.md');
const PW = fs.readFileSync(PW_PATH, 'utf8');

describe('02d-product-walk.md judge-observer identity', () => {
  test('identity: observation agent, not judge', () => {
    assert.ok(/Product Walk.*observation agent|observation agent/i.test(PW));
    assert.ok(/high-fidelity camera with hands/.test(PW));
    assert.ok(/raw evidence/.test(PW));
  });

  test('names the three downstream lenses (QA / Design / PO)', () => {
    // Launcher dispatches this output to each lens; drift in naming
    // breaks the lens-input contract.
    assert.ok(/three lenses \(QA, Design, PO\)/.test(PW));
  });
});

describe('02d-product-walk.md behavioral contract', () => {
  test('writes product_walk (not evaluation_report — Anti-Pattern enforces)', () => {
    assert.ok(PW.includes('product_walk'));
    // Anti-Pattern guards against the common drift.
    assert.ok(/Never write to `evaluation_report`/.test(PW));
  });

  test('scope classification: full | incremental | no-op', () => {
    // Load-bearing for incremental cycles — calibration on what to
    // skip vs walk fully.
    assert.ok(/\*\*Full build or cycle 1:\*\*/.test(PW));
    assert.ok(/\*\*Incremental\*\*/.test(PW));
    assert.ok(/\*\*No-op:\*\*/.test(PW));
    assert.ok(/diff_scope\.changed_routes/.test(PW));
    assert.ok(/Smoke check on unchanged screens/.test(PW));
  });

  test('six-step observation protocol preserved', () => {
    for (const step of [
      '### Step 1 — Screen Inventory',
      '### Step 2 — Interactive Element Inventory',
      '### Step 3 — Form Testing',
      '### Step 4 — Journey Walks',
      '### Step 5 — Responsive Check',
      '### Step 6 — Anomaly Capture',
    ]) {
      assert.ok(PW.includes(step), `missing step: ${step}`);
    }
  });

  test('responsive breakpoints: 320, 768, 1440 (calibration)', () => {
    // These are the exact breakpoints the Design lens scores against.
    // Drift here changes what responsive-fit means.
    assert.ok(/320/.test(PW));
    assert.ok(/768/.test(PW));
    assert.ok(/1440/.test(PW));
    assert.ok(/breakpoints": \[320, 768, 1440\]/.test(PW));
  });

  test('a11y signals captured (landmarks / heading hierarchy / ARIA)', () => {
    assert.ok(/landmarks.*main, nav, header, footer|main, header/.test(PW));
    assert.ok(/heading hierarchy|h1, h2, h3/.test(PW));
    assert.ok(/ARIA labels/.test(PW));
  });

  test('touch-target threshold: 44x44px (accessibility calibration)', () => {
    assert.ok(/44x44px/.test(PW));
  });

  test('preserves form-testing state matrix (valid / empty / invalid / tab-order)', () => {
    assert.ok(/Valid submission/.test(PW));
    assert.ok(/Empty submission/.test(PW));
    assert.ok(/Invalid submission/.test(PW));
    assert.ok(/Tab order/.test(PW));
  });

  test('product_walk output shape names every field downstream reads', () => {
    for (const field of [
      'timestamp', 'scope', 'screens_walked', 'screens_smoked',
      'screens', 'route', 'screenshot', 'load_time_ms',
      'console_errors', 'console_warnings', 'a11y_tree_summary',
      'lighthouse', 'interactive_elements', 'anomalies',
      'journeys', 'total_clicks', 'friction_points', 'delight_moments',
      'responsive', 'forms',
    ]) {
      assert.ok(PW.includes(field), `missing product_walk field: ${field}`);
    }
  });

  test('commit message template names cycle + counts', () => {
    assert.ok(/eval\(walk\): cycle \$\{CYCLE\} — \$\{SCREENS_WALKED\} screens, \$\{JOURNEY_COUNT\} journeys/.test(PW));
  });

  test('reads cycle_context inputs: deployment_url / active_spec / vision / diff_scope / _cycle_number', () => {
    for (const field of ['deployment_url', 'active_spec', 'vision', 'diff_scope', '_cycle_number']) {
      assert.ok(PW.includes(field), `missing cycle_context input: ${field}`);
    }
  });

  test('preserves factual-not-interpretive recording rule (with example)', () => {
    // Load-bearing calibration: if anomalies get interpreted, the
    // downstream evaluation lenses inherit the interpretation and
    // score against a biased baseline.
    assert.ok(/factually|record factually/i.test(PW));
    assert.ok(/Button text reads 'undefined'|Button text reads "undefined"/.test(PW));
  });

  test('V3 Phase Contract marker present', () => {
    assert.ok(/V3 Phase Contract/.test(PW));
  });
});

describe('02d-product-walk.md Anti-Patterns (observer-boundary catchers)', () => {
  test('preserves six "Never" Anti-Pattern rules verbatim', () => {
    for (const rule of [
      'Never score or verdict anything',
      'Never write to `evaluation_report`',
      'Never skip screenshots',
      'Never judge anomalies',
      'Never infer what you cannot observe',
      'Never modify production code',
    ]) {
      assert.ok(PW.includes(rule), `missing Anti-Pattern rule: ${rule}`);
    }
  });

  test('Anti-Pattern "Never" count asserted == 6 (regression catcher)', () => {
    const hits = PW.match(/- \*\*Never /g) || [];
    assert.equal(hits.length, 6);
  });

  test('"Never judge anomalies" rule paired with factual example', () => {
    assert.ok(/"Button label shows 'undefined'" not "Bug: broken button\."/.test(PW));
  });
});

describe('02d-product-walk.md Opus 4.7 modernization', () => {
  test('no "think step by step" scaffolding', () => {
    assert.ok(!/think step by step/i.test(PW));
  });

  test('no "reason carefully" scaffolding', () => {
    assert.ok(!/reason carefully/i.test(PW));
  });

  test('no "CRITICAL:" / "URGENT:" / "YOU MUST" emphatic prefixes', () => {
    assert.ok(!/\bCRITICAL:/.test(PW));
    assert.ok(!/\bURGENT:/.test(PW));
    assert.ok(!/YOU MUST/.test(PW));
  });

  test('"IMPORTANT" prefix removed from screenshot-cleanliness rule', () => {
    // Was: "**IMPORTANT**: All screenshots ... must be **clean**"
    // Now: positive prose + rationale on-site.
    assert.ok(!/\*\*IMPORTANT\*\*:/.test(PW));
    assert.ok(/All screenshots for evaluation and documentation must be \*\*clean\*\*/.test(PW));
    assert.ok(/annotations bias what the lens sees/.test(PW),
      'rationale tying screenshot-cleanliness to lens-calibration should be on-site');
  });

  test('no "MUST" all-caps emphasis', () => {
    assert.ok(!/\bMUST\b/.test(PW));
  });

  test('stylistic caps softened (ALL screens / ALL steps)', () => {
    assert.ok(!/Full protocol on ALL screens/.test(PW));
    assert.ok(!/Throughout ALL steps above/.test(PW));
  });

  test('"You do NOT judge" reframed to positive voice (Anti-Patterns carry the rule)', () => {
    assert.ok(!/You do NOT judge/.test(PW));
    assert.ok(/leave judgment to the downstream evaluation phase/.test(PW));
    // Canonical emphatic form lives in Anti-Patterns.
    assert.ok(/Never score or verdict anything/.test(PW));
  });

  test('Do-NOT emphasis count == 0 (Anti-Patterns use "Never")', () => {
    const hits = PW.match(/\b[dD]o NOT\b/g) || [];
    assert.equal(hits.length, 0);
  });
});
