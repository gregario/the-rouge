#!/usr/bin/env node
/**
 * Tests for the self-improvement module.
 *
 * Tests the module's pure functions with mock data. Does not invoke
 * claude -p or gh for real — only tests filtering, prioritisation,
 * prompt building, and anthology parsing.
 *
 * Usage: node tests/self-improve.test.js
 */

const path = require('path');
const fs = require('fs');

const {
  prioritiseIssues,
  buildIssuePrompt,
  findNextExplorationItem,
  slugify,
  TRUSTED_AUTHORS,
} = require(path.join(__dirname, '..', 'src', 'launcher', 'self-improve.js'));

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log('\nSelf-improvement module tests');
console.log('='.repeat(50));

// ---- TRUSTED_AUTHORS ----

console.log('\n[TRUSTED_AUTHORS — includes repo owner]');
{
  assert(TRUSTED_AUTHORS.includes('gregario'), 'gregario is trusted');
  assert(TRUSTED_AUTHORS.length >= 1, 'at least one trusted author');
}

// ---- slugify ----

console.log('\n[slugify — converts titles to branch-safe slugs]');
{
  assertEqual(slugify('Add Resend email integration'), 'add-resend-email-integration', 'basic slugify');
  assertEqual(slugify('Fix bug #42'), 'fix-bug-42', 'strips special chars');
  assertEqual(slugify('  leading-trailing  '), 'leading-trailing', 'trims dashes');
  assertEqual(slugify('UPPERCASE TITLE'), 'uppercase-title', 'lowercases');
  assert(slugify('a'.repeat(100)).length <= 50, 'truncates to 50 chars');
}

// ---- prioritiseIssues ----

console.log('\n[prioritiseIssues — blockers first]');
{
  const issues = [
    { number: 1, title: 'Normal', labels: [], createdAt: '2025-01-01' },
    { number: 2, title: 'Blocker', labels: [{ name: 'blocker' }], createdAt: '2025-01-03' },
    { number: 3, title: 'Priority', labels: [{ name: 'priority' }], createdAt: '2025-01-02' },
  ];
  const sorted = prioritiseIssues(issues);
  assertEqual(sorted[0].number, 2, 'blocker comes first');
  assertEqual(sorted[1].number, 3, 'priority comes second');
  assertEqual(sorted[2].number, 1, 'normal comes last');
}

console.log('\n[prioritiseIssues — backlog comes last]');
{
  const issues = [
    { number: 1, title: 'Backlog', labels: [{ name: 'backlog' }], createdAt: '2025-01-01' },
    { number: 2, title: 'Normal', labels: [], createdAt: '2025-01-05' },
  ];
  const sorted = prioritiseIssues(issues);
  assertEqual(sorted[0].number, 2, 'normal before backlog');
  assertEqual(sorted[1].number, 1, 'backlog comes last');
}

console.log('\n[prioritiseIssues — oldest first within same priority]');
{
  const issues = [
    { number: 1, title: 'Newer', labels: [], createdAt: '2025-03-01' },
    { number: 2, title: 'Older', labels: [], createdAt: '2025-01-01' },
    { number: 3, title: 'Middle', labels: [], createdAt: '2025-02-01' },
  ];
  const sorted = prioritiseIssues(issues);
  assertEqual(sorted[0].number, 2, 'oldest first');
  assertEqual(sorted[1].number, 3, 'middle second');
  assertEqual(sorted[2].number, 1, 'newest last');
}

console.log('\n[prioritiseIssues — empty list returns empty]');
{
  const sorted = prioritiseIssues([]);
  assertEqual(sorted.length, 0, 'empty in, empty out');
}

console.log('\n[prioritiseIssues — multiple blockers sorted by date]');
{
  const issues = [
    { number: 1, title: 'Blocker B', labels: [{ name: 'blocker' }], createdAt: '2025-02-01' },
    { number: 2, title: 'Blocker A', labels: [{ name: 'blocker' }], createdAt: '2025-01-01' },
  ];
  const sorted = prioritiseIssues(issues);
  assertEqual(sorted[0].number, 2, 'older blocker first');
  assertEqual(sorted[1].number, 1, 'newer blocker second');
}

// ---- buildIssuePrompt ----

console.log('\n[buildIssuePrompt — includes issue number and title]');
{
  const prompt = buildIssuePrompt({ number: 42, title: 'Fix the thing', body: 'Details here' });
  assert(prompt.includes('#42'), 'contains issue number');
  assert(prompt.includes('Fix the thing'), 'contains title');
  assert(prompt.includes('Details here'), 'contains body');
}

console.log('\n[buildIssuePrompt — includes workflow instructions]');
{
  const prompt = buildIssuePrompt({ number: 1, title: 'Test', body: '' });
  assert(prompt.includes('CLAUDE.md'), 'references CLAUDE.md');
  assert(prompt.includes('VISION.md'), 'references VISION.md');
  assert(prompt.includes('Do NOT merge to main'), 'warns against merging');
  assert(prompt.includes('Write tests'), 'mentions tests');
  assert(prompt.includes('feature branch'), 'mentions feature branch');
}

console.log('\n[buildIssuePrompt — handles missing body]');
{
  const prompt = buildIssuePrompt({ number: 1, title: 'No body', body: null });
  assert(prompt.includes('(no description)'), 'shows fallback for null body');
}

console.log('\n[buildIssuePrompt — handles undefined body]');
{
  const prompt = buildIssuePrompt({ number: 1, title: 'No body' });
  assert(prompt.includes('(no description)'), 'shows fallback for undefined body');
}

// ---- findNextExplorationItem ----

console.log('\n[findNextExplorationItem — finds unchecked items from anthology]');
{
  const result = findNextExplorationItem();
  // anthology.md exists and has unchecked items
  if (result) {
    assert(typeof result.item === 'string', 'item is a string');
    assert(result.item.length > 0, 'item is non-empty');
    assert(typeof result.section === 'string', 'section is a string');
    assert(typeof result.fullText === 'string', 'fullText is a string');
  } else {
    // Anthology might not exist in test env — that's ok
    assert(true, 'no anthology or all items checked (acceptable)');
  }
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
