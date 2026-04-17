import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { stopBuild, startBuild } from '../build-runner'

// stopBuild tests. startBuild's settlement logic spawns real child
// processes and is harder to test hermetically — left for integration.

let projectsRoot: string

beforeEach(() => {
  projectsRoot = mkdtempSync(join(tmpdir(), 'rouge-build-runner-'))
})

afterEach(() => {
  rmSync(projectsRoot, { recursive: true, force: true })
})

function writeProject(slug: string, stateOverrides: Record<string, unknown> = {}): string {
  const dir = join(projectsRoot, slug)
  mkdirSync(join(dir, '.rouge'), { recursive: true })
  writeFileSync(
    join(dir, '.rouge', 'state.json'),
    JSON.stringify({ current_state: 'ready', ...stateOverrides }, null, 2),
  )
  return dir
}

describe('stopBuild — idempotent (#161 followup)', () => {
  it('returns alreadyStopped when no PID file exists, state is ready', async () => {
    writeProject('alpha', { current_state: 'ready' })
    const result = await stopBuild(projectsRoot, 'alpha')
    expect(result.ok).toBe(true)
    if (result.ok && 'alreadyStopped' in result) {
      expect(result.alreadyStopped).toBe(true)
      expect(result.stateRolledBack).toBeUndefined()
    } else {
      throw new Error('expected alreadyStopped')
    }
  })

  it('rolls back zombie foundation state to ready when no PID exists', async () => {
    // Exact symptom from the testimonial session after the ENOENT Start
    // crash: state claims foundation, no PID. Pressing Stop should
    // succeed idempotently AND clean up the state.
    const dir = writeProject('alpha', { current_state: 'foundation' })
    const result = await stopBuild(projectsRoot, 'alpha')
    expect(result.ok).toBe(true)
    if (result.ok && 'alreadyStopped' in result) {
      expect(result.alreadyStopped).toBe(true)
      expect(result.stateRolledBack).toBe(true)
    } else {
      throw new Error('expected alreadyStopped with rollback')
    }
    const state = JSON.parse(readFileSync(join(dir, '.rouge', 'state.json'), 'utf-8'))
    expect(state.current_state).toBe('ready')
  })

  it('rolls back zombie story-building state to ready', async () => {
    const dir = writeProject('alpha', { current_state: 'story-building' })
    const result = await stopBuild(projectsRoot, 'alpha')
    expect(result.ok).toBe(true)
    const state = JSON.parse(readFileSync(join(dir, '.rouge', 'state.json'), 'utf-8'))
    expect(state.current_state).toBe('ready')
  })

  it('does NOT roll back non-build states (seeding, complete, escalation)', async () => {
    const dir = writeProject('alpha', { current_state: 'seeding' })
    const result = await stopBuild(projectsRoot, 'alpha')
    expect(result.ok).toBe(true)
    const state = JSON.parse(readFileSync(join(dir, '.rouge', 'state.json'), 'utf-8'))
    // Seeding stays seeding — Stop is not meant to retreat from seeding.
    expect(state.current_state).toBe('seeding')
  })

  it('coalesces concurrent startBuild calls for the same slug', async () => {
    // Project doesn't exist → startBuild returns instantly with the same
    // error. Two parallel calls should produce identical results and
    // never crash from the in-flight dedupe path.
    const a = startBuild(projectsRoot, '/tmp/no-such-rouge-cli.js', 'ghost')
    const b = startBuild(projectsRoot, '/tmp/no-such-rouge-cli.js', 'ghost')
    const [ra, rb] = await Promise.all([a, b])
    expect(ra.ok).toBe(false)
    expect(rb.ok).toBe(false)
    expect(ra).toEqual(rb)
  })

  it('cleans up a stale PID file (dead process) via readBuildInfo', async () => {
    const dir = writeProject('alpha', { current_state: 'foundation' })
    // PID 999999 — essentially guaranteed not to exist.
    writeFileSync(
      join(dir, '.build-pid'),
      JSON.stringify({ pid: 999999, startedAt: new Date().toISOString() }),
    )
    const result = await stopBuild(projectsRoot, 'alpha')
    expect(result.ok).toBe(true)
    // readBuildInfo (called inside stopBuild) removes the stale file; the
    // idempotent-stop branch then runs and rolls back state.
    expect(existsSync(join(dir, '.build-pid'))).toBe(false)
    const state = JSON.parse(readFileSync(join(dir, '.rouge', 'state.json'), 'utf-8'))
    expect(state.current_state).toBe('ready')
  })
})
