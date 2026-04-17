import { spawn } from 'child_process'
import { readFileSync, writeFileSync, existsSync, unlinkSync, openSync } from 'fs'
import { join } from 'path'
import { statePath as resolveStatePath, writeStateJson } from './state-path'

const PID_FILE = '.build-pid'

interface BuildInfo {
  pid: number
  startedAt: string
}

// In-process dedupe for concurrent Start clicks. Two clicks within the
// 800 ms settlement window race to write `.build-pid`; both succeed,
// last-write-wins, and we leak the loser PID. Coalesce on slug so the
// second caller waits for the first's resolution and returns the same
// answer.
const inFlightStarts = new Map<string, ReturnType<typeof startBuildInner>>()

/**
 * Check if a PID is a live process.
 */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Read the build PID file for a project. Returns null if no build is tracked
 * OR if the tracked PID is dead (and cleans up the stale file).
 */
export function readBuildInfo(projectDir: string): BuildInfo | null {
  const pidPath = join(projectDir, PID_FILE)
  if (!existsSync(pidPath)) return null
  try {
    const info: BuildInfo = JSON.parse(readFileSync(pidPath, 'utf-8'))
    if (!isPidAlive(info.pid)) {
      // Stale PID — clean up
      unlinkSync(pidPath)
      return null
    }
    return info
  } catch {
    return null
  }
}

/**
 * Spawn `rouge build <slug>` as a detached subprocess. Writes the PID to
 * <projectDir>/.build-pid so the loop can be stopped later. Returns the
 * PID immediately — doesn't wait for the process to finish.
 */
/**
 * Spawns the Rouge loop directly (node src/launcher/rouge-loop.js) with
 * ROUGE_PROJECT_FILTER set to the project slug. This matches the tmux/screen
 * pattern documented in The-Rouge/docs/setup.md:
 *
 *     tmux new-session -d -s rouge 'node src/launcher/rouge-loop.js'
 *
 * rouge-cli.js's `build` command just sets ROUGE_PROJECT_FILTER and spawns the
 * same file — we skip the wrapper to avoid an extra process layer.
 */
export async function startBuild(
  projectsRoot: string,
  rougeCliPath: string,
  slug: string,
): Promise<{ ok: true; pid: number; alreadyRunning?: boolean } | { ok: false; error: string }> {
  const existing = inFlightStarts.get(slug)
  if (existing) return existing
  const promise = startBuildInner(projectsRoot, rougeCliPath, slug)
  inFlightStarts.set(slug, promise)
  try {
    return await promise
  } finally {
    // Clear once settled so a real second start (much later) goes
    // through the full path again.
    inFlightStarts.delete(slug)
  }
}

async function startBuildInner(
  projectsRoot: string,
  rougeCliPath: string,
  slug: string,
): Promise<{ ok: true; pid: number; alreadyRunning?: boolean } | { ok: false; error: string }> {
  const projectDir = join(projectsRoot, slug)
  if (!existsSync(projectDir)) {
    return { ok: false, error: 'Project not found' }
  }

  // Transition state.current_state from 'ready' to 'foundation' (or
  // 'story-building' if foundation is already complete). The Rouge loop
  // skips projects in 'ready' state — it's waiting for a human trigger.
  // This matches what the Slack bot does in its `start` command.
  //
  // We remember the prior state so we can roll back if the subprocess
  // fails to launch — otherwise a failed Start leaves the project
  // looking like it's building when no process exists, and the UI shows
  // Stop against a zombie (the exact symptom from the earlier ENOENT
  // crash; see audit finding A in #161 followup).
  const statePath = resolveStatePath(projectDir)
  let priorCurrentState: string | null = null
  if (existsSync(statePath)) {
    try {
      const state = JSON.parse(readFileSync(statePath, 'utf-8'))
      if (state.current_state === 'ready' || state.current_state === 'seeding') {
        priorCurrentState = state.current_state
        const foundationComplete = state.foundation?.status === 'complete'
        state.current_state = foundationComplete ? 'story-building' : 'foundation'
        writeStateJson(projectDir, state)
      } else if (state.current_state === 'complete') {
        return { ok: false, error: `Project is complete — nothing to build` }
      }
      // Otherwise the loop is already past ready (e.g., already building) — leave state alone
    } catch (err) {
      return {
        ok: false,
        error: `Failed to read/update state.json: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }

  const rollbackState = () => {
    if (priorCurrentState === null) return
    try {
      const st = JSON.parse(readFileSync(statePath, 'utf-8'))
      if (st.current_state === 'foundation' || st.current_state === 'story-building') {
        st.current_state = priorCurrentState
        writeStateJson(projectDir, st)
      }
    } catch {
      // best effort
    }
  }

  // Check if a build is already running — if so, the state transition above
  // is enough to kick it into gear on the next loop tick.
  const existing = readBuildInfo(projectDir)
  if (existing) {
    return { ok: true, pid: existing.pid, alreadyRunning: true }
  }

  // Derive rouge-loop.js path from the CLI path (they're in the same dir)
  const loopScript = join(rougeCliPath, '..', 'rouge-loop.js')
  if (!existsSync(loopScript)) {
    rollbackState()
    return { ok: false, error: `rouge-loop.js not found at ${loopScript}` }
  }

  let child: ReturnType<typeof spawn>
  try {
    // Redirect stdout/stderr to a log file so the loop's output is captured
    // (and user can diagnose hangs). Must open files first because the child
    // is detached — after spawn, the bridge can't manage these fds.
    const logPath = join(projectDir, 'build.log')
    const logFd = openSync(logPath, 'a') // append mode
    // Leave stdin as 'ignore' — the loop reads from files, not stdin.
    child = spawn('node', [loopScript], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      // Run from the Rouge repo root (parent of src/launcher/), matching the
      // documented tmux invocation's cwd.
      cwd: join(rougeCliPath, '..', '..', '..'),
      env: {
        ...process.env,
        ROUGE_PROJECT_FILTER: slug,
      },
    })
  } catch (err) {
    rollbackState()
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  child.unref()

  if (!child.pid) {
    rollbackState()
    return { ok: false, error: 'Failed to spawn process' }
  }

  // Wait briefly for settlement. spawn() can succeed with a valid PID
  // but the child may immediately crash (node can't find the script,
  // module load throws, etc.) — see the ENOENT incident that prompted
  // this rollback logic. If the subprocess exits within the settlement
  // window, we roll state back so the user doesn't see a zombie Stop
  // button against a project that was never really building.
  const SETTLEMENT_MS = 800
  const settled = await new Promise<{ exited: boolean; code: number | null }>((resolve) => {
    const t = setTimeout(() => resolve({ exited: false, code: null }), SETTLEMENT_MS)
    child.once('exit', (code) => {
      clearTimeout(t)
      resolve({ exited: true, code })
    })
  })

  if (settled.exited) {
    rollbackState()
    return {
      ok: false,
      error: `build subprocess exited immediately (code ${settled.code ?? '?'}) — check build.log`,
    }
  }

  // Still alive after settlement — consider the launch successful.
  const info: BuildInfo = {
    pid: child.pid,
    startedAt: new Date().toISOString(),
  }
  writeFileSync(join(projectDir, PID_FILE), JSON.stringify(info, null, 2))
  return { ok: true, pid: child.pid }
}

type StopResult =
  | { ok: true; killed: 'sigint' | 'sigkill' }
  | { ok: true; alreadyStopped: true; stateRolledBack?: boolean }
  | { ok: false; error: string }

/**
 * Stop a running build. Sends SIGINT first (clean shutdown — the Rouge launcher
 * exits with code 130 on SIGINT). If the process is still alive after `graceMs`,
 * escalate to SIGKILL. Note: the launcher deliberately ignores SIGTERM as a
 * daemon-resilience feature, so we don't use it.
 *
 * Idempotent: if no PID exists, returns `{ok: true, alreadyStopped: true}`
 * rather than an error. Stop is semantically "ensure stopped" — if nothing
 * is running, that's already the case, so pressing Stop twice or pressing
 * Stop on a zombie shouldn't pop an error overlay.
 *
 * Zombie-state recovery: if the build PID is gone but
 * `state.current_state` is still a building state (`foundation` /
 * `story-building`), roll the state back to `ready`. This repairs the
 * inconsistency left behind by earlier failed Starts (pre-rollback
 * logic) so the user can press Start again without hand-editing state.
 */
export async function stopBuild(
  projectsRoot: string,
  slug: string,
  graceMs = 5000,
): Promise<StopResult> {
  const projectDir = join(projectsRoot, slug)
  const info = readBuildInfo(projectDir)
  if (!info) {
    const stateRolledBack = rollbackZombieBuildState(projectDir)
    return { ok: true, alreadyStopped: true, ...(stateRolledBack ? { stateRolledBack: true } : {}) }
  }

  const { pid } = info

  // Try SIGINT first (graceful)
  try {
    process.kill(pid, 'SIGINT')
  } catch (err) {
    return { ok: false, error: `Failed to send SIGINT: ${err instanceof Error ? err.message : String(err)}` }
  }

  // Wait for process to exit
  const start = Date.now()
  while (Date.now() - start < graceMs) {
    if (!isPidAlive(pid)) {
      cleanupPidFile(projectDir)
      return { ok: true, killed: 'sigint' }
    }
    await sleep(200)
  }

  // Still alive — escalate to SIGKILL
  try {
    process.kill(pid, 'SIGKILL')
  } catch (err) {
    return { ok: false, error: `Failed to send SIGKILL: ${err instanceof Error ? err.message : String(err)}` }
  }

  // Give the OS a moment to clean up
  await sleep(200)
  cleanupPidFile(projectDir)
  return { ok: true, killed: 'sigkill' }
}

/**
 * If state.current_state claims the project is building but no PID file
 * exists, flip it back to `ready`. Returns true if a rollback was
 * performed. Caller uses this on the idempotent-stop path to recover
 * from a half-started session.
 */
function rollbackZombieBuildState(projectDir: string): boolean {
  const statePath = resolveStatePath(projectDir)
  if (!existsSync(statePath)) return false
  try {
    const state = JSON.parse(readFileSync(statePath, 'utf-8'))
    const cur = state.current_state
    if (cur === 'foundation' || cur === 'story-building') {
      state.current_state = 'ready'
      writeStateJson(projectDir, state)
      return true
    }
  } catch {
    // best effort
  }
  return false
}

function cleanupPidFile(projectDir: string): void {
  const pidPath = join(projectDir, PID_FILE)
  if (existsSync(pidPath)) {
    try { unlinkSync(pidPath) } catch {}
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
