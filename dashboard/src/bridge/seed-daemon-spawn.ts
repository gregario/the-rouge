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

// Path resolution strategy: in Next 16 dev (Turbopack), `__dirname`
// points at a compiled bundle path deep under `.next/`, so a
// `resolve(__dirname, '../../node_modules/.bin/tsx')` walk lands
// somewhere that doesn't exist. Same gotcha `resolveOrchestratorPromptPath`
// in seed-handler.ts already works around. Use process.cwd() anchored
// candidates (which are stable across dev/prod) with __dirname as a
// fallback for node-run tests. Also check an env override.
function resolveTsxBinary(): string | null {
  const envHint = process.env.ROUGE_TSX_BIN
  if (envHint && existsSync(envHint)) return envHint

  const candidates: string[] = [
    // Dashboard invoked from repo root (`npm run dashboard`).
    resolve(process.cwd(), 'dashboard/node_modules/.bin/tsx'),
    // Dashboard invoked from its own dir (`cd dashboard && npm run dev`).
    resolve(process.cwd(), 'node_modules/.bin/tsx'),
    // Production standalone build.
    resolve(process.cwd(), 'dashboard/ROUGE_STANDALONE/node_modules/.bin/tsx'),
    resolve(process.cwd(), 'ROUGE_STANDALONE/node_modules/.bin/tsx'),
    // __dirname-based fallback for node-run tests (not Turbopack).
    resolve(__dirname, '../../node_modules/.bin/tsx'),
    resolve(__dirname, '../../../node_modules/.bin/tsx'),
  ]

  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return null
}

function resolveDaemonScript(): string {
  const envHint = process.env.ROUGE_SEED_DAEMON_SCRIPT
  if (envHint && existsSync(envHint)) return envHint

  const candidates: string[] = [
    // Dashboard invoked from repo root.
    resolve(process.cwd(), 'dashboard/src/bridge/seed-daemon.ts'),
    // Dashboard invoked from its own dir.
    resolve(process.cwd(), 'src/bridge/seed-daemon.ts'),
    // __dirname-based fallback (tests, node direct).
    resolve(__dirname, 'seed-daemon.ts'),
  ]

  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  // Fall through to the first candidate so the spawn error message
  // points at a real-looking path.
  return candidates[0]
}

function resolveDashboardDir(): string {
  // The daemon has to run with cwd = dashboard/ so `tsx` can find
  // `dashboard/tsconfig.json` and resolve the `@/*` path aliases used
  // by seeding-state.ts and friends. First attempt made the mistake
  // of setting cwd to the repo root; tsx then ignored the tsconfig
  // aliases and the daemon crashed on `Cannot find module @/lib/...`
  // right after import.
  //
  // Downstream code (e.g. resolveOrchestratorPromptPath in
  // seed-handler.ts) already handles both cwd layouts via a
  // candidate list — cwd = dashboard/ is the layout that matches
  // `cd dashboard && npm run dev`, which IS how the user runs the
  // dashboard in practice.
  const cwd = process.cwd()
  if (existsSync(resolve(cwd, 'tsconfig.json')) && existsSync(resolve(cwd, 'src/bridge/seed-daemon.ts'))) {
    return cwd
  }
  if (existsSync(resolve(cwd, 'dashboard/tsconfig.json'))) {
    return resolve(cwd, 'dashboard')
  }
  return cwd
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

  const tsxBin = resolveTsxBinary()
  if (!tsxBin) {
    return {
      ok: false,
      error:
        'tsx binary not found. Expected at dashboard/node_modules/.bin/tsx. Install dashboard deps with `npm install` or set ROUGE_TSX_BIN.',
    }
  }

  const daemonScript = resolveDaemonScript()
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
      // Run from the dashboard dir so tsx finds dashboard/tsconfig.json
      // and resolves `@/*` aliases (seeding-state.ts → @/lib/safe-read-json
      // etc.). Downstream prompt-path resolvers already try both cwd
      // layouts so the orchestrator prompt still loads correctly.
      cwd: resolveDashboardDir(),
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
