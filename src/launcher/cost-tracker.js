/**
 * V3 Cost tracking — per-phase tokens, cumulative USD, budget cap.
 * Pricing assumes 50/50 input/output token split.
 */

const MODEL_PRICING = {
  opus:   { input_per_m: 15, output_per_m: 75 },
  sonnet: { input_per_m: 3,  output_per_m: 15 },
};

function estimatePhaseCost(tokenCount, model) {
  if (tokenCount === 0) return 0;
  const pricing = MODEL_PRICING[model] || MODEL_PRICING.opus;
  const inputTokens = tokenCount / 2;
  const outputTokens = tokenCount / 2;
  return (inputTokens / 1_000_000) * pricing.input_per_m +
         (outputTokens / 1_000_000) * pricing.output_per_m;
}

function trackPhaseCost(state, phaseTokens, model) {
  if (!state.costs) {
    state.costs = { cumulative_tokens: 0, cumulative_cost_usd: 0 };
  }
  const phaseCost = estimatePhaseCost(phaseTokens, model);
  state.costs.phase_tokens = phaseTokens;
  state.costs.phase_cost_usd = phaseCost;
  state.costs.cumulative_tokens += phaseTokens;
  state.costs.cumulative_cost_usd += phaseCost;
}

function checkBudgetCap(state, budgetCapUsd) {
  const cumulative = state.costs?.cumulative_cost_usd || 0;
  return cumulative >= budgetCapUsd;
}

function getCostSummary(checkpoints) {
  if (checkpoints.length === 0) {
    return { total_tokens: 0, total_cost_usd: 0, by_phase: {} };
  }

  const last = checkpoints[checkpoints.length - 1];
  const byPhase = {};

  for (const cp of checkpoints) {
    if (!cp.costs) continue;
    if (!byPhase[cp.phase]) {
      byPhase[cp.phase] = { total_tokens: 0, total_cost_usd: 0, count: 0 };
    }
    byPhase[cp.phase].total_tokens += cp.costs.phase_tokens || 0;
    byPhase[cp.phase].total_cost_usd += cp.costs.phase_cost_usd || 0;
    byPhase[cp.phase].count++;
  }

  return {
    total_tokens: last.costs?.cumulative_tokens || 0,
    total_cost_usd: last.costs?.cumulative_cost_usd || 0,
    by_phase: byPhase,
  };
}

module.exports = { estimatePhaseCost, trackPhaseCost, checkBudgetCap, getCostSummary };
