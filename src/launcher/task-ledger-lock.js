/**
 * Locking wrapper for task_ledger.json writes.
 *
 * P0-003 fix: task_ledger.json was written bare via fs.writeFileSync() with
 * no lock, causing concurrent writes (e.g., dashboard + rouge-loop adding
 * fix stories simultaneously) to clobber each other.
 *
 * This module provides a lock-wrapped read/write API for task_ledger that
 * prevents corruption.
 */

const { withLock } = require('./facade/lock.js');
const path = require('path');
const fs = require('fs');

/**
 * Read task_ledger.json with no lock (reads are safe if writes are atomic).
 */
function readTaskLedger(projectDir) {
  const ledgerFile = path.join(projectDir, 'task_ledger.json');
  if (!fs.existsSync(ledgerFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Write task_ledger.json with lock to prevent concurrent write corruption.
 * Uses write-temp-rename for atomicity.
 */
async function writeTaskLedger(projectDir, data) {
  return withLock(projectDir, async () => {
    const ledgerFile = path.join(projectDir, 'task_ledger.json');
    const tmp = `${ledgerFile}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, ledgerFile);
  });
}

/**
 * Update task_ledger.json via mutation function (read-modify-write under lock).
 * Fn receives current ledger (or null if missing) and returns updated ledger.
 */
async function updateTaskLedger(projectDir, fn) {
  return withLock(projectDir, async () => {
    const ledgerFile = path.join(projectDir, 'task_ledger.json');
    let current = null;
    if (fs.existsSync(ledgerFile)) {
      try {
        current = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
      } catch {}
    }
    const updated = fn(current);
    const tmp = `${ledgerFile}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(updated, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, ledgerFile);
    return updated;
  });
}

module.exports = {
  readTaskLedger,
  writeTaskLedger,
  updateTaskLedger,
};
