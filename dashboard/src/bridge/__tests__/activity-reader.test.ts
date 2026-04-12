import { resolve } from 'path'
import { describe, it, expect } from 'vitest'
import { readProjectActivity } from '../activity-reader'
import { join } from 'path'

const PROJECTS_ROOT = resolve(__dirname, '../../../../projects')

describe('readProjectActivity', () => {
  it('reads checkpoints and produces critical events for mtgordle', () => {
    const events = readProjectActivity(join(PROJECTS_ROOT, 'mtgordle'))
    expect(events.length).toBeGreaterThan(0)
    expect(events.length).toBeLessThan(100) // Critical filter should dramatically reduce from 455
  })

  it('includes phase transitions', () => {
    const events = readProjectActivity(join(PROJECTS_ROOT, 'mtgordle'))
    const transitions = events.filter((e) => e.type === 'phase-transition')
    expect(transitions.length).toBeGreaterThan(0)
  })

  it('includes deploys from cycle_context', () => {
    const events = readProjectActivity(join(PROJECTS_ROOT, 'mtgordle'))
    const deploys = events.filter((e) => e.type === 'deploy')
    expect(deploys.length).toBeGreaterThan(0)
    expect(String(deploys[0].metadata?.url)).toContain('vercel.app')
  })

  it('events are sorted newest first', () => {
    const events = readProjectActivity(join(PROJECTS_ROOT, 'mtgordle'))
    for (let i = 1; i < events.length; i++) {
      expect(events[i - 1].timestamp >= events[i].timestamp).toBe(true)
    }
  })

  it('verbose mode returns all checkpoint entries', () => {
    const events = readProjectActivity(join(PROJECTS_ROOT, 'mtgordle'), { verbose: true })
    expect(events.length).toBeGreaterThan(400) // mtgordle has 455+ checkpoints
  })

  it('returns empty array for project without checkpoints', () => {
    const events = readProjectActivity('/nonexistent/path')
    expect(events).toEqual([])
  })
})
