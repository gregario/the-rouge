/**
 * V3 Self-improvement safety boundary.
 * Enforces allowlist/blocklist for prompt modification in worktrees.
 * The running loop MUST NOT modify its own prompts, launcher, or evaluation criteria.
 */

const path = require('path');

/**
 * Check if a file path matches any glob pattern in a list.
 * Simple glob matching: supports * (any segment) and ** (any path).
 */
function matchesGlob(filePath, pattern) {
  // Normalise
  const normPath = filePath.replace(/\\/g, '/');
  const normPattern = pattern.replace(/\\/g, '/');

  // Convert glob to regex
  const regexStr = normPattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{GLOBSTAR\}\}/g, '.*');

  return new RegExp(`^${regexStr}$`).test(normPath);
}

function isFileAllowed(filePath, allowlist) {
  return allowlist.some(pattern => matchesGlob(filePath, pattern));
}

function isFileBlocked(filePath, blocklist) {
  return blocklist.some(pattern => matchesGlob(filePath, pattern));
}

function validateImprovementScope(filePaths, config) {
  const rejected = [];

  for (const fp of filePaths) {
    if (isFileBlocked(fp, config.blocklist)) {
      rejected.push(fp);
    } else if (!isFileAllowed(fp, config.allowlist)) {
      rejected.push(fp);
    }
  }

  return {
    valid: rejected.length === 0,
    rejected,
  };
}

module.exports = { isFileAllowed, isFileBlocked, validateImprovementScope };
