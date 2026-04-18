import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// The guard reads request headers via next/headers. Mock the module so
// each test can set a distinct header bag without needing a full Next
// request context.
const mockHeaders = vi.hoisted(() => new Map<string, string>())
vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (k: string) => mockHeaders.get(k.toLowerCase()) ?? null,
  }),
}))

import { assertLoopback } from '../localhost-guard'

function setHeaders(h: Record<string, string | undefined>): void {
  mockHeaders.clear()
  for (const [k, v] of Object.entries(h)) {
    if (v !== undefined) mockHeaders.set(k.toLowerCase(), v)
  }
}

beforeEach(() => {
  mockHeaders.clear()
  delete process.env.ROUGE_TRUST_PROXY
})

afterEach(() => {
  delete process.env.ROUGE_TRUST_PROXY
})

describe('assertLoopback', () => {
  it('allows requests with no forwarding headers (direct socket)', async () => {
    setHeaders({})
    const res = await assertLoopback()
    expect(res).toBeNull()
  })

  it('allows requests with loopback x-forwarded-for', async () => {
    setHeaders({ 'x-forwarded-for': '127.0.0.1' })
    expect(await assertLoopback()).toBeNull()
  })

  it('allows IPv6 loopback variants', async () => {
    setHeaders({ 'x-forwarded-for': '::1' })
    expect(await assertLoopback()).toBeNull()
    setHeaders({ 'x-forwarded-for': '::ffff:127.0.0.1' })
    expect(await assertLoopback()).toBeNull()
  })

  it('rejects a spoofed forwarded-for (non-loopback)', async () => {
    setHeaders({ 'x-forwarded-for': '8.8.8.8' })
    const res = await assertLoopback()
    expect(res?.status).toBe(403)
  })

  it('rejects when ANY hop in forwarded-for is non-loopback (no proxy trust)', async () => {
    // An attacker prepending their own address to try to slip past a
    // naive first-hop check should still be blocked.
    setHeaders({ 'x-forwarded-for': '127.0.0.1, 8.8.8.8' })
    const res = await assertLoopback()
    expect(res?.status).toBe(403)
  })

  it('rejects a spoofed x-real-ip', async () => {
    setHeaders({ 'x-real-ip': '203.0.113.1' })
    const res = await assertLoopback()
    expect(res?.status).toBe(403)
  })

  it('with ROUGE_TRUST_PROXY=1, allows based on first hop alone', async () => {
    process.env.ROUGE_TRUST_PROXY = '1'
    setHeaders({ 'x-forwarded-for': '127.0.0.1, 8.8.8.8' })
    expect(await assertLoopback()).toBeNull()
  })

  it('with ROUGE_TRUST_PROXY=1, still rejects non-loopback first hop', async () => {
    process.env.ROUGE_TRUST_PROXY = '1'
    setHeaders({ 'x-forwarded-for': '8.8.8.8' })
    const res = await assertLoopback()
    expect(res?.status).toBe(403)
  })
})
