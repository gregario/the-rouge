const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { buildPreamble, injectPreamble } = require('../../src/launcher/preamble-injector.js');

describe('Preamble Injector', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-test-'));
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

  describe('buildPreamble', () => {
    test('includes phase name and description', () => {
      const preamble = buildPreamble({
        phaseName: 'story-building',
        phaseDescription: 'Build the current story using TDD',
        modelName: 'opus',
        requiredOutputKeys: ['story_result'],
        learningsContent: '',
      });
      assert.ok(preamble.includes('story-building'));
      assert.ok(preamble.includes('Build the current story using TDD'));
      assert.ok(preamble.includes('opus'));
    });

    test('includes required output keys', () => {
      const preamble = buildPreamble({
        phaseName: 'story-building',
        phaseDescription: 'Build',
        modelName: 'opus',
        requiredOutputKeys: ['story_result', 'factory_decisions'],
        learningsContent: '',
      });
      assert.ok(preamble.includes('story_result'));
      assert.ok(preamble.includes('factory_decisions'));
    });

    test('includes learnings when provided', () => {
      const preamble = buildPreamble({
        phaseName: 'story-building',
        phaseDescription: 'Build',
        modelName: 'opus',
        requiredOutputKeys: [],
        learningsContent: '## Infrastructure\n- Do NOT use Prisma ORM',
      });
      assert.ok(preamble.includes('Do NOT use Prisma ORM'));
    });

    test('omits learnings section when empty', () => {
      const preamble = buildPreamble({
        phaseName: 'story-building',
        phaseDescription: 'Build',
        modelName: 'opus',
        requiredOutputKeys: [],
        learningsContent: '',
      });
      assert.ok(!preamble.includes('Project learnings'));
    });

    test('includes read/write permissions', () => {
      const preamble = buildPreamble({
        phaseName: 'story-building',
        phaseDescription: 'Build',
        modelName: 'opus',
        requiredOutputKeys: [],
        learningsContent: '',
      });
      assert.ok(preamble.includes('task_ledger.json'));
      assert.ok(preamble.includes('cycle_context.json'));
      assert.ok(preamble.includes('NEVER write'));
      assert.ok(preamble.includes('checkpoints.jsonl'));
    });

    test('includes pre-compaction instruction', () => {
      const preamble = buildPreamble({
        phaseName: 'story-building',
        phaseDescription: 'Build',
        modelName: 'opus',
        requiredOutputKeys: [],
        learningsContent: '',
      });
      assert.ok(preamble.includes('pre_compaction_flush'));
    });

    test('marks generating-change-spec as allowed to write task_ledger', () => {
      const preamble = buildPreamble({
        phaseName: 'generating-change-spec',
        phaseDescription: 'Generate fix stories',
        modelName: 'opus',
        requiredOutputKeys: [],
        learningsContent: '',
      });
      assert.ok(preamble.includes('task_ledger.json (WRITE ALLOWED'));
    });
  });

  describe('injectPreamble', () => {
    test('reads learnings.md from project dir when it exists', () => {
      const projectDir = tmpDir;
      fs.writeFileSync(path.join(projectDir, 'learnings.md'), '## Build\n- Always use supabase-js');

      const result = injectPreamble({
        projectDir,
        phaseName: 'story-building',
        phaseDescription: 'Build',
        modelName: 'opus',
        requiredOutputKeys: ['story_result'],
      });
      assert.ok(result.includes('Always use supabase-js'));
    });

    test('works without learnings.md', () => {
      const result = injectPreamble({
        projectDir: tmpDir,
        phaseName: 'story-building',
        phaseDescription: 'Build',
        modelName: 'opus',
        requiredOutputKeys: ['story_result'],
      });
      assert.ok(result.includes('story-building'));
      assert.ok(!result.includes('Project learnings'));
    });
  });

  describe('human guidance + resolution injection', () => {
    test('omits both sections when cycle_context is missing', () => {
      const result = injectPreamble({
        projectDir: tmpDir,
        phaseName: 'story-building',
        phaseDescription: 'Build',
        modelName: 'opus',
        requiredOutputKeys: [],
      });
      assert.ok(!result.includes('Human guidance for this phase'));
      assert.ok(!result.includes('Human resolved this off-line'));
    });

    test('injects human_guidance block when cycle_context has the field', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'cycle_context.json'),
        JSON.stringify({
          human_guidance: 'Use the existing Stripe client, not a new one. Look at lib/stripe.ts.',
        }),
      );
      const result = injectPreamble({
        projectDir: tmpDir,
        phaseName: 'story-building',
        phaseDescription: 'Build',
        modelName: 'opus',
        requiredOutputKeys: [],
      });
      assert.match(result, /Human guidance for this phase/);
      assert.match(result, /Use the existing Stripe client/);
      assert.match(result, /higher-priority than your own judgement/);
    });

    test('injects human_resolution block with commits + files', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'cycle_context.json'),
        JSON.stringify({
          human_resolution: {
            note: 'Regex was greedy; made it lazy.',
            commits: [
              { sha: 'abc1234', subject: 'fix(auth): lazy quantifier in token regex', files_changed: ['lib/auth.ts'] },
            ],
            files_changed: ['lib/auth.ts'],
          },
        }),
      );
      const result = injectPreamble({
        projectDir: tmpDir,
        phaseName: 'story-building',
        phaseDescription: 'Build',
        modelName: 'opus',
        requiredOutputKeys: [],
      });
      assert.match(result, /Human resolved this off-line/);
      assert.match(result, /Regex was greedy/);
      assert.match(result, /abc1234/);
      assert.match(result, /lib\/auth\.ts/);
    });

    test('swallows malformed cycle_context without throwing', () => {
      fs.writeFileSync(path.join(tmpDir, 'cycle_context.json'), 'not json {{{');
      assert.doesNotThrow(() =>
        injectPreamble({
          projectDir: tmpDir,
          phaseName: 'story-building',
          phaseDescription: 'Build',
          modelName: 'opus',
          requiredOutputKeys: [],
        }),
      );
    });
  });
});
