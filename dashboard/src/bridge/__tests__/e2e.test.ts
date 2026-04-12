import { resolve } from 'path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createBridgeServer } from '../server'
import type { Server } from 'http'

const PROJECTS_ROOT = resolve(__dirname, '../../../../projects')
const PORT = 13003

describe('E2E: Bridge → Real Projects', () => {
  let server: Server

  beforeAll(async () => {
    server = createBridgeServer({ projectsRoot: PROJECTS_ROOT, bridgePort: PORT, rougeCli: '' })
    await new Promise<void>(resolve => server.listen(PORT, resolve))
  })

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()))
  })

  it('lists real Rouge projects with correct states', async () => {
    const res = await fetch(`http://localhost:${PORT}/projects`)
    const projects = await res.json()

    const mtg = projects.find((p: any) => p.slug === 'mtgordle')
    expect(mtg).toBeDefined()
    expect(mtg.state).toBeDefined()

    const timer = projects.find((p: any) => p.slug === 'countdowntimer')
    expect(timer).toBeDefined()
    expect(timer.state).toBe('complete')
  })

  it('returns full state for a specific project', async () => {
    const res = await fetch(`http://localhost:${PORT}/projects/mtgordle`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.milestones).toBeDefined()
    expect(data.milestones.length).toBeGreaterThan(0)
  })

  it('returns 404 for nonexistent project', async () => {
    const res = await fetch(`http://localhost:${PORT}/projects/does-not-exist`)
    expect(res.status).toBe(404)
  })

  it('SSE endpoint streams without error', async () => {
    const res = await fetch(`http://localhost:${PORT}/events`)
    expect(res.ok).toBe(true)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    await res.body?.cancel()
  })

  it('CORS headers allow localhost:3001', async () => {
    const res = await fetch(`http://localhost:${PORT}/projects`, {
      headers: { 'Origin': 'http://localhost:3001' }
    })
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3001')
  })
})
