/**
 * V3 Per-project audit trail — append-only tools.jsonl.
 * Records every tool call during a build for post-hoc analysis.
 */

const fs = require('fs');
const path = require('path');

function appendToolCall(projectDir, entry) {
  const file = path.join(projectDir, 'tools.jsonl');
  const record = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  fs.appendFileSync(file, JSON.stringify(record) + '\n', 'utf8');
}

function readAuditTrail(projectDir) {
  const file = path.join(projectDir, 'tools.jsonl');
  if (!fs.existsSync(file)) return [];
  const content = fs.readFileSync(file, 'utf8').trim();
  if (!content) return [];
  return content.split('\n').filter(Boolean).map(line => JSON.parse(line));
}

module.exports = { appendToolCall, readAuditTrail };
