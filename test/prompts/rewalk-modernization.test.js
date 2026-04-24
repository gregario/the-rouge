const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// P1.19 PR 17 on 02f-re-walk.md.
//
// First judge-side prompt in the modernization sweep. Judge prompts sit
// on the measurement instrument (GC.1 blocklists them for self-improve
// specifically because "a self-improving system that can edit its own
// measurement instrument will, over time, soften the instrument through
// sequences of individually-defensible edits"). So the modernization
// here is deliberately MINIMAL: light stylistic softening of a single
// duplicated emphasis, with comprehensive test coverage locking in
// every judge-observer boundary + behavioral contract field so future
// edits cannot silently drift the calibration surface.

const RW_PATH = path.join(__dirname, '..', '..', 'src', 'prompts', 'loop', '02f-re-walk.md');
const RW = fs.readFileSync(RW_PATH, 'utf8');

describe('02f-re-walk.md judge-observer boundary (GC.1 calibration surface)', () => {
  test('identity: re-walk is an observer, not a judge', () => {
    assert.ok(/Re-walk agent.*targeted follow-up observer/is.test(RW));
    assert.ok(/observe and record/.test(RW));
  });

  test('Anti-Patterns list preserves all five "Never" rules verbatim', () => {
    // This is the judge-observer boundary. Softening any of these lets
    // the re-walk phase drift into judging, which corrupts the
    // evaluation pipeline. Preserved by design — judge surfaces stay
    // emphatic per the P1.19 PR 7 safety-block-preservation precedent.
    for (const rule of [
      'Never judge, score, or verdict',
      'Never re-walk things not in the request list',
      'Never skip screenshots',
      'Never modify production code',
      'Never infer what you cannot observe',
    ]) {
      assert.ok(RW.includes(rule), `missing Anti-Pattern rule: ${rule}`);
    }
  });

  test('Anti-Patterns rationale preserves the "camera filling gaps" identity', () => {
    assert.ok(/camera filling gaps/.test(RW));
    assert.ok(/evaluation phase interprets/.test(RW));
  });
});

describe('02f-re-walk.md behavioral contract', () => {
  test('reads re_walk_requests array with exact field names {screen, need, lens}', () => {
    assert.ok(/evaluation_report\.re_walk_requests/.test(RW));
    assert.ok(/\{\s*screen,\s*need,\s*lens\s*\}/.test(RW),
      'the request shape must be named explicitly so the evaluation phase can produce the right requests');
  });

  test('reads product_walk + deployment_url + _cycle_number from cycle_context', () => {
    assert.ok(/product_walk/.test(RW));
    assert.ok(/deployment_url/.test(RW));
    assert.ok(/_cycle_number/.test(RW));
  });

  test('empty / missing re_walk_requests → no-op commit exit', () => {
    assert.ok(/re_walk_requests.*empty or missing/.test(RW));
    assert.ok(/No re-walk requests\. Exiting/.test(RW));
    assert.ok(/commit a no-op/.test(RW));
  });

  test('screenshot directory convention: screenshots/cycle-${CYCLE}/re-walk', () => {
    assert.ok(/screenshots\/cycle-\$\{CYCLE\}\/re-walk/.test(RW));
  });

  test('uses $B goto + $B screenshot browser tools', () => {
    assert.ok(/\$B goto/.test(RW));
    assert.ok(/\$B screenshot/.test(RW));
  });

  test('writes product_walk.re_walk_results[] with exact field shape', () => {
    assert.ok(/product_walk\.re_walk_results/.test(RW));
    // Fields the evaluation phase consumes:
    for (const field of ['"screen":', '"need":', '"lens":', '"observation":', '"screenshots":']) {
      assert.ok(RW.includes(field), `missing re_walk_results field: ${field}`);
    }
  });

  test('updates existing product_walk.screens[] rather than replacing', () => {
    assert.ok(/Update existing `product_walk\.screens\[\]`/.test(RW),
      'must append to existing screen entry, not overwrite');
    assert.ok(/Find the matching screen entry by route/.test(RW));
  });

  test('commit message template names cycle number + observation count', () => {
    assert.ok(/eval\(re-walk\): cycle \$\{CYCLE\} — \$\{COUNT\} targeted observations/.test(RW));
  });

  test('two-step observation protocol (Plan → Execute)', () => {
    assert.ok(/### Step 1 — Plan/.test(RW));
    assert.ok(/### Step 2 — Execute/.test(RW));
    assert.ok(/Group by screen to minimize navigation/.test(RW));
  });

  test('captures exactly what was requested — no more, no less (scope rule)', () => {
    assert.ok(/Capture exactly what was requested — no more, no less/.test(RW),
      'request-scope rule prevents observation drift');
  });

  test('V3 Phase Contract marker present (preamble injection point)', () => {
    assert.ok(/V3 Phase Contract/.test(RW));
  });
});

describe('02f-re-walk.md Opus 4.7 modernization (judge-side: minimal softening)', () => {
  test('no "think step by step" scaffolding', () => {
    assert.ok(!/think step by step/i.test(RW));
  });

  test('no "reason carefully" scaffolding', () => {
    assert.ok(!/reason carefully/i.test(RW));
  });

  test('no "CRITICAL:" / "IMPORTANT:" / "URGENT:" / "YOU MUST" emphatic prefixes', () => {
    assert.ok(!/\bCRITICAL:/.test(RW));
    assert.ok(!/\bIMPORTANT:/.test(RW));
    assert.ok(!/\bURGENT:/.test(RW));
    assert.ok(!/YOU MUST/.test(RW));
  });

  test('no "do NOT" / "Do NOT" emphasis in Phase Identity (duplicated by Anti-Patterns)', () => {
    // The Phase Identity opener used to say "you do NOT judge, score,
    // or verdict" — duplicating the Anti-Patterns "Never judge, score,
    // or verdict." Softened to reframe positively while keeping the
    // emphatic rule in Anti-Patterns where it belongs.
    assert.ok(!/you do NOT judge, score, or verdict/.test(RW));
    assert.ok(/Judgment, scoring, and verdicts belong to the evaluation phase/.test(RW));
    // The Anti-Patterns rule is the authoritative home for the boundary.
    assert.ok(/Never judge, score, or verdict/.test(RW));
  });

  test('no "Do NOT" emphasis anywhere in the prompt (Anti-Patterns uses "Never" instead)', () => {
    const hits = RW.match(/\b[dD]o NOT\b/g) || [];
    assert.equal(hits.length, 0,
      'Do NOT emphasis removed; Anti-Patterns list uses Never for the same rules');
  });

  test('"Never" emphasis count in Anti-Patterns stays exactly 5 (regression catcher)', () => {
    // If a future edit adds or drops an Anti-Pattern rule, this test
    // fires. Judge-boundary drift is the specific failure mode we're
    // guarding against.
    const hits = RW.match(/\*\*Never /g) || [];
    assert.equal(hits.length, 5,
      'exactly 5 "Never X" Anti-Pattern rules expected');
  });
});
