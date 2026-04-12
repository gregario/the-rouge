import { resolve } from 'path'
import { describe, it, expect } from 'vitest'
import { readPlatformData } from '../platform-reader'

const PROJECTS_ROOT = resolve(__dirname, '../../../../projects')

describe('readPlatformData', () => {
  it('aggregates providers across all projects', () => {
    const data = readPlatformData(PROJECTS_ROOT)
    expect(data.quotas).toHaveLength(5)
    expect(data.totalProjects).toBeGreaterThan(0)
  })

  it('includes mtgordle under vercel', () => {
    const data = readPlatformData(PROJECTS_ROOT)
    const vercel = data.quotas.find((q) => q.provider === 'vercel')
    expect(vercel?.projects.some((p) => p.slug === 'mtgordle')).toBe(true)
  })

  it('project status is active or paused (not complete)', () => {
    const data = readPlatformData(PROJECTS_ROOT)
    const vercel = data.quotas.find((q) => q.provider === 'vercel')
    const mtg = vercel?.projects.find((p) => p.slug === 'mtgordle')
    expect(mtg?.status).toBeDefined()
    expect(['active', 'paused']).toContain(mtg?.status)
  })

  it('includes posthog as a provider', () => {
    const data = readPlatformData(PROJECTS_ROOT)
    const posthog = data.quotas.find((q) => q.provider === 'posthog')
    expect(posthog).toBeDefined()
  })
})
