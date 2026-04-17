/**
 * Shared launcher logger with size-based rotation.
 *
 * Why this exists: prior to v0.3.1 every module that wrote to rouge.log
 * resolved its own LOG_DIR. Several used `path.resolve(__dirname, '../..')
 * + 'logs/'` which works for source checkouts but silently writes outside
 * the repo in some install layouts (one user hit 1.13 GB in
 * `~/Projects/logs/rouge.log`, one level above their cwd, because of a
 * misresolved root). None of them rotated, so the file grew without bound.
 *
 * Contract:
 *   - resolveLogDir() is the single source of truth. Env > repo local >
 *     per-user `~/.rouge/logs/`.
 *   - log(line) rotates rouge.log → rouge.log.1 when size exceeds 10 MB.
 *     One rotation is kept; older rotations are discarded. That's enough
 *     to survive a pathological run without growing unbounded.
 *   - Callers don't pass a directory. If a module needs the directory for
 *     other purposes, call getLogDir().
 */

const fs = require('fs');
const path = require('path');

const ROUGE_ROOT = path.resolve(__dirname, '..', '..');
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

let cachedLogDir = null;

function resolveLogDir() {
  if (cachedLogDir) return cachedLogDir;

  if (process.env.ROUGE_LOG_DIR) {
    cachedLogDir = process.env.ROUGE_LOG_DIR;
  } else if (fs.existsSync(path.join(ROUGE_ROOT, '.git'))) {
    // Source checkout — keep logs next to the repo for easy `tail -f`.
    cachedLogDir = path.join(ROUGE_ROOT, 'logs');
  } else {
    // Global / packaged install — per-user dir, never writes to the
    // install prefix or some parent of cwd.
    const home = process.env.HOME || process.env.USERPROFILE || '/tmp';
    cachedLogDir = path.join(home, '.rouge', 'logs');
  }

  try {
    fs.mkdirSync(cachedLogDir, { recursive: true });
  } catch (err) {
    // EEXIST means the directory is already there — fine, keep going.
    // Anything else (EACCES, ENOSPC, EROFS) means we can't write logs at
    // this location and silent-swallowing here was hiding misconfigured
    // ROUGE_LOG_DIR. Surface to stderr; the loop's console mirror still
    // works even when file logging doesn't.
    if (err && err.code !== 'EEXIST') {
      try {
        process.stderr.write(`[rouge-logger] cannot create log dir ${cachedLogDir}: ${err.message}\n`);
      } catch { /* stderr unavailable — give up */ }
    }
  }
  return cachedLogDir;
}

function rotateIfNeeded(logFile) {
  let size;
  try {
    size = fs.statSync(logFile).size;
  } catch {
    return; // file doesn't exist yet — nothing to rotate
  }
  if (size < MAX_BYTES) return;

  const rotated = logFile + '.1';
  try {
    // Replace any existing .1 (keep only one rotation)
    fs.renameSync(logFile, rotated);
  } catch (renameErr) {
    // Rename can fail if another process has the file open; fall back to
    // truncating in place so we at least stop growing.
    try {
      fs.truncateSync(logFile, 0);
    } catch (truncErr) {
      try {
        process.stderr.write(
          `[rouge-logger] log rotation failed (rename: ${renameErr.message}, truncate: ${truncErr.message})\n`
        );
      } catch { /* stderr unavailable */ }
    }
  }
}

function log(line) {
  const dir = resolveLogDir();
  const logFile = path.join(dir, 'rouge.log');
  rotateIfNeeded(logFile);
  try {
    fs.appendFileSync(logFile, line.endsWith('\n') ? line : line + '\n');
  } catch {
    // Never let a logging failure crash the loop. Silent is fine — the
    // console mirror in rouge-loop.js picks up most of the signal.
  }
}

function getLogDir() {
  return resolveLogDir();
}

function getLogFile() {
  return path.join(resolveLogDir(), 'rouge.log');
}

module.exports = { log, getLogDir, getLogFile };
