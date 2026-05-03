import { describe, it, expect } from 'vitest'
import { phaseLabel, phaseGloss, knownPhaseStates } from '../phase-labels'
import type { ProjectState } from '../types'

describe('phaseLabel', () => {
  it('returns a user-speak label for every ProjectState', () => {
    const states: ProjectState[] = [
      'seeding', 'ready', 'foundation', 'foundation-eval', 'story-building',
      'milestone-check', 'milestone-fix', 'analyzing', 'generating-change-spec',
      'vision-check', 'shipping', 'final-review', 'complete',
      'escalation', 'waiting-for-human',
    ]
    for (const s of states) {
      const label = phaseLabel(s)
      expect(label).toBeTruthy()
      // The label should never be the raw internal state — the point
      // of this module is to translate to user-speak.
      expect(label).not.toBe(s)
    }
  })

  it('echoes the input for unknown state (no crash)', () => {
    expect(phaseLabel('some-future-state')).toBe('some-future-state')
  })

  it('translates foundation to building-foundation language (foundation is now a milestone)', () => {
    // Foundation is now a regular milestone with discrete stories that
    // run through the same story-building loop. The legacy "foundation"
    // state label says "Building foundation" to match.
    expect(phaseLabel('foundation').toLowerCase()).toContain('foundation')
  })
})

describe('phaseGloss', () => {
  it('returns a non-empty sentence for known phases', () => {
    expect(phaseGloss('foundation')).toMatch(/.+/)
    expect(phaseGloss('milestone-check').toLowerCase()).toMatch(/review|evaluat|code review|po|test/)
  })

  it('returns empty string for unknown state', () => {
    expect(phaseGloss('some-future-state')).toBe('')
  })
})

describe('knownPhaseStates', () => {
  it('includes every ProjectState member', () => {
    const known = knownPhaseStates()
    const states: ProjectState[] = [
      'seeding', 'ready', 'foundation', 'foundation-eval', 'story-building',
      'milestone-check', 'milestone-fix', 'analyzing', 'generating-change-spec',
      'vision-check', 'shipping', 'final-review', 'complete',
      'escalation', 'waiting-for-human',
    ]
    for (const s of states) {
      expect(known).toContain(s)
    }
  })
})
