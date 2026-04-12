import { describe, it, expect, afterEach } from 'vitest'
import { readSeedingState, writeSeedingState, updateSessionId, markDisciplineComplete, markSeedingComplete } from '../seeding-state'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('seeding-state', () => {
  const testDir = join(tmpdir(), 'seeding-state-' + Date.now())

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('returns default state when file does not exist', () => {
    mkdirSync(testDir, { recursive: true })
    const state = readSeedingState(testDir)
    expect(state.status).toBe('not-started')
    expect(state.session_id).toBeNull()
  })

  it('writes and reads state', () => {
    mkdirSync(testDir, { recursive: true })
    writeSeedingState(testDir, {
      session_id: 'sess-123',
      status: 'active',
      started_at: '2026-04-05T10:00:00Z',
    })
    const state = readSeedingState(testDir)
    expect(state.session_id).toBe('sess-123')
    expect(state.status).toBe('active')
  })

  it('updates session_id preserving other fields', () => {
    mkdirSync(testDir, { recursive: true })
    writeSeedingState(testDir, { session_id: null, status: 'active' })
    updateSessionId(testDir, 'sess-new')
    const state = readSeedingState(testDir)
    expect(state.session_id).toBe('sess-new')
    expect(state.status).toBe('active')
  })

  it('marks discipline complete appending to array', () => {
    mkdirSync(testDir, { recursive: true })
    writeSeedingState(testDir, { session_id: null, status: 'active' })
    markDisciplineComplete(testDir, 'brainstorming')
    markDisciplineComplete(testDir, 'competition')
    const state = readSeedingState(testDir)
    expect(state.disciplines_complete).toEqual(['brainstorming', 'competition'])
  })

  it('does not duplicate discipline entries', () => {
    mkdirSync(testDir, { recursive: true })
    writeSeedingState(testDir, { session_id: null, status: 'active' })
    markDisciplineComplete(testDir, 'brainstorming')
    markDisciplineComplete(testDir, 'brainstorming')
    const state = readSeedingState(testDir)
    expect(state.disciplines_complete).toEqual(['brainstorming'])
  })

  it('advances current_discipline to next in sequence', () => {
    mkdirSync(testDir, { recursive: true })
    writeSeedingState(testDir, { session_id: null, status: 'active' })
    markDisciplineComplete(testDir, 'brainstorming')
    expect(readSeedingState(testDir).current_discipline).toBe('competition')
    markDisciplineComplete(testDir, 'competition')
    expect(readSeedingState(testDir).current_discipline).toBe('taste')
  })

  it('skips completed disciplines when advancing', () => {
    mkdirSync(testDir, { recursive: true })
    writeSeedingState(testDir, {
      session_id: null,
      status: 'active',
      disciplines_complete: ['brainstorming', 'competition', 'taste'],
    })
    markDisciplineComplete(testDir, 'spec')
    expect(readSeedingState(testDir).current_discipline).toBe('infrastructure')
  })

  it('marks seeding complete and sets status', () => {
    mkdirSync(testDir, { recursive: true })
    writeSeedingState(testDir, { session_id: 'x', status: 'active' })
    markSeedingComplete(testDir)
    const state = readSeedingState(testDir)
    expect(state.seeding_complete).toBe(true)
    expect(state.status).toBe('complete')
  })
})
