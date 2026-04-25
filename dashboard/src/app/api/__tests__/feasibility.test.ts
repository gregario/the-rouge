import { describe, it, expect, vi } from 'vitest'

// assertLoopback() reads next/server `headers()` which only exists
// inside a Next request scope. Unit tests run outside that scope, so
// we stub the guard to always allow.
vi.mock('@/lib/localhost-guard', () => ({
  assertLoopback: async () => null,
}))

import { POST } from '../feasibility/route'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/feasibility', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeBadJsonRequest(): Request {
  return new Request('http://localhost/api/feasibility', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{ this is not json',
  })
}

describe('POST /api/feasibility', () => {
  it('returns 400 when body is not valid JSON', async () => {
    const res = await POST(makeBadJsonRequest())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/invalid JSON/i)
  })

  it('returns 400 when title is missing', async () => {
    const res = await POST(makeRequest({ description: 'no title' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/title.*required/i)
  })

  it('returns 400 when title is empty string', async () => {
    const res = await POST(makeRequest({ title: '   ' }))
    expect(res.status).toBe(400)
  })

  it('returns a feasibility result for a valid proposal', async () => {
    const res = await POST(
      makeRequest({
        title: 'Add a Stripe checkout flow',
        description: 'Standard one-time payment with webhook',
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    // Shape contract — these four fields must always be present for the dashboard
    // UI to render without conditional fallbacks.
    expect(body).toHaveProperty('verdict')
    expect(['proceed', 'proceed-with-caveats', 'escalate', 'defer']).toContain(body.verdict)
    expect(body).toHaveProperty('reasoning')
    expect(typeof body.reasoning).toBe('string')
    expect(Array.isArray(body.checks)).toBe(true)
    expect(Array.isArray(body.missing)).toBe(true)
  })
})
