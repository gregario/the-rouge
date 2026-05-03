/**
 * Orphan process cleanup for Rouge.
 *
 * Three surfaces:
 *   1. reapStaleProcesses() — scan project dirs, delete PID/lock files
 *      whose tracked PID is dead.
 *   2. killProcessTree() — kill a parent PID and all its children
 *      (SIGTERM first, SIGKILL after 3 s).
 *   3. startPeriodicReaper() — run reapStaleProcesses on a 60 s interval.
 *
 * macOS note: `pkill -P <pid>` sends SIGTERM to immediate children.
 * process.kill(-pid) kills the process group, but only if the child was
 * spawned with `detached: true` (which creates a new PGID = child PID).
 * We use both strategies for coverage.
 */

import { execSync } from 'child_process'
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the given PID corresponds to a live process.
 * Distinguishes ESRCH (no such process) from EPERM (process exists but
 * owned by another user — still alive).
 */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err: any) {
    // EPERM means the process exists but we can't signal it.
    if (err?.code === 'EPERM') return true
    return false
  }
}

// ---------------------------------------------------------------------------
// killProcessTree
// ---------------------------------------------------------------------------

/**
 * Kill a process and all its children.
 *
 * Strategy:
 *   1. pkill -P <pid> to kill child processes (macOS/Linux).
 *   2. SIGTERM the parent.
 *   3. Wait up to 3 s for the parent to die.
 *   4. If still alive, SIGKILL the parent and any surviving children.
 *
 * Swallows all errors for already-dead processes.
 */
export async function killProcessTree(pid: number): Promise<void> {
  // Step 1: kill children via pkill
  try {
    execSync(`pkill -P ${pid} 2>/dev/null`, { timeout: 5000 })
  } catch {
    // pkill exits non-zero if no children found — expected
  }

  // Step 2: SIGTERM the parent
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    // Already dead — nothing to do
    return
  }

  // Step 3: Wait up to 3 seconds for graceful exit
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) return
    await new Promise((r) => setTimeout(r, 200))
  }

  // Step 4: Force kill parent + surviving children
  try {
    execSync(`pkill -9 -P ${pid} 2>/dev/null`, { timeout: 5000 })
  } catch {
    // No children or already dead
  }
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    // Already dead
  }
}

// ---------------------------------------------------------------------------
// reapStaleProcesses
// ---------------------------------------------------------------------------

/** Files to check per project, with the PID extraction strategy. */
interface PidFileSpec {
  /** Relative path within the project directory. */
  relativePath: string
  /** Extract PID from file contents. Return null if unparseable. */
  extractPid: (content: string) => number | null
}

const PID_FILES: PidFileSpec[] = [
  {
    relativePath: '.build-pid',
    extractPid: (c) => {
      try {
        return JSON.parse(c).pid ?? null
      } catch {
        return null
      }
    },
  },
  {
    relativePath: '.seed-pid',
    extractPid: (c) => {
      try {
        return JSON.parse(c).pid ?? null
      } catch {
        return null
      }
    },
  },
  {
    relativePath: '.rouge/state.lock',
    extractPid: (c) => {
      try {
        return JSON.parse(c).pid ?? null
      } catch {
        return null
      }
    },
  },
]

const HEARTBEAT_STALE_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Scan all project directories under projectsRoot.
 * For each project, check PID files and lock files; delete any whose
 * tracked PID is dead. Also warn about stale heartbeat files.
 *
 * Returns the list of cleaned-up file paths (for logging).
 */
export function reapStaleProcesses(projectsRoot: string): { cleaned: string[] } {
  const cleaned: string[] = []
  if (!existsSync(projectsRoot)) return { cleaned }

  let entries: string[]
  try {
    entries = readdirSync(projectsRoot)
  } catch {
    return { cleaned }
  }

  for (const entry of entries) {
    const projectDir = join(projectsRoot, entry)
    try {
      if (!statSync(projectDir).isDirectory()) continue
    } catch {
      continue
    }

    // Check each PID file
    for (const spec of PID_FILES) {
      const filePath = join(projectDir, spec.relativePath)
      if (!existsSync(filePath)) continue
      try {
        const content = readFileSync(filePath, 'utf-8')
        const pid = spec.extractPid(content)
        if (pid !== null && !isPidAlive(pid)) {
          unlinkSync(filePath)
          cleaned.push(filePath)
        }
      } catch {
        // File vanished between exists check and read — fine
      }
    }

    // Check seed-heartbeat.json for staleness
    const heartbeatPath = join(projectDir, 'seed-heartbeat.json')
    if (existsSync(heartbeatPath)) {
      try {
        const hb = JSON.parse(readFileSync(heartbeatPath, 'utf-8'))
        const lastTick = hb.lastTickAt ? new Date(hb.lastTickAt).getTime() : 0
        const stale = Date.now() - lastTick > HEARTBEAT_STALE_MS
        if (stale) {
          // Check if the associated seed daemon PID is dead
          const seedPidPath = join(projectDir, '.seed-pid')
          if (existsSync(seedPidPath)) {
            try {
              const seedInfo = JSON.parse(readFileSync(seedPidPath, 'utf-8'))
              if (seedInfo.pid && !isPidAlive(seedInfo.pid)) {
                console.log(
                  `[process-reaper] stale heartbeat for ${entry}: lastTickAt=${hb.lastTickAt}, daemon PID ${seedInfo.pid} is dead`,
                )
              }
            } catch {
              // Unparseable seed-pid — already handled by PID file cleanup above
            }
          } else {
            console.log(
              `[process-reaper] stale heartbeat for ${entry}: lastTickAt=${hb.lastTickAt}, no daemon PID file`,
            )
          }
        }
      } catch {
        // Unparseable heartbeat — ignore
      }
    }
  }

  return { cleaned }
}

// ---------------------------------------------------------------------------
// startPeriodicReaper
// ---------------------------------------------------------------------------

const DEFAULT_INTERVAL_MS = 60_000 // 60 seconds

/**
 * Start a background interval that runs reapStaleProcesses.
 * Logs any cleaned files. Returns the interval handle so the caller
 * can clear it on shutdown.
 */
export function startPeriodicReaper(
  projectsRoot: string,
  intervalMs: number = DEFAULT_INTERVAL_MS,
): ReturnType<typeof setInterval> {
  const handle = setInterval(() => {
    try {
      const { cleaned } = reapStaleProcesses(projectsRoot)
      if (cleaned.length > 0) {
        console.log(
          `[process-reaper] periodic sweep cleaned ${cleaned.length} stale files:`,
          cleaned,
        )
      }
    } catch (err) {
      console.error('[process-reaper] periodic sweep error:', err)
    }
  }, intervalMs)

  // Don't block Node from exiting if this is the only timer left
  if (handle.unref) handle.unref()

  return handle
}
