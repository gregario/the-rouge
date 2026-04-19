import { spawn } from 'child_process'
import { existsSync, openSync } from 'fs'
import { join, resolve } from 'path'
import { readSeedPid, type SeedPidInfo } from './seed-daemon-pid'

/**
 * Spawn the seeding daemon (detached) for a project if one is not
 * already running. Returns the daemon's PID info, or an error.
 *
 * The daemon is a TypeScript file run via `tsx` (already a dashboard
 * devDependency). We resolve `tsx` from the dashboard's
 * `node_modules/.bin/` at runtime rather than depending on PATH — in
 * both dev (`next dev`) and prod (standalone Next build), the
 * dashboard's node_modules is the canonical location.
 *
 * Detached + unref: matches the build-runner pattern
 * (build-runner.ts:182-201). Once spawned, the daemon outlives the
 * HTTP request that created it; the dashboard process can restart
 * (HMR, redeploy) without killing in-flight seeding work.
 *
 * Log destination: the daemon's stdout/stderr goes to
 * `<projectDir>/seed-daemon.log` (append mode) so the operator can
 * diagnose crashes without keeping the dashboard open.
 */

const DAEMON_RELATIVE_PATH = 'src/bridge/seed-daemon.ts'
const TSX_RELATIVE_PATHS = [
  // Dev: dashboard/node_modules/.bin/tsx
  '../../node_modules/.bin/tsx',
  // Prod (standalone): dashboard/ROUGE_STANDALONE/node_modules/.bin/tsx
  '../../ROUGE_STANDALONE/node_modules/.bin/tsx',
]

function resolveTsxBinary(fromDir: string): string | null {
  for (const rel of TSX_RELATIVE_PATHS) {
    const candidate = resolve(fromDir, rel)
    if (existsSync(candidate)) return candidate
  }
  // Environment override for test environments or unusual layouts.
  const envHint = process.env.ROUGE_TSX_BIN
  if (envHint && existsSync(envHint)) return envHint
  return null
}

function resolveDaemonScript(fromDir: string): string {
  // __dirname is the compiled location at runtime. Under Next, that
  // points at a bundled path; under node+tsx (tests), it points at
  // dashboard/src/bridge. Try both layouts.
  const candidates = [
    // Source layout: this file at dashboard/src/bridge, daemon sibling.
    resolve(fromDir, 'seed-daemon.ts'),
    // Env hint for unusual layouts.
    process.env.ROUGE_SEED_DAEMON_SCRIPT,
  ].filter((p): p is string => typeof p === 'string' && p.length > 0)

  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  // Fall through to the first candidate so the spawn error message
  // points at a real-looking path.
  return candidates[0]
}

export interface SpawnResult {
  ok: boolean
  pid?: number
  alreadyRunning?: boolean
  error?: string
}

/**
 * Ensure a seeding daemon is running for this project. If one is
 * already alive, returns its PID. Otherwise spawns a new one.
 *
 * This is invoked by the HTTP handler after enqueueing a user message
 * — the daemon picks up the queue on its next tick (or immediately
 * on cold start).
 *
 * Scoped to the feature flag `ROUGE_USE_SEED_DAEMON`. Callers should
 * check the flag before invoking this helper; this function itself
 * does not.
 */
export function ensureSeedDaemon(projectDir: string): SpawnResult {
  const existing: SeedPidInfo | null = readSeedPid(projectDir)
  if (existing) {
    return { ok: true, pid: existing.pid, alreadyRunning: true }
  }

  const tsxBin = resolveTsxBinary(__dirname)
  if (!tsxBin) {
    return {
      ok: false,
      error:
        'tsx binary not found. Expected at dashboard/node_modules/.bin/tsx. Install dashboard deps with `npm install` or set ROUGE_TSX_BIN.',
    }
  }

  const daemonScript = resolveDaemonScript(__dirname)
  if (!existsSync(daemonScript)) {
    return { ok: false, error: `seed-daemon.ts not found at ${daemonScript}` }
  }

  let logFd: number
  try {
    logFd = openSync(join(projectDir, 'seed-daemon.log'), 'a')
  } catch (err) {
    return {
      ok: false,
      error: `failed to open seed-daemon.log: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  let child: ReturnType<typeof spawn>
  try {
    child = spawn(tsxBin, [daemonScript, projectDir], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      // Run from the repo root so relative paths inside the daemon
      // resolve the same way the HTTP handler's do (orchestrator
      // prompt path, etc.).
      cwd: resolve(__dirname, DAEMON_RELATIVE_PATH, '..', '..', '..'),
      env: { ...process.env },
    })
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  child.unref()

  if (!child.pid) {
    return { ok: false, error: 'failed to spawn seed daemon (no PID)' }
  }

  // We return immediately — the daemon writes its own .seed-pid
  // on startup. The HTTP handler can read it back on the next
  // request if it needs confirmation. Not waiting here matches the
  // "return 202 immediately" contract of the new seed-handler path.
  return { ok: true, pid: child.pid, alreadyRunning: false }
}
