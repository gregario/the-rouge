/**
 * Locking wrapper for cycle_context.json writes.
 *
 * P0-005 fix: cycle_context.json was written bare via writeJson() with no
 * lock, causing cross-phase signals (circuit_breaker, previous_phase,
 * human_guidance) to be silently lost when concurrent writes occurred.
 *
 * This module provides a lock-wrapped read/write API for cycle_context
 * that prevents corruption.
 */

const { withLock } = require('./facade/lock.js');
const path = require('path');
const fs = require('fs');

/**
 * Read cycle_context.json with no lock (reads are safe if writes are atomic).
 */
function readCycleContext(projectDir) {
  const contextFile = path.join(projectDir, 'cycle_context.json');
  if (!fs.existsSync(contextFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(contextFile, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Write cycle_context.json with lock to prevent concurrent write corruption.
 * Uses write-temp-rename for atomicity.
 */
async function writeCycleContext(projectDir, data) {
  return withLock(projectDir, async () => {
    const contextFile = path.join(projectDir, 'cycle_context.json');
    const tmp = `${contextFile}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, contextFile);
  });
}

/**
 * Update cycle_context.json via mutation function (read-modify-write under lock).
 * Fn receives current context (or {} if missing) and returns updated context.
 */
async function updateCycleContext(projectDir, fn) {
  return withLock(projectDir, async () => {
    const contextFile = path.join(projectDir, 'cycle_context.json');
    let current = {};
    if (fs.existsSync(contextFile)) {
      try {
        current = JSON.parse(fs.readFileSync(contextFile, 'utf8'));
      } catch {}
    }
    const updated = fn(current);
    const tmp = `${contextFile}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(updated, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, contextFile);
    return updated;
  });
}

module.exports = {
  readCycleContext,
  writeCycleContext,
  updateCycleContext,
};
