import { resolve } from 'path'
import { describe, it, expect } from 'vitest'
import { scanProjects } from '../scanner'

const PROJECTS_ROOT = resolve(__dirname, '../../../../projects')

describe('scanProjects', () => {
  it('finds projects with state.json', () => {
    const projects = scanProjects(PROJECTS_ROOT)
    expect(projects.length).toBeGreaterThan(0)
  })

  it('includes mtgordle as a V3 project', () => {
    const projects = scanProjects(PROJECTS_ROOT)
    const mtg = projects.find(p => p.slug === 'mtgordle')
    expect(mtg).toBeDefined()
    expect(mtg!.schemaVersion).toBe('v3')
    expect(mtg!.state).toBeDefined()
  })

  it('includes countdowntimer as a V2 project', () => {
    const projects = scanProjects(PROJECTS_ROOT)
    const timer = projects.find(p => p.slug === 'countdowntimer')
    expect(timer).toBeDefined()
    expect(timer!.schemaVersion).toBe('v2')
  })

  it('excludes directories without state.json', () => {
    const projects = scanProjects(PROJECTS_ROOT)
    const slugs = projects.map(p => p.slug)
    // fleet-manager has no state.json
    expect(slugs).not.toContain('fleet-manager')
  })

  describe('provider detection', () => {
    it('detects vercel for mtgordle', () => {
      const projects = scanProjects(PROJECTS_ROOT)
      const mtg = projects.find(p => p.slug === 'mtgordle')
      expect(mtg!.providers).toContain('vercel')
    })

    it('does not include supabase when supabase_ref is null', () => {
      const projects = scanProjects(PROJECTS_ROOT)
      const mtg = projects.find(p => p.slug === 'mtgordle')
      expect(mtg!.providers).not.toContain('supabase')
    })

    it('includes deployment URL when available', () => {
      const projects = scanProjects(PROJECTS_ROOT)
      const mtg = projects.find(p => p.slug === 'mtgordle')
      expect(mtg!.deploymentUrl).toContain('vercel.app')
    })

    it('handles projects without cycle_context.json', () => {
      const projects = scanProjects(PROJECTS_ROOT)
      const timer = projects.find(p => p.slug === 'countdowntimer')
      expect(timer!.providers).toBeInstanceOf(Array)
    })
  })

  it('returns normalized BridgeProjectSummary', () => {
    const projects = scanProjects(PROJECTS_ROOT)
    const first = projects[0]
    expect(first).toHaveProperty('name')
    expect(first).toHaveProperty('slug')
    expect(first).toHaveProperty('state')
    expect(first).toHaveProperty('schemaVersion')
    expect(first).toHaveProperty('milestones')
    expect(first).toHaveProperty('hasStateFile')
  })
})
