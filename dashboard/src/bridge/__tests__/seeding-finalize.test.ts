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

  const LONG = 'x'.repeat(500)

  const SAMPLE_MILESTONE = {
    name: 'core',
    stories: [{ id: 'core-1', name: 'scaffold', status: 'pending', acceptance_criteria: [] }],
  }

  function seedCompleteProject(): void {
    mkdirSync(join(testDir, 'seed_spec'), { recursive: true })
    mkdirSync(join(testDir, '.rouge'), { recursive: true })
    writeFileSync(
      join(testDir, 'task_ledger.json'),
      JSON.stringify({ milestones: [SAMPLE_MILESTONE] }),
    )
    writeFileSync(
      join(testDir, 'seed_spec', 'milestones.json'),
      JSON.stringify({ milestones: [SAMPLE_MILESTONE] }),
    )
    writeFileSync(join(testDir, 'vision.json'), LONG)
    writeFileSync(join(testDir, 'product_standard.json'), LONG)
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

  it('returns missingArtifacts when product_standard.json is missing', async () => {
    seedCompleteProject()
    rmSync(join(testDir, 'product_standard.json'))
    const result = await finalizeSeeding(testDir)
    expect(result.ok).toBe(false)
    expect(result.missingArtifacts).toContain('product_standard.json')
  })

  it('returns missingArtifacts when vision.json is a stub (below byte floor)', async () => {
    seedCompleteProject()
    writeFileSync(join(testDir, 'vision.json'), '{}')
    const result = await finalizeSeeding(testDir)
    expect(result.ok).toBe(false)
    expect(result.missingArtifacts).toContain('vision.json')
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

  // uat-test (2026-04-21) reached state=foundation with task_ledger.json
  // = {"milestones": []} because finalize passed on bare existence,
  // not on content. Guard against regression.
  it('returns missingArtifacts when task_ledger.json has an empty milestones array AND no seed_spec/milestones.json', async () => {
    seedCompleteProject()
    writeFileSync(join(testDir, 'task_ledger.json'), JSON.stringify({ milestones: [] }))
    rmSync(join(testDir, 'seed_spec', 'milestones.json'))
    // keep a different seed_spec file so the directory-exists check still passes
    writeFileSync(join(testDir, 'seed_spec', 'spec.md'), LONG)

    const result = await finalizeSeeding(testDir)
    expect(result.ok).toBe(false)
    expect(result.missingArtifacts?.join(' ')).toMatch(/empty milestones/)
  })

  it('auto-populates task_ledger.json from seed_spec/milestones.json when ledger is empty', async () => {
    seedCompleteProject()
    // Simulate the common path: SPEC wrote milestones.json, task_ledger
    // was the migration stub.
    writeFileSync(join(testDir, 'task_ledger.json'), JSON.stringify({ milestones: [] }))

    const result = await finalizeSeeding(testDir)
    expect(result.ok).toBe(true)

    const ledger = JSON.parse(readFileSync(join(testDir, 'task_ledger.json'), 'utf-8'))
    expect(ledger.milestones).toHaveLength(1)
    expect(ledger.milestones[0].name).toBe('core')
  })

  it('returns missingArtifacts when both task_ledger and seed_spec/milestones.json have empty milestones', async () => {
    seedCompleteProject()
    writeFileSync(join(testDir, 'task_ledger.json'), JSON.stringify({ milestones: [] }))
    writeFileSync(join(testDir, 'seed_spec', 'milestones.json'), JSON.stringify({ milestones: [] }))

    const result = await finalizeSeeding(testDir)
    expect(result.ok).toBe(false)
    expect(result.missingArtifacts?.join(' ')).toMatch(/empty milestones/)
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
          one_liner: LONG, // keep byte size above the stub floor
          infrastructure: {},
          ...extra,
        }),
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

    it('does not overwrite an explicit vision.infrastructure.deployment_target', async () => {
      seedCompleteProject()
      writeVision({ infrastructure: { deployment_target: 'vercel' } })
      writeManifest('docker-compose')

      await finalizeSeeding(testDir)

      const vision = JSON.parse(readFileSync(join(testDir, 'vision.json'), 'utf-8'))
      expect(vision.infrastructure.deployment_target).toBe('vercel')
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
