const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const { isFileAllowed, isFileBlocked, validateImprovementScope } = require('../../src/launcher/self-improve-safety.js');

// Kept for back-compat of tests written against the pre-GC.1 shape.
// New tests use the REAL config from rouge.config.json to prove the
// judge/instrument boundary holds in the shipping config.
const DEFAULT_CONFIG = {
  allowlist: ['src/prompts/loop/*.md', 'src/prompts/seeding/*.md', 'docs/design/*.md'],
  blocklist: ['src/launcher/*.js', '.claude/settings.json', 'rouge.config.json', 'rouge-safety-check.sh'],
  test_budget_usd: 5,
};

// Real shipping config — the one self-improve actually consults.
const REAL_CONFIG = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'rouge.config.json'), 'utf8')
).self_improvement;

describe('Self-Improvement Safety', () => {
  describe('isFileAllowed', () => {
    test('allows prompt files', () => {
      assert.equal(isFileAllowed('src/prompts/loop/01-building.md', DEFAULT_CONFIG.allowlist), true);
      assert.equal(isFileAllowed('src/prompts/seeding/04-spec.md', DEFAULT_CONFIG.allowlist), true);
    });

    test('allows design docs', () => {
      assert.equal(isFileAllowed('docs/design/state-schema.md', DEFAULT_CONFIG.allowlist), true);
    });

    test('rejects files not on allowlist', () => {
      assert.equal(isFileAllowed('src/launcher/rouge-loop.js', DEFAULT_CONFIG.allowlist), false);
      assert.equal(isFileAllowed('package.json', DEFAULT_CONFIG.allowlist), false);
    });
  });

  describe('isFileBlocked', () => {
    test('blocks launcher files', () => {
      assert.equal(isFileBlocked('src/launcher/rouge-loop.js', DEFAULT_CONFIG.blocklist), true);
      assert.equal(isFileBlocked('src/launcher/safety.js', DEFAULT_CONFIG.blocklist), true);
    });

    test('blocks config files', () => {
      assert.equal(isFileBlocked('.claude/settings.json', DEFAULT_CONFIG.blocklist), true);
      assert.equal(isFileBlocked('rouge.config.json', DEFAULT_CONFIG.blocklist), true);
    });

    test('does not block allowed files', () => {
      assert.equal(isFileBlocked('src/prompts/loop/01-building.md', DEFAULT_CONFIG.blocklist), false);
    });
  });

  describe('validateImprovementScope', () => {
    test('accepts valid file list', () => {
      const result = validateImprovementScope(
        ['src/prompts/loop/01-building.md', 'src/prompts/loop/04-analyzing.md'],
        DEFAULT_CONFIG
      );
      assert.equal(result.valid, true);
      assert.equal(result.rejected.length, 0);
    });

    test('rejects blocked files', () => {
      const result = validateImprovementScope(
        ['src/prompts/loop/01-building.md', 'src/launcher/rouge-loop.js'],
        DEFAULT_CONFIG
      );
      assert.equal(result.valid, false);
      assert.equal(result.rejected.length, 1);
      assert.ok(result.rejected[0].includes('rouge-loop.js'));
    });

    test('rejects files not on allowlist', () => {
      const result = validateImprovementScope(
        ['src/prompts/loop/01-building.md', 'package.json'],
        DEFAULT_CONFIG
      );
      assert.equal(result.valid, false);
      assert.equal(result.rejected.length, 1);
    });
  });

  // ---- GC.1: Judge / instrument boundary in the shipping config ----
  //
  // These tests assert the real rouge.config.json enforces the
  // "pipeline doesn't author the instrument" boundary. They read the
  // actual file so the assertions fail if someone re-widens the
  // allowlist or removes a blocklist entry.

  describe('GC.1 judge/instrument boundary (real config)', () => {
    test('judge sub-phase prompts are blocked', () => {
      const judgeFiles = [
        'src/prompts/loop/02-evaluation-orchestrator.md',
        'src/prompts/loop/02a-test-integrity.md',
        'src/prompts/loop/02c-code-review.md',
        'src/prompts/loop/02d-product-walk.md',
        'src/prompts/loop/02e-evaluation.md',
        'src/prompts/loop/02f-re-walk.md',
        'src/prompts/loop/06-vision-check.md',
        'src/prompts/loop/10-final-review.md',
        'src/prompts/loop/00-foundation-evaluating.md',
        'src/prompts/final/01-final-validation-gate.md',
      ];
      for (const f of judgeFiles) {
        assert.equal(isFileBlocked(f, REAL_CONFIG.blocklist), true, `${f} must be blocked`);
      }
    });

    test('taste seeding discipline is blocked (judgment-nature prompt)', () => {
      assert.equal(isFileBlocked('src/prompts/seeding/03-taste.md', REAL_CONFIG.blocklist), true);
    });

    test('library heuristics and rubrics are blocked', () => {
      const instrumentFiles = [
        'library/global/page-load-time.json',
        'library/global/lighthouse-performance.json',
        'library/domain/web/page-load-time.json',
        'library/rules/typescript/strict-mode.md',
        'library/rubrics/product-quality-v1.md',
        'library/agents/typescript-reviewer.md',
        'library/templates/label-quality.json',
      ];
      for (const f of instrumentFiles) {
        assert.equal(isFileBlocked(f, REAL_CONFIG.blocklist), true, `${f} must be blocked`);
      }
    });

    test('gold-sets are blocked (ground truth for the calibrator)', () => {
      // P1.18 — gold sets are human-labeled ground truth. If self-improve
      // could edit them, the calibrator's Kappa gate becomes gameable:
      // pipeline-authored edits could quietly retune labels to match
      // drifting model output, making "calibration passed" meaningless.
      const goldSetFiles = [
        'library/gold-sets/product-eval/entry-001.json',
        'library/gold-sets/product-eval/README.md',
        'library/gold-sets/some-future-domain/entry.json',
        'schemas/gold-set-entry-v1.json',
      ];
      for (const f of goldSetFiles) {
        assert.equal(isFileBlocked(f, REAL_CONFIG.blocklist), true, `${f} must be blocked`);
      }
    });

    test('library-entry schema is blocked', () => {
      assert.equal(isFileBlocked('schemas/library-entry-v1.json', REAL_CONFIG.blocklist), true);
      assert.equal(isFileBlocked('schemas/library-entry-v2.json', REAL_CONFIG.blocklist), true);
      assert.equal(isFileBlocked('schemas/cycle-context-v3.json', REAL_CONFIG.blocklist), true);
    });

    test('preamble template is blocked (instrument I/O contract)', () => {
      assert.equal(isFileBlocked('src/prompts/loop/_preamble.md', REAL_CONFIG.blocklist), true);
    });

    test('generation prompts are allowed', () => {
      const generationFiles = [
        'src/prompts/loop/00-foundation-building.md',
        'src/prompts/loop/01-building.md',
        'src/prompts/loop/03-qa-fixing.md',
        'src/prompts/loop/04-analyzing.md',
        'src/prompts/loop/05-change-spec-generation.md',
        'src/prompts/loop/07-ship-promote.md',
        'src/prompts/loop/08-document-release.md',
        'src/prompts/loop/09-cycle-retrospective.md',
        'src/prompts/seeding/00-swarm-orchestrator.md',
        'src/prompts/seeding/01-brainstorming.md',
        'src/prompts/seeding/02-competition.md',
        'src/prompts/seeding/04-spec.md',
        'src/prompts/seeding/05-design.md',
        'src/prompts/seeding/06-legal-privacy.md',
        'src/prompts/seeding/07-marketing.md',
        'src/prompts/seeding/08-infrastructure.md',
        'docs/design/foo.md',
      ];
      for (const f of generationFiles) {
        assert.equal(isFileAllowed(f, REAL_CONFIG.allowlist), true, `${f} must be allowed`);
        assert.equal(isFileBlocked(f, REAL_CONFIG.blocklist), false, `${f} must not be blocked`);
      }
    });

    test('validateImprovementScope rejects mixed batch when any judge file included', () => {
      const result = validateImprovementScope(
        [
          'src/prompts/loop/01-building.md',       // allowed — generation
          'src/prompts/loop/02e-evaluation.md',    // blocked — judge
        ],
        REAL_CONFIG
      );
      assert.equal(result.valid, false);
      assert.deepEqual(result.rejected, ['src/prompts/loop/02e-evaluation.md']);
    });

    test('validateImprovementScope rejects library heuristic edits even with allowed partner', () => {
      const result = validateImprovementScope(
        [
          'src/prompts/loop/01-building.md',
          'library/global/lighthouse-performance.json',
        ],
        REAL_CONFIG
      );
      assert.equal(result.valid, false);
      assert.ok(result.rejected.some((r) => r.includes('lighthouse-performance.json')));
    });

    test('validateImprovementScope accepts pure-generation batch', () => {
      const result = validateImprovementScope(
        [
          'src/prompts/loop/01-building.md',
          'src/prompts/loop/04-analyzing.md',
          'src/prompts/seeding/01-brainstorming.md',
          'docs/design/some-improvement.md',
        ],
        REAL_CONFIG
      );
      assert.equal(result.valid, true);
      assert.equal(result.rejected.length, 0);
    });

    test('launcher JS still blocked (pre-GC.1 invariant preserved)', () => {
      const launcherFiles = [
        'src/launcher/rouge-loop.js',
        'src/launcher/variant-tracker.js',
        'src/launcher/amendify.js',
        'src/launcher/post-retrospective-hook.js',
      ];
      for (const f of launcherFiles) {
        assert.equal(isFileBlocked(f, REAL_CONFIG.blocklist), true, `${f} must stay blocked`);
      }
    });
  });
});
