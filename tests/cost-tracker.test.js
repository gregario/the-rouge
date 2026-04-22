#!/usr/bin/env node
/**
 * Tests for src/launcher/cost-tracker.js
 *
 * Covers the real/estimated split added 2026-04-22 so heuristic-
 * fallback estimates can't trip the budget cap. Stack-rank reached
 * an inflated "budget cap" through heuristic escalation checkpoints;
 * separating the two streams ensures the cap only fires on real spend.
 *
 * Usage: node tests/cost-tracker.test.js
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const {
  trackPhaseCost,
  trackPhaseCostFromLog,
  checkBudgetCap,
  isOverBudget,
} = require('../src/launcher/cost-tracker.js');

let failures = 0;
let checks = 0;

function assert(condition, message) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${message}`);
  }
}

function writeTempLog(content) {
  const p = path.join(os.tmpdir(), 'cost-test-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.log');
  fs.writeFileSync(p, content);
  return p;
}

function testTrackPhaseCostIsEstimated() {
  const state = {};
  trackPhaseCost(state, 100000, 'opus');
  assert(state.costs.phase_cost_source === 'estimated', 'trackPhaseCost labels as estimated');
  assert(state.costs.cumulative_cost_usd_estimated > 0, 'estimated cumulative accrues');
  assert(state.costs.cumulative_cost_usd_real === 0, 'real cumulative stays at 0');
  assert(state.costs.cumulative_cost_usd === state.costs.cumulative_cost_usd_estimated, 'total = estimated');
}

function testParsedCostIsRealNotEstimated() {
  const state = {};
  const log = writeTempLog('blah blah\nTotal cost: $1.50\ndone\n');
  trackPhaseCostFromLog(state, log, 10000, 'opus');
  fs.unlinkSync(log);
  assert(state.costs.phase_cost_source === 'parsed', 'parsed from log → source=parsed');
  assert(state.costs.cumulative_cost_usd_real === 1.50, 'real cumulative = 1.50');
  assert(state.costs.cumulative_cost_usd_estimated === 0, 'estimated stays 0');
  assert(state.costs.cumulative_cost_usd === 1.50, 'total = real in this case');
}

function testParsedTokensIsRealAtPricedRate() {
  const state = {};
  const log = writeTempLog('input_tokens: 1000000\noutput_tokens: 1000000\n');
  trackPhaseCostFromLog(state, log, 10000, 'opus');
  fs.unlinkSync(log);
  assert(state.costs.phase_cost_source === 'parsed-tokens', 'tokens-only parse → parsed-tokens');
  // 1M input * 15 + 1M output * 75 = 90
  assert(state.costs.cumulative_cost_usd_real === 90, 'real cumulative prices parsed tokens');
  assert(state.costs.cumulative_cost_usd_estimated === 0, 'estimated stays 0');
}

function testHeuristicFallbackIsEstimated() {
  const state = {};
  const log = writeTempLog('nothing parseable here\n');
  trackPhaseCostFromLog(state, log, 100000, 'opus');
  fs.unlinkSync(log);
  assert(state.costs.phase_cost_source === 'heuristic', 'unparseable log → heuristic');
  assert(state.costs.cumulative_cost_usd_estimated > 0, 'estimated cumulative accrues');
  assert(state.costs.cumulative_cost_usd_real === 0, 'real stays 0 on heuristic');
}

function testCapEnforcesOnRealNotEstimated() {
  // The pathological case: lots of heuristic "cost" but no real LLM spend.
  // Cap at $10, heuristic = $500 (testimonial shape), real = $2.
  const state = { costs: { cumulative_cost_usd: 502, cumulative_cost_usd_real: 2, cumulative_cost_usd_estimated: 500 } };
  assert(checkBudgetCap(state, 10) === false, 'cap not tripped by phantom heuristic spend');
  assert(isOverBudget(state, 10) === false, 'isOverBudget = false (real < cap)');
}

function testCapEnforcesWhenRealExceeds() {
  const state = { costs: { cumulative_cost_usd: 95, cumulative_cost_usd_real: 95, cumulative_cost_usd_estimated: 0 } };
  assert(checkBudgetCap(state, 100) === true, 'cap trips within safety margin on real spend');
  assert(isOverBudget(state, 90) === true, 'isOverBudget at 95 > cap 90');
}

function testLegacyStateFallsBackToTotal() {
  // Pre-split state.json has no _real / _estimated fields.
  const state = { costs: { cumulative_cost_usd: 95 } };
  assert(checkBudgetCap(state, 100) === true, 'legacy: falls back to total');
}

function testMultiplePhasesAccumulate() {
  const state = {};
  const log1 = writeTempLog('Total cost: $2.00\n');
  const log2 = writeTempLog('Total cost: $3.50\n');
  const logH = writeTempLog('no parseable content\n');
  trackPhaseCostFromLog(state, log1, 10000, 'opus');
  trackPhaseCostFromLog(state, log2, 10000, 'opus');
  trackPhaseCostFromLog(state, logH, 50000, 'opus');
  fs.unlinkSync(log1); fs.unlinkSync(log2); fs.unlinkSync(logH);
  assert(state.costs.cumulative_cost_usd_real === 5.5, 'real sums two parsed phases');
  assert(state.costs.cumulative_cost_usd_estimated > 0, 'estimated from heuristic phase');
  assert(
    Math.abs(state.costs.cumulative_cost_usd - (state.costs.cumulative_cost_usd_real + state.costs.cumulative_cost_usd_estimated)) < 0.0001,
    'total = real + estimated (floating tolerance)',
  );
}

function main() {
  console.log('cost-tracker real/estimated split');
  testTrackPhaseCostIsEstimated();
  testParsedCostIsRealNotEstimated();
  testParsedTokensIsRealAtPricedRate();
  testHeuristicFallbackIsEstimated();
  testCapEnforcesOnRealNotEstimated();
  testCapEnforcesWhenRealExceeds();
  testLegacyStateFallsBackToTotal();
  testMultiplePhasesAccumulate();
  console.log(`  ${checks} checks, ${failures} failures`);
  if (failures > 0) {
    console.error('FAIL');
    process.exit(1);
  }
  console.log('PASS');
}

main();
