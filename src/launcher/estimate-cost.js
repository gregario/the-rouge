#!/usr/bin/env node
/**
 * Rouge Cost Estimation Engine
 *
 * After spec generation, estimates total loop cost with low/mid/high bounds.
 * Calibrated from real countdowntimer E2E data (2026-03-23).
 *
 * Usage:
 *   node estimate-cost.js <project-dir>              # Estimate from spec
 *   node estimate-cost.js <project-dir> --actual      # Report actual cost from logs
 *
 * Inputs: feature area count, screen count, acceptance criteria count
 * Outputs: estimated cycles, token usage, cost in USD
 */

const fs = require('fs');
const path = require('path');
const { statePath } = require('./state-path.js');

const PROJECT_DIR = process.argv[2];
const ACTUAL_MODE = process.argv.includes('--actual');

if (!PROJECT_DIR) {
  console.error('Usage: node estimate-cost.js <project-dir> [--actual]');
  process.exit(1);
}

// --- Calibration data (V3 phase names) ---
// Average opus minutes per phase (calibrated from countdowntimer retro,
// re-mapped to V3 state machine phases per STATE_TO_PROMPT in rouge-loop.js).
const PHASE_MINUTES = {
  'foundation': 15.0,            // foundation-building (longer than a story build)
  'foundation-eval': 8.0,       // foundation evaluation
  'story-building': 10.1,       // was: building
  'milestone-check': 12.0,      // was: qa-gate + po-review-* (evaluation orchestrator in V3)
  'milestone-fix': 8.0,         // fix cycle after milestone evaluation
  'analyzing': 3.9,             // unchanged
  'generating-change-spec': 3.0, // unchanged
  'vision-check': 2.8,          // was: vision-checking
  'shipping': 4.1,              // was: promoting
  'final-review': 5.0,          // new in V3 (post-ship verification)
};

// Token estimates per minute of opus runtime (empirical)
// Opus: ~1-2K input tokens/min (reading context), ~0.5-1K output tokens/min
const TOKENS_PER_MINUTE = {
  input: 1500,
  output: 750,
};

// Pricing (USD per million tokens)
const PRICING = {
  opus: { input: 15, output: 75 },
  sonnet: { input: 3, output: 15 },
  haiku: { input: 0.25, output: 1.25 },
};

// Retry/waste multiplier from retro (successful runs / total runs)
// countdowntimer: 19 successful out of 119 total, but 95 were rate limits
// Excluding rate limits: 19 successful out of 24 = 0.79 efficiency
// With smart backoff fix: ~0.9 efficiency expected
let WASTE_MULTIPLIER = 1.15; // 15% overhead for retries/timeouts

// --- Complexity estimation ---

function estimateCycles(featureAreas, criteria, screens) {
  // Base: 1 cycle to build + 1 refinement cycle
  let cycles = 2;

  // More feature areas = more build cycles (if decomposed)
  if (featureAreas > 10) cycles += Math.ceil((featureAreas - 10) / 5);

  // More criteria = more likely to need refinement
  if (criteria > 50) cycles += 1;
  if (criteria > 100) cycles += 1;

  // Screens affect QA time but not cycle count directly

  return { low: Math.max(1, cycles - 1), mid: cycles, high: cycles + 2 };
}

function estimatePhaseMinutes(featureAreas, screens) {
  // Scale certain phases by project size
  const scale = Math.max(1, Math.sqrt(screens / 6)); // sqrt scaling from 6-screen baseline

  return {
    building: PHASE_MINUTES.building * Math.max(1, featureAreas / 6),
    'test-integrity': PHASE_MINUTES['test-integrity'] * scale,
    'qa-gate': PHASE_MINUTES['qa-gate'] * scale,
    'po-review-journeys': PHASE_MINUTES['po-review-journeys'] * scale,
    'po-review-screens': PHASE_MINUTES['po-review-screens'] * Math.max(1, screens / 6),
    'po-review-heuristics': PHASE_MINUTES['po-review-heuristics'] * scale,
    analyzing: PHASE_MINUTES.analyzing,
    'vision-checking': PHASE_MINUTES['vision-checking'],
    promoting: PHASE_MINUTES.promoting,
    'generating-change-spec': PHASE_MINUTES['generating-change-spec'],
  };
}

function calculateCost(totalMinutes, model = 'opus') {
  const inputTokens = totalMinutes * TOKENS_PER_MINUTE.input;
  const outputTokens = totalMinutes * TOKENS_PER_MINUTE.output;
  const price = PRICING[model];

  return {
    inputTokens: Math.round(inputTokens),
    outputTokens: Math.round(outputTokens),
    inputCost: (inputTokens / 1_000_000) * price.input,
    outputCost: (outputTokens / 1_000_000) * price.output,
    totalCost: ((inputTokens / 1_000_000) * price.input) + ((outputTokens / 1_000_000) * price.output),
  };
}

// --- Calibration file ---
const CALIBRATION_FILE = path.join(__dirname, '../../.calibration.json');

function loadCalibration() {
  try {
    const data = JSON.parse(fs.readFileSync(CALIBRATION_FILE, 'utf8'));
    // Override defaults with calibrated values
    if (data.phase_minutes) Object.assign(PHASE_MINUTES, data.phase_minutes);
    if (data.waste_multiplier) WASTE_MULTIPLIER = data.waste_multiplier;
    return data;
  } catch {
    return null;
  }
}

function saveCalibration(phaseData, wasteData) {
  const existing = loadCalibration() || {};
  const calibration = {
    ...existing,
    phase_minutes: phaseData,
    waste_multiplier: wasteData,
    calibrated_at: new Date().toISOString(),
    calibrated_from: path.basename(PROJECT_DIR),
  };
  fs.writeFileSync(CALIBRATION_FILE, JSON.stringify(calibration, null, 2) + '\n');
  return calibration;
}

// --- Actual cost calculation from logs ---

function calculateActualCost() {
  const { getLogFile } = require('./logger.js');
  const projectName = path.basename(PROJECT_DIR);
  const logFile = getLogFile();

  if (!fs.existsSync(logFile)) {
    console.error('No rouge.log found');
    process.exit(1);
  }

  const content = fs.readFileSync(logFile, 'utf8');
  const lines = content.split('\n');

  const phaseRuns = {};
  let currentStart = {};

  for (const line of lines) {
    const tsMatch = line.match(/\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})Z\]/);
    if (!tsMatch) continue;
    const ts = new Date(tsMatch[1] + 'Z');

    const startMatch = line.match(/\[(\w[\w-]*)\] Running phase: ([\w-]+)/);
    if (startMatch && startMatch[1] === projectName) {
      currentStart[startMatch[2]] = ts;
      continue;
    }

    const compMatch = line.match(/\[(\w[\w-]*)\] Phase ([\w-]+) completed/);
    if (compMatch && compMatch[1] === projectName && currentStart[compMatch[2]]) {
      const phase = compMatch[2];
      const duration = (ts - currentStart[phase]) / 1000 / 60; // minutes
      if (!phaseRuns[phase]) phaseRuns[phase] = [];
      phaseRuns[phase].push(duration);
      delete currentStart[phase];
    }
  }

  // Calculate averages
  const phaseAvgs = {};
  let totalCompletedMinutes = 0;
  let totalCompletedRuns = 0;

  console.log('═'.repeat(60));
  console.log(`ACTUAL COST REPORT — ${projectName}`);
  console.log('═'.repeat(60));

  console.log('\nPhase Actuals:');
  for (const [phase, durations] of Object.entries(phaseRuns).sort()) {
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    phaseAvgs[phase] = parseFloat(avg.toFixed(1));
    totalCompletedMinutes += durations.reduce((a, b) => a + b, 0);
    totalCompletedRuns += durations.length;
    console.log(`  ${phase.padEnd(25)} avg ${avg.toFixed(1)}m (${durations.length} runs, total ${durations.reduce((a,b) => a+b, 0).toFixed(0)}m)`);
  }

  // Count waste (rate limits, timeouts)
  const rateLimits = (content.match(/Rate limited/g) || []).length;
  const timeouts = (content.match(/timeout.*killing|killed.*ceiling/gi) || []).length;
  const totalRuns = (content.match(new RegExp(`\\[${projectName}\\] Running phase`, 'g')) || []).length;
  const wasteRuns = totalRuns - totalCompletedRuns;
  const efficiency = totalCompletedRuns / totalRuns;

  console.log(`\nEfficiency:`);
  console.log(`  Total runs: ${totalRuns}`);
  console.log(`  Completed: ${totalCompletedRuns}`);
  console.log(`  Rate limited: ${rateLimits}`);
  console.log(`  Timed out: ${timeouts}`);
  console.log(`  Efficiency: ${(efficiency * 100).toFixed(0)}%`);
  console.log(`  Waste multiplier: ${(1 / efficiency).toFixed(2)}x`);

  const totalOpusMinutes = totalCompletedMinutes;
  const cost = calculateCost(totalOpusMinutes, 'opus');

  console.log(`\nActual Cost (completed phases only):`);
  console.log(`  Opus minutes: ${totalOpusMinutes.toFixed(0)} min`);
  console.log(`  Input:  ${(cost.inputTokens / 1000).toFixed(0)}K tokens  $${cost.inputCost.toFixed(2)}`);
  console.log(`  Output: ${(cost.outputTokens / 1000).toFixed(0)}K tokens  $${cost.outputCost.toFixed(2)}`);
  console.log(`  TOTAL:  $${cost.totalCost.toFixed(2)}`);

  // Save calibration
  const wasteMultiplier = parseFloat((1 / efficiency).toFixed(2));
  saveCalibration(phaseAvgs, wasteMultiplier);
  console.log(`\nCalibration saved to ${CALIBRATION_FILE}`);
  console.log('Future estimates will use these actuals as the baseline.');
  console.log('═'.repeat(60));
}

// --- Main ---

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

// Load calibration if available (overrides hardcoded defaults)
loadCalibration();

if (ACTUAL_MODE) {
  calculateActualCost();
  process.exit(0);
}

const ctx = readJson(path.join(PROJECT_DIR, 'cycle_context.json'));
const state = readJson(statePath(PROJECT_DIR));

if (!ctx && !state) {
  console.error('No cycle_context.json or state.json found');
  process.exit(1);
}

const projectName = state?.name || path.basename(PROJECT_DIR);
const featureAreas = (state?.feature_areas || []).length || 1;
const criteria = (ctx?.active_spec || []).length || 0;
const screens = ctx?.vision?.screens?.length || featureAreas; // fallback to feature areas

console.log('═'.repeat(60));
console.log(`ROUGE COST ESTIMATE — ${projectName}`);
console.log('═'.repeat(60));

console.log(`\nProject Profile:`);
console.log(`  Feature areas: ${featureAreas}`);
console.log(`  Acceptance criteria: ${criteria}`);
console.log(`  Estimated screens: ${screens}`);

const cycles = estimateCycles(featureAreas, criteria, screens);
const phaseMinutes = estimatePhaseMinutes(featureAreas, screens);
const cycleMinutes = Object.values(phaseMinutes).reduce((a, b) => a + b, 0);

console.log(`\nCycle Estimate:`);
console.log(`  Minutes per cycle: ${cycleMinutes.toFixed(0)} min`);
console.log(`  Cycles: ${cycles.low} (low) / ${cycles.mid} (mid) / ${cycles.high} (high)`);
console.log(`  Waste multiplier: ${WASTE_MULTIPLIER}x`);

console.log(`\nPer-Phase Breakdown:`);
for (const [phase, mins] of Object.entries(phaseMinutes)) {
  console.log(`  ${phase.padEnd(25)} ${mins.toFixed(1)} min`);
}

console.log(`\n${'─'.repeat(60)}`);
console.log('COST ESTIMATES (Opus)');
console.log('─'.repeat(60));

for (const [label, numCycles] of [['Low', cycles.low], ['Mid', cycles.mid], ['High', cycles.high]]) {
  const totalMinutes = cycleMinutes * numCycles * WASTE_MULTIPLIER;
  const cost = calculateCost(totalMinutes, 'opus');
  console.log(`\n  ${label} (${numCycles} cycles, ${totalMinutes.toFixed(0)} min opus):`);
  console.log(`    Input:  ${(cost.inputTokens / 1000).toFixed(0)}K tokens  $${cost.inputCost.toFixed(2)}`);
  console.log(`    Output: ${(cost.outputTokens / 1000).toFixed(0)}K tokens  $${cost.outputCost.toFixed(2)}`);
  console.log(`    TOTAL:  $${cost.totalCost.toFixed(2)}`);
}

// Comparison: what if we used haiku for simple phases?
console.log(`\n${'─'.repeat(60)}`);
console.log('OPTIMISED COST (Haiku for simple phases + Opus for complex)');
console.log('─'.repeat(60));

const opusPhases = ['building', 'qa-gate', 'po-review-journeys', 'po-review-screens'];
const haikuPhases = ['test-integrity', 'po-review-heuristics', 'analyzing', 'vision-checking', 'promoting', 'generating-change-spec'];

const opusMins = Object.entries(phaseMinutes)
  .filter(([p]) => opusPhases.includes(p))
  .reduce((a, [, m]) => a + m, 0);
const haikuMins = Object.entries(phaseMinutes)
  .filter(([p]) => haikuPhases.includes(p))
  .reduce((a, [, m]) => a + m, 0);

for (const [label, numCycles] of [['Low', cycles.low], ['Mid', cycles.mid], ['High', cycles.high]]) {
  const opusTotal = opusMins * numCycles * WASTE_MULTIPLIER;
  const haikuTotal = haikuMins * numCycles * WASTE_MULTIPLIER;
  const opusCost = calculateCost(opusTotal, 'opus');
  const haikuCost = calculateCost(haikuTotal, 'haiku');
  const total = opusCost.totalCost + haikuCost.totalCost;
  const savings = ((calculateCost((opusMins + haikuMins) * numCycles * WASTE_MULTIPLIER, 'opus').totalCost - total) / calculateCost((opusMins + haikuMins) * numCycles * WASTE_MULTIPLIER, 'opus').totalCost * 100);
  console.log(`\n  ${label} (${numCycles} cycles): $${total.toFixed(2)} (${savings.toFixed(0)}% savings vs all-opus)`);
}

// Freelancer comparison
console.log(`\n${'─'.repeat(60)}`);
console.log('COMPARISON: Human Equivalent');
console.log('─'.repeat(60));

const midMinutes = cycleMinutes * cycles.mid;
const humanHours = midMinutes / 60;
const rates = { junior: 50, mid: 100, senior: 175, agency: 250 };
console.log(`\n  Estimated dev time: ${humanHours.toFixed(0)} hours (mid estimate)`);
for (const [level, rate] of Object.entries(rates)) {
  console.log(`  ${level.padEnd(10)} $${rate}/hr  = $${(humanHours * rate).toFixed(0)}`);
}

const midCost = calculateCost(cycleMinutes * cycles.mid * WASTE_MULTIPLIER, 'opus');
console.log(`\n  Rouge (opus, mid): $${midCost.totalCost.toFixed(2)}`);
console.log(`  vs junior dev:     ${((midCost.totalCost / (humanHours * rates.junior)) * 100).toFixed(1)}% of the cost`);
console.log(`  vs senior dev:     ${((midCost.totalCost / (humanHours * rates.senior)) * 100).toFixed(1)}% of the cost`);

console.log('\n' + '═'.repeat(60));
