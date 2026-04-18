const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  assembleStoryContext,
  assembleMilestoneContext,
  assembleFixStoryContext,
} = require('../../src/launcher/context-assembly.js');

describe('context-assembly', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-assembly-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeCtx(data) {
    fs.writeFileSync(path.join(dir, 'cycle_context.json'), JSON.stringify(data));
  }

  test('assembleStoryContext throws when story ID not found in state', () => {
    writeCtx({ vision: { product_name: 'test', one_liner: 'x' } });
    const state = {
      current_milestone: 'ms-1',
      current_story: 'missing-story',
      milestones: [{ name: 'ms-1', stories: [{ id: 's1', name: 'a' }] }],
    };
    assert.throws(() => assembleStoryContext(dir, state, null), /missing-story/);
  });

  test('assembleStoryContext produces a story_context.json with the expected shape', () => {
    writeCtx({
      vision: {
        product_name: 'test',
        one_liner: 'one liner',
        target_audience: { primary: 'dev' },
        deploy_model: 'vercel',
      },
      product_standard: { tone: 'neutral' },
      library_heuristics: ['heuristic-1'],
    });
    const state = {
      current_milestone: 'ms-1',
      current_story: 's1',
      milestones: [{
        name: 'ms-1',
        stories: [{ id: 's1', name: 'add auth', status: 'in-progress' }],
      }],
      fix_patterns: {},
      shipped_insights: [],
    };
    const outPath = assembleStoryContext(dir, state, { id: 's1', name: 'add auth' });
    assert.ok(fs.existsSync(outPath));
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.equal(out._type, 'story_context');
    assert.equal(out.story.id, 's1');
    assert.match(out.vision_summary, /test.*one liner/);
    assert.ok(out.product_standard);
  });

  test('assembleMilestoneContext produces a milestone_context.json', () => {
    writeCtx({ vision: { product_name: 'test' } });
    const state = {
      current_milestone: 'ms-1',
      milestones: [{
        name: 'ms-1',
        status: 'in-progress',
        stories: [
          { id: 's1', name: 'a', status: 'done' },
          { id: 's2', name: 'b', status: 'done' },
        ],
      }],
    };
    const outPath = assembleMilestoneContext(dir, state);
    assert.ok(fs.existsSync(outPath));
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.equal(out._type, 'milestone_context');
  });

  test('assembleFixStoryContext writes fix_story_context.json', () => {
    writeCtx({ vision: { product_name: 'test' } });
    const state = {
      current_milestone: 'ms-1',
      current_story: 's1',
      milestones: [{
        name: 'ms-1',
        stories: [{ id: 's1', name: 'a', status: 'blocked', attempts: 1 }],
      }],
      fix_memory: { s1: [{ attempt: 1, outcome: 'failed' }] },
    };
    const outPath = assembleFixStoryContext(dir, state);
    assert.ok(fs.existsSync(outPath));
  });
});
