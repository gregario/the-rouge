/**
 * Subprocess dispatch strategy — `claude -p` invocation.
 *
 * Phase 3 of the grand unified reconciliation. This strategy is the
 * thin shape that facade.runPhase calls when `mode === 'subprocess'`.
 * The full per-phase orchestration (cwd setup, env injection,
 * stream-json parsing, allowed-tools wiring, MCP wiring) lives in
 * `rouge-loop.js` today — Phase 4 migrates that logic behind this
 * strategy. For Phase 3 the strategy is callable but minimal: it
 * spawns claude -p and returns the trimmed stdout, suitable for
 * non-tool-using ad-hoc phase invocations from tests + scripts.
 *
 * The full migration (Phase 4) replaces the body below with the
 * orchestration currently in rouge-loop's `runPhase` function. That
 * delivers the GC.4 boundary: rouge-loop.js stops spawning claude
 * directly, calls facade.runPhase({ mode: 'subprocess' }) instead.
 */

'use strict';

const { spawn } = require('node:child_process');

/**
 * Run a phase via `claude -p`.
 *
 * @param {object} opts
 *   - prompt: the user message text (required)
 *   - cwd: working dir for the subprocess (default process.cwd())
 *   - env: env-vars (default process.env)
 *   - args: extra CLI args (default [])
 *   - timeoutMs: SIGTERM after this duration (default 10 min)
 *   - signal: AbortSignal — alternative to timeoutMs
 * @returns {Promise<{ stdout, stderr, code }>}
 */
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

module.exports = { runSubprocess };
