import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { acquireStateLock, withStateLock } from '../state-lock'
import { writeStateJson } from '../state-path'

let projectDir: string

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'state-lock-'))
  mkdirSync(join(projectDir, '.rouge'), { recursive: true })
})

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true })
})

describe('state-lock', () => {
  it('serialises concurrent read-modify-write so no update is lost', async () => {
    // Baseline — field starts at 0; both mutators increment by 1. Without
    // the lock, both would read 0 and both write 1. With the lock, they
    // serialise and the final value is 2.
    writeStateJson(projectDir, { counter: 0 })

    const bump = () =>
      withStateLock(projectDir, () => {
        const cur = JSON.parse(readFileSync(join(projectDir, '.rouge', 'state.json'), 'utf-8'))
        // Force interleaving: yield to the scheduler between read and write.
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            cur.counter += 1
            writeStateJson(projectDir, cur)
            resolve()
          }, 10)
        })
      })

    await Promise.all([bump(), bump(), bump()])
    const final = JSON.parse(readFileSync(join(projectDir, '.rouge', 'state.json'), 'utf-8'))
    expect(final.counter).toBe(3)
  })

  it('breaks a stale lock left behind by a dead pid', async () => {
    const lockFile = join(projectDir, '.rouge', 'state.lock')
    // Write a lockfile claimed by a pid that's definitely not alive.
    writeFileSync(lockFile, JSON.stringify({ pid: 999999, acquiredAt: Date.now() }))
    expect(existsSync(lockFile)).toBe(true)

    // Our acquire should break the stale lock and succeed well within timeout.
    const start = Date.now()
    const release = await acquireStateLock(projectDir, { timeoutMs: 2000 })
    expect(Date.now() - start).toBeLessThan(1500)
    release()
    // After release, lockfile is gone.
    expect(existsSync(lockFile)).toBe(false)
  })

  it('breaks a lockfile that is older than the staleness window', async () => {
    const lockFile = join(projectDir, '.rouge', 'state.lock')
    // Claim ownership with OUR live pid but an acquiredAt in the distant
    // past — exercises the wall-clock staleness branch rather than the
    // dead-owner branch.
    writeFileSync(lockFile, JSON.stringify({ pid: process.pid, acquiredAt: Date.now() - 60_000 }))
    const release = await acquireStateLock(projectDir, { timeoutMs: 2000 })
    release()
  })

  it('times out when another live holder does not release', async () => {
    const releaseFirst = await acquireStateLock(projectDir, { timeoutMs: 1000 })
    try {
      await expect(
        acquireStateLock(projectDir, { timeoutMs: 200 }),
      ).rejects.toThrow(/timed out/i)
    } finally {
      releaseFirst()
    }
  })
})
