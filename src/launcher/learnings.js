/**
 * V3 Project learnings — read/append/prune learnings.md.
 * Read by every phase via the shared preamble. Append-only during the loop.
 * Max 50 lines by default, pruned by retrospective.
 */

const fs = require('fs');
const path = require('path');

function readLearnings(projectDir) {
  const file = path.join(projectDir, 'learnings.md');
  if (!fs.existsSync(file)) return '';
  return fs.readFileSync(file, 'utf8');
}

function appendLearning(projectDir, category, learning) {
  const file = path.join(projectDir, 'learnings.md');
  let content = '';

  if (fs.existsSync(file)) {
    content = fs.readFileSync(file, 'utf8');
  } else {
    content = '# Project Learnings\n';
  }

  const categoryHeader = `## ${category}`;
  if (content.includes(categoryHeader)) {
    // Append under existing category — find the category header and add after the last line in that section
    const lines = content.split('\n');
    const categoryIdx = lines.findIndex(l => l.trim() === categoryHeader);
    let insertIdx = categoryIdx + 1;
    // Find the end of this category (next ## or end of file)
    while (insertIdx < lines.length && !lines[insertIdx].startsWith('## ')) {
      insertIdx++;
    }
    lines.splice(insertIdx, 0, `- ${learning}`);
    content = lines.join('\n');
  } else {
    // Add new category at the end
    content = content.trimEnd() + `\n\n${categoryHeader}\n- ${learning}\n`;
  }

  fs.writeFileSync(file, content, 'utf8');
}

function pruneLearnings(projectDir, maxLines = 50) {
  const file = path.join(projectDir, 'learnings.md');
  if (!fs.existsSync(file)) return;

  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');

  if (lines.length <= maxLines) return;

  // Keep the header and the most recent lines
  const pruned = lines.slice(0, 2).concat(lines.slice(-(maxLines - 2)));
  fs.writeFileSync(file, pruned.join('\n'), 'utf8');
}

module.exports = { readLearnings, appendLearning, pruneLearnings };
