#!/usr/bin/env node
/**
 * Tests for src/launcher/self-heal-zones.js
 *
 * Zone enforcement is the guardrail for the self-heal subsystem.
 * These tests are deliberately adversarial — the goal is to prove
 * that the classifier refuses to auto-apply anything that might
 * modify safety mechanisms, prompts, or agentic side-effects.
 *
 * Usage: node tests/self-heal-zones.test.js
 */

const { classifyPlan, canAutoApply, MAX_GREEN_LINES, RED_FILES } = require('../src/launcher/self-heal-zones.js');

let failures = 0;
let checks = 0;

function assert(condition, message) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${message}`);
  }
}

function testSimpleLauncherFixIsGreen() {
  const plan = {
    kind: 'add-enum-value',
    files: [{ path: 'src/launcher/rouge-loop.js', added_lines: 1, removed_lines: 0 }],
  };
  const result = classifyPlan(plan);
  assert(result.zone === 'green', 'small launcher fix → green');
  assert(canAutoApply(plan) === true, 'canAutoApply true');
}

function testSafetyModuleRedZone() {
  for (const file of RED_FILES) {
    const plan = {
      kind: 'anything',
      files: [{ path: file, added_lines: 1, removed_lines: 0 }],
    };
    const result = classifyPlan(plan);
    assert(result.zone === 'red', `${file} → red`);
    assert(canAutoApply(plan) === false, `${file} never auto-applies`);
  }
}

function testPromptChangeIsRed() {
  const plan = {
    kind: 'edit-prompt',
    files: [{ path: 'src/prompts/loop/00-foundation-building.md', added_lines: 5, removed_lines: 2 }],
  };
  const result = classifyPlan(plan);
  assert(result.zone === 'red', 'prompt change → red');
}

function testSchemaChangeIsYellow() {
  const plan = {
    kind: 'add-enum-value',
    files: [{ path: 'schemas/state.json', added_lines: 1, removed_lines: 0 }],
  };
  const result = classifyPlan(plan);
  assert(result.zone === 'yellow', 'schema change → yellow (review required)');
}

function testLibraryIntegrationIsYellow() {
  const plan = {
    kind: 'add-manifest',
    files: [{ path: 'library/integrations/tier-2/netlify/manifest.json', added_lines: 20, removed_lines: 0 }],
  };
  const result = classifyPlan(plan);
  assert(result.zone === 'yellow', 'new catalog manifest → yellow');
}

function testDashboardChangeIsYellow() {
  const plan = {
    kind: 'fix-ui',
    files: [{ path: 'dashboard/src/components/foo.tsx', added_lines: 5, removed_lines: 2 }],
  };
  const result = classifyPlan(plan);
  assert(result.zone === 'yellow', 'dashboard change → yellow');
}

function testLargeChangeIsYellow() {
  const plan = {
    kind: 'refactor',
    files: [{ path: 'src/launcher/rouge-loop.js', added_lines: 50, removed_lines: 20 }],
  };
  const result = classifyPlan(plan);
  assert(result.zone === 'yellow', 'big change (50+20 > 30) → yellow');
}

function testBoundaryAtMaxGreenLines() {
  const plan = {
    kind: 'fix',
    files: [{ path: 'src/launcher/rouge-loop.js', added_lines: MAX_GREEN_LINES, removed_lines: 0 }],
  };
  const result = classifyPlan(plan);
  assert(result.zone === 'green', `exactly ${MAX_GREEN_LINES} lines → green`);
  const over = {
    kind: 'fix',
    files: [{ path: 'src/launcher/rouge-loop.js', added_lines: MAX_GREEN_LINES + 1, removed_lines: 0 }],
  };
  assert(classifyPlan(over).zone === 'yellow', 'one line over → yellow');
}

function testMultiFileIsYellow() {
  const plan = {
    kind: 'multi-file-fix',
    files: [
      { path: 'src/launcher/rouge-loop.js', added_lines: 1, removed_lines: 0 },
      { path: 'src/launcher/cost-tracker.js', added_lines: 1, removed_lines: 0 },
    ],
  };
  const result = classifyPlan(plan);
  assert(result.zone === 'yellow', 'multi-file → yellow (even if all green-zone paths)');
}

function testNonLauncherJsIsYellow() {
  const plan = {
    kind: 'fix',
    files: [{ path: 'dashboard/src/bridge/seed-handler.ts', added_lines: 1, removed_lines: 0 }],
  };
  const result = classifyPlan(plan);
  assert(result.zone === 'yellow', 'non-src/launcher/*.js files → yellow');
}

function testEmptyPlanIsRed() {
  const result = classifyPlan({ files: [] });
  assert(result.zone === 'red', 'empty plan → red (refuse)');
  const result2 = classifyPlan(null);
  assert(result2.zone === 'red', 'null plan → red (refuse)');
}

function testCiWorkflowIsRed() {
  const plan = {
    kind: 'fix-ci',
    files: [{ path: '.github/workflows/test.yml', added_lines: 3, removed_lines: 0 }],
  };
  const result = classifyPlan(plan);
  assert(result.zone === 'red', '.github/workflows/ → red');
}

function testPathNormalisation() {
  // Leading ./ shouldn't cause misclassification.
  const plan = {
    kind: 'fix',
    files: [{ path: './src/launcher/safety.js', added_lines: 1, removed_lines: 0 }],
  };
  const result = classifyPlan(plan);
  assert(result.zone === 'red', 'leading ./ still matches red list');
}

function main() {
  console.log('self-heal-zones enforcement');
  testSimpleLauncherFixIsGreen();
  testSafetyModuleRedZone();
  testPromptChangeIsRed();
  testSchemaChangeIsYellow();
  testLibraryIntegrationIsYellow();
  testDashboardChangeIsYellow();
  testLargeChangeIsYellow();
  testBoundaryAtMaxGreenLines();
  testMultiFileIsYellow();
  testNonLauncherJsIsYellow();
  testEmptyPlanIsRed();
  testCiWorkflowIsRed();
  testPathNormalisation();
  console.log(`  ${checks} checks, ${failures} failures`);
  if (failures > 0) {
    console.error('FAIL');
    process.exit(1);
  }
  console.log('PASS');
}

main();
