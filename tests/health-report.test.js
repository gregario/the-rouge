#!/usr/bin/env node
/**
 * Tests for src/launcher/health-report.js
 *
 * Uses a temp "projects dir" with synthesised state.json +
 * phase-fingerprints.jsonl to verify the aggregation logic.
 *
 * Usage: node tests/health-report.test.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildReport, formatReport, fingerprintRepeats, summariseEscalations } = require('../src/launcher/health-report.js');

let failures = 0;
let checks = 0;

function assert(condition, message) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${message}`);
  }
}

function makeProject(projectsDir, name, state, fingerprints) {
  const dir = path.join(projectsDir, name);
  const rougeDir = path.join(dir, '.rouge');
  fs.mkdirSync(rougeDir, { recursive: true });
  fs.writeFileSync(path.join(rougeDir, 'state.json'), JSON.stringify(state));
  if (fingerprints && fingerprints.length) {
    fs.writeFileSync(
      path.join(dir, 'phase-fingerprints.jsonl'),
      fingerprints.map((e) => JSON.stringify(e)).join('\n') + '\n',
    );
  }
}

function testEmptyProjectsDir() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'health-'));
  try {
    const report = buildReport({ projectsDir: tmp });
    assert(report.fleet.project_count === 0, 'empty dir → 0 projects');
    assert(report.projects.length === 0, 'no project entries');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

function testHealthyProject() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'health-'));
  try {
    makeProject(tmp, 'happy', { current_state: 'story-building', budget_cap_usd: 100, costs: { cumulative_cost_usd_real: 5.5, cumulative_cost_usd_estimated: 0 } }, []);
    const report = buildReport({ projectsDir: tmp });
    assert(report.fleet.project_count === 1, '1 project found');
    assert(report.fleet.stuck_project_count === 0, 'no stuck projects');
    assert(report.fleet.cumulative_cost_usd_real === 5.5, 'fleet spend aggregated');
    assert(report.projects[0].early_warnings.length === 0, 'no early warnings');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

function testSpinningProjectFlagged() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'health-'));
  try {
    const fps = [
      { phase: 'foundation-eval', ts: '2026-04-22T10:00:00Z', fingerprint: 'abc', verdict: 'FAIL' },
      { phase: 'foundation-eval', ts: '2026-04-22T10:01:00Z', fingerprint: 'abc', verdict: 'FAIL' },
    ];
    makeProject(tmp, 'spinner', { current_state: 'foundation-eval' }, fps);
    const report = buildReport({ projectsDir: tmp, spinWarnThreshold: 2 });
    assert(report.fleet.stuck_project_count === 1, 'spinning project counted as stuck');
    assert(report.projects[0].early_warnings.length === 1, 'one early warning');
    assert(report.projects[0].early_warnings[0].repeats === 2, 'warning counts 2 identical');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

function testEscalationHistogramAggregates() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'health-'));
  try {
    makeProject(tmp, 'a', {
      current_state: 'escalation',
      escalations: [
        { id: '1', classification: 'semantic-spin', status: 'pending', summary: 'stuck' },
        { id: '2', classification: 'budget-exceeded', status: 'resolved' },
      ],
    });
    makeProject(tmp, 'b', {
      current_state: 'escalation',
      escalations: [
        { id: '3', classification: 'semantic-spin', status: 'pending', summary: 'also stuck' },
      ],
    });
    const report = buildReport({ projectsDir: tmp });
    assert(report.fleet.escalation_histogram['semantic-spin'] === 2, 'semantic-spin count aggregated across projects');
    assert(report.fleet.escalation_histogram['budget-exceeded'] === 1, 'budget-exceeded counted');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

function testFingerprintRepeatCounting() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'health-'));
  try {
    const fps = [
      { phase: 'foundation-eval', fingerprint: 'A' },
      { phase: 'foundation-eval', fingerprint: 'B' },
      { phase: 'foundation-eval', fingerprint: 'C' },
      { phase: 'foundation-eval', fingerprint: 'C' },
      { phase: 'foundation-eval', fingerprint: 'C' },
      { phase: 'milestone-check', fingerprint: 'X' },
    ];
    makeProject(tmp, 'proj', { current_state: 'foundation-eval' }, fps);
    const result = fingerprintRepeats(tmp, 'proj');
    assert(result['foundation-eval'].repeats === 3, 'foundation-eval trailing 3 identical');
    assert(result['milestone-check'].repeats === 1, 'milestone-check has 1 entry');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

function testFormatReportIsReadable() {
  const report = {
    generated_at: '2026-04-22T10:00:00Z',
    projects_dir: '/tmp/projects',
    projects: [
      {
        name: 'stack-rank',
        state: 'foundation-eval',
        budget_cap_usd: 100,
        cumulative_cost_usd: 90,
        cumulative_cost_usd_real: 90,
        cumulative_cost_usd_estimated: 0,
        escalations: { byClass: { 'semantic-spin': 1 }, pending: [{ id: '1', classification: 'semantic-spin', summary: 'stuck at foundation-eval' }], total: 1 },
        fingerprint_repeats: { 'foundation-eval': { repeats: 5, last_verdict: 'FAIL' } },
        early_warnings: [{ phase: 'foundation-eval', repeats: 5, last_verdict: 'FAIL' }],
      },
    ],
    fleet: {
      project_count: 1,
      stuck_project_count: 1,
      stuck_projects: ['stack-rank'],
      escalation_histogram: { 'semantic-spin': 1 },
      cumulative_cost_usd_real: 90,
      cumulative_cost_usd_estimated: 0,
      self_heal: { applied: 0, drafted: 0, refused: 0, reverted: 0, total: 0 },
    },
  };
  const text = formatReport(report);
  assert(text.includes('stack-rank'), 'project name in output');
  assert(text.includes('Escalation histogram'), 'histogram header present');
  assert(text.includes('5 identical cycles'), 'warning line rendered');
}

function main() {
  console.log('health-report');
  testEmptyProjectsDir();
  testHealthyProject();
  testSpinningProjectFlagged();
  testEscalationHistogramAggregates();
  testFingerprintRepeatCounting();
  testFormatReportIsReadable();
  console.log(`  ${checks} checks, ${failures} failures`);
  if (failures > 0) {
    console.error('FAIL');
    process.exit(1);
  }
  console.log('PASS');
}

main();
