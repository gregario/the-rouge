/**
 * V3 Cost tracking — per-phase tokens, cumulative USD, budget cap.
 * Pricing assumes 50/50 input/output token split when falling back to
 * the log-size heuristic; uses real values from Claude's output when
 * available.
 */

const fs = require('fs');

const MODEL_PRICING = {
  opus:   { input_per_m: 15, output_per_m: 75 },
  sonnet: { input_per_m: 3,  output_per_m: 15 },
  haiku:  { input_per_m: 1,  output_per_m: 5 },
};

// Safety margin on the budget cap: if the cumulative cost is within
// this fraction of the cap, refuse to start a new phase. A phase mid-
// flight can easily add a few dollars; without this buffer the cap
// fires AFTER the overrun. 10% matches user expectations that "$100
// cap" means the wallet never closes beyond ~$100, not "$100 + one
// more phase".
const CAP_SAFETY_FRACTION = 0.10;
// Also enforce a minimum absolute margin so tiny caps (e.g. $5) don't
// collapse the safety to cents. The bigger of fractional / absolute.
const CAP_SAFETY_MIN_USD = 2;

function estimatePhaseCost(tokenCount, model) {
  if (tokenCount === 0) return 0;
  const pricing = MODEL_PRICING[model] || MODEL_PRICING.opus;
  const inputTokens = tokenCount / 2;
  const outputTokens = tokenCount / 2;
  return (inputTokens / 1_000_000) * pricing.input_per_m +
         (outputTokens / 1_000_000) * pricing.output_per_m;
}

/**
 * Try to extract the real phase cost from Claude's stream log.
 *
 * Claude Code's CLI, in the default streaming mode, prints per-turn
 * usage like `tokens: 1234 in / 567 out` or a final `Total cost: $X`
 * line. Parse these when present so cost tracking reflects reality
 * instead of a log-size heuristic.
 *
 * Returns { tokens, costUsd } when either is extractable; returns null
 * when nothing parseable was found (caller falls back to heuristic).
 */
function parseRealCostFromLog(logPath) {
  try {
    const content = fs.readFileSync(logPath, 'utf8');
    if (!content) return null;

    // Total-cost line: `Total cost: $1.23` / `total_cost_usd: 1.23` /
    // `"total_cost_usd":1.23` (JSON output). First match from the
    // end wins — we want the FINAL reported cost, not any intermediate
    // per-turn cost.
    const costRe = /(?:Total cost:\s*\$|total_cost_usd"?\s*:\s*)([\d.]+)/gi;
    let costUsd = null;
    let m;
    while ((m = costRe.exec(content)) !== null) {
      const v = parseFloat(m[1]);
      if (!Number.isNaN(v)) costUsd = v;
    }

    // Token-count lines: `input_tokens: 1234` / `output_tokens: 567` /
    // `tokens: 1234 in / 567 out`.
    let inputTokens = 0;
    let outputTokens = 0;
    const inRe = /input_tokens"?\s*:\s*(\d+)|(\d+)\s*in\b/gi;
    const outRe = /output_tokens"?\s*:\s*(\d+)|(\d+)\s*out\b/gi;
    let im;
    while ((im = inRe.exec(content)) !== null) {
      inputTokens += parseInt(im[1] || im[2], 10) || 0;
    }
    while ((im = outRe.exec(content)) !== null) {
      outputTokens += parseInt(im[1] || im[2], 10) || 0;
    }
    const tokens = inputTokens + outputTokens;

    if (costUsd !== null || tokens > 0) {
      return { tokens, costUsd };
    }
    return null;
  } catch {
    return null;
  }
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

/**
 * Version of trackPhaseCost that prefers parsed real cost over the
 * token heuristic. If parseRealCostFromLog returns a real costUsd,
 * use it directly (bypass the estimate). Otherwise fall back to the
 * token-based estimate.
 */
function trackPhaseCostFromLog(state, logPath, fallbackTokens, model) {
  if (!state.costs) {
    state.costs = { cumulative_tokens: 0, cumulative_cost_usd: 0 };
  }
  const real = parseRealCostFromLog(logPath);
  const tokens = real?.tokens || fallbackTokens;
  const cost = (real?.costUsd !== null && real?.costUsd !== undefined)
    ? real.costUsd
    : estimatePhaseCost(tokens, model);
  state.costs.phase_tokens = tokens;
  state.costs.phase_cost_usd = cost;
  state.costs.cumulative_tokens += tokens;
  state.costs.cumulative_cost_usd += cost;
  state.costs.phase_cost_source = real?.costUsd != null
    ? 'parsed'
    : real?.tokens
      ? 'parsed-tokens'
      : 'heuristic';
}

/**
 * Returns true if starting a new phase would risk exceeding the budget
 * cap. Uses a safety margin so the cap fires BEFORE the overrun rather
 * than after. Previously `cumulative >= cap` fired only after a phase
 * had already pushed past — typical phase cost is a few dollars on
 * Opus, so caps could miss by a meaningful amount.
 */
function checkBudgetCap(state, budgetCapUsd) {
  const cumulative = state.costs?.cumulative_cost_usd || 0;
  const margin = Math.max(budgetCapUsd * CAP_SAFETY_FRACTION, CAP_SAFETY_MIN_USD);
  return cumulative >= (budgetCapUsd - margin);
}

/**
 * Strict cap check — true only when the cumulative has actually
 * exceeded the cap. Use for logging / alerting; use `checkBudgetCap`
 * for the pre-phase gate.
 */
function isOverBudget(state, budgetCapUsd) {
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

module.exports = {
  estimatePhaseCost,
  trackPhaseCost,
  trackPhaseCostFromLog,
  parseRealCostFromLog,
  checkBudgetCap,
  isOverBudget,
  getCostSummary,
};
