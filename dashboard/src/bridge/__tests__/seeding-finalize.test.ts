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

  function seedCompleteProject(): void {
    mkdirSync(join(testDir, 'seed_spec'), { recursive: true })
    mkdirSync(join(testDir, '.rouge'), { recursive: true })
    writeFileSync(join(testDir, 'task_ledger.json'), '{}')
    writeFileSync(join(testDir, 'seed_spec', 'milestones.json'), '{}')
    writeFileSync(join(testDir, 'vision.json'), LONG)
    writeFileSync(join(testDir, 'product_standard.json'), LONG)
    // state.json lives under .rouge/ (#135 / #143). Previous test
    // seeded it at the legacy root path, which still works for reads
    // via the fallback, but finalizeSeeding's writeStateJson writes
    // to the new location — so tests must read from the new location too.
    writeFileSync(join(testDir, '.rouge', 'state.json'), JSON.stringify({ current_state: 'seeding', name: 'test' }))
  }

  it('returns missingArtifacts when task_ledger.json is missing', () => {
    seedCompleteProject()
    rmSync(join(testDir, 'task_ledger.json'))
    const result = finalizeSeeding(testDir)
    expect(result.ok).toBe(false)
    expect(result.missingArtifacts).toContain('task_ledger.json')
  })

  it('returns missingArtifacts when seed_spec/ has no files', () => {
    seedCompleteProject()
    rmSync(join(testDir, 'seed_spec', 'milestones.json'))
    const result = finalizeSeeding(testDir)
    expect(result.ok).toBe(false)
    expect(result.missingArtifacts).toContain('seed_spec/')
  })

  it('returns missingArtifacts when vision.json is missing', () => {
    seedCompleteProject()
    rmSync(join(testDir, 'vision.json'))
    const result = finalizeSeeding(testDir)
    expect(result.ok).toBe(false)
    expect(result.missingArtifacts).toContain('vision.json')
  })

  it('returns missingArtifacts when product_standard.json is missing', () => {
    seedCompleteProject()
    rmSync(join(testDir, 'product_standard.json'))
    const result = finalizeSeeding(testDir)
    expect(result.ok).toBe(false)
    expect(result.missingArtifacts).toContain('product_standard.json')
  })

  it('returns missingArtifacts when vision.json is a stub (below byte floor)', () => {
    seedCompleteProject()
    writeFileSync(join(testDir, 'vision.json'), '{}')
    const result = finalizeSeeding(testDir)
    expect(result.ok).toBe(false)
    expect(result.missingArtifacts).toContain('vision.json')
  })

  it('transitions state to ready when all required artifacts exist', () => {
    seedCompleteProject()
    const result = finalizeSeeding(testDir)
    expect(result.ok).toBe(true)

    const state = JSON.parse(readFileSync(join(testDir, '.rouge', 'state.json'), 'utf-8'))
    expect(state.current_state).toBe('ready')
    expect(state.name).toBe('test') // preserved
  })

  it('initializes foundation: { status: "pending" } when promoting to ready', () => {
    seedCompleteProject()
    const result = finalizeSeeding(testDir)
    expect(result.ok).toBe(true)
    const state = JSON.parse(readFileSync(join(testDir, '.rouge', 'state.json'), 'utf-8'))
    // Testimonial symptom was state=foundation, foundation=null causing
    // rouge-loop to crash. Finalize now guarantees the shape.
    expect(state.foundation).toEqual({ status: 'pending' })
  })

  it('preserves an explicit foundation object set by the orchestrator', () => {
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
    const result = finalizeSeeding(testDir)
    expect(result.ok).toBe(true)
    const state = JSON.parse(readFileSync(join(testDir, '.rouge', 'state.json'), 'utf-8'))
    expect(state.foundation).toEqual({ status: 'complete' })
  })

  it('is idempotent — a second call on an already-finalized project is a no-op', () => {
    seedCompleteProject()
    finalizeSeeding(testDir)
    const first = readFileSync(join(testDir, '.rouge', 'state.json'), 'utf-8')
    // Call again — should not rewrite (same content before/after).
    const result = finalizeSeeding(testDir)
    expect(result.ok).toBe(true)
    const second = readFileSync(join(testDir, '.rouge', 'state.json'), 'utf-8')
    expect(second).toBe(first)
  })
})
