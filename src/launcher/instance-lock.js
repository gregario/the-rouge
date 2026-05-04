/**
 * Per-project instance lock — prevents concurrent rouge-loop processes.
 *
 * Lock file lives at <projectDir>/.rouge/loop.pid (gitignored).
 * For unfiltered loops (no ROUGE_PROJECT_FILTER), locks at ROUGE_ROOT/.rouge/loop.pid.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LOCK_FILENAME = 'loop.pid';

function lockPath(dir) {
  const rougeDir = path.join(dir, '.rouge');
  if (!fs.existsSync(rougeDir)) {
    fs.mkdirSync(rougeDir, { recursive: true });
  }
  return path.join(rougeDir, LOCK_FILENAME);
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err.code === 'EPERM') return true;
    return false;
  }
}

function pgrepFallback(filter) {
  if (!filter) return null;
  try {
    const out = execSync(
      `pgrep -f "rouge-loop" 2>/dev/null || true`,
      { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const pids = out.trim().split('\n').map(Number).filter(p => p && p !== process.pid);
    for (const pid of pids) {
      try {
        const env = execSync(`ps eww -p ${pid} 2>/dev/null || true`, {
          encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'],
        });
        if (env.includes(`ROUGE_PROJECT_FILTER=${filter}`)) {
          return pid;
        }
      } catch {}
    }
  } catch {}
  return null;
}

function acquire(dir, opts = {}) {
  const file = lockPath(dir);
  const filter = opts.filter || null;

  if (fs.existsSync(file)) {
    try {
      const existing = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (existing.pid && isPidAlive(existing.pid) && existing.pid !== process.pid) {
        return { acquired: false, existingPid: existing.pid };
      }
    } catch {}
  }

  const fallbackPid = pgrepFallback(filter);
  if (fallbackPid) {
    return { acquired: false, existingPid: fallbackPid };
  }

  const lock = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    filter,
  };
  fs.writeFileSync(file, JSON.stringify(lock, null, 2) + '\n', 'utf-8');
  return { acquired: true };
}

function release(dir) {
  const file = lockPath(dir);
  try {
    if (fs.existsSync(file)) {
      const lock = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (lock.pid === process.pid) {
        fs.unlinkSync(file);
      }
    }
  } catch {}
}

function isRunning(dir) {
  const file = lockPath(dir);
  if (fs.existsSync(file)) {
    try {
      const lock = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (lock.pid && isPidAlive(lock.pid)) {
        return { running: true, pid: lock.pid };
      }
      fs.unlinkSync(file);
    } catch {}
  }
  return { running: false, pid: null };
}

module.exports = { acquire, release, isRunning, isPidAlive, lockPath };
