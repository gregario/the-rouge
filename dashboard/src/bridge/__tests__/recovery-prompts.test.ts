import { describe, it, expect } from 'vitest'
import { recoveryPromptFor } from '../recovery-prompts'

describe('recoveryPromptFor', () => {
  it('returns a discipline-specific prompt for each of the eight disciplines', () => {
    const disciplines = [
      'brainstorming',
      'competition',
      'taste',
      'spec',
      'infrastructure',
      'design',
      'legal-privacy',
      'marketing',
    ]
    const texts = new Set<string>()
    for (const d of disciplines) {
      const p = recoveryPromptFor(d)
      expect(p.text).toMatch(/^\[SYSTEM\]/)
      expect(p.text.length).toBeGreaterThan(50)
      texts.add(p.text)
    }
    // Each discipline gets a distinct prompt — if someone
    // accidentally copies one over another, this test catches it.
    expect(texts.size).toBe(disciplines.length)
  })

  it('returns a generic fallback for unknown discipline', () => {
    const p = recoveryPromptFor('some-new-phase-we-dont-know-about')
    expect(p.text).toMatch(/^\[SYSTEM\]/)
    expect(p.text).toContain('Continue the current discipline')
  })

  it('returns a generic fallback for null discipline', () => {
    expect(recoveryPromptFor(null).text).toMatch(/^\[SYSTEM\]/)
    expect(recoveryPromptFor(undefined).text).toMatch(/^\[SYSTEM\]/)
  })

  it('spec recovery explicitly reminds about per-FA markers (the regression Phase 3 is meant to catch)', () => {
    // Spec has the most explicit "please emit a marker" nudge
    // because the colourcontrast stall happened inside spec.
    const p = recoveryPromptFor('spec')
    expect(p.text).toMatch(/WROTE:/)
    expect(p.text.toLowerCase()).toContain('faN'.toLowerCase())
  })
})
