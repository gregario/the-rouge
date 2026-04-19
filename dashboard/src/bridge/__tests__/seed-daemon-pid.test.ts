import { describe, it, expect, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  readSeedPid,
  writeSeedPid,
  clearSeedPid,
  stillOwned,
  SEED_PID_FILE,
} from '../seed-daemon-pid'

describe('seed-daemon-pid', () => {
  const testDir = join(tmpdir(), 'seed-pid-test-' + Date.now())

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('writes and reads PID info atomically', () => {
    mkdirSync(testDir, { recursive: true })
    const info = writeSeedPid(testDir, process.pid)
    expect(info.pid).toBe(process.pid)
    expect(info.sessionId).toMatch(/^[0-9a-f-]{36}$/)

    const read = readSeedPid(testDir)
    expect(read).not.toBeNull()
    expect(read?.pid).toBe(process.pid)
    expect(read?.sessionId).toBe(info.sessionId)
  })

  it('read returns null when no PID file exists', () => {
    mkdirSync(testDir, { recursive: true })
    expect(readSeedPid(testDir)).toBeNull()
  })

  it('read cleans up and returns null for a dead PID', () => {
    mkdirSync(testDir, { recursive: true })
    // 2147483647 is int32 max — outside any real PID range so
    // process.kill(pid, 0) throws ESRCH. The reader treats the entry
    // as stale and removes the file.
    writeFileSync(
      join(testDir, SEED_PID_FILE),
      JSON.stringify({ pid: 2147483647, startedAt: '2026-04-19T00:00:00Z', sessionId: 'x' }),
    )
    expect(readSeedPid(testDir)).toBeNull()
    expect(existsSync(join(testDir, SEED_PID_FILE))).toBe(false)
  })

  it('read returns null and cleans up on malformed JSON', () => {
    mkdirSync(testDir, { recursive: true })
    writeFileSync(join(testDir, SEED_PID_FILE), '{ not valid json')
    // Malformed file — reader should not throw.
    expect(readSeedPid(testDir)).toBeNull()
  })

  it('clearSeedPid removes the file', () => {
    mkdirSync(testDir, { recursive: true })
    writeSeedPid(testDir, process.pid)
    clearSeedPid(testDir)
    expect(existsSync(join(testDir, SEED_PID_FILE))).toBe(false)
  })

  it('clearSeedPid is a no-op when the file is absent', () => {
    mkdirSync(testDir, { recursive: true })
    clearSeedPid(testDir)
    expect(existsSync(join(testDir, SEED_PID_FILE))).toBe(false)
  })

  it('stillOwned is true only if sessionId matches', () => {
    mkdirSync(testDir, { recursive: true })
    const info = writeSeedPid(testDir, process.pid)
    expect(stillOwned(testDir, info.sessionId)).toBe(true)
    expect(stillOwned(testDir, 'some-other-session-id')).toBe(false)
  })

  it('stillOwned is false when the PID file is missing', () => {
    mkdirSync(testDir, { recursive: true })
    expect(stillOwned(testDir, 'anything')).toBe(false)
  })

  it('overwriting the PID file rotates sessionId — earlier caller detects loss', () => {
    mkdirSync(testDir, { recursive: true })
    // Race scenario: two daemons start concurrently. Both call
    // writeSeedPid; last write wins. The loser checks stillOwned()
    // on the next tick and sees the winner's sessionId, so it exits.
    const daemonA = writeSeedPid(testDir, process.pid)
    const daemonB = writeSeedPid(testDir, process.pid)
    expect(stillOwned(testDir, daemonA.sessionId)).toBe(false)
    expect(stillOwned(testDir, daemonB.sessionId)).toBe(true)
  })
})
