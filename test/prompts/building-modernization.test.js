const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('path');

const BUILD_PATH = path.join(__dirname, '..', '..', 'src', 'prompts', 'loop', '01-building.md');
const BUILD = fs.readFileSync(BUILD_PATH, 'utf8');

describe('01-building.md behavioral contract', () => {
  test('writes story_result (the field the launcher advances state on)', () => {
    assert.ok(BUILD.includes('story_result'), 'missing story_result — the launcher reads this');
  });

  test('story_result carries every field the launcher reads', () => {
    for (const field of ['outcome', 'files_changed', 'tests_added', 'tests_passing', 'env_limitations', 'classification', 'blocked_by', 'escalation']) {
      assert.ok(BUILD.includes(field), `missing story_result field: ${field}`);
    }
  });

  test('outcome enum is pass | fail | blocked', () => {
    assert.ok(BUILD.includes('pass'));
    assert.ok(BUILD.includes('fail'));
    assert.ok(BUILD.includes('blocked'));
  });

  test('writes the full output bundle expected by the orchestrator', () => {
    for (const field of ['deployment_url', 'implemented', 'skipped', 'divergences', 'factory_decisions', 'factory_questions']) {
      assert.ok(BUILD.includes(field), `missing required output field: ${field}`);
    }
  });

  test('preserves TDD instruction', () => {
    assert.ok(/TDD|test.*first|failing test/i.test(BUILD));
  });

  test('preserves isolation rules', () => {
    assert.ok(/NEVER.*outside this project directory/i.test(BUILD));
    assert.ok(/NEVER.*adopt existing/i.test(BUILD));
    assert.ok(/NEVER.*force/i.test(BUILD));
  });

  test('preserves deploy-staging intent path', () => {
    assert.ok(BUILD.includes('pending-action.json'));
    assert.ok(BUILD.includes('deploy-staging'));
  });

  test('preserves self-diagnosis classifications', () => {
    for (const cls of ['implementation-bug', 'design-problem', 'infrastructure-gap', 'environment-limitation']) {
      assert.ok(BUILD.includes(cls), `missing classification: ${cls}`);
    }
  });

  test('preserves factory_decisions append-only semantics', () => {
    assert.ok(/append|APPEND|never overwrite/i.test(BUILD));
  });

  test('references cycle_context.json as output target', () => {
    assert.ok(BUILD.includes('cycle_context.json'));
  });

  test('includes git commit format guidance', () => {
    assert.ok(BUILD.includes('feat'));
    assert.ok(BUILD.includes('fix'));
    assert.ok(BUILD.includes('refactor'));
  });

  test('mentions foundation story mode', () => {
    assert.ok(/foundation.*story|FOUNDATION STORY/i.test(BUILD));
    assert.ok(BUILD.includes('infrastructure_manifest.json'));
  });
});

describe('01-building.md lean prompt properties', () => {
  test('is under 150 lines (cost optimization: was 773)', () => {
    const lineCount = BUILD.split('\n').length;
    assert.ok(lineCount < 150, `Prompt is ${lineCount} lines — should be under 150 for cost efficiency`);
  });

  test('does not contain process scaffolding (removed for efficiency)', () => {
    assert.ok(!/## Step 1:/.test(BUILD), 'numbered steps removed');
    assert.ok(!/## Step 2:/.test(BUILD), 'numbered steps removed');
    assert.ok(!/Latent Space Activation/.test(BUILD), 'latent space removed');
    assert.ok(!/Subagent-Driven Development/.test(BUILD), 'subagent section removed');
    assert.ok(!/Search Before Building/.test(BUILD), 'search-before-building removed');
    assert.ok(!/Detect Complexity Profile/.test(BUILD), 'complexity detection removed');
  });

  test('no emphatic scaffolding aimed at weaker models', () => {
    assert.ok(!/think step by step/i.test(BUILD));
    assert.ok(!/reason carefully/i.test(BUILD));
    assert.ok(!/IMPORTANT:/i.test(BUILD));
    assert.ok(!/YOU MUST/i.test(BUILD));
  });
});
