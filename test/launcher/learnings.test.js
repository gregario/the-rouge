const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { readLearnings, appendLearning, pruneLearnings } = require('../../src/launcher/learnings.js');

describe('Project Learnings', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-test-'));
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

  test('readLearnings returns empty string when file missing', () => {
    assert.equal(readLearnings(tmpDir), '');
  });

  test('readLearnings returns content when file exists', () => {
    fs.writeFileSync(path.join(tmpDir, 'learnings.md'), '## Infrastructure\n- Use supabase-js');
    assert.ok(readLearnings(tmpDir).includes('supabase-js'));
  });

  test('appendLearning creates file with category if missing', () => {
    appendLearning(tmpDir, 'Infrastructure', 'Do NOT use Prisma ORM');
    const content = fs.readFileSync(path.join(tmpDir, 'learnings.md'), 'utf8');
    assert.ok(content.includes('## Infrastructure'));
    assert.ok(content.includes('- Do NOT use Prisma ORM'));
  });

  test('appendLearning appends to existing category', () => {
    fs.writeFileSync(path.join(tmpDir, 'learnings.md'), '# Project Learnings\n\n## Infrastructure\n- Use supabase-js\n');
    appendLearning(tmpDir, 'Infrastructure', 'No Prisma');
    const content = fs.readFileSync(path.join(tmpDir, 'learnings.md'), 'utf8');
    assert.ok(content.includes('- Use supabase-js'));
    assert.ok(content.includes('- No Prisma'));
  });

  test('appendLearning adds new category to existing file', () => {
    fs.writeFileSync(path.join(tmpDir, 'learnings.md'), '# Project Learnings\n\n## Infrastructure\n- Use supabase-js\n');
    appendLearning(tmpDir, 'Quality', 'Loading skeletons required');
    const content = fs.readFileSync(path.join(tmpDir, 'learnings.md'), 'utf8');
    assert.ok(content.includes('## Quality'));
    assert.ok(content.includes('- Loading skeletons required'));
  });

  test('pruneLearnings trims to max lines', () => {
    const lines = ['# Project Learnings', ''];
    for (let i = 0; i < 60; i++) {
      lines.push(`- Learning ${i}`);
    }
    fs.writeFileSync(path.join(tmpDir, 'learnings.md'), lines.join('\n'));
    pruneLearnings(tmpDir, 50);
    const content = fs.readFileSync(path.join(tmpDir, 'learnings.md'), 'utf8');
    const lineCount = content.trim().split('\n').length;
    assert.ok(lineCount <= 50, `Expected <= 50 lines, got ${lineCount}`);
  });

  test('pruneLearnings is no-op when under limit', () => {
    fs.writeFileSync(path.join(tmpDir, 'learnings.md'), '# Learnings\n\n- One\n- Two\n');
    pruneLearnings(tmpDir, 50);
    const content = fs.readFileSync(path.join(tmpDir, 'learnings.md'), 'utf8');
    assert.ok(content.includes('- One'));
    assert.ok(content.includes('- Two'));
  });

  test('pruneLearnings handles missing file', () => {
    pruneLearnings(tmpDir, 50); // should not throw
  });
});
