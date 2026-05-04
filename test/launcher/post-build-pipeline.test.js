/**
 * Post-build pipeline integration test.
 *
 * Exercises the full state machine path from "last story done" through
 * vision-check → shipping → final-review → complete. This path was
 * never tested end-to-end before (Highlow proved it doesn't fire in
 * production — deploy failures blocked it, then manual intervention
 * bypassed it).
 *
 * The test mocks deploy-to-staging to avoid real deploys, and runs
 * advanceState sequentially through each transition.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  advanceState,
  findNextMilestone,
  readJson,
  writeJson,
} = require('../../src/launcher/rouge-loop.js');

function setupProject(tmpDir, state, cycleContext = {}) {
  writeJson(path.join(tmpDir, 'state.json'), state);
  writeJson(path.join(tmpDir, 'cycle_context.json'), cycleContext);
}

function readState(tmpDir) {
  return readJson(path.join(tmpDir, 'state.json'));
}

function readContext(tmpDir) {
  return readJson(path.join(tmpDir, 'cycle_context.json'));
}

// Mock deploy-to-staging in require cache before advanceState uses it.
// The real module does shell commands; we just return a URL.
function mockDeploy(url = 'https://example.github.io/test/') {
  const deployModulePath = require.resolve('../../src/launcher/deploy-to-staging.js');
  require.cache[deployModulePath] = {
    id: deployModulePath,
    filename: deployModulePath,
    loaded: true,
    exports: {
      deploy: () => url,
      deployGithubPages: () => url,
      deployCloudflare: () => url,
    },
  };
}

function unmockDeploy() {
  const deployModulePath = require.resolve('../../src/launcher/deploy-to-staging.js');
  delete require.cache[deployModulePath];
}

// Base state: all milestones done, last story just completed.
// This is the state AFTER the story-building phase marks the last story done
// and the batch-complete deploy succeeds.
function makeAllMilestonesDoneState() {
  return {
    current_state: 'analyzing',
    current_milestone: 'polish',
    current_story: null,
    consecutive_failures: 0,
    promoted_milestones: ['foundation', 'core'],
    milestones: [
      {
        name: 'foundation',
        status: 'complete',
        stories: [{ id: 'f1', status: 'done', depends_on: [] }],
      },
      {
        name: 'core',
        status: 'complete',
        stories: [{ id: 'c1', status: 'done', depends_on: [] }],
      },
      {
        name: 'polish',
        status: 'in-progress',
        stories: [{ id: 'p1', status: 'done', depends_on: [] }],
      },
    ],
  };
}

describe('post-build pipeline: analyzing → vision-check → shipping → final-review → complete', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-postbuild-'));
    mockDeploy();
  });

  afterEach(() => {
    unmockDeploy();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('analyzing with promote action on last milestone → vision-check', async () => {
    const state = makeAllMilestonesDoneState();
    const ctx = {
      analysis_recommendation: { action: 'promote', rationale: 'All good' },
      analysis_result: { recommendation: 'promote' },
    };
    setupProject(tmpDir, state, ctx);

    await advanceState(tmpDir);

    const result = readState(tmpDir);
    assert.strictEqual(result.current_state, 'vision-check',
      'Should transition to vision-check when last milestone promoted');
    // Milestone should be marked complete
    const polish = result.milestones.find(m => m.name === 'polish');
    assert.strictEqual(polish.status, 'complete');
    // Should be added to promoted_milestones
    assert.ok(result.promoted_milestones.includes('polish'),
      'polish should be in promoted_milestones');
  });

  test('analyzing with continue action on last milestone → vision-check', async () => {
    const state = makeAllMilestonesDoneState();
    const ctx = {
      analysis_recommendation: { action: 'continue' },
    };
    setupProject(tmpDir, state, ctx);

    await advanceState(tmpDir);

    const result = readState(tmpDir);
    assert.strictEqual(result.current_state, 'vision-check');
  });

  test('analyzing with no action (default continue) on last milestone → vision-check', async () => {
    const state = makeAllMilestonesDoneState();
    // No analysis_recommendation at all — defaults to 'continue'
    setupProject(tmpDir, state, {});

    await advanceState(tmpDir);

    const result = readState(tmpDir);
    assert.strictEqual(result.current_state, 'vision-check');
  });

  test('vision-check with aligned results → shipping', async () => {
    const state = {
      ...makeAllMilestonesDoneState(),
      current_state: 'vision-check',
      promoted_milestones: ['foundation', 'core', 'polish'],
    };
    state.milestones[2].status = 'complete';
    const ctx = {
      vision_check_results: {
        trajectory: 'converging',
        overall_confidence: 0.9,
        vision_alignment: { core_promise_delivery: { score: 0.9 } },
      },
    };
    setupProject(tmpDir, state, ctx);

    await advanceState(tmpDir);

    const result = readState(tmpDir);
    assert.strictEqual(result.current_state, 'shipping',
      'Should transition to shipping when vision is aligned');
  });

  test('vision-check with empty results (prompt failure) → shipping', async () => {
    const state = {
      ...makeAllMilestonesDoneState(),
      current_state: 'vision-check',
      promoted_milestones: ['foundation', 'core', 'polish'],
    };
    state.milestones[2].status = 'complete';
    // Empty cycle_context — prompt didn't write vision_check_results
    setupProject(tmpDir, state, {});

    await advanceState(tmpDir);

    const result = readState(tmpDir);
    assert.strictEqual(result.current_state, 'shipping',
      'Should still advance to shipping even if vision_check_results is missing');
  });

  test('vision-check with diverging trajectory → escalation', async () => {
    const state = {
      ...makeAllMilestonesDoneState(),
      current_state: 'vision-check',
      promoted_milestones: ['foundation', 'core', 'polish'],
    };
    state.milestones[2].status = 'complete';
    const ctx = {
      vision_check_results: {
        trajectory: 'diverging',
        overall_confidence: 0.3,
      },
    };
    setupProject(tmpDir, state, ctx);

    await advanceState(tmpDir);

    const result = readState(tmpDir);
    assert.strictEqual(result.current_state, 'escalation',
      'Should escalate on vision divergence');
    const esc = (result.escalations || []).find(e => e.classification === 'vision-drift');
    assert.ok(esc, 'Should have a vision-drift escalation');
  });

  test('shipping with success → final-review', async () => {
    const state = {
      ...makeAllMilestonesDoneState(),
      current_state: 'shipping',
      promoted_milestones: ['foundation', 'core', 'polish'],
    };
    state.milestones[2].status = 'complete';
    const ctx = {
      ship_result: { success: true, version: '1.0.0' },
    };
    setupProject(tmpDir, state, ctx);

    await advanceState(tmpDir);

    const result = readState(tmpDir);
    assert.strictEqual(result.current_state, 'final-review',
      'Successful shipping should transition to final-review');
  });

  test('shipping with ship_blocked → escalation', async () => {
    const state = {
      ...makeAllMilestonesDoneState(),
      current_state: 'shipping',
      promoted_milestones: ['foundation', 'core', 'polish'],
    };
    state.milestones[2].status = 'complete';
    const ctx = {
      ship_blocked: true,
      ship_blocked_reason: 'Gate qa_gate not passed. Cannot promote to production.',
      blocked_gates: ['qa_gate'],
    };
    setupProject(tmpDir, state, ctx);

    await advanceState(tmpDir);

    const result = readState(tmpDir);
    assert.strictEqual(result.current_state, 'escalation',
      'Blocked ship should escalate');
    const esc = (result.escalations || []).find(e => e.classification === 'ship-blocked');
    assert.ok(esc, 'Should have ship-blocked escalation');
    assert.ok(esc.summary.includes('qa_gate'));
  });

  test('shipping with escalation_needed → escalation', async () => {
    const state = {
      ...makeAllMilestonesDoneState(),
      current_state: 'shipping',
      promoted_milestones: ['foundation', 'core', 'polish'],
    };
    state.milestones[2].status = 'complete';
    const ctx = {
      escalation_needed: true,
      ship_error: { message: 'Production deploy failed: 503' },
    };
    setupProject(tmpDir, state, ctx);

    await advanceState(tmpDir);

    const result = readState(tmpDir);
    assert.strictEqual(result.current_state, 'escalation',
      'escalation_needed should escalate');
  });

  test('shipping with empty context (prompt wrote nothing) → final-review', async () => {
    const state = {
      ...makeAllMilestonesDoneState(),
      current_state: 'shipping',
      promoted_milestones: ['foundation', 'core', 'polish'],
    };
    state.milestones[2].status = 'complete';
    setupProject(tmpDir, state, {});

    await advanceState(tmpDir);

    const result = readState(tmpDir);
    assert.strictEqual(result.current_state, 'final-review',
      'No failure signals → advance to final-review');
  });

  test('final-review with production_ready → complete', async () => {
    const state = {
      ...makeAllMilestonesDoneState(),
      current_state: 'final-review',
      promoted_milestones: ['foundation', 'core', 'polish'],
    };
    state.milestones[2].status = 'complete';
    const ctx = {
      final_review_report: {
        production_ready: true,
        confidence: 0.92,
        recommendation: 'ship',
        overall_impression: 'Great product.',
      },
    };
    setupProject(tmpDir, state, ctx);

    await advanceState(tmpDir);

    const result = readState(tmpDir);
    assert.strictEqual(result.current_state, 'complete',
      'Should reach complete when final review passes');
    assert.strictEqual(result.final_review_attempts, 0);
  });

  test('final-review with human_approved → complete', async () => {
    const state = {
      ...makeAllMilestonesDoneState(),
      current_state: 'final-review',
      promoted_milestones: ['foundation', 'core', 'polish'],
    };
    state.milestones[2].status = 'complete';
    const ctx = {
      final_review_report: {
        human_approved: true,
        production_ready: false,
        recommendation: 'refine',
      },
    };
    setupProject(tmpDir, state, ctx);

    await advanceState(tmpDir);

    const result = readState(tmpDir);
    assert.strictEqual(result.current_state, 'complete',
      'Should reach complete when human approves even if not production_ready');
  });

  test('final-review with refine recommendation → generating-change-spec (refinement loop)', async () => {
    const state = {
      ...makeAllMilestonesDoneState(),
      current_state: 'final-review',
      current_milestone: 'polish',
      promoted_milestones: ['foundation', 'core', 'polish'],
    };
    state.milestones[2].status = 'complete';
    const ctx = {
      final_review_report: {
        production_ready: false,
        confidence: 0.7,
        recommendation: 'refine',
        rough_edges: ['Loading state missing'],
      },
    };
    setupProject(tmpDir, state, ctx);

    await advanceState(tmpDir);

    const result = readState(tmpDir);
    assert.strictEqual(result.current_state, 'generating-change-spec',
      'Refine recommendation should route to generating-change-spec');
    assert.strictEqual(result.final_review_attempts, 1);
  });

  test('final-review refinement exhaustion (3 attempts) → escalation', async () => {
    const state = {
      ...makeAllMilestonesDoneState(),
      current_state: 'final-review',
      current_milestone: 'polish',
      final_review_attempts: 2,
      promoted_milestones: ['foundation', 'core', 'polish'],
    };
    state.milestones[2].status = 'complete';
    const ctx = {
      final_review_report: {
        production_ready: false,
        recommendation: 'refine',
      },
    };
    setupProject(tmpDir, state, ctx);

    await advanceState(tmpDir);

    const result = readState(tmpDir);
    assert.strictEqual(result.current_state, 'escalation',
      'Should escalate after 3 refinement attempts');
    assert.strictEqual(result.final_review_attempts, 3);
    const esc = (result.escalations || []).find(e => e.classification === 'taste-judgment');
    assert.ok(esc, 'Should have a taste-judgment escalation');
  });

  test('final-review with major-rework → escalation', async () => {
    const state = {
      ...makeAllMilestonesDoneState(),
      current_state: 'final-review',
      promoted_milestones: ['foundation', 'core', 'polish'],
    };
    state.milestones[2].status = 'complete';
    const ctx = {
      final_review_report: {
        production_ready: false,
        recommendation: 'major-rework',
        rough_edges: ['Core flow is broken'],
      },
    };
    setupProject(tmpDir, state, ctx);

    await advanceState(tmpDir);

    const result = readState(tmpDir);
    assert.strictEqual(result.current_state, 'escalation',
      'Major rework should escalate');
    const esc = (result.escalations || []).find(e =>
      e.classification === 'final-review-major-rework');
    assert.ok(esc, 'Should have a final-review-major-rework escalation');
  });

  test('final-review with no report (prompt failure) → generating-change-spec', async () => {
    const state = {
      ...makeAllMilestonesDoneState(),
      current_state: 'final-review',
      current_milestone: 'polish',
      promoted_milestones: ['foundation', 'core', 'polish'],
    };
    state.milestones[2].status = 'complete';
    // Empty context — prompt didn't write final_review_report
    setupProject(tmpDir, state, {});

    await advanceState(tmpDir);

    const result = readState(tmpDir);
    assert.strictEqual(result.current_state, 'generating-change-spec',
      'Missing report should trigger refinement (not crash)');
    assert.strictEqual(result.final_review_attempts, 1);
  });
});

describe('post-build pipeline: story batch complete → deploy → milestone-check', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-deploy-'));
    mockDeploy();
  });

  afterEach(() => {
    unmockDeploy();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('batch complete with successful deploy → milestone-check', async () => {
    const state = {
      current_state: 'story-building',
      current_milestone: 'core',
      current_story: 's2',
      consecutive_failures: 0,
      milestones: [{
        name: 'core',
        status: 'in-progress',
        stories: [
          { id: 's1', status: 'done', depends_on: [] },
          { id: 's2', status: 'in-progress', depends_on: [] },
        ],
      }],
    };
    const ctx = { story_result: { outcome: 'pass', files_changed: ['app.js'] } };
    setupProject(tmpDir, state, ctx);

    await advanceState(tmpDir);

    const result = readState(tmpDir);
    assert.strictEqual(result.current_state, 'milestone-check',
      'Should advance to milestone-check after successful deploy');
    // Note: current_story is NOT cleared in the advanceState batch-complete
    // path (only in the pre-dispatch optimization). The milestone-check
    // invariant only requires current_milestone, not a null story pointer.
    const s2 = result.milestones[0].stories.find(s => s.id === 's2');
    assert.strictEqual(s2.status, 'done', 'Last story should be marked done');
  });

  test('batch complete with failed deploy → escalation', { timeout: 120000 }, async () => {
    // Slow: deployWithRetry has 30s delays between 3 attempts (hardcoded in rouge-loop.js).
    const deployModulePath = require.resolve('../../src/launcher/deploy-to-staging.js');
    require.cache[deployModulePath] = {
      id: deployModulePath,
      filename: deployModulePath,
      loaded: true,
      exports: {
        deploy: () => { throw new Error('npm error Missing script: "build"'); },
      },
    };

    const state = {
      current_state: 'story-building',
      current_milestone: 'core',
      current_story: 's2',
      consecutive_failures: 0,
      milestones: [{
        name: 'core',
        status: 'in-progress',
        stories: [
          { id: 's1', status: 'done', depends_on: [] },
          { id: 's2', status: 'in-progress', depends_on: [] },
        ],
      }],
    };
    const ctx = { story_result: { outcome: 'pass', files_changed: ['app.js'] } };
    setupProject(tmpDir, state, ctx);

    await advanceState(tmpDir);

    const result = readState(tmpDir);
    assert.strictEqual(result.current_state, 'escalation',
      'Should escalate when deploy fails');
    const esc = (result.escalations || []).find(e => e.classification === 'deploy-failure');
    assert.ok(esc, 'Should have a deploy-failure escalation');
  });
});

describe('post-build pipeline: full end-to-end traversal', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-e2e-'));
    mockDeploy();
  });

  afterEach(() => {
    unmockDeploy();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('walks analyzing → vision-check → shipping → final-review → complete in sequence', async () => {
    // Step 1: analyzing promotes last milestone → vision-check
    const state = makeAllMilestonesDoneState();
    setupProject(tmpDir, state, {
      analysis_recommendation: { action: 'promote' },
    });
    await advanceState(tmpDir);
    let result = readState(tmpDir);
    assert.strictEqual(result.current_state, 'vision-check', 'Step 1: → vision-check');

    // Step 2: vision-check aligned → shipping
    writeJson(path.join(tmpDir, 'cycle_context.json'), {
      vision_check_results: { trajectory: 'converging', overall_confidence: 0.88 },
    });
    await advanceState(tmpDir);
    result = readState(tmpDir);
    assert.strictEqual(result.current_state, 'shipping', 'Step 2: → shipping');

    // Step 3: shipping → final-review
    writeJson(path.join(tmpDir, 'cycle_context.json'), {
      ship_result: { success: true, version: '1.0.0', pr_url: 'https://github.com/test/pr/1' },
    });
    await advanceState(tmpDir);
    result = readState(tmpDir);
    assert.strictEqual(result.current_state, 'final-review', 'Step 3: → final-review');

    // Step 4: final-review passes → complete
    writeJson(path.join(tmpDir, 'cycle_context.json'), {
      final_review_report: {
        production_ready: true,
        confidence: 0.91,
        recommendation: 'ship',
      },
    });
    await advanceState(tmpDir);
    result = readState(tmpDir);
    assert.strictEqual(result.current_state, 'complete', 'Step 4: → complete');

    // Verify all milestones promoted
    assert.ok(result.promoted_milestones.includes('polish'));
    // Verify shipped_insights recorded
    assert.ok(Array.isArray(result.shipped_insights));
    assert.ok(result.shipped_insights.some(si => si.milestone === 'polish'));
  });

  test('full path with refinement loop: final-review refine → change-spec → back to final-review → complete', async () => {
    // Start at final-review with a refine result
    const state = {
      ...makeAllMilestonesDoneState(),
      current_state: 'final-review',
      current_milestone: 'polish',
      promoted_milestones: ['foundation', 'core', 'polish'],
    };
    state.milestones[2].status = 'complete';
    setupProject(tmpDir, state, {
      final_review_report: {
        production_ready: false,
        recommendation: 'refine',
        rough_edges: ['Missing loading state'],
      },
    });

    // Step 1: final-review → generating-change-spec
    await advanceState(tmpDir);
    let result = readState(tmpDir);
    assert.strictEqual(result.current_state, 'generating-change-spec', 'Refine → change-spec');
    assert.strictEqual(result.final_review_attempts, 1);

    // Step 2: generating-change-spec with no pending specs → milestone-check
    writeJson(path.join(tmpDir, 'cycle_context.json'), {
      change_specs_pending: [],
      previous_phase: 'analyzing',
    });
    await advanceState(tmpDir);
    result = readState(tmpDir);
    assert.strictEqual(result.current_state, 'milestone-check',
      'No fix stories → milestone-check');
  });
});

describe('post-build pipeline: findNextMilestone with all done', () => {
  test('returns null when all milestones are complete', () => {
    const state = {
      milestones: [
        { name: 'foundation', status: 'complete' },
        { name: 'core', status: 'complete' },
        { name: 'polish', status: 'complete' },
      ],
    };
    assert.strictEqual(findNextMilestone(state), null);
  });

  test('returns null when milestones are mix of complete and partial', () => {
    const state = {
      milestones: [
        { name: 'foundation', status: 'complete' },
        { name: 'core', status: 'partial' },
        { name: 'polish', status: 'complete' },
      ],
    };
    assert.strictEqual(findNextMilestone(state), null);
  });

  test('returns pending milestone when one remains', () => {
    const state = {
      milestones: [
        { name: 'foundation', status: 'complete' },
        { name: 'core', status: 'complete' },
        { name: 'polish', status: 'pending' },
      ],
    };
    const next = findNextMilestone(state);
    assert.strictEqual(next.name, 'polish');
  });
});
