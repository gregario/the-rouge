import { describe, it, expect, afterEach } from 'vitest'
import { acquireLock, releaseLock, isLocked } from '../lock'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('Control plane lock', () => {
  const lockDir = join(tmpdir(), 'rouge-lock-test-' + Date.now())

  afterEach(() => {
    rmSync(lockDir, { recursive: true, force: true })
  })

  it('acquires lock when none exists', () => {
    expect(acquireLock(lockDir, 'frontend')).toBe(true)
  })

  it('rejects lock when already held by live process', () => {
    acquireLock(lockDir, 'frontend')
    expect(acquireLock(lockDir, 'slack')).toBe(false)
  })

  it('allows lock after release', () => {
    acquireLock(lockDir, 'frontend')
    releaseLock(lockDir)
    expect(acquireLock(lockDir, 'slack')).toBe(true)
  })

  it('cleans up stale lock with dead PID', () => {
    mkdirSync(lockDir, { recursive: true })
    writeFileSync(join(lockDir, '.control-plane.lock'), JSON.stringify({
      type: 'slack', pid: 999999, started: new Date().toISOString()
    }))
    expect(acquireLock(lockDir, 'frontend')).toBe(true)
  })

  it('isLocked returns correct status', () => {
    expect(isLocked(lockDir).locked).toBe(false)
    acquireLock(lockDir, 'frontend')
    const status = isLocked(lockDir)
    expect(status.locked).toBe(true)
    expect(status.type).toBe('frontend')
  })
})
