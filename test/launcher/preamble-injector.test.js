const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { buildPreamble, injectPreamble, buildProfileContextSection } = require('../../src/launcher/preamble-injector.js');

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

  describe('profile context injection', () => {
    test('omits profile context section when no profile specified', () => {
      const result = injectPreamble({
        projectDir: tmpDir,
        phaseName: 'story-building',
        phaseDescription: 'Build',
        modelName: 'opus',
        requiredOutputKeys: [],
      });
      assert.ok(!result.includes('Active profile:'));
      assert.ok(!result.includes('Profile context'));
    });

    test('injects profile context when profileName param is provided (real profile)', () => {
      const result = injectPreamble({
        projectDir: tmpDir,
        phaseName: 'story-building',
        phaseDescription: 'Build',
        modelName: 'opus',
        requiredOutputKeys: [],
        profileName: 'saas-webapp',
      });
      assert.match(result, /Active profile: `saas-webapp`/);
      assert.match(result, /Rules in scope/);
      assert.match(result, /Skills available/);
      assert.match(result, /Reviewer agents/);
      assert.match(result, /MCPs configured/);
      // catalog entries from the real saas-webapp profile
      assert.match(result, /typescript/);
    });

    test('reads profile from cycle_context.profile when param not supplied', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'cycle_context.json'),
        JSON.stringify({ profile: 'api-service' }),
      );
      const result = injectPreamble({
        projectDir: tmpDir,
        phaseName: 'story-building',
        phaseDescription: 'Build',
        modelName: 'opus',
        requiredOutputKeys: [],
      });
      assert.match(result, /Active profile: `api-service`/);
    });

    test('reads profile from cycle_context.active_spec.profile when top-level missing', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'cycle_context.json'),
        JSON.stringify({ active_spec: { profile: 'cli-tool' } }),
      );
      const result = injectPreamble({
        projectDir: tmpDir,
        phaseName: 'story-building',
        phaseDescription: 'Build',
        modelName: 'opus',
        requiredOutputKeys: [],
      });
      assert.match(result, /Active profile: `cli-tool`/);
    });

    test('explicit profileName wins over cycle_context', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'cycle_context.json'),
        JSON.stringify({ profile: 'cli-tool' }),
      );
      const result = injectPreamble({
        projectDir: tmpDir,
        phaseName: 'story-building',
        phaseDescription: 'Build',
        modelName: 'opus',
        requiredOutputKeys: [],
        profileName: 'saas-webapp',
      });
      assert.match(result, /Active profile: `saas-webapp`/);
      assert.ok(!result.includes('`cli-tool`'));
    });

    test('unknown profile → falls back to "all", no crash, no section', () => {
      // profile-loader returns the "all" fallback with a warning when the
      // profile file isn't found. buildProfileContextSection returns '' for
      // profile.name === 'all', so the preamble has no profile section.
      const result = injectPreamble({
        projectDir: tmpDir,
        phaseName: 'story-building',
        phaseDescription: 'Build',
        modelName: 'opus',
        requiredOutputKeys: [],
        profileName: 'nonexistent-profile-xyz',
      });
      assert.ok(!result.includes('Active profile:'));
    });

    test('buildProfileContextSection returns empty string for "all" profile', () => {
      const out = buildProfileContextSection({ name: 'all' }, { rules: [], skills: [], agents: [], mcps: [] });
      assert.equal(out, '');
    });

    test('buildProfileContextSection handles missing fields gracefully', () => {
      const out = buildProfileContextSection(
        { name: 'minimal' },
        { rules: [], skills: [], agents: [], mcps: [] }
      );
      assert.match(out, /Active profile: `minimal`/);
      assert.ok(!out.includes('Rules in scope'));
      assert.ok(!out.includes('Skills available'));
    });

    test('buildProfileContextSection lists each resolved entry', () => {
      const out = buildProfileContextSection(
        {
          name: 'test',
          description: 'test profile',
          stack_hints: { primary_language: 'typescript', targets_browser: true },
          quality_bar: { coverage_min: 80 },
        },
        {
          rules: ['common', 'typescript'],
          skills: ['tdd-workflow'],
          agents: ['typescript-reviewer'],
          mcps: ['github', 'context7'],
        }
      );
      assert.match(out, /Active profile: `test` — test profile/);
      assert.match(out, /primary_language=typescript/);
      assert.match(out, /coverage_min/);
      assert.match(out, /`common\/`/);
      assert.match(out, /`typescript\/`/);
      assert.match(out, /`tdd-workflow`/);
      assert.match(out, /`typescript-reviewer`/);
      assert.match(out, /`github`/);
      assert.match(out, /`context7`/);
    });

    test('measurable token reduction: saas-webapp profile vs no profile — section is bounded', () => {
      // P0.3 verification gate: profile context shouldn't inflate the
      // preamble with full rule content — it should be a compact listing.
      // Target: profile section adds less than 1500 chars to the preamble.
      const withProfile = injectPreamble({
        projectDir: tmpDir,
        phaseName: 'story-building',
        phaseDescription: 'Build',
        modelName: 'opus',
        requiredOutputKeys: [],
        profileName: 'saas-webapp',
      });
      const withoutProfile = injectPreamble({
        projectDir: tmpDir,
        phaseName: 'story-building',
        phaseDescription: 'Build',
        modelName: 'opus',
        requiredOutputKeys: [],
      });
      const delta = withProfile.length - withoutProfile.length;
      assert.ok(delta > 0, 'profile should add content');
      assert.ok(delta < 1500, `profile context inflated preamble by ${delta} chars — too much`);
    });
  });
});
