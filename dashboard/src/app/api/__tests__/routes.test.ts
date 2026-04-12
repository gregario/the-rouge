import { describe, it, expect } from 'vitest'
import { GET as getProjects } from '../projects/route'
import { GET as getProjectByName } from '../projects/[name]/route'
import { GET as getActivity } from '../projects/[name]/activity/route'
import { GET as getChat } from '../projects/[name]/chat/route'
import { GET as getCatalogue } from '../catalogue/route'
import { GET as getPlatform } from '../platform/route'

// Helper to create params promise (Next.js 16 async params)
function makeParams<T>(value: T): Promise<T> {
  return Promise.resolve(value)
}

describe('GET /api/projects', () => {
  it('returns array of 6 projects', async () => {
    const response = await getProjects()
    const data = await response.json()

    expect(Array.isArray(data)).toBe(true)
    expect(data).toHaveLength(6)
    expect(data[0]).toHaveProperty('name')
    expect(data[0]).toHaveProperty('slug')
    expect(data[0]).toHaveProperty('state')
  })
})

describe('GET /api/projects/[name]', () => {
  it('returns project detail with milestones for epoch-timer', async () => {
    const response = await getProjectByName(new Request('http://localhost'), {
      params: makeParams({ name: 'epoch-timer' }),
    })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.name).toBe('Epoch Timer')
    expect(data.slug).toBe('epoch-timer')
    expect(data.milestones).toBeDefined()
    expect(data.milestones.length).toBeGreaterThan(0)
    expect(data.confidenceHistory).toBeDefined()
  })

  it('returns 404 for nonexistent project', async () => {
    const response = await getProjectByName(new Request('http://localhost'), {
      params: makeParams({ name: 'nonexistent' }),
    })

    expect(response.status).toBe(404)
    const data = await response.json()
    expect(data.error).toBe('Project not found')
  })
})

describe('GET /api/projects/[name]/activity', () => {
  it('returns events array for epoch-timer', async () => {
    const response = await getActivity(new Request('http://localhost'), {
      params: makeParams({ name: 'epoch-timer' }),
    })
    const data = await response.json()

    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
    expect(data[0]).toHaveProperty('type')
    expect(data[0]).toHaveProperty('timestamp')
  })

  it('returns empty array for project with no activity', async () => {
    const response = await getActivity(new Request('http://localhost'), {
      params: makeParams({ name: 'soundscape' }),
    })
    const data = await response.json()

    expect(Array.isArray(data)).toBe(true)
    expect(data).toHaveLength(0)
  })
})

describe('GET /api/projects/[name]/chat', () => {
  it('returns messages array for soundscape', async () => {
    const response = await getChat(new Request('http://localhost'), {
      params: makeParams({ name: 'soundscape' }),
    })
    const data = await response.json()

    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
    expect(data[0]).toHaveProperty('role')
    expect(data[0]).toHaveProperty('content')
  })

  it('returns empty array for project with no chat', async () => {
    const response = await getChat(new Request('http://localhost'), {
      params: makeParams({ name: 'epoch-timer' }),
    })
    const data = await response.json()

    expect(Array.isArray(data)).toBe(true)
    expect(data).toHaveLength(0)
  })
})

describe('GET /api/catalogue', () => {
  it('returns 35 catalogue entities', async () => {
    const response = await getCatalogue()
    const data = await response.json()

    expect(Array.isArray(data)).toBe(true)
    expect(data).toHaveLength(35)
    expect(data[0]).toHaveProperty('kind')
    expect(data[0]).toHaveProperty('type')
    expect(data[0]).toHaveProperty('capabilities')
  })
})

describe('GET /api/platform', () => {
  it('returns platform data with quotas and integrations', async () => {
    const response = await getPlatform()
    const data = await response.json()

    expect(data.quotas).toBeDefined()
    expect(Array.isArray(data.quotas)).toBe(true)
    expect(data.integrations).toBeDefined()
    expect(Array.isArray(data.integrations)).toBe(true)
    expect(data.totalMonthlySpend).toBeDefined()
    expect(data.budgetRemaining).toBeDefined()
  })
})
