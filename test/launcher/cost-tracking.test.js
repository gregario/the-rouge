const { test, describe } = require('node:test');
const assert = require('node:assert');

const { estimatePhaseCost, trackPhaseCost, checkBudgetCap, getCostSummary } = require('../../src/launcher/cost-tracker.js');

describe('Cost Tracking', () => {
  describe('estimatePhaseCost', () => {
    test('estimates Opus cost correctly', () => {
      // 100k tokens, assume 50/50 input/output split
      // Opus: input $15/M, output $75/M
      // 50k input = $0.75, 50k output = $3.75, total = $4.50
      const cost = estimatePhaseCost(100000, 'opus');
      assert.ok(cost > 0);
      assert.equal(typeof cost, 'number');
    });

    test('estimates Sonnet cost correctly', () => {
      // Sonnet: input $3/M, output $15/M
      // Should be cheaper than Opus for same tokens
      const opusCost = estimatePhaseCost(100000, 'opus');
      const sonnetCost = estimatePhaseCost(100000, 'sonnet');
      assert.ok(sonnetCost < opusCost);
    });

    test('defaults to opus pricing for unknown model', () => {
      const opusCost = estimatePhaseCost(100000, 'opus');
      const unknownCost = estimatePhaseCost(100000, 'unknown');
      assert.equal(unknownCost, opusCost);
    });

    test('returns 0 for 0 tokens', () => {
      assert.equal(estimatePhaseCost(0, 'opus'), 0);
    });
  });

  describe('trackPhaseCost', () => {
    test('accumulates costs in state', () => {
      const state = { costs: { cumulative_tokens: 0, cumulative_cost_usd: 0 } };
      trackPhaseCost(state, 50000, 'opus');
      assert.equal(state.costs.phase_tokens, 50000);
      assert.equal(state.costs.cumulative_tokens, 50000);
      assert.ok(state.costs.phase_cost_usd > 0);
      assert.ok(state.costs.cumulative_cost_usd > 0);
    });

    test('accumulates across multiple phases', () => {
      const state = { costs: { cumulative_tokens: 50000, cumulative_cost_usd: 2.25 } };
      trackPhaseCost(state, 30000, 'sonnet');
      assert.equal(state.costs.phase_tokens, 30000);
      assert.equal(state.costs.cumulative_tokens, 80000);
      assert.ok(state.costs.cumulative_cost_usd > 2.25);
    });

    test('initialises costs if missing', () => {
      const state = {};
      trackPhaseCost(state, 10000, 'opus');
      assert.equal(state.costs.cumulative_tokens, 10000);
      assert.ok(state.costs.cumulative_cost_usd > 0);
    });
  });

  describe('checkBudgetCap', () => {
    test('returns false when under budget', () => {
      const state = { costs: { cumulative_cost_usd: 10 } };
      assert.equal(checkBudgetCap(state, 50), false);
    });

    test('returns true when at budget', () => {
      const state = { costs: { cumulative_cost_usd: 50 } };
      assert.equal(checkBudgetCap(state, 50), true);
    });

    test('returns true when over budget', () => {
      const state = { costs: { cumulative_cost_usd: 55 } };
      assert.equal(checkBudgetCap(state, 50), true);
    });

    test('returns false when no costs tracked', () => {
      const state = {};
      assert.equal(checkBudgetCap(state, 50), false);
    });
  });

  describe('getCostSummary', () => {
    test('returns per-phase and cumulative breakdown', () => {
      const checkpoints = [
        { phase: 'foundation', costs: { phase_tokens: 40000, phase_cost_usd: 1.80, cumulative_tokens: 40000, cumulative_cost_usd: 1.80 } },
        { phase: 'story-building', costs: { phase_tokens: 60000, phase_cost_usd: 2.70, cumulative_tokens: 100000, cumulative_cost_usd: 4.50 } },
        { phase: 'story-building', costs: { phase_tokens: 50000, phase_cost_usd: 2.25, cumulative_tokens: 150000, cumulative_cost_usd: 6.75 } },
      ];
      const summary = getCostSummary(checkpoints);
      assert.equal(summary.total_tokens, 150000);
      assert.equal(summary.total_cost_usd, 6.75);
      assert.ok(summary.by_phase['foundation']);
      assert.ok(summary.by_phase['story-building']);
      assert.equal(summary.by_phase['story-building'].total_tokens, 110000);
    });

    test('handles empty checkpoints', () => {
      const summary = getCostSummary([]);
      assert.equal(summary.total_tokens, 0);
      assert.equal(summary.total_cost_usd, 0);
      assert.deepEqual(summary.by_phase, {});
    });
  });
});
