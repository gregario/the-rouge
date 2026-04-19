import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { readProviders } from '../project-details'

let dir: string

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('readProviders', () => {
  it('returns empty list when no cycle_context.json', () => {
    dir = mkdtempSync(join(tmpdir(), 'providers-'))
    expect(readProviders(dir)).toEqual([])
  })

  it('detects vercel from *.vercel.app URL', () => {
    dir = mkdtempSync(join(tmpdir(), 'providers-'))
    writeFileSync(
      join(dir, 'cycle_context.json'),
      JSON.stringify({ infrastructure: { staging_url: 'https://foo.vercel.app' } }),
    )
    expect(readProviders(dir)).toContain('vercel')
  })

  it('detects cloudflare from *.pages.dev or *.workers.dev', () => {
    dir = mkdtempSync(join(tmpdir(), 'providers-'))
    writeFileSync(
      join(dir, 'cycle_context.json'),
      JSON.stringify({ infrastructure: { staging_url: 'https://foo.pages.dev' } }),
    )
    expect(readProviders(dir)).toContain('cloudflare')
  })

  // GitHub Pages detection: three signals — explicit target (normal),
  // alias target (gh-pages), URL-only (for projects deployed before the
  // target was wired and only have a staging URL).

  it('detects github-pages from explicit deployment_target', () => {
    dir = mkdtempSync(join(tmpdir(), 'providers-'))
    writeFileSync(
      join(dir, 'cycle_context.json'),
      JSON.stringify({ vision: { infrastructure: { deployment_target: 'github-pages' } } }),
    )
    expect(readProviders(dir)).toContain('github-pages')
  })

  it('detects github-pages from the gh-pages alias', () => {
    dir = mkdtempSync(join(tmpdir(), 'providers-'))
    writeFileSync(
      join(dir, 'cycle_context.json'),
      JSON.stringify({ vision: { infrastructure: { deployment_target: 'gh-pages' } } }),
    )
    expect(readProviders(dir)).toContain('github-pages')
  })

  it('detects github-pages from a *.github.io URL even without a declared target', () => {
    dir = mkdtempSync(join(tmpdir(), 'providers-'))
    writeFileSync(
      join(dir, 'cycle_context.json'),
      JSON.stringify({ infrastructure: { staging_url: 'https://gregario.github.io/testimonial/' } }),
    )
    expect(readProviders(dir)).toContain('github-pages')
  })

  it('detects supabase + sentry + posthog from infra signals', () => {
    dir = mkdtempSync(join(tmpdir(), 'providers-'))
    writeFileSync(
      join(dir, 'cycle_context.json'),
      JSON.stringify({
        infrastructure: {
          supabase_url: 'https://abc.supabase.co',
          supabase_ref: 'abc',
          sentry_dsn: 'https://abc@sentry.io/1',
          readiness: { posthog: true },
        },
      }),
    )
    const providers = readProviders(dir)
    expect(providers).toContain('supabase')
    expect(providers).toContain('sentry')
    expect(providers).toContain('posthog')
  })

  it('returns empty list on malformed cycle_context.json', () => {
    dir = mkdtempSync(join(tmpdir(), 'providers-'))
    writeFileSync(join(dir, 'cycle_context.json'), '{ not valid json')
    expect(readProviders(dir)).toEqual([])
  })
})
