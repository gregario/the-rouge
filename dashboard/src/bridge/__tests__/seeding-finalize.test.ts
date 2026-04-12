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

  it('returns missingArtifacts when task_ledger.json is missing', () => {
    mkdirSync(join(testDir, 'seed_spec'), { recursive: true })
    writeFileSync(join(testDir, 'seed_spec', 'milestones.json'), '{}')
    writeFileSync(join(testDir, 'state.json'), JSON.stringify({ current_state: 'seeding' }))

    const result = finalizeSeeding(testDir)
    expect(result.ok).toBe(false)
    expect(result.missingArtifacts).toContain('task_ledger.json')
  })

  it('returns missingArtifacts when seed_spec/ has no files', () => {
    mkdirSync(testDir, { recursive: true })
    writeFileSync(join(testDir, 'task_ledger.json'), '{}')
    writeFileSync(join(testDir, 'state.json'), JSON.stringify({ current_state: 'seeding' }))

    const result = finalizeSeeding(testDir)
    expect(result.ok).toBe(false)
    expect(result.missingArtifacts).toContain('seed_spec/')
  })

  it('transitions state to ready when both artifacts exist', () => {
    mkdirSync(join(testDir, 'seed_spec'), { recursive: true })
    writeFileSync(join(testDir, 'task_ledger.json'), '{}')
    writeFileSync(join(testDir, 'seed_spec', 'milestones.json'), '{}')
    writeFileSync(join(testDir, 'state.json'), JSON.stringify({ current_state: 'seeding', name: 'test' }))

    const result = finalizeSeeding(testDir)
    expect(result.ok).toBe(true)

    const state = JSON.parse(readFileSync(join(testDir, 'state.json'), 'utf-8'))
    expect(state.current_state).toBe('ready')
    expect(state.name).toBe('test') // preserved
  })
})
