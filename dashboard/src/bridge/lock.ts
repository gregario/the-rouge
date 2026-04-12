import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const LOCK_FILE = '.control-plane.lock'

interface LockInfo {
  type: string
  pid: number
  started: string
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export function acquireLock(rougeRoot: string, type: 'frontend' | 'slack'): boolean {
  const lockPath = join(rougeRoot, LOCK_FILE)

  if (existsSync(lockPath)) {
    try {
      const existing: LockInfo = JSON.parse(readFileSync(lockPath, 'utf-8'))
      if (isPidAlive(existing.pid)) {
        return false // locked by a live process
      }
      // Stale lock — PID is dead, clean up
      unlinkSync(lockPath)
    } catch {
      // Corrupted lock file — remove it
      unlinkSync(lockPath)
    }
  }

  mkdirSync(rougeRoot, { recursive: true })
  writeFileSync(lockPath, JSON.stringify({
    type,
    pid: process.pid,
    started: new Date().toISOString(),
  }))
  return true
}

export function releaseLock(rougeRoot: string): void {
  const lockPath = join(rougeRoot, LOCK_FILE)
  if (existsSync(lockPath)) {
    unlinkSync(lockPath)
  }
}

export function isLocked(rougeRoot: string): { locked: boolean; type?: string } {
  const lockPath = join(rougeRoot, LOCK_FILE)
  if (!existsSync(lockPath)) return { locked: false }

  try {
    const info: LockInfo = JSON.parse(readFileSync(lockPath, 'utf-8'))
    if (isPidAlive(info.pid)) {
      return { locked: true, type: info.type }
    }
    // Stale — clean up
    unlinkSync(lockPath)
    return { locked: false }
  } catch {
    return { locked: false }
  }
}
