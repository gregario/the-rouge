import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { repairProjectState } from '../state-repair'

let dir: string

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

function seedProject(state: Record<string, unknown>, seeding: Record<string, unknown>): void {
  mkdirSync(join(dir, '.rouge'), { recursive: true })
  writeFileSync(join(dir, '.rouge', 'state.json'), JSON.stringify(state))
  writeFileSync(join(dir, 'seeding-state.json'), JSON.stringify(seeding))
}

function seedArtifacts(): void {
  // Satisfy finalizeSeeding's artifact checks.
  mkdirSync(join(dir, 'seed_spec'), { recursive: true })
  writeFileSync(join(dir, 'task_ledger.json'), '{}')
  writeFileSync(join(dir, 'seed_spec', 'milestones.json'), '{}')
  writeFileSync(join(dir, 'vision.json'), 'x'.repeat(500))
  writeFileSync(join(dir, 'product_standard.json'), 'x'.repeat(500))
}

describe('repairProjectState', () => {
  it('heals stuck-seeding: all 8 disciplines complete but seeding_complete null', async () => {
    dir = mkdtempSync(join(tmpdir(), 'repair-'))
    seedArtifacts()
    seedProject(
      {
        current_state: 'seeding',
        name: 'colour-contrast',
        seedingProgress: {
          disciplines: [
            { discipline: 'brainstorming', status: 'complete' },
            { discipline: 'competition', status: 'complete' },
            { discipline: 'taste', status: 'complete' },
            { discipline: 'spec', status: 'complete' },
            { discipline: 'infrastructure', status: 'complete' },
            { discipline: 'design', status: 'complete' },
            { discipline: 'legal-privacy', status: 'complete' },
            { discipline: 'marketing', status: 'complete' },
          ],
        },
      },
      {
        session_id: 's',
        status: 'active',
        disciplines_complete: [
          'brainstorming', 'competition', 'taste', 'spec',
          'infrastructure', 'design', 'legal-privacy', 'marketing',
        ],
      },
    )

    const report = await repairProjectState(dir)
    expect(report.fixes.length).toBeGreaterThan(0)
    expect(report.fixes.join(' ')).toContain('stuck-seeding')

    const state = JSON.parse(readFileSync(join(dir, '.rouge', 'state.json'), 'utf-8'))
    expect(state.current_state).toBe('ready')
    expect(state.foundation).toEqual({ status: 'pending' })

    const seeding = JSON.parse(readFileSync(join(dir, 'seeding-state.json'), 'utf-8'))
    expect(seeding.seeding_complete).toBe(true)
  })

  it('heals null-foundation: current_state=foundation with foundation=null', async () => {
    dir = mkdtempSync(join(tmpdir(), 'repair-'))
    seedProject(
      { current_state: 'foundation', name: 'testimonial', foundation: null },
      { session_id: 's', status: 'active' },
    )

    const report = await repairProjectState(dir)
    expect(report.fixes.length).toBe(1)
    expect(report.fixes[0]).toContain('null-foundation')

    const state = JSON.parse(readFileSync(join(dir, '.rouge', 'state.json'), 'utf-8'))
    expect(state.foundation).toEqual({ status: 'pending' })
    expect(state.current_state).toBe('foundation') // unchanged
  })

  it('is a no-op on a healthy project', async () => {
    dir = mkdtempSync(join(tmpdir(), 'repair-'))
    seedProject(
      { current_state: 'ready', name: 'healthy', foundation: { status: 'pending' } },
      { session_id: 's', status: 'active', seeding_complete: true },
    )
    const before = readFileSync(join(dir, '.rouge', 'state.json'), 'utf-8')

    const report = await repairProjectState(dir)
    expect(report.fixes).toEqual([])

    const after = readFileSync(join(dir, '.rouge', 'state.json'), 'utf-8')
    expect(after).toBe(before)
  })

  it('handles missing state.json gracefully', async () => {
    dir = mkdtempSync(join(tmpdir(), 'repair-'))
    // No state files written.
    const report = await repairProjectState(dir)
    expect(report.fixes).toEqual([])
  })

  it('is idempotent — running twice produces no additional fixes', async () => {
    dir = mkdtempSync(join(tmpdir(), 'repair-'))
    seedProject(
      { current_state: 'foundation', name: 'x', foundation: null },
      { session_id: 's', status: 'active' },
    )

    const first = await repairProjectState(dir)
    expect(first.fixes.length).toBe(1)

    const second = await repairProjectState(dir)
    expect(second.fixes).toEqual([])
  })
})
