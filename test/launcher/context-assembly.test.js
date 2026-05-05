const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  assembleStoryContext,
  assembleMilestoneContext,
  assembleFixStoryContext,
  compactOlderStories,
  assembleAnalysisContext,
  assembleVisionCheckContext,
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

describe('compactOlderStories', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compact-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeCtx(data) {
    fs.writeFileSync(path.join(dir, 'cycle_context.json'), JSON.stringify(data));
  }

  function readCtx() {
    return JSON.parse(fs.readFileSync(path.join(dir, 'cycle_context.json'), 'utf8'));
  }

  test('no compaction when fewer than 3 story_results', () => {
    const ctx = {
      story_results: [
        { story_id: 's1', files_changed: ['a.ts', 'b.ts'] },
        { story_id: 's2', files_changed: ['c.ts'] },
      ],
    };
    writeCtx(ctx);
    compactOlderStories(dir);
    const result = readCtx();
    assert.ok(Array.isArray(result.story_results[0].files_changed));
    assert.ok(Array.isArray(result.story_results[1].files_changed));
  });

  test('compacts first story when 3 stories present', () => {
    const ctx = {
      story_results: [
        { story_id: 's1', files_changed: ['a.ts', 'b.ts', 'c.ts', 'd.ts'] },
        { story_id: 's2', files_changed: ['e.ts'] },
        { story_id: 's3', files_changed: ['f.ts'] },
      ],
    };
    writeCtx(ctx);
    compactOlderStories(dir);
    const result = readCtx();
    // First story compacted
    assert.equal(result.story_results[0].files_changed.count, 4);
    assert.deepEqual(result.story_results[0].files_changed.key_files, ['a.ts', 'b.ts', 'c.ts']);
    assert.equal(result.story_results[0]._compacted, true);
    // Last two at full fidelity
    assert.ok(Array.isArray(result.story_results[1].files_changed));
    assert.ok(Array.isArray(result.story_results[2].files_changed));
  });

  test('compacts acceptance_criteria to summary', () => {
    const ctx = {
      story_results: [
        {
          story_id: 's1',
          acceptance_criteria: [
            { id: 'ac1', status: 'pass' },
            { id: 'ac2', status: 'pass' },
            { id: 'ac3', status: 'fail' },
          ],
        },
        { story_id: 's2' },
        { story_id: 's3' },
      ],
    };
    writeCtx(ctx);
    compactOlderStories(dir);
    const result = readCtx();
    assert.deepEqual(result.story_results[0].acceptance_criteria, { total: 3, passed: 2, failed: 1 });
  });

  test('idempotent — already compacted entries unchanged', () => {
    const ctx = {
      story_results: [
        { story_id: 's1', files_changed: { count: 4, key_files: ['a.ts'] }, _compacted: true },
        { story_id: 's2', files_changed: ['e.ts'] },
        { story_id: 's3', files_changed: ['f.ts'] },
      ],
    };
    writeCtx(ctx);
    compactOlderStories(dir);
    const result = readCtx();
    assert.equal(result.story_results[0].files_changed.count, 4);
    assert.deepEqual(result.story_results[0].files_changed.key_files, ['a.ts']);
  });

  test('preserves protected fields during compaction', () => {
    const ctx = {
      story_results: [
        {
          story_id: 's1',
          outcome: 'pass',
          files_changed: ['a.ts', 'b.ts', 'c.ts', 'd.ts'],
          divergences: [{ spec_says: 'x', actually_did: 'y' }],
          escalation: { tier: 1 },
        },
        { story_id: 's2' },
        { story_id: 's3' },
      ],
    };
    writeCtx(ctx);
    compactOlderStories(dir);
    const result = readCtx();
    assert.equal(result.story_results[0].outcome, 'pass');
    assert.deepEqual(result.story_results[0].divergences, [{ spec_says: 'x', actually_did: 'y' }]);
    assert.deepEqual(result.story_results[0].escalation, { tier: 1 });
  });

  test('compacts string alternatives_considered in factory_decisions', () => {
    // 12 decisions to trigger compaction (threshold is >10, keep last 10 full)
    const decisions = Array.from({ length: 12 }, (_, i) => ({
      decision: `decision-${i}`,
      rationale: 'reason',
      alternatives_considered: 'We considered Vue for its simplicity. We also looked at Svelte for performance. Angular was ruled out due to complexity.',
    }));
    writeCtx({ factory_decisions: decisions });
    compactOlderStories(dir);
    const result = readCtx();
    // First 2 compacted (12 - 10 = 2 to compact)
    assert.equal(result.factory_decisions[0].alternatives_considered, 'We considered Vue for its simplicity.');
    assert.equal(result.factory_decisions[0]._compacted, true);
    // Last 10 at full fidelity
    assert.ok(result.factory_decisions[11].alternatives_considered.includes('Angular'));
    assert.equal(result.factory_decisions[11]._compacted, undefined);
  });

  test('compacts array alternatives_considered in factory_decisions', () => {
    // Real pattern observed in production: alternatives_considered is an array of strings
    const decisions = Array.from({ length: 12 }, (_, i) => ({
      decision: `decision-${i}`,
      rationale: 'reason',
      alternatives_considered: [
        'Vue — rejected (vision says React)',
        'Svelte — rejected (less ecosystem)',
        'Angular — rejected (too complex)',
      ],
    }));
    writeCtx({ factory_decisions: decisions });
    compactOlderStories(dir);
    const result = readCtx();
    // First 2 compacted: array → first element only
    assert.equal(result.factory_decisions[0].alternatives_considered, 'Vue — rejected (vision says React)');
    assert.equal(result.factory_decisions[0]._compacted, true);
    // Last 10 at full fidelity (still arrays)
    assert.ok(Array.isArray(result.factory_decisions[11].alternatives_considered));
    assert.equal(result.factory_decisions[11].alternatives_considered.length, 3);
  });
});

describe('assembleAnalysisContext', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'analysis-ctx-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeCtx(data) {
    fs.writeFileSync(path.join(dir, 'cycle_context.json'), JSON.stringify(data));
  }

  test('produces analysis_context.json with expected shape', () => {
    writeCtx({
      _cycle_number: 2,
      _current_milestone: 'ms-1',
      evaluation_report: { po: { confidence: 0.85, verdict: 'NEEDS_IMPROVEMENT' }, qa: { verdict: 'PASS' } },
      factory_decisions: [{ decision: 'use tabs', rationale: 'cleaner' }],
      factory_questions: [{ question: 'should we paginate?' }],
      confidence_history: [{ cycle: 1, confidence: 0.72 }],
      previous_cycles: [{ cycle: 1, action: 'deepen' }],
      vision: { product_name: 'TestApp', one_liner: 'testing' },
      product_standard: { tone: 'professional' },
      retry_counts: { 'fix-001': 2 },
      capability_assessments: [{ finding_id: 'f1', capability_feasible: true }],
    });
    const state = { cycle_number: 2, current_milestone: 'ms-1' };
    const outPath = assembleAnalysisContext(dir, state);
    assert.ok(fs.existsSync(outPath));
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.equal(out._type, 'analysis_context');
    assert.equal(out._cycle_number, 2);
    assert.equal(out.evaluation_report.po.confidence, 0.85);
    assert.equal(out.factory_decisions[0].decision, 'use tabs');
    assert.equal(out.confidence_history[0].confidence, 0.72);
    assert.equal(out.vision.product_name, 'TestApp');
    assert.equal(out.retry_counts['fix-001'], 2);
    assert.equal(out.capability_assessments[0].finding_id, 'f1');
  });

  test('evaluation_report preserved in full (no lossy transformation)', () => {
    const evalReport = {
      po: { confidence: 0.91, confidence_adjusted: 0.95, verdict: 'PRODUCTION_READY', quality_gaps: [], improvement_items: [{ id: 'imp-1' }] },
      qa: { verdict: 'PASS', criteria_pass_rate: 0.98, fix_tasks: [] },
      design: { design_review: { score: 8.5 }, a11y_review: { verdict: 'PASS' } },
      health_score: 87,
    };
    writeCtx({ evaluation_report: evalReport });
    const state = { cycle_number: 1, current_milestone: 'ms-1' };
    assembleAnalysisContext(dir, state);
    const out = JSON.parse(fs.readFileSync(path.join(dir, 'analysis_context.json'), 'utf8'));
    assert.deepEqual(out.evaluation_report, evalReport);
  });

  test('handles missing optional fields gracefully', () => {
    writeCtx({ vision: { product_name: 'x' } });
    const state = { cycle_number: 1, current_milestone: 'ms-1' };
    const outPath = assembleAnalysisContext(dir, state);
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.deepEqual(out.capability_assessments, []);
    assert.deepEqual(out.qa_fix_results, {});
    assert.deepEqual(out.evaluation_report, {});
    assert.deepEqual(out.confidence_history, []);
  });
});

describe('assembleVisionCheckContext', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vision-ctx-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeCtx(data) {
    fs.writeFileSync(path.join(dir, 'cycle_context.json'), JSON.stringify(data));
  }

  test('produces vision_check_context.json with expected shape', () => {
    writeCtx({
      _cycle_number: 3,
      _current_milestone: 'ms-2',
      vision: { product_name: 'VisionApp', one_liner: 'test vision' },
      story_results: [
        { story_id: 's1', implemented: [{ task: 'auth' }], skipped: [] },
        { story_id: 's2', implemented: [{ task: 'search' }], skipped: [{ task: 'maps', reason: 'no API key' }] },
      ],
      factory_decisions: [{ decision: 'use JWT' }],
      factory_questions: [{ question: 'CDN?' }],
      divergences: [{ spec_says: 'OAuth', actually_did: 'JWT', rationale: 'simpler' }],
      evaluator_observations: [{ observation: 'nav feels slow' }],
      evaluation_report: { po: { confidence: 0.88, quality_gaps: [{ id: 'g1' }] } },
      previous_cycles: [{ cycle: 1 }],
    });
    const state = { cycle_number: 3, current_milestone: 'ms-2' };
    const outPath = assembleVisionCheckContext(dir, state);
    assert.ok(fs.existsSync(outPath));
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.equal(out._type, 'vision_check_context');
    assert.equal(out.vision.product_name, 'VisionApp');
    assert.equal(out.implemented.length, 2);
    assert.equal(out.implemented[0]._story_id, 's1');
    assert.equal(out.skipped.length, 1);
    assert.equal(out.divergences[0].spec_says, 'OAuth');
    assert.equal(out.evaluation_report_summary.po_confidence, 0.88);
    assert.equal(out.evaluation_report_summary.quality_gaps[0].id, 'g1');
  });

  test('divergences preserved in full (never truncated)', () => {
    const divergences = [
      { spec_says: 'A', actually_did: 'B', rationale: 'reason 1' },
      { spec_says: 'C', actually_did: 'D', rationale: 'reason 2' },
      { spec_says: 'E', actually_did: 'F', rationale: 'reason 3' },
    ];
    writeCtx({ divergences, vision: {} });
    const state = { cycle_number: 1, current_milestone: 'ms-1' };
    assembleVisionCheckContext(dir, state);
    const out = JSON.parse(fs.readFileSync(path.join(dir, 'vision_check_context.json'), 'utf8'));
    assert.deepEqual(out.divergences, divergences);
  });

  test('aggregates implemented items from story_results with story_id attribution', () => {
    writeCtx({
      vision: {},
      story_results: [
        { story_id: 's1', implemented: [{ task: 'auth' }, { task: 'login page' }] },
        { story_id: 's2', implemented: [{ task: 'dashboard' }] },
      ],
    });
    const state = { cycle_number: 1, current_milestone: 'ms-1' };
    assembleVisionCheckContext(dir, state);
    const out = JSON.parse(fs.readFileSync(path.join(dir, 'vision_check_context.json'), 'utf8'));
    assert.equal(out.implemented.length, 3);
    assert.equal(out.implemented[0]._story_id, 's1');
    assert.equal(out.implemented[0].task, 'auth');
    assert.equal(out.implemented[2]._story_id, 's2');
    assert.equal(out.implemented[2].task, 'dashboard');
  });

  test('handles missing cycle_context gracefully', () => {
    // No cycle_context.json written
    const state = { cycle_number: 1, current_milestone: 'ms-1' };
    const outPath = assembleVisionCheckContext(dir, state);
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.equal(out._type, 'vision_check_context');
    assert.deepEqual(out.implemented, []);
    assert.deepEqual(out.vision, {});
  });
});
