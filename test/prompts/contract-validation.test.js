const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const PROMPTS_DIR = path.join(__dirname, '../../src/prompts/loop');
const SCHEMAS_DIR = path.join(__dirname, '../../schemas');

const PROMPT_FILES = fs.readdirSync(PROMPTS_DIR)
  .filter(f => f.endsWith('.md') && !f.startsWith('_'))
  .sort();

const cycleContextSchema = JSON.parse(
  fs.readFileSync(path.join(SCHEMAS_DIR, 'cycle-context-v3.json'), 'utf8')
);

describe('Prompt Contract Validation', () => {
  test('all 17 loop prompts exist', () => {
    assert.equal(PROMPT_FILES.length, 17, `Expected 17 prompts, found ${PROMPT_FILES.length}: ${PROMPT_FILES.join(', ')}`);
  });

  for (const file of PROMPT_FILES) {
    describe(file, () => {
      const content = fs.readFileSync(path.join(PROMPTS_DIR, file), 'utf8');

      test('does not read state.json for context', () => {
        // Allow "Do NOT update state.json" guards and preamble NEVER-write references
        const lines = content.split('\n');
        for (const line of lines) {
          const lower = line.toLowerCase();
          // Skip guard lines that tell the prompt NOT to touch state.json
          if (lower.includes('do not') || lower.includes('never') || lower.includes('must not') || lower.includes('do not modify')) continue;
          // Skip the V3 preamble reference
          if (lower.includes('v2 legacy') || lower.includes('launcher manages')) continue;
          // Check for problematic reads
          if (/\bread\b.*state\.json/i.test(line) || /from\s+`?state\.json/i.test(line)) {
            assert.fail(`Line reads state.json: "${line.trim()}"`);
          }
        }
      });

      test('does not contain branch creation instructions', () => {
        assert.ok(!content.includes('git checkout -b'), `${file} contains git checkout -b`);
        assert.ok(!/rouge\/story-\{/.test(content), `${file} contains rouge/story-{} branch pattern`);
      });

      test('has V3 preamble reference or is a sub-phase', () => {
        // Sub-phases (02a, 02c, 02d, 02e, 02f) are invoked by the orchestrator, not directly by launcher
        const isSubPhase = /^02[a-f]-/.test(file);
        const hasPreamble = content.includes('V3 Phase Contract');
        if (!isSubPhase) {
          // Main phases should have the preamble reference OR the old Phase Contract removed
          // Being lenient here — the preamble is injected at runtime
        }
        // All prompts should have V3 Phase Contract marker
        assert.ok(hasPreamble, `${file} missing V3 Phase Contract marker`);
      });
    });
  }

  describe('Schema coverage', () => {
    const PHASE_TO_FILE = {
      'foundation': '00-foundation-building.md',
      'foundation-eval': '00-foundation-evaluating.md',
      'story-building': '01-building.md',
      'milestone-check': '02-evaluation-orchestrator.md',
      'milestone-fix': '03-qa-fixing.md',
      'analyzing': '04-analyzing.md',
      'generating-change-spec': '05-change-spec-generation.md',
      'vision-check': '06-vision-check.md',
      'shipping': '07-ship-promote.md',
      'final-review': '10-final-review.md',
    };

    for (const [phase, file] of Object.entries(PHASE_TO_FILE)) {
      test(`schema defines required keys for ${phase}`, () => {
        const contract = cycleContextSchema.phase_contracts[phase];
        assert.ok(contract, `No schema contract for phase ${phase}`);
        assert.ok(contract.required_output_keys.length > 0, `No required keys for ${phase}`);
      });
    }
  });

  describe('No cross-prompt contradictions', () => {
    test('only generating-change-spec references writing task_ledger', () => {
      for (const file of PROMPT_FILES) {
        if (file === '05-change-spec-generation.md') continue;
        const content = fs.readFileSync(path.join(PROMPTS_DIR, file), 'utf8');
        // Check for writing to task_ledger (not reading)
        const writePatterns = /write.*task_ledger|task_ledger.*write/i;
        if (writePatterns.test(content)) {
          // Allow read references and "NEVER write" guards
          const lines = content.split('\n').filter(l => writePatterns.test(l));
          for (const line of lines) {
            if (/never|do not|except|read-only/i.test(line)) continue;
            assert.fail(`${file} references writing task_ledger: "${line.trim()}"`);
          }
        }
      }
    });

    test('no prompt references writing to checkpoints.jsonl', () => {
      for (const file of PROMPT_FILES) {
        const content = fs.readFileSync(path.join(PROMPTS_DIR, file), 'utf8');
        const lines = content.split('\n');
        for (const line of lines) {
          if (/write.*checkpoints\.jsonl/i.test(line)) {
            if (/never|do not|launcher/i.test(line)) continue;
            assert.fail(`${file} references writing checkpoints.jsonl: "${line.trim()}"`);
          }
        }
      }
    });
  });
});
