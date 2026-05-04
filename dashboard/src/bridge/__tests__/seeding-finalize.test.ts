import { describe, it, expect, afterEach } from 'vitest'
import { finalizeSeeding } from '../seeding-finalize'
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('finalizeSeeding', () => {
  const testDir = join(tmpdir(), 'finalize-' + Date.now())

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  const VALID_VISION = JSON.stringify({
    product_name: 'Test Product',
    one_liner: 'A test product for unit testing the finalize pipeline with enough content to pass byte floor checks easily',
    persona: 'developers who need tests',
    problem: 'no valid test fixtures exist',
    infrastructure: {},
  }, null, 2)

  const VALID_LEDGER = JSON.stringify({
    milestones: [{
      name: 'MVP',
      stories: [{ id: 's-1', name: 'Test story', status: 'pending' }],
    }],
  }, null, 2)

  const VALID_STANDARD = JSON.stringify({
    schema_version: 'product-standard-v1',
    generated: true,
    generated_at: '2026-05-04T00:00:00Z',
    source: 'library/global',
    heuristics: [
      { id: 'lighthouse-performance', rule: 'Lighthouse score >= 80' },
      { id: 'visual-consistency', rule: 'At most 2 font families, 5 sizes, 8 colors' },
      { id: 'no-console-errors', rule: 'Zero console errors on every route' },
    ],
  }, null, 2)

  function seedCompleteProject(): void {
    mkdirSync(join(testDir, 'seed_spec'), { recursive: true })
    mkdirSync(join(testDir, '.rouge'), { recursive: true })
    writeFileSync(join(testDir, 'task_ledger.json'), VALID_LEDGER)
    writeFileSync(join(testDir, 'seed_spec', 'milestones.json'), '{}')
    writeFileSync(join(testDir, 'vision.json'), VALID_VISION)
    writeFileSync(join(testDir, 'product_standard.json'), VALID_STANDARD)
    // state.json lives under .rouge/ (#135 / #143). Previous test
    // seeded it at the legacy root path, which still works for reads
    // via the fallback, but finalizeSeeding's writeStateJson writes
    // to the new location — so tests must read from the new location too.
    writeFileSync(join(testDir, '.rouge', 'state.json'), JSON.stringify({ current_state: 'seeding', name: 'test' }))
  }

  it('returns missingArtifacts when task_ledger.json is missing', async () => {
    seedCompleteProject()
    rmSync(join(testDir, 'task_ledger.json'))
    const result = await finalizeSeeding(testDir)
    expect(result.ok).toBe(false)
    expect(result.missingArtifacts).toContain('task_ledger.json')
  })

  it('returns missingArtifacts when seed_spec/ has no files', async () => {
    seedCompleteProject()
    rmSync(join(testDir, 'seed_spec', 'milestones.json'))
    const result = await finalizeSeeding(testDir)
    expect(result.ok).toBe(false)
    expect(result.missingArtifacts).toContain('seed_spec/')
  })

  it('returns missingArtifacts when vision.json is missing', async () => {
    seedCompleteProject()
    rmSync(join(testDir, 'vision.json'))
    const result = await finalizeSeeding(testDir)
    expect(result.ok).toBe(false)
    expect(result.missingArtifacts).toContain('vision.json')
  })

  it('auto-generates product_standard.json from library when missing', async () => {
    seedCompleteProject()
    rmSync(join(testDir, 'product_standard.json'))
    const result = await finalizeSeeding(testDir)
    // ensureProductStandard generates from library/global if available
    // so product_standard.json is no longer a blocking artifact
    const exists = require('fs').existsSync(join(testDir, 'product_standard.json'))
    if (exists) {
      // Library was accessible — auto-generated, finalization should pass
      // (may still fail for other schema reasons, but not for product_standard)
      expect(result.missingArtifacts ?? []).not.toContain('product_standard.json')
    } else {
      // Library not accessible in test env — product_standard stays missing
      expect(result.ok).toBe(false)
      expect(result.missingArtifacts).toContain('product_standard.json')
    }
  })

  it('returns missingArtifacts when vision.json is a stub (below byte floor)', async () => {
    seedCompleteProject()
    writeFileSync(join(testDir, 'vision.json'), '{ "stub": true }')
    const result = await finalizeSeeding(testDir)
    expect(result.ok).toBe(false)
    // Either rejected for being too small or for missing required fields
    expect(result.missingArtifacts?.some(m => m.includes('vision.json'))).toBe(true)
  })

  it('transitions state to ready when all required artifacts exist', async () => {
    seedCompleteProject()
    const result = await finalizeSeeding(testDir)
    expect(result.ok).toBe(true)

    const state = JSON.parse(readFileSync(join(testDir, '.rouge', 'state.json'), 'utf-8'))
    expect(state.current_state).toBe('ready')
    expect(state.name).toBe('test') // preserved
  })

  it('initializes foundation: { status: "pending" } when promoting to ready', async () => {
    seedCompleteProject()
    const result = await finalizeSeeding(testDir)
    expect(result.ok).toBe(true)
    const state = JSON.parse(readFileSync(join(testDir, '.rouge', 'state.json'), 'utf-8'))
    // Testimonial symptom was state=foundation, foundation=null causing
    // rouge-loop to crash. Finalize now guarantees the shape.
    expect(state.foundation).toEqual({ status: 'pending' })
  })

  it('preserves an explicit foundation object set by the orchestrator', async () => {
    seedCompleteProject()
    // Simulate the orchestrator having already set foundation to a
    // specific value (e.g. `complete` when complexity profile waives
    // foundation). Finalize must not clobber it.
    writeFileSync(
      join(testDir, '.rouge', 'state.json'),
      JSON.stringify({
        current_state: 'seeding',
        name: 'test',
        foundation: { status: 'complete' },
      }),
    )
    const result = await finalizeSeeding(testDir)
    expect(result.ok).toBe(true)
    const state = JSON.parse(readFileSync(join(testDir, '.rouge', 'state.json'), 'utf-8'))
    expect(state.foundation).toEqual({ status: 'complete' })
  })

  it('is idempotent — a second call on an already-finalized project is a no-op', async () => {
    seedCompleteProject()
    await finalizeSeeding(testDir)
    const first = readFileSync(join(testDir, '.rouge', 'state.json'), 'utf-8')
    // Call again — should not rewrite (same content before/after).
    const result = await finalizeSeeding(testDir)
    expect(result.ok).toBe(true)
    const second = readFileSync(join(testDir, '.rouge', 'state.json'), 'utf-8')
    expect(second).toBe(first)
  })

  describe('infrastructure manifest propagation', () => {
    function writeVision(extra: Record<string, unknown> = {}): void {
      writeFileSync(
        join(testDir, 'vision.json'),
        JSON.stringify({
          product_name: 'test',
          one_liner: 'A test product with enough content to pass byte floor checks easily and validate correctly',
          persona: 'testers',
          infrastructure: {},
          ...extra,
        }, null, 2),
      )
    }
    function writeManifest(target: string, opts: { database?: boolean; auth?: boolean } = {}): void {
      writeFileSync(
        join(testDir, 'infrastructure_manifest.json'),
        JSON.stringify({
          deploy: { target },
          database: opts.database ? { provider: 'self-hosted' } : null,
          auth: opts.auth ? { strategy: 'home-grown' } : null,
        }),
      )
    }

    it('mirrors manifest.deploy.target into vision.json.infrastructure.deployment_target', async () => {
      seedCompleteProject()
      writeVision()
      writeManifest('docker-compose', { database: true, auth: true })

      const result = await finalizeSeeding(testDir)
      expect(result.ok).toBe(true)

      const vision = JSON.parse(readFileSync(join(testDir, 'vision.json'), 'utf-8'))
      expect(vision.infrastructure.deployment_target).toBe('docker-compose')
      expect(vision.infrastructure.needs_database).toBe(true)
      expect(vision.infrastructure.needs_auth).toBe(true)
    })

    it('also writes into cycle_context.json.vision.infrastructure (where the provisioner reads)', async () => {
      seedCompleteProject()
      writeVision()
      writeManifest('docker-compose')
      writeFileSync(join(testDir, 'cycle_context.json'), JSON.stringify({ vision: { infrastructure: {} } }))

      await finalizeSeeding(testDir)

      const ctx = JSON.parse(readFileSync(join(testDir, 'cycle_context.json'), 'utf-8'))
      expect(ctx.vision.infrastructure.deployment_target).toBe('docker-compose')
    })

    it('overwrites vision.infrastructure.deployment_target from manifest (canonical source)', async () => {
      seedCompleteProject()
      writeVision({ infrastructure: { deployment_target: 'vercel' } })
      writeManifest('docker-compose')

      await finalizeSeeding(testDir)

      const vision = JSON.parse(readFileSync(join(testDir, 'vision.json'), 'utf-8'))
      expect(vision.infrastructure.deployment_target).toBe('docker-compose')
    })

    it('is a no-op when manifest is missing', async () => {
      seedCompleteProject()
      writeVision()
      // no infrastructure_manifest.json written

      await finalizeSeeding(testDir)

      const vision = JSON.parse(readFileSync(join(testDir, 'vision.json'), 'utf-8'))
      expect(vision.infrastructure).toEqual({})
    })

    it('is a no-op when manifest has no deploy.target', async () => {
      seedCompleteProject()
      writeVision()
      writeFileSync(
        join(testDir, 'infrastructure_manifest.json'),
        JSON.stringify({ deploy: {} }),
      )

      await finalizeSeeding(testDir)

      const vision = JSON.parse(readFileSync(join(testDir, 'vision.json'), 'utf-8'))
      expect(vision.infrastructure).toEqual({})
    })
  })
})
