import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanProjects } from '../scanner'

// Tests use a fixture directory so they don't depend on the user's live
// projects. (Previously this suite pointed at `<repo>/projects/` which
// only worked because example projects happened to live inside the repo —
// broken by #143 which moved them to ~/.rouge/projects.)

let PROJECTS_ROOT: string

function writeProject(slug: string, state: Record<string, unknown>, cycleContext?: Record<string, unknown>) {
  const dir = join(PROJECTS_ROOT, slug)
  mkdirSync(join(dir, '.rouge'), { recursive: true })
  writeFileSync(join(dir, '.rouge', 'state.json'), JSON.stringify(state, null, 2))
  if (cycleContext) {
    writeFileSync(join(dir, 'cycle_context.json'), JSON.stringify(cycleContext, null, 2))
  }
}

beforeEach(() => {
  PROJECTS_ROOT = mkdtempSync(join(tmpdir(), 'rouge-scanner-test-'))
})

afterEach(() => {
  rmSync(PROJECTS_ROOT, { recursive: true, force: true })
})

describe('scanProjects', () => {
  it('finds projects with state.json', async () => {
    writeProject('alpha', { project: 'alpha', current_state: 'building', milestones: [] })
    writeProject('beta', { project: 'beta', current_state: 'complete', milestones: [] })
    const projects = await scanProjects(PROJECTS_ROOT)
    expect(projects.length).toBe(2)
  })

  it('detects V3 schema from milestones[]', async () => {
    writeProject('v3-proj', {
      project: 'v3-proj',
      current_state: 'story-building',
      milestones: [{ name: 'm1', status: 'pending' }],
    })
    const p = (await scanProjects(PROJECTS_ROOT)).find(p => p.slug === 'v3-proj')
    expect(p?.schemaVersion).toBe('v3')
  })

  it('detects V2 schema from feature_areas[]', async () => {
    writeProject('v2-proj', {
      project: 'v2-proj',
      current_state: 'building',
      feature_areas: [{ name: 'f1', status: 'pending' }],
    })
    const p = (await scanProjects(PROJECTS_ROOT)).find(p => p.slug === 'v2-proj')
    expect(p?.schemaVersion).toBe('v2')
  })

  it('excludes directories without state.json', async () => {
    writeProject('has-state', { project: 'has-state', current_state: 'building' })
    mkdirSync(join(PROJECTS_ROOT, 'no-state'))
    const slugs = (await scanProjects(PROJECTS_ROOT)).map(p => p.slug)
    expect(slugs).toContain('has-state')
    expect(slugs).not.toContain('no-state')
  })

  describe('provider detection', () => {
    it('detects vercel from staging_url', async () => {
      writeProject(
        'vercel-proj',
        { project: 'vercel-proj', current_state: 'complete' },
        { infrastructure: { staging_url: 'https://vercel-proj.vercel.app' } },
      )
      const p = (await scanProjects(PROJECTS_ROOT)).find(p => p.slug === 'vercel-proj')
      expect(p?.providers).toContain('vercel')
      expect(p?.deploymentUrl).toContain('vercel.app')
    })

    it('does not include supabase when supabase_ref is null', async () => {
      writeProject(
        'no-supabase',
        { project: 'no-supabase', current_state: 'complete' },
        { infrastructure: { staging_url: 'https://x.vercel.app', supabase_ref: null } },
      )
      const p = (await scanProjects(PROJECTS_ROOT)).find(p => p.slug === 'no-supabase')
      expect(p?.providers).not.toContain('supabase')
    })

    it('handles projects without cycle_context.json', async () => {
      writeProject('no-ctx', { project: 'no-ctx', current_state: 'seeding' })
      const p = (await scanProjects(PROJECTS_ROOT)).find(p => p.slug === 'no-ctx')
      expect(p?.providers).toBeInstanceOf(Array)
    })
  })

  it('returns normalized BridgeProjectSummary', async () => {
    writeProject('shape-check', { project: 'shape-check', current_state: 'ready', milestones: [] })
    const first = (await scanProjects(PROJECTS_ROOT))[0]
    expect(first).toHaveProperty('name')
    expect(first).toHaveProperty('slug')
    expect(first).toHaveProperty('state')
    expect(first).toHaveProperty('schemaVersion')
    expect(first).toHaveProperty('milestones')
    expect(first).toHaveProperty('hasStateFile')
  })
})
