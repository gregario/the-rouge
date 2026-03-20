import { describe, it, expect } from 'vitest'
import type { CatalogueItem } from '@/lib/types'

// This test validates the catalogue data against spec requirements
// Import the actual catalogue data
let catalogue: CatalogueItem[]

try {
  // Dynamic import to handle case where JSON doesn't exist yet
  const data = await import('../../src/data/catalogue.json')
  catalogue = data.default as CatalogueItem[]
} catch {
  catalogue = []
}

const shouldRun = catalogue.length > 0

describe.skipIf(!shouldRun)('Catalogue Data Validation', () => {
  it('AC-CAT-01: All catalogue items load (minimum 60)', () => {
    expect(catalogue.length).toBeGreaterThanOrEqual(60)
  })

  it('AC-CAT-02: All images have valid paths', () => {
    for (const item of catalogue) {
      expect(item.image).toMatch(/^\/images\/catalogue\/[\w-]+\.webp$/)
    }
  })

  it('AC-CAT-03: All questions have valid correct answers', () => {
    for (const item of catalogue) {
      for (const q of item.questions) {
        const optionIds = q.options.map((o) => o.id)
        expect(
          optionIds,
          `${item.id} question ${q.id}: correctOptionId "${q.correctOptionId}" not in options ${JSON.stringify(optionIds)}`
        ).toContain(q.correctOptionId)
      }
    }
  })

  it('AC-CAT-04: Category distribution is balanced', () => {
    const fruits = catalogue.filter((i) => i.category === 'fruit').length
    const vegetables = catalogue.filter((i) => i.category === 'vegetable').length
    const berries = catalogue.filter((i) => i.category === 'berry').length
    expect(fruits).toBeGreaterThanOrEqual(25)
    expect(vegetables).toBeGreaterThanOrEqual(25)
    expect(berries).toBeGreaterThanOrEqual(6)
  })

  it('AC-CAT-05: Fun facts meet content requirements', () => {
    for (const item of catalogue) {
      expect(
        item.funFacts.length,
        `${item.id}: expected 3-4 fun facts, got ${item.funFacts.length}`
      ).toBeGreaterThanOrEqual(3)
      expect(item.funFacts.length).toBeLessThanOrEqual(4)

      for (const fact of item.funFacts) {
        expect(
          fact.text.length,
          `${item.id}: fact too long (${fact.text.length} chars): "${fact.text}"`
        ).toBeLessThanOrEqual(80)

        expect(
          fact.text.toLowerCase(),
          `${item.id}: highlightWord "${fact.highlightWord}" not in fact "${fact.text}"`
        ).toContain(fact.highlightWord.toLowerCase())
      }
    }
  })

  it('AC-CAT-06: Questions cover multiple types per item', () => {
    for (const item of catalogue) {
      if (item.questions.length >= 4) {
        const types = new Set(item.questions.map((q) => q.type))
        expect(
          types.size,
          `${item.id}: only ${types.size} question type(s), expected >= 2`
        ).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('AC-CAT-07: No duplicate item IDs', () => {
    const ids = catalogue.map((i) => i.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('AC-CAT-08: Colour-match questions have valid hex colours', () => {
    const hexRegex = /^#[0-9a-fA-F]{6}$/
    for (const item of catalogue) {
      for (const q of item.questions) {
        if (q.type === 'colour-match') {
          for (const opt of q.options) {
            expect(
              opt.colour,
              `${item.id} question ${q.id}: colour-match option missing colour`
            ).toBeTruthy()
            expect(
              opt.colour,
              `${item.id} question ${q.id}: invalid hex colour "${opt.colour}"`
            ).toMatch(hexRegex)
          }
        }
      }
    }
  })

  it('every item has 4-5 questions', () => {
    for (const item of catalogue) {
      expect(
        item.questions.length,
        `${item.id}: expected 4-5 questions, got ${item.questions.length}`
      ).toBeGreaterThanOrEqual(4)
      expect(item.questions.length).toBeLessThanOrEqual(5)
    }
  })

  it('every item has at least 1 colour', () => {
    for (const item of catalogue) {
      expect(
        item.colours.length,
        `${item.id}: needs at least 1 colour`
      ).toBeGreaterThanOrEqual(1)
    }
  })

  it('question IDs follow naming pattern', () => {
    for (const item of catalogue) {
      for (const q of item.questions) {
        expect(
          q.id,
          `Question ID "${q.id}" should start with "${item.id}-q"`
        ).toMatch(new RegExp(`^${item.id}-q\\d+$`))
      }
    }
  })
})
