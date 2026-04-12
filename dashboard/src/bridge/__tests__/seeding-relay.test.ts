import { describe, it, expect } from 'vitest'
import { parseSeedingOutput } from '../seeding-relay'

describe('parseSeedingOutput', () => {
  it('detects discipline complete markers', () => {
    const result = parseSeedingOutput('[DISCIPLINE_COMPLETE: brainstorming]')
    expect(result).toEqual({ type: 'discipline-complete', discipline: 'brainstorming' })
  })

  it('detects seeding complete marker', () => {
    const result = parseSeedingOutput('SEEDING_COMPLETE')
    expect(result).toEqual({ type: 'seeding-complete' })
  })

  it('returns null for regular text', () => {
    const result = parseSeedingOutput('What kind of product are you thinking about?')
    expect(result).toBeNull()
  })

  it('handles discipline marker mid-line', () => {
    const result = parseSeedingOutput('Great, moving on. [DISCIPLINE_COMPLETE: competition]')
    expect(result).toEqual({ type: 'discipline-complete', discipline: 'competition' })
  })

  it('handles all 8 discipline names', () => {
    const disciplines = ['brainstorming', 'competition', 'taste', 'spec', 'infrastructure', 'design', 'legal-privacy', 'marketing']
    for (const d of disciplines) {
      const result = parseSeedingOutput(`[DISCIPLINE_COMPLETE: ${d}]`)
      expect(result).toEqual({ type: 'discipline-complete', discipline: d })
    }
  })

  it('does not false-positive on similar text', () => {
    expect(parseSeedingOutput('The seeding is complete now')).toBeNull()
    expect(parseSeedingOutput('DISCIPLINE_COMPLETE without brackets')).toBeNull()
  })
})
