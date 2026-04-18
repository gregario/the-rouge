import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Stub server-config so the route reads a temp projectsRoot.
let projectsRoot: string
vi.mock('@/lib/server-config', () => ({
  loadServerConfig: () => ({ projectsRoot, rougeCli: '/tmp/fake' }),
}))
vi.mock('@/lib/localhost-guard', () => ({
  assertLoopback: async () => null,
}))

import { POST } from '../route'

function makeRequest(body: unknown, contentLength?: number): Request {
  const raw = typeof body === 'string' ? body : JSON.stringify(body)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (contentLength !== undefined) headers['content-length'] = String(contentLength)
  return new Request('http://localhost/api/projects/foo/feedback', {
    method: 'POST',
    headers,
    body: raw,
  })
}

beforeEach(() => {
  projectsRoot = mkdtempSync(join(tmpdir(), 'feedback-route-'))
})

afterEach(() => {
  rmSync(projectsRoot, { recursive: true, force: true })
})

describe('POST /api/projects/[name]/feedback', () => {
  it('rejects invalid slug with 400', async () => {
    const res = await POST(makeRequest({ text: 'hi' }), {
      params: Promise.resolve({ name: '../etc/passwd' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/Invalid project name/i)
  })

  it('rejects slug with path separator', async () => {
    const res = await POST(makeRequest({ text: 'hi' }), {
      params: Promise.resolve({ name: 'foo/bar' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 404 for non-existent project', async () => {
    const res = await POST(makeRequest({ text: 'hi' }), {
      params: Promise.resolve({ name: 'does-not-exist' }),
    })
    expect(res.status).toBe(404)
  })

  it('rejects payload larger than cap with 413', async () => {
    mkdirSync(join(projectsRoot, 'foo'), { recursive: true })
    const huge = 'x'.repeat(100 * 1024) // 100 KB — above 64 KB cap
    const res = await POST(makeRequest(huge), {
      params: Promise.resolve({ name: 'foo' }),
    })
    expect(res.status).toBe(413)
  })

  it('writes feedback.json inside the project dir on valid request', async () => {
    mkdirSync(join(projectsRoot, 'foo'), { recursive: true })
    const res = await POST(makeRequest({ text: 'feedback body' }), {
      params: Promise.resolve({ name: 'foo' }),
    })
    expect(res.status).toBe(200)
    const written = readFileSync(join(projectsRoot, 'foo', 'feedback.json'), 'utf-8')
    expect(JSON.parse(written)).toEqual({ text: 'feedback body' })
  })

  it('refuses to write through a symlink that escapes projectsRoot', async () => {
    // Attacker plants a symlink where a project dir should be, pointing
    // at something outside projectsRoot. Without realpath enforcement,
    // feedback.json would land in the target.
    const outside = mkdtempSync(join(tmpdir(), 'outside-'))
    const attackPath = join(projectsRoot, 'attack')
    try {
      symlinkSync(outside, attackPath)
    } catch {
      // Some CI environments don't allow symlink creation — skip.
      return
    }
    const res = await POST(makeRequest({ text: 'pwn' }), {
      params: Promise.resolve({ name: 'attack' }),
    })
    expect(res.status).toBe(400)
    expect(existsSync(join(outside, 'feedback.json'))).toBe(false)
    rmSync(outside, { recursive: true, force: true })
  })

  it('rejects malformed JSON body with 400', async () => {
    mkdirSync(join(projectsRoot, 'foo'), { recursive: true })
    const res = await POST(makeRequest('not json {{'), {
      params: Promise.resolve({ name: 'foo' }),
    })
    expect(res.status).toBe(400)
  })
})
