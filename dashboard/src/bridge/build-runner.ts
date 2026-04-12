import { spawn } from 'child_process'
import { readFileSync, writeFileSync, existsSync, unlinkSync, openSync } from 'fs'
import { join } from 'path'

const PID_FILE = '.build-pid'

interface BuildInfo {
  pid: number
  startedAt: string
}

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
export function startBuild(
  projectsRoot: string,
  rougeCliPath: string,
  slug: string,
): { ok: true; pid: number; alreadyRunning?: boolean } | { ok: false; error: string } {
  const projectDir = join(projectsRoot, slug)
  if (!existsSync(projectDir)) {
    return { ok: false, error: 'Project not found' }
  }

  // Transition state.current_state from 'ready' to 'foundation' (or
  // 'story-building' if foundation is already complete). The Rouge loop
  // skips projects in 'ready' state — it's waiting for a human trigger.
  // This matches what the Slack bot does in its `start` command.
  const statePath = join(projectDir, 'state.json')
  if (existsSync(statePath)) {
    try {
      const state = JSON.parse(readFileSync(statePath, 'utf-8'))
      if (state.current_state === 'ready' || state.current_state === 'seeding') {
        const foundationComplete = state.foundation?.status === 'complete'
        state.current_state = foundationComplete ? 'story-building' : 'foundation'
        writeFileSync(statePath, JSON.stringify(state, null, 2))
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

  // Check if a build is already running — if so, the state transition above
  // is enough to kick it into gear on the next loop tick.
  const existing = readBuildInfo(projectDir)
  if (existing) {
    return { ok: true, pid: existing.pid, alreadyRunning: true }
  }

  // Derive rouge-loop.js path from the CLI path (they're in the same dir)
  const loopScript = join(rougeCliPath, '..', 'rouge-loop.js')
  if (!existsSync(loopScript)) {
    return { ok: false, error: `rouge-loop.js not found at ${loopScript}` }
  }

  try {
    // Redirect stdout/stderr to a log file so the loop's output is captured
    // (and user can diagnose hangs). Must open files first because the child
    // is detached — after spawn, the bridge can't manage these fds.
    const logPath = join(projectDir, 'build.log')
    const logFd = openSync(logPath, 'a') // append mode
    // Leave stdin as 'ignore' — the loop reads from files, not stdin.
    const child = spawn('node', [loopScript], {
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
    // Detach: don't keep parent event loop alive on child's account
    child.unref()

    if (!child.pid) {
      return { ok: false, error: 'Failed to spawn process' }
    }

    const info: BuildInfo = {
      pid: child.pid,
      startedAt: new Date().toISOString(),
    }
    writeFileSync(join(projectDir, PID_FILE), JSON.stringify(info, null, 2))
    return { ok: true, pid: child.pid }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Stop a running build. Sends SIGINT first (clean shutdown — the Rouge launcher
 * exits with code 130 on SIGINT). If the process is still alive after `graceMs`,
 * escalate to SIGKILL. Note: the launcher deliberately ignores SIGTERM as a
 * daemon-resilience feature, so we don't use it.
 */
export async function stopBuild(
  projectsRoot: string,
  slug: string,
  graceMs = 5000,
): Promise<{ ok: true; killed: 'sigint' | 'sigkill' } | { ok: false; error: string }> {
  const projectDir = join(projectsRoot, slug)
  const info = readBuildInfo(projectDir)
  if (!info) {
    return { ok: false, error: 'No build running for this project' }
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

function cleanupPidFile(projectDir: string): void {
  const pidPath = join(projectDir, PID_FILE)
  if (existsSync(pidPath)) {
    try { unlinkSync(pidPath) } catch {}
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
