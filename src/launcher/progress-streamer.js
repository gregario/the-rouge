/**
 * Phase progress streamer — watches a log file and emits significant events.
 * Used by the launcher's heartbeat to post live updates during long phases.
 */

const fs = require('fs');
const path = require('path');

// Patterns that indicate significant progress events
const PROGRESS_PATTERNS = [
  { pattern: /(\d+) tests? (passing|passed)/i, format: (m) => `🧪 ${m[1]} tests passing` },
  { pattern: /deployed to (https:\/\/\S+)/i, format: (m) => `🚀 Deployed: ${m[1]}` },
  { pattern: /(\d+) files? changed/i, format: (m) => `📁 ${m[1]} files changed` },
  { pattern: /commit[ted]?\s+([a-f0-9]{7})/i, format: (m) => `📝 Committed ${m[1]}` },
  { pattern: /PASS|FAIL/i, format: (m) => `${m[0] === 'PASS' ? '✅' : '❌'} Verdict: ${m[0]}` },
  { pattern: /health.?score:?\s*(\d+)/i, format: (m) => `📊 Health: ${m[1]}/100` },
  { pattern: /lighthouse.*?(\d+)/i, format: (m) => `💡 Lighthouse: ${m[1]}` },
  { pattern: /npm install/i, format: () => `📦 Installing dependencies` },
  { pattern: /building|compiling/i, format: () => `🔨 Building` },
];

/**
 * Scan new content in a log file for progress events.
 * @param {string} content - New content since last check
 * @returns {string[]} - Array of progress event strings
 */
function extractEvents(content) {
  const events = [];
  const seen = new Set();

  for (const { pattern, format } of PROGRESS_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      const event = format(match);
      if (!seen.has(event)) {
        seen.add(event);
        events.push(event);
      }
    }
  }

  return events;
}

module.exports = { extractEvents, PROGRESS_PATTERNS };
