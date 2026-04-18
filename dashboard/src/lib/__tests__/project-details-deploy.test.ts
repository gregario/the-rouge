import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { readDeployUrls } from '../project-details'

let dir: string

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('readDeployUrls', () => {
  it('prefers cycle_context.infrastructure.staging_url when present', () => {
    dir = mkdtempSync(join(tmpdir(), 'deploy-urls-'))
    writeFileSync(
      join(dir, 'cycle_context.json'),
      JSON.stringify({
        infrastructure: {
          staging_url: 'https://fresh.example.com',
          deploy_history: [{ url: 'https://stale.example.com' }],
        },
      }),
    )
    const r = readDeployUrls(dir)
    expect(r.stagingUrl).toBe('https://fresh.example.com')
  })

  it('falls back to last deploy_history entry when staging_url absent', () => {
    dir = mkdtempSync(join(tmpdir(), 'deploy-urls-'))
    writeFileSync(
      join(dir, 'cycle_context.json'),
      JSON.stringify({
        infrastructure: {
          deploy_history: [
            { url: 'https://a.example.com' },
            { url: 'https://b.example.com' },
          ],
        },
      }),
    )
    const r = readDeployUrls(dir)
    expect(r.stagingUrl).toBe('https://b.example.com')
  })

  it('falls back to infrastructure_manifest when no cycle_context', () => {
    dir = mkdtempSync(join(tmpdir(), 'deploy-urls-'))
    writeFileSync(
      join(dir, 'infrastructure_manifest.json'),
      JSON.stringify({
        staging_url: 'https://manifest-staging.example.com',
        production_url: 'https://manifest-prod.example.com',
      }),
    )
    const r = readDeployUrls(dir)
    expect(r.stagingUrl).toBe('https://manifest-staging.example.com')
    expect(r.productionUrl).toBe('https://manifest-prod.example.com')
  })

  it('returns undefined for both when nothing configured', () => {
    dir = mkdtempSync(join(tmpdir(), 'deploy-urls-'))
    const r = readDeployUrls(dir)
    expect(r.stagingUrl).toBeUndefined()
    expect(r.productionUrl).toBeUndefined()
  })
})
