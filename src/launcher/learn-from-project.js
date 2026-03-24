#!/usr/bin/env node
/**
 * Cross-Product Learning — extract lessons from a completed project
 * into the personal Library layer.
 *
 * Reads cycle_context.json, state.json, and logs to extract:
 * - Phase timing calibration (actual vs estimated)
 * - Quality patterns (what scores well, what doesn't)
 * - Heuristic overrides (global heuristics that don't match user's taste)
 * - Process patterns (what phases need more/less time)
 *
 * Usage: node learn-from-project.js <project-dir>
 *
 * Output: writes/updates files in library/personal/
 */

const fs = require('fs');
const path = require('path');

const ROUGE_ROOT = path.resolve(__dirname, '../..');
const PERSONAL_DIR = path.join(ROUGE_ROOT, 'library', 'personal');
const LOG_DIR = path.join(ROUGE_ROOT, 'logs');

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function writeJson(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, filePath);
}

const PROJECT_DIR = process.argv[2];
if (!PROJECT_DIR) {
  console.error('Usage: node learn-from-project.js <project-dir>');
  process.exit(1);
}

const projectName = path.basename(PROJECT_DIR);
const ctx = readJson(path.join(PROJECT_DIR, 'cycle_context.json'));
const state = readJson(path.join(PROJECT_DIR, 'state.json'));

if (!ctx || !state) {
  console.error('No cycle_context.json or state.json found');
  process.exit(1);
}

console.log(`Learning from: ${projectName}`);
fs.mkdirSync(PERSONAL_DIR, { recursive: true });

// --- 1. Phase timing patterns ---

const timingFile = path.join(PERSONAL_DIR, 'phase-timing.json');
const timing = readJson(timingFile) || { projects: {}, averages: {} };

// Parse phase durations from logs
const logFile = path.join(LOG_DIR, 'rouge.log');
if (fs.existsSync(logFile)) {
  const content = fs.readFileSync(logFile, 'utf8');
  const phaseRuns = {};

  const lines = content.split('\n');
  const startTimes = {};

  for (const line of lines) {
    const tsMatch = line.match(/\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})Z\]/);
    if (!tsMatch) continue;
    const ts = new Date(tsMatch[1] + 'Z');

    const startMatch = line.match(new RegExp(`\\[${projectName}\\] Running phase: ([\\w-]+)`));
    if (startMatch) {
      startTimes[startMatch[1]] = ts;
      continue;
    }

    const compMatch = line.match(new RegExp(`\\[${projectName}\\] Phase ([\\w-]+) completed`));
    if (compMatch && startTimes[compMatch[1]]) {
      const phase = compMatch[1];
      const duration = (ts - startTimes[phase]) / 1000 / 60;
      if (!phaseRuns[phase]) phaseRuns[phase] = [];
      phaseRuns[phase].push(parseFloat(duration.toFixed(1)));
      delete startTimes[phase];
    }
  }

  timing.projects[projectName] = {
    phases: phaseRuns,
    recorded_at: new Date().toISOString(),
  };

  // Recalculate averages across all projects
  const allPhases = {};
  for (const proj of Object.values(timing.projects)) {
    for (const [phase, durations] of Object.entries(proj.phases || {})) {
      if (!allPhases[phase]) allPhases[phase] = [];
      allPhases[phase].push(...durations);
    }
  }
  timing.averages = {};
  for (const [phase, durations] of Object.entries(allPhases)) {
    timing.averages[phase] = {
      avg: parseFloat((durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1)),
      min: parseFloat(Math.min(...durations).toFixed(1)),
      max: parseFloat(Math.max(...durations).toFixed(1)),
      samples: durations.length,
    };
  }

  writeJson(timingFile, timing);
  console.log(`  Phase timing: ${Object.keys(phaseRuns).length} phases recorded`);
}

// --- 2. Quality patterns ---

const qualityFile = path.join(PERSONAL_DIR, 'quality-patterns.json');
const quality = readJson(qualityFile) || { projects: {}, patterns: [] };

const projectQuality = {
  health_scores: [],
  confidence_scores: [],
  common_findings: {},
  recorded_at: new Date().toISOString(),
};

// Extract from evaluation reports
if (ctx.qa_report?.health_score) {
  projectQuality.health_scores.push(ctx.qa_report.health_score);
}
if (ctx.po_review_report?.confidence) {
  projectQuality.confidence_scores.push(ctx.po_review_report.confidence);
}
if (ctx.evaluation_report?.health_score) {
  projectQuality.health_scores.push(ctx.evaluation_report.health_score);
}

// Track recurring finding categories
const findings = [
  ...(ctx.qa_report?.fix_tasks || []),
  ...(ctx.evaluation_report?.qa?.fix_tasks || []),
];
for (const f of findings) {
  const cat = f.source || 'unknown';
  projectQuality.common_findings[cat] = (projectQuality.common_findings[cat] || 0) + 1;
}

// Confidence history from state
if (state.confidence_history) {
  for (const entry of state.confidence_history) {
    if (entry.confidence) projectQuality.confidence_scores.push(entry.confidence);
  }
}

quality.projects[projectName] = projectQuality;

// Detect patterns across projects
const allFindings = {};
for (const proj of Object.values(quality.projects)) {
  for (const [cat, count] of Object.entries(proj.common_findings || {})) {
    allFindings[cat] = (allFindings[cat] || 0) + count;
  }
}
quality.patterns = Object.entries(allFindings)
  .sort(([, a], [, b]) => b - a)
  .map(([category, count]) => ({ category, count, projects: Object.keys(quality.projects).length }));

writeJson(qualityFile, quality);
console.log(`  Quality patterns: ${findings.length} findings recorded`);

// --- 3. Heuristic performance ---

const heuristicsFile = path.join(PERSONAL_DIR, 'heuristic-performance.json');
const heuristics = readJson(heuristicsFile) || { heuristics: {} };

const heuristicResults = ctx.po_review_report?.heuristic_results || ctx.evaluation_report?.po?.heuristic_results;
if (heuristicResults?.details) {
  for (const h of heuristicResults.details) {
    const id = h.id || h.name;
    if (!id) continue;
    if (!heuristics.heuristics[id]) {
      heuristics.heuristics[id] = { pass: 0, fail: 0, projects: [] };
    }
    if (h.passed || h.status === 'pass') {
      heuristics.heuristics[id].pass++;
    } else {
      heuristics.heuristics[id].fail++;
    }
    if (!heuristics.heuristics[id].projects.includes(projectName)) {
      heuristics.heuristics[id].projects.push(projectName);
    }
  }
  writeJson(heuristicsFile, heuristics);
  console.log(`  Heuristic performance: ${Object.keys(heuristics.heuristics).length} heuristics tracked`);
} else {
  console.log('  Heuristic performance: no detailed results available');
}

// --- 4. Process observations ---

const processFile = path.join(PERSONAL_DIR, 'process-observations.json');
const processObs = readJson(processFile) || { observations: [] };

// Extract from evaluator_observations
if (ctx.evaluator_observations) {
  for (const obs of ctx.evaluator_observations) {
    processObs.observations.push({
      project: projectName,
      observation: typeof obs === 'string' ? obs : obs.text || JSON.stringify(obs),
      timestamp: new Date().toISOString(),
    });
  }
}

// Keep last 100 observations
if (processObs.observations.length > 100) {
  processObs.observations = processObs.observations.slice(-100);
}

writeJson(processFile, processObs);
console.log(`  Process observations: ${ctx.evaluator_observations?.length || 0} new observations`);

// --- Summary ---

console.log(`\nLearning complete. Personal library updated:`);
console.log(`  ${PERSONAL_DIR}/phase-timing.json`);
console.log(`  ${PERSONAL_DIR}/quality-patterns.json`);
console.log(`  ${PERSONAL_DIR}/heuristic-performance.json`);
console.log(`  ${PERSONAL_DIR}/process-observations.json`);
console.log(`\nThese files calibrate future projects. Product #${Object.keys(timing.projects).length + 1} will benefit from these learnings.`);
