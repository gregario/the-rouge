/**
 * Subprocess dispatch strategy — `claude -p` invocation.
 *
 * Two callable shapes:
 *
 *   runSubprocess({ prompt, cwd, env, args, timeoutMs, signal })
 *     Minimal one-shot invocation: spawns `claude -p <prompt>`,
 *     captures stdout + stderr, returns when the child exits.
 *     Suitable for ad-hoc phase calls from tests and scripts.
 *
 *   runPhaseSubprocess(opts)
 *     Full phase orchestration lifted from rouge-loop.js (Phase 5):
 *     stream-json stdout teed to a phase log + phase-events writer,
 *     stderr captured for rate-limit detection, three-signal
 *     watchdog (log growth / progress events / file activity) with
 *     hard ceiling, structured result. The launcher loop calls this
 *     instead of spawning claude itself; loop business logic
 *     (cost tracking, advanceState, state restore) reacts to the
 *     result.
 *
 * Lift rationale (Phase 5 of the grand unified reconciliation):
 * the loop's spawn block was ~250 lines of I/O orchestration mixed
 * with phase business logic. Extracting it here gives GC.4 a real
 * dispatch boundary (one place owns "spawn + watch + report"), and
 * lets the harness adapter and any future strategies reuse the
 * watchdog discipline without copy-paste.
 */

'use strict';

const fs = require('node:fs');
const { spawn, execSync } = require('node:child_process');
const path = require('node:path');

// ---------------------------------------------------------------------------
// runSubprocess — minimal one-shot (kept for harness probe + ad-hoc use)
// ---------------------------------------------------------------------------

async function runSubprocess(opts = {}) {
  const {
    prompt,
    cwd = process.cwd(),
    env = process.env,
    args = [],
    timeoutMs = 10 * 60 * 1000,
    signal,
  } = opts;

  if (!prompt || typeof prompt !== 'string') {
    throw new Error('dispatch/subprocess: prompt (string) is required');
  }

  // Pre-aborted signal: don't even spawn — fail fast.
  if (signal && signal.aborted) {
    throw new Error('dispatch/subprocess: aborted before spawn');
  }

  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', prompt, ...args], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    const timer = signal ? null : setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    if (signal) {
      const onAbort = () => { killed = true; child.kill('SIGTERM'); };
      signal.addEventListener('abort', onAbort, { once: true });
      child.on('exit', () => signal.removeEventListener('abort', onAbort));
    }

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });

    child.on('exit', (code) => {
      if (timer) clearTimeout(timer);
      if (killed) {
        reject(new Error(`dispatch/subprocess: terminated (timeout/abort) after ${timeoutMs}ms`));
        return;
      }
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code });
    });
  });
}

// ---------------------------------------------------------------------------
// runPhaseSubprocess — full phase orchestration with watchdog
// ---------------------------------------------------------------------------

const HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_PROGRESS_STALE_MS = 15 * 60 * 1000;
const DEFAULT_LOG_STALE_MS = 10 * 60 * 1000;
const DEFAULT_HARD_CEILING_MS = 60 * 60 * 1000;

/**
 * Probe whether any file in the project tree was modified since the
 * phase log's mtime. Used by the watchdog as the third "alive" signal
 * — tool calls that write files but emit no stdout still count as
 * progress.
 */
function checkFileActivity(projectDir, phaseLog) {
  try {
    const result = execSync(
      `find "${projectDir}" -maxdepth 3 -newer "${phaseLog}" -not -path "*/node_modules/*" -not -path "*/.git/objects/*" -not -path "*/.next/*" -type f 2>/dev/null | head -1`,
      { encoding: 'utf8', timeout: 5000 }
    ).trim();
    return result.length > 0;
  } catch { return false; }
}

/**
 * Run a phase as a `claude -p` subprocess with the full streaming +
 * watchdog discipline.
 *
 * @param {object} opts
 *   Required:
 *   - args              full claude argv array (the strategy's caller
 *                       owns prompt construction + flag selection)
 *   - cwd               project directory
 *   - env               env-vars to pass to claude
 *   - logStream         WriteStream for the phase log (tee'd stdout)
 *   - phaseLog          path to that log file (used by file-activity probe)
 *   - logSizeAtStart    bytes already in the log when the phase began
 *   - phaseEventWriter  object with onChunk(chunk) / onEnd(code) — the
 *                       caller passes a phase-events.js writer
 *   Optional:
 *   - progressStaleMs / logStaleMs / hardCeilingMs (defaults: 15/10/60 min)
 *   - log(msg)          structured-logging callback (default no-op)
 *   - onProgressEvents([events]) — called when stale-log heartbeat
 *                       extracts progress markers from new log content
 *
 * @returns {Promise<{
 *   exitCode: number|null,
 *   killed: boolean,
 *   killReason: string|null,
 *   stderr: string,
 *   elapsedMs: number,
 * }>}
 *
 * Resolves on child exit; rejects only on `child.on('error')` (spawn
 * failure). Caller decides what counts as "success" — exit code 0
 * doesn't always mean done (rate limit appears as code !== 0 with a
 * recognisable stderr pattern; killed-by-watchdog appears as
 * killed: true).
 */
async function runPhaseSubprocess(opts) {
  const {
    args,
    cwd,
    env,
    logStream,
    phaseLog,
    logSizeAtStart = 0,
    phaseEventWriter,
    progressStaleMs = DEFAULT_PROGRESS_STALE_MS,
    logStaleMs = DEFAULT_LOG_STALE_MS,
    hardCeilingMs = DEFAULT_HARD_CEILING_MS,
    log = () => {},
    onProgressEvents = () => {},
  } = opts || {};

  if (!Array.isArray(args)) throw new Error('dispatch/subprocess.runPhaseSubprocess: args (array) required');
  if (!cwd) throw new Error('dispatch/subprocess.runPhaseSubprocess: cwd required');
  if (!logStream) throw new Error('dispatch/subprocess.runPhaseSubprocess: logStream required');
  if (!phaseLog) throw new Error('dispatch/subprocess.runPhaseSubprocess: phaseLog required');

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const stderrChunks = [];
    let killed = false;
    let killReason = null;
    let lastLogSize = logSizeAtStart;
    let lastLogGrowthAt = Date.now();
    let lastProgressEventAt = Date.now();
    let lastFileActivityAt = Date.now();

    const child = spawn('claude', args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        try { logStream.write(chunk); } catch { /* logStream may have ended */ }
        if (phaseEventWriter && typeof phaseEventWriter.onChunk === 'function') {
          try { phaseEventWriter.onChunk(chunk); } catch { /* writer faulted; not fatal */ }
        }
      });
    }
    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderrChunks.push(chunk);
        try { logStream.write('\n[STDERR] ' + chunk); } catch {}
      });
    }

    // Three-signal watchdog: log growth / progress events / file activity.
    // ALL must be stale before we kill (and even then, only past the
    // configured progress-stale + log-stale thresholds). Hard ceiling is
    // the absolute safety net.
    const heartbeat = setInterval(() => {
      try {
        const now = Date.now();
        const elapsed = now - startedAt;

        // Log file growth
        let currentSize = lastLogSize;
        try { currentSize = fs.statSync(phaseLog).size; } catch { /* log not yet present */ }
        if (currentSize > lastLogSize) {
          lastLogGrowthAt = now;
          // Extract progress events from the new content.
          try {
            const buf = Buffer.alloc(currentSize - lastLogSize);
            const fd = fs.openSync(phaseLog, 'r');
            fs.readSync(fd, buf, 0, buf.length, lastLogSize);
            fs.closeSync(fd);
            const newContent = buf.toString('utf8');
            const { extractEvents } = require('../../progress-streamer.js');
            const events = extractEvents(newContent);
            if (events.length > 0) {
              lastProgressEventAt = now;
              onProgressEvents(events);
            }
          } catch { /* progress extraction is best-effort */ }
          lastLogSize = currentSize;
        }

        // File-system activity
        if (checkFileActivity(cwd, phaseLog)) {
          lastFileActivityAt = now;
          try { fs.utimesSync(phaseLog, new Date(), new Date()); } catch {}
        }

        const logStaleDuration = now - lastLogGrowthAt;
        const progressStaleDuration = now - lastProgressEventAt;
        const fileStaleDuration = now - lastFileActivityAt;

        if (elapsed >= hardCeilingMs) {
          killed = true;
          killReason = `hard ceiling (${Math.round(hardCeilingMs / 60000)}min)`;
        } else if (
          logStaleDuration >= logStaleMs
          && progressStaleDuration >= progressStaleMs
          && fileStaleDuration >= progressStaleMs
        ) {
          killed = true;
          killReason = `no output for ${Math.floor(logStaleDuration / 60000)}min, no progress for ${Math.floor(progressStaleDuration / 60000)}min, no file activity for ${Math.floor(fileStaleDuration / 60000)}min`;
        }

        // Periodic stale-status logging (every minute of staleness past 3 min).
        const allStale = logStaleDuration >= 180_000 && fileStaleDuration >= 180_000;
        if (allStale && logStaleDuration % 60_000 < HEARTBEAT_INTERVAL_MS) {
          log(`subprocess: no output for ${Math.floor(logStaleDuration / 1000)}s, no file activity for ${Math.floor(fileStaleDuration / 1000)}s`);
        } else if (logStaleDuration >= 180_000 && fileStaleDuration < 60_000 && logStaleDuration % 120_000 < HEARTBEAT_INTERVAL_MS) {
          log(`subprocess: stdout silent but files active (last file change ${Math.floor(fileStaleDuration / 1000)}s ago)`);
        }

        if (killed) {
          clearInterval(heartbeat);
          log(`subprocess: killing — ${killReason}`);
          try { child.kill('SIGTERM'); } catch {}
          setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 5000);
        }
      } catch { /* heartbeat must never throw */ }
    }, HEARTBEAT_INTERVAL_MS);

    child.on('error', (err) => {
      clearInterval(heartbeat);
      try { logStream.end(); } catch {}
      reject(err);
    });

    child.on('close', (code) => {
      clearInterval(heartbeat);
      try { logStream.end(); } catch {}
      if (phaseEventWriter && typeof phaseEventWriter.onEnd === 'function') {
        try { phaseEventWriter.onEnd(code); } catch {}
      }
      const stderr = stderrChunks
        .map((c) => (typeof c === 'string' ? c : c.toString()))
        .join('');
      resolve({
        exitCode: code,
        killed,
        killReason,
        stderr,
        elapsedMs: Date.now() - startedAt,
      });
    });
  });
}

module.exports = {
  runSubprocess,
  runPhaseSubprocess,
  // Exported for tests + advanced callers.
  HEARTBEAT_INTERVAL_MS,
  DEFAULT_PROGRESS_STALE_MS,
  DEFAULT_LOG_STALE_MS,
  DEFAULT_HARD_CEILING_MS,
  checkFileActivity,
};
