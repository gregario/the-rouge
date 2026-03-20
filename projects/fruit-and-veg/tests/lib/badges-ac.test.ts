import { describe, it, expect } from 'vitest'
import { generateBadges, checkNewBadges } from '@/lib/badges'
import { catalogue } from '@/data/catalogue'

describe('Badges & Achievements', () => {
  const badges = generateBadges(catalogue)

  // @criterion: AC-ACH-04
  // @criterion-hash: aad07c3a734d
  describe('AC-ACH-04: progress counter accuracy', () => {
    it('badges cover all catalogue items exactly once', () => {
      const allRequiredIds = badges.flatMap(b => b.requiredItemIds)
      const catalogueIds = catalogue.map(i => i.id)
      // Every catalogue item appears in exactly one badge
      for (const id of catalogueIds) {
        const count = allRequiredIds.filter(rid => rid === id).length
        expect(count, `item ${id} should appear in exactly 1 badge`).toBe(1)
      }
      // No badge references non-existent items
      for (const id of allRequiredIds) {
        expect(catalogueIds, `badge references non-existent item ${id}`).toContain(id)
      }
    })
  })

  // @criterion: AC-ACH-05
  // @criterion-hash: f4e26916db0d
  describe('AC-ACH-05: category badge earned on full completion', () => {
    it('checkNewBadges returns badge when all items completed', () => {
      const badge = badges.find(b => b.category === 'tropical')!
      expect(badge).toBeDefined()
      const newBadges = checkNewBadges(badges, badge.requiredItemIds, [])
      expect(newBadges).toContainEqual(badge)
    })

    it('checkNewBadges returns nothing when items are missing', () => {
      const badge = badges.find(b => b.category === 'tropical')!
      const partial = badge.requiredItemIds.slice(0, -1) // missing last item
      const newBadges = checkNewBadges(badges, partial, [])
      expect(newBadges.find(b => b.id === badge.id)).toBeUndefined()
    })

    it('checkNewBadges does not re-award existing badges', () => {
      const badge = badges.find(b => b.category === 'tropical')!
      const newBadges = checkNewBadges(badges, badge.requiredItemIds, [badge.id])
      expect(newBadges.find(b => b.id === badge.id)).toBeUndefined()
    })
  })

  // @criterion: AC-ACH-01
  // @criterion-hash: c40392dd512b
  describe('AC-ACH-01: all items represented', () => {
    it('every subcategory has at least one badge', () => {
      const subcategories = new Set(catalogue.map(i => i.subcategory))
      for (const sub of subcategories) {
        expect(badges.find(b => b.category === sub), `missing badge for ${sub}`).toBeDefined()
      }
    })
  })
})
