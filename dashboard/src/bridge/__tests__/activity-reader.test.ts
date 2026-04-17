import { describe, it, expect } from 'vitest'
import { readProjectActivity } from '../activity-reader'
import { homedir } from 'os'
import { existsSync } from 'fs'
import { join } from 'path'

// These tests exercise the reader against the real mtgordle project —
// migrated out of the repo in #143. If the user hasn't run the migration,
// skip gracefully so a fresh clone doesn't fail.
const PROJECTS_ROOT = join(homedir(), '.rouge', 'projects')
const MTGORDLE = join(PROJECTS_ROOT, 'mtgordle')
const withMtgordle = existsSync(MTGORDLE) ? it : it.skip

describe('readProjectActivity', () => {
  withMtgordle('reads checkpoints and produces critical events for mtgordle', () => {
    const events = readProjectActivity(MTGORDLE)
    expect(events.length).toBeGreaterThan(0)
    expect(events.length).toBeLessThan(100) // Critical filter should dramatically reduce from 455
  })

  withMtgordle('includes phase transitions', () => {
    const events = readProjectActivity(MTGORDLE)
    const transitions = events.filter((e) => e.type === 'phase-transition')
    expect(transitions.length).toBeGreaterThan(0)
  })

  withMtgordle('includes deploys from cycle_context', () => {
    const events = readProjectActivity(MTGORDLE)
    const deploys = events.filter((e) => e.type === 'deploy')
    expect(deploys.length).toBeGreaterThan(0)
    expect(String(deploys[0].metadata?.url)).toContain('vercel.app')
  })

  withMtgordle('events are sorted newest first', () => {
    const events = readProjectActivity(MTGORDLE)
    for (let i = 1; i < events.length; i++) {
      expect(events[i - 1].timestamp >= events[i].timestamp).toBe(true)
    }
  })

  withMtgordle('verbose mode returns all checkpoint entries', () => {
    const events = readProjectActivity(MTGORDLE, { verbose: true })
    expect(events.length).toBeGreaterThan(400) // mtgordle has 455+ checkpoints
  })

  it('returns empty array for project without checkpoints', () => {
    const events = readProjectActivity('/nonexistent/path')
    expect(events).toEqual([])
  })
})
