#!/usr/bin/env node
/**
 * Tests for CLI commands: init, seed, build, status, cost.
 *
 * Uses temp directories for isolation. Does not invoke claude or rouge-loop
 * for real — only tests argument validation and filesystem operations.
 *
 * Usage: node tests/cli.test.js
 */

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CLI_PATH = path.join(__dirname, '..', 'src', 'launcher', 'rouge-cli.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${message}`);
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    passed++;
    console.log(`  PASS: ${message}`);
  } else {
    failed++;
    console.error(`  FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

/**
 * Run the CLI with the given args and env overrides.
 * Returns { status, stdout, stderr }.
 */
function runCLI(args, envOverrides = {}, timeout = 5000) {
  const env = { ...process.env, ...envOverrides };
  try {
    const stdout = execFileSync('node', [CLI_PATH, ...args], {
      env,
      encoding: 'utf8',
      timeout,
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      status: err.status || 1,
      stdout: (err.stdout || '').toString(),
      stderr: (err.stderr || '').toString(),
    };
  }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-cli-test-'));
}

function cleanupDir(dir) {
  try { fs.rmSync(dir, { recursive: true }); } catch { /* fine */ }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log('\nCLI command tests');
console.log('='.repeat(50));

// ---- rouge init ----

console.log('\n[rouge init — creates project directory]');
{
  const tmpDir = makeTmpDir();
  const result = runCLI(['init', 'my-app'], { ROUGE_PROJECTS_DIR: tmpDir });
  assertEqual(result.status, 0, 'exits 0');
  assert(fs.existsSync(path.join(tmpDir, 'my-app')), 'project directory exists');
  assert(fs.existsSync(path.join(tmpDir, 'my-app', '.gitkeep')), '.gitkeep created');
  assert(result.stdout.includes('my-app'), 'output mentions project name');
  assert(result.stdout.includes('rouge seed'), 'output mentions next step');
  cleanupDir(tmpDir);
}

console.log('\n[rouge init — fails on duplicate]');
{
  const tmpDir = makeTmpDir();
  fs.mkdirSync(path.join(tmpDir, 'existing-app'));
  const result = runCLI(['init', 'existing-app'], { ROUGE_PROJECTS_DIR: tmpDir });
  assertEqual(result.status, 1, 'exits 1 on duplicate');
  assert(result.stderr.includes('already exists'), 'error mentions already exists');
  cleanupDir(tmpDir);
}

console.log('\n[rouge init — fails without name]');
{
  const tmpDir = makeTmpDir();
  const result = runCLI(['init'], { ROUGE_PROJECTS_DIR: tmpDir });
  assertEqual(result.status, 1, 'exits 1 without name');
  assert(result.stderr.includes('Usage'), 'shows usage');
  cleanupDir(tmpDir);
}

// ---- rouge seed ----

console.log('\n[rouge seed — fails on non-existent project]');
{
  const tmpDir = makeTmpDir();
  const result = runCLI(['seed', 'ghost-project'], { ROUGE_PROJECTS_DIR: tmpDir });
  assertEqual(result.status, 1, 'exits 1 for missing project');
  assert(result.stderr.includes('not found'), 'error mentions not found');
  assert(result.stderr.includes('rouge init'), 'error suggests rouge init');
  cleanupDir(tmpDir);
}

console.log('\n[rouge seed — fails without name]');
{
  const tmpDir = makeTmpDir();
  const result = runCLI(['seed'], { ROUGE_PROJECTS_DIR: tmpDir });
  assertEqual(result.status, 1, 'exits 1 without name');
  assert(result.stderr.includes('Usage'), 'shows usage');
  cleanupDir(tmpDir);
}

// ---- rouge build ----

console.log('\n[rouge build — fails for non-existent project name]');
{
  const tmpDir = makeTmpDir();
  const result = runCLI(['build', 'nonexistent'], { ROUGE_PROJECTS_DIR: tmpDir });
  assertEqual(result.status, 1, 'exits 1 for missing project');
  assert(result.stderr.includes('not found'), 'error mentions not found');
  cleanupDir(tmpDir);
}

// ---- rouge status ----

console.log('\n[rouge status — no projects]');
{
  const tmpDir = makeTmpDir();
  const result = runCLI(['status'], { ROUGE_PROJECTS_DIR: tmpDir });
  assertEqual(result.status, 0, 'exits 0');
  assert(result.stdout.includes('No projects found'), 'says no projects found');
  cleanupDir(tmpDir);
}

console.log('\n[rouge status — project without state.json]');
{
  const tmpDir = makeTmpDir();
  fs.mkdirSync(path.join(tmpDir, 'bare-project'));
  const result = runCLI(['status'], { ROUGE_PROJECTS_DIR: tmpDir });
  assertEqual(result.status, 0, 'exits 0');
  assert(result.stdout.includes('bare-project'), 'shows project name');
  assert(result.stdout.includes('not seeded'), 'shows not seeded');
  cleanupDir(tmpDir);
}

console.log('\n[rouge status — project with state.json]');
{
  const tmpDir = makeTmpDir();
  const projectDir = path.join(tmpDir, 'fleet-manager');
  fs.mkdirSync(projectDir);
  fs.writeFileSync(path.join(projectDir, 'state.json'), JSON.stringify({
    phase: 'building',
    cycle: 3,
    features: { total: 7, complete: 2 },
  }));
  const result = runCLI(['status'], { ROUGE_PROJECTS_DIR: tmpDir });
  assertEqual(result.status, 0, 'exits 0');
  assert(result.stdout.includes('fleet-manager'), 'shows project name');
  assert(result.stdout.includes('building'), 'shows phase');
  assert(result.stdout.includes('3'), 'shows cycle');
  assert(result.stdout.includes('2/7 complete'), 'shows feature progress');
  cleanupDir(tmpDir);
}

console.log('\n[rouge status — single project by name]');
{
  const tmpDir = makeTmpDir();
  const projectDir = path.join(tmpDir, 'solo-project');
  fs.mkdirSync(projectDir);
  fs.writeFileSync(path.join(projectDir, 'state.json'), JSON.stringify({
    phase: 'waiting-for-human',
    cycle: 1,
    features: { total: 3, complete: 0 },
  }));
  const result = runCLI(['status', 'solo-project'], { ROUGE_PROJECTS_DIR: tmpDir });
  assertEqual(result.status, 0, 'exits 0');
  assert(result.stdout.includes('solo-project'), 'shows project name');
  assert(result.stdout.includes('waiting-for-human'), 'shows phase');
  cleanupDir(tmpDir);
}

console.log('\n[rouge status — single project not found]');
{
  const tmpDir = makeTmpDir();
  const result = runCLI(['status', 'ghost'], { ROUGE_PROJECTS_DIR: tmpDir });
  assertEqual(result.status, 1, 'exits 1 for missing project');
  assert(result.stderr.includes('not found'), 'error mentions not found');
  cleanupDir(tmpDir);
}

// ---- rouge cost ----

console.log('\n[rouge cost — fails on non-existent project]');
{
  const tmpDir = makeTmpDir();
  const result = runCLI(['cost', 'ghost-project'], { ROUGE_PROJECTS_DIR: tmpDir });
  assertEqual(result.status, 1, 'exits 1 for missing project');
  assert(result.stderr.includes('not found'), 'error mentions not found');
  cleanupDir(tmpDir);
}

console.log('\n[rouge cost — fails without name]');
{
  const tmpDir = makeTmpDir();
  const result = runCLI(['cost'], { ROUGE_PROJECTS_DIR: tmpDir });
  assertEqual(result.status, 1, 'exits 1 without name');
  assert(result.stderr.includes('Usage'), 'shows usage');
  cleanupDir(tmpDir);
}

// ---- rouge doctor ----

console.log('\n[rouge doctor — checks prerequisites]');
{
  const result = runCLI(['doctor'], {}, 15000);
  assertEqual(result.status, 0, 'exits 0 (all required deps exist)');
  assert(result.stdout.includes('Node.js'), 'output contains Node.js');
  assert(result.stdout.includes('Git'), 'output contains Git');
  assert(result.stdout.includes('Claude Code') || result.stdout.includes('claude'), 'output contains Claude Code or claude');
  assert(result.stdout.includes('Integrations'), 'output contains Integrations');
  assert(result.stdout.includes('Rouge Doctor'), 'output contains Rouge Doctor header');
  assert(result.stdout.includes('Required'), 'output contains Required section');
  assert(result.stdout.includes('Recommended'), 'output contains Recommended section');
}

// ---- rouge (no args) — help text ----

console.log('\n[rouge — shows help with all commands]');
{
  const result = runCLI([]);
  assertEqual(result.status, 0, 'exits 0');
  assert(result.stdout.includes('rouge doctor'), 'help lists doctor');
  assert(result.stdout.includes('rouge init'), 'help lists init');
  assert(result.stdout.includes('rouge seed'), 'help lists seed');
  assert(result.stdout.includes('rouge build'), 'help lists build');
  assert(result.stdout.includes('rouge status'), 'help lists status');
  assert(result.stdout.includes('rouge cost'), 'help lists cost');
  assert(result.stdout.includes('rouge setup'), 'help lists setup');
  assert(result.stdout.includes('rouge secrets'), 'help lists secrets');
}

// ---- rouge slack ----

console.log('\n[rouge slack — no subcommand shows usage]');
{
  const result = runCLI(['slack']);
  assertEqual(result.status, 1, 'exits 1 without subcommand');
  assert(result.stderr.includes('rouge slack'), 'shows usage');
  assert(result.stderr.includes('setup'), 'mentions setup subcommand');
  assert(result.stderr.includes('start'), 'mentions start subcommand');
  assert(result.stderr.includes('test'), 'mentions test subcommand');
}

console.log('\n[rouge slack setup — prints guide text]');
{
  const result = runCLI(['slack', 'setup']);
  assertEqual(result.status, 0, 'exits 0');
  assert(result.stdout.includes('api.slack.com'), 'output contains api.slack.com');
  assert(result.stdout.includes('manifest'), 'output mentions manifest');
  assert(result.stdout.includes('Socket Mode'), 'output mentions Socket Mode');
}

console.log('\n[rouge slack test — without webhook prints helpful error]');
{
  const tmpDir = makeTmpDir();
  // Use a custom ROUGE_HOME so no real secrets are found
  const result = runCLI(['slack', 'test'], { ROUGE_HOME: tmpDir });
  assertEqual(result.status, 1, 'exits 1 without webhook');
  assert(result.stderr.includes('rouge setup slack'), 'suggests running rouge setup slack');
  cleanupDir(tmpDir);
}

// ---- rouge help includes slack ----

console.log('\n[rouge — help text includes slack commands]');
{
  const result = runCLI([]);
  assertEqual(result.status, 0, 'exits 0');
  assert(result.stdout.includes('rouge slack'), 'help lists slack');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed.\n');
}
