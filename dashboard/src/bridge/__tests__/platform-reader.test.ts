import { describe, it, expect } from 'vitest'
import { readPlatformData } from '../platform-reader'
import { homedir } from 'os'
import { existsSync } from 'fs'
import { join } from 'path'

// Exercises the reader against the real projects dir (migrated out of
// the repo in #143). Skip gracefully if the user hasn't run the
// migration so a fresh clone doesn't fail.
const PROJECTS_ROOT = join(homedir(), '.rouge', 'projects')
const withProjects = existsSync(join(PROJECTS_ROOT, 'mtgordle')) ? it : it.skip

describe('readPlatformData', () => {
  withProjects('aggregates providers across all projects', () => {
    const data = readPlatformData(PROJECTS_ROOT)
    expect(data.quotas).toHaveLength(5)
    expect(data.totalProjects).toBeGreaterThan(0)
  })

  withProjects('includes mtgordle under vercel', () => {
    const data = readPlatformData(PROJECTS_ROOT)
    const vercel = data.quotas.find((q) => q.provider === 'vercel')
    expect(vercel?.projects.some((p) => p.slug === 'mtgordle')).toBe(true)
  })

  withProjects('project status is active or paused (not complete)', () => {
    const data = readPlatformData(PROJECTS_ROOT)
    const vercel = data.quotas.find((q) => q.provider === 'vercel')
    const mtg = vercel?.projects.find((p) => p.slug === 'mtgordle')
    expect(mtg?.status).toBeDefined()
    expect(['active', 'paused']).toContain(mtg?.status)
  })

  withProjects('includes posthog as a provider', () => {
    const data = readPlatformData(PROJECTS_ROOT)
    const posthog = data.quotas.find((q) => q.provider === 'posthog')
    expect(posthog).toBeDefined()
  })
})
