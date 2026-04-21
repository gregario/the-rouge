import { describe, it, expect, afterEach } from 'vitest'
import { readSeedingState, writeSeedingState, updateSessionId, markDisciplineComplete, markDisciplinePrompted, markSeedingComplete, appendPendingCorrection, peekPendingCorrection, clearPendingCorrection, setAwaitingGate, clearPendingGate, updateHeartbeat, isAwaitingGateFor, effectiveMode } from '../seeding-state'
import { writeStateJson, statePath } from '../state-path'
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'fs'
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

  it('marks discipline complete appending to array', async () => {
    mkdirSync(testDir, { recursive: true })
    writeSeedingState(testDir, { session_id: null, status: 'active' })
    await markDisciplineComplete(testDir, 'brainstorming')
    await markDisciplineComplete(testDir, 'competition')
    const state = readSeedingState(testDir)
    expect(state.disciplines_complete).toEqual(['brainstorming', 'competition'])
  })

  it('does not duplicate discipline entries', async () => {
    mkdirSync(testDir, { recursive: true })
    writeSeedingState(testDir, { session_id: null, status: 'active' })
    await markDisciplineComplete(testDir, 'brainstorming')
    await markDisciplineComplete(testDir, 'brainstorming')
    const state = readSeedingState(testDir)
    expect(state.disciplines_complete).toEqual(['brainstorming'])
  })

  it('advances current_discipline to next in sequence', async () => {
    mkdirSync(testDir, { recursive: true })
    writeSeedingState(testDir, { session_id: null, status: 'active' })
    await markDisciplineComplete(testDir, 'brainstorming')
    expect(readSeedingState(testDir).current_discipline).toBe('competition')
    await markDisciplineComplete(testDir, 'competition')
    expect(readSeedingState(testDir).current_discipline).toBe('taste')
  })

  it('skips completed disciplines when advancing', async () => {
    mkdirSync(testDir, { recursive: true })
    writeSeedingState(testDir, {
      session_id: null,
      status: 'active',
      disciplines_complete: ['brainstorming', 'competition', 'taste'],
    })
    await markDisciplineComplete(testDir, 'spec')
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

  // Phase 0 of the seed-loop architecture plan: when a discipline is
  // prompted, its state.json entry flips to 'in-progress'. Previously
  // nothing ever wrote in-progress — only 'complete' — so the stepper
  // had to synthesise the active state from `currentDiscipline`. That
  // synthesis broke in the stackrank case (competition was prompted but
  // UI showed pending). These tests lock in the direct write path.
  describe('markDisciplinePrompted — state.json flip to in-progress', () => {
    function seedProjectWithDisciplines(): void {
      mkdirSync(testDir, { recursive: true })
      writeStateJson(testDir, {
        current_state: 'seeding',
        seedingProgress: {
          disciplines: [
            { discipline: 'brainstorming', status: 'pending' },
            { discipline: 'competition', status: 'pending' },
            { discipline: 'taste', status: 'pending' },
            { discipline: 'spec', status: 'pending' },
            { discipline: 'infrastructure', status: 'pending' },
            { discipline: 'design', status: 'pending' },
            { discipline: 'legal-privacy', status: 'pending' },
            { discipline: 'marketing', status: 'pending' },
          ],
          completedCount: 0,
          totalCount: 8,
          currentDiscipline: 'brainstorming',
        },
      })
      writeSeedingState(testDir, { session_id: null, status: 'active' })
    }

    function readDisciplineStatus(discipline: string): string | undefined {
      const state = JSON.parse(readFileSync(statePath(testDir), 'utf-8'))
      const entry = state.seedingProgress?.disciplines?.find(
        (d: { discipline: string }) => d.discipline === discipline,
      )
      return entry?.status
    }

    it('flips discipline status from pending to in-progress', async () => {
      seedProjectWithDisciplines()
      await markDisciplinePrompted(testDir, 'competition')
      expect(readDisciplineStatus('competition')).toBe('in-progress')
    })

    it('leaves other disciplines untouched', async () => {
      seedProjectWithDisciplines()
      await markDisciplinePrompted(testDir, 'competition')
      expect(readDisciplineStatus('brainstorming')).toBe('pending')
      expect(readDisciplineStatus('taste')).toBe('pending')
    })

    it('sets currentDiscipline to the promoted discipline on in-progress', async () => {
      // Originally this test asserted currentDiscipline was unchanged
      // on in-progress promotion — that behaviour was a bug: nobody
      // else wrote currentDiscipline during active work, so it stayed
      // stale/null the whole time a discipline was in-progress. The
      // dashboard stepper and the bridge watcher both key off
      // currentDiscipline; without this the dashboard never learned
      // a daemon turn completed (no watcher event, no client refetch).
      // The correct semantic is: currentDiscipline ALWAYS points at
      // whichever discipline is actively being worked on.
      seedProjectWithDisciplines()
      await markDisciplinePrompted(testDir, 'competition')
      const state = JSON.parse(readFileSync(statePath(testDir), 'utf-8'))
      expect(state.seedingProgress.currentDiscipline).toBe('competition')
    })

    it('is idempotent — calling twice leaves status at in-progress', async () => {
      seedProjectWithDisciplines()
      await markDisciplinePrompted(testDir, 'competition')
      await markDisciplinePrompted(testDir, 'competition')
      expect(readDisciplineStatus('competition')).toBe('in-progress')
    })

    it('does not downgrade a complete discipline back to in-progress', async () => {
      seedProjectWithDisciplines()
      // First complete brainstorming.
      await markDisciplineComplete(testDir, 'brainstorming')
      expect(readDisciplineStatus('brainstorming')).toBe('complete')
      // Now a stray markDisciplinePrompted — must NOT downgrade.
      await markDisciplinePrompted(testDir, 'brainstorming')
      expect(readDisciplineStatus('brainstorming')).toBe('complete')
    })

    it('still appends to disciplines_prompted in seeding-state.json', async () => {
      seedProjectWithDisciplines()
      await markDisciplinePrompted(testDir, 'competition')
      const s = readSeedingState(testDir)
      expect(s.disciplines_prompted).toContain('competition')
    })

    it('is a no-op on state.json when seedingProgress is missing', async () => {
      // Old projects / malformed states must not throw — they just
      // skip the state.json update and proceed with seeding-state
      // mutation.
      mkdirSync(testDir, { recursive: true })
      writeStateJson(testDir, { current_state: 'seeding' })
      writeSeedingState(testDir, { session_id: null, status: 'active' })
      await expect(markDisciplinePrompted(testDir, 'competition')).resolves.toBeUndefined()
      const s = readSeedingState(testDir)
      expect(s.disciplines_prompted).toContain('competition')
    })
  })

  it('writeSeedingState leaves no .tmp file behind on success', () => {
    mkdirSync(testDir, { recursive: true })
    writeSeedingState(testDir, { session_id: 'a', status: 'active' })
    writeSeedingState(testDir, { session_id: 'b', status: 'active' })
    writeSeedingState(testDir, { session_id: 'c', status: 'active' })
    const stray = readdirSync(testDir).filter((f) => f.endsWith('.tmp'))
    expect(stray).toEqual([])
  })

  it('peek returns pending correction without clearing it', () => {
    mkdirSync(testDir, { recursive: true })
    writeSeedingState(testDir, { session_id: 's', status: 'active' })
    appendPendingCorrection(testDir, 'marker X rejected')
    expect(peekPendingCorrection(testDir)).toBe('marker X rejected')
    // Still there.
    expect(peekPendingCorrection(testDir)).toBe('marker X rejected')
    expect(readSeedingState(testDir).pending_correction).toBe('marker X rejected')
  })

  it('clear removes the pending correction and preserves other state', () => {
    mkdirSync(testDir, { recursive: true })
    writeSeedingState(testDir, { session_id: 's1', status: 'active' })
    appendPendingCorrection(testDir, 'rejected')
    clearPendingCorrection(testDir)
    expect(peekPendingCorrection(testDir)).toBeNull()
    // Other fields preserved.
    expect(readSeedingState(testDir).session_id).toBe('s1')
    expect(readSeedingState(testDir).status).toBe('active')
  })

  it('clear is a no-op when there is no pending correction', () => {
    mkdirSync(testDir, { recursive: true })
    writeSeedingState(testDir, { session_id: 's', status: 'active' })
    // Should not throw.
    clearPendingCorrection(testDir)
    expect(readSeedingState(testDir).session_id).toBe('s')
  })

  // ─── Gated autonomy ─────────────────────────────────────────────

  it('effectiveMode defaults to running_autonomous for legacy state', () => {
    const legacy = { session_id: null, status: 'active' as const }
    expect(effectiveMode(legacy)).toBe('running_autonomous')
  })

  it('setAwaitingGate flips mode and records the pending gate', () => {
    mkdirSync(testDir, { recursive: true })
    writeSeedingState(testDir, { session_id: 's', status: 'active' })
    setAwaitingGate(testDir, 'brainstorming', 'brainstorming/H1-premise')
    const state = readSeedingState(testDir)
    expect(state.mode).toBe('awaiting_gate')
    expect(state.pending_gate?.discipline).toBe('brainstorming')
    expect(state.pending_gate?.gate_id).toBe('brainstorming/H1-premise')
    expect(state.pending_gate?.asked_at).toBeTruthy()
  })

  it('isAwaitingGateFor matches only the specific discipline', () => {
    mkdirSync(testDir, { recursive: true })
    writeSeedingState(testDir, { session_id: 's', status: 'active' })
    setAwaitingGate(testDir, 'brainstorming', 'brainstorming/H1')
    const state = readSeedingState(testDir)
    expect(isAwaitingGateFor(state, 'brainstorming')).toBe(true)
    expect(isAwaitingGateFor(state, 'competition')).toBe(false)
  })

  it('clearPendingGate returns to running_autonomous and removes pending_gate', () => {
    mkdirSync(testDir, { recursive: true })
    writeSeedingState(testDir, { session_id: 's', status: 'active' })
    setAwaitingGate(testDir, 'brainstorming', 'brainstorming/H1')
    clearPendingGate(testDir)
    const state = readSeedingState(testDir)
    expect(state.mode).toBe('running_autonomous')
    expect(state.pending_gate).toBeUndefined()
  })

  it('updateHeartbeat sets last_heartbeat_at to now', () => {
    mkdirSync(testDir, { recursive: true })
    writeSeedingState(testDir, { session_id: 's', status: 'active' })
    const before = Date.now()
    updateHeartbeat(testDir)
    const state = readSeedingState(testDir)
    expect(state.last_heartbeat_at).toBeTruthy()
    const hbTs = new Date(state.last_heartbeat_at!).getTime()
    expect(hbTs).toBeGreaterThanOrEqual(before - 5)
  })
})
