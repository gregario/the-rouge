import { resolve } from 'path'
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { rmSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { createBridgeServer } from '../server'
import type { Server } from 'http'

const PROJECTS_ROOT = resolve(__dirname, '../../../../projects')
const PORT = 13002

describe('Bridge Server', () => {
  let server: Server

  beforeAll(async () => {
    server = createBridgeServer({ projectsRoot: PROJECTS_ROOT, bridgePort: PORT, rougeCli: '' })
    await new Promise<void>(resolve => server.listen(PORT, resolve))
  })

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()))
  })

  it('GET /projects returns array of real projects', async () => {
    const res = await fetch(`http://localhost:${PORT}/projects`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
    expect(data[0]).toHaveProperty('slug')
    expect(data[0]).toHaveProperty('state')
  })

  it('GET /projects/mtgordle returns project detail', async () => {
    const res = await fetch(`http://localhost:${PORT}/projects/mtgordle`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.slug).toBe('mtgordle')
  })

  it('GET /projects/nonexistent returns 404', async () => {
    const res = await fetch(`http://localhost:${PORT}/projects/nonexistent`)
    expect(res.status).toBe(404)
  })

  it('GET /events returns SSE stream', async () => {
    const res = await fetch(`http://localhost:${PORT}/events`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    await res.body?.cancel()
  })

  it('sets CORS headers for localhost:3001', async () => {
    const res = await fetch(`http://localhost:${PORT}/projects`, {
      headers: { 'Origin': 'http://localhost:3001' }
    })
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3001')
  })

  it('echoes back any localhost origin (any port)', async () => {
    const res = await fetch(`http://localhost:${PORT}/projects`, {
      headers: { 'Origin': 'http://localhost:3000' }
    })
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000')
  })

  it('GET /projects/mtgordle/spec returns vision and milestones', async () => {
    const res = await fetch(`http://localhost:${PORT}/projects/mtgordle/spec`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.hasVision).toBe(true)
  })

  it('GET /projects/mtgordle/activity returns events', async () => {
    const res = await fetch(`http://localhost:${PORT}/projects/mtgordle/activity`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('GET /projects/mtgordle/activity?verbose=true returns raw checkpoints', async () => {
    const res = await fetch(`http://localhost:${PORT}/projects/mtgordle/activity?verbose=true`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.length).toBeGreaterThan(100)
  })

  describe('POST /projects (create)', () => {
    const testSlug = 'test-new-project-' + Date.now()
    const testDir = join(PROJECTS_ROOT, testSlug)

    afterEach(() => {
      // Clean up created test project
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true })
      }
    })

    it('creates a new project with valid slug', async () => {
      const res = await fetch(`http://localhost:${PORT}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: testSlug, name: 'Test Project' }),
      })
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.ok).toBe(true)
      expect(data.slug).toBe(testSlug)
      expect(existsSync(join(testDir, 'state.json'))).toBe(true)
    })

    it('rejects invalid slug', async () => {
      const res = await fetch(`http://localhost:${PORT}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'bad slug with spaces!', name: 'X' }),
      })
      expect(res.status).toBe(400)
    })

    it('rejects duplicate slug (existing project)', async () => {
      const res = await fetch(`http://localhost:${PORT}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'mtgordle', name: 'Duplicate' }),
      })
      expect(res.status).toBe(409)
    })
  })

  it('GET /projects/:name/seed/messages returns empty array for new project', async () => {
    const testSlug = 'seed-msg-test-' + Date.now()
    const testDir = join(PROJECTS_ROOT, testSlug)
    mkdirSync(testDir, { recursive: true })

    const res = await fetch(`http://localhost:${PORT}/projects/${testSlug}/seed/messages`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual([])

    rmSync(testDir, { recursive: true, force: true })
  })

  it('POST /projects/:name/seed/message returns 400 for empty text', async () => {
    const testSlug = 'seed-msg-400-' + Date.now()
    const testDir = join(PROJECTS_ROOT, testSlug)
    mkdirSync(testDir, { recursive: true })

    const res = await fetch(`http://localhost:${PORT}/projects/${testSlug}/seed/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '' }),
    })
    expect(res.status).toBe(400)

    rmSync(testDir, { recursive: true, force: true })
  })

  it('POST /projects/:name/seed/message returns 404 for nonexistent project', async () => {
    const res = await fetch(`http://localhost:${PORT}/projects/does-not-exist/seed/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hi' }),
    })
    expect(res.status).toBe(404)
  })

  it('POST /projects/mtgordle/feedback writes feedback file', async () => {
    const res = await fetch(`http://localhost:${PORT}/projects/mtgordle/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'test feedback', classification: 'direction' })
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
  })
})
