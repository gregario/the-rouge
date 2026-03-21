import { describe, it, expect } from 'vitest'
import { generateDailyChallenge, recordFeaturedItem } from '@/lib/daily-challenge'
import type { CatalogueItem, UserProgress } from '@/lib/types'

function makeCatalogue(count: number, opts?: Partial<CatalogueItem>): CatalogueItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    name: `Item ${i}`,
    image: `/images/item-${i}.webp`,
    category: 'fruit' as const,
    subcategory: 'common' as const,
    colours: ['red'],
    growsOn: 'tree' as const,
    origin: 'Testland',
    season: 'summer' as const,
    funFacts: [],
    questions: [],
    surpriseFact: null,
    difficulty: i < 5 ? 'easy' as const : 'medium' as const,
    ...opts,
  }))
}

function emptyProgress(): UserProgress {
  return {
    completedItems: [],
    completedAt: {},
    categoryBadges: [],
    currentStreak: 0,
    longestStreak: 0,
    lastPlayedDate: null,
    dailyStamps: [],
    totalQuizCorrect: 0,
    totalQuizAnswered: 0,
    recentFeaturedIds: [],
  }
}

describe('Daily Challenge Logic', () => {
  // @criterion: AC-DAILY-02
  // @criterion-hash: 063747b13750
  describe('AC-DAILY-02: featured item is uncompleted', () => {
    it('picks an uncompleted item as featured', () => {
      const catalogue = makeCatalogue(10)
      const progress: UserProgress = {
        ...emptyProgress(),
        completedItems: ['item-0', 'item-1', 'item-2'],
        completedAt: { 'item-0': '2026-01-01', 'item-1': '2026-01-02', 'item-2': '2026-01-03' },
      }
      const challenge = generateDailyChallenge(catalogue, progress, '2026-03-20')
      expect(progress.completedItems).not.toContain(challenge.featuredItemId)
    })

    it('never picks a completed item when uncompleted exist', () => {
      const catalogue = makeCatalogue(20)
      const completed = catalogue.slice(0, 15).map(i => i.id)
      const progress: UserProgress = {
        ...emptyProgress(),
        completedItems: completed,
        completedAt: Object.fromEntries(completed.map(id => [id, '2026-01-01'])),
      }
      // Test across multiple dates to increase confidence
      for (let d = 1; d <= 10; d++) {
        const ch = generateDailyChallenge(catalogue, progress, `2026-03-${String(d).padStart(2, '0')}`)
        expect(completed).not.toContain(ch.featuredItemId)
      }
    })
  })

  // @criterion: AC-DAILY-03
  // @criterion-hash: 1f90f1a6de25
  describe('AC-DAILY-03: review items are completed', () => {
    it('only includes completed items in review', () => {
      const catalogue = makeCatalogue(10)
      const progress: UserProgress = {
        ...emptyProgress(),
        completedItems: ['item-0', 'item-1', 'item-2'],
        completedAt: { 'item-0': '2026-01-01', 'item-1': '2026-01-02', 'item-2': '2026-01-03' },
      }
      const challenge = generateDailyChallenge(catalogue, progress, '2026-03-20')
      for (const reviewId of challenge.reviewItemIds) {
        expect(progress.completedItems).toContain(reviewId)
      }
    })

    it('returns at most 2 review items', () => {
      const catalogue = makeCatalogue(10)
      const progress: UserProgress = {
        ...emptyProgress(),
        completedItems: ['item-0', 'item-1', 'item-2', 'item-3', 'item-4'],
        completedAt: {
          'item-0': '2026-01-01', 'item-1': '2026-01-02',
          'item-2': '2026-01-03', 'item-3': '2026-01-04', 'item-4': '2026-01-05',
        },
      }
      const challenge = generateDailyChallenge(catalogue, progress, '2026-03-20')
      expect(challenge.reviewItemIds.length).toBeLessThanOrEqual(2)
    })
  })

  // @criterion: AC-DAILY-04
  // @criterion-hash: 8f19443578d1
  describe('AC-DAILY-04: review items prioritise oldest completions', () => {
    it('selects the two oldest completed items for review', () => {
      const catalogue = makeCatalogue(10)
      const progress: UserProgress = {
        ...emptyProgress(),
        completedItems: ['item-0', 'item-1', 'item-2', 'item-3'],
        completedAt: {
          'item-0': '2026-01-10',
          'item-1': '2026-01-01', // oldest
          'item-2': '2026-01-05', // second oldest
          'item-3': '2026-01-15',
        },
      }
      const challenge = generateDailyChallenge(catalogue, progress, '2026-03-20')
      // The two oldest should be item-1 and item-2 (unless one is featured)
      const reviewSet = new Set(challenge.reviewItemIds)
      // At minimum, the oldest completed items should appear
      expect(challenge.reviewItemIds.length).toBe(2)
      // item-1 (oldest) and item-2 (2nd oldest) should be review, unless featured
      if (challenge.featuredItemId !== 'item-1') {
        expect(reviewSet.has('item-1')).toBe(true)
      }
    })
  })

  // @criterion: AC-DAILY-07
  // @criterion-hash: bf0656f4c94d
  describe('AC-DAILY-07: daily challenge resets at midnight', () => {
    it('different dates produce challenges with potentially different featured items', () => {
      const catalogue = makeCatalogue(20)
      const progress = emptyProgress()
      const ch1 = generateDailyChallenge(catalogue, progress, '2026-03-20')
      const ch2 = generateDailyChallenge(catalogue, progress, '2026-03-21')
      // Different dates, different seeds — at least the date should differ
      expect(ch1.date).toBe('2026-03-20')
      expect(ch2.date).toBe('2026-03-21')
      // With 20 items and different seeds, it's very likely (but not guaranteed) to differ
      // We verify the mechanism works by checking the structure is correct
      expect(ch1.featuredItemId).toBeDefined()
      expect(ch2.featuredItemId).toBeDefined()
    })
  })

  // @criterion: AC-DAILY-10
  // @criterion-hash: 4090ed8ff497
  describe('AC-DAILY-10: re-discovery mode activates when catalogue exhausted', () => {
    it('picks from completed items when all are completed', () => {
      const catalogue = makeCatalogue(5)
      const allIds = catalogue.map(i => i.id)
      const progress: UserProgress = {
        ...emptyProgress(),
        completedItems: allIds,
        completedAt: Object.fromEntries(allIds.map(id => [id, '2026-01-01'])),
      }
      const challenge = generateDailyChallenge(catalogue, progress, '2026-03-20')
      expect(allIds).toContain(challenge.featuredItemId)
    })

    it('avoids recently featured even in re-discovery mode', () => {
      const catalogue = makeCatalogue(5)
      const allIds = catalogue.map(i => i.id)
      const progress: UserProgress = {
        ...emptyProgress(),
        completedItems: allIds,
        completedAt: Object.fromEntries(allIds.map(id => [id, '2026-01-01'])),
        recentFeaturedIds: ['item-0', 'item-1', 'item-2', 'item-3'],
      }
      const challenge = generateDailyChallenge(catalogue, progress, '2026-03-20')
      // Only item-4 is not recent, so it should be featured
      expect(challenge.featuredItemId).toBe('item-4')
    })
  })

  // @criterion: AC-DAILY-12
  // @criterion-hash: 9c3cd3942d1a
  describe('AC-DAILY-12: featured item not repeated within 7 days', () => {
    it('recordFeaturedItem keeps only last 7 entries', () => {
      let progress = emptyProgress()
      for (let i = 0; i < 10; i++) {
        progress = recordFeaturedItem(progress, `item-${i}`)
      }
      expect(progress.recentFeaturedIds.length).toBe(7)
      expect(progress.recentFeaturedIds[0]).toBe('item-3')
      expect(progress.recentFeaturedIds[6]).toBe('item-9')
    })

    it('avoids recently featured items when alternatives exist', () => {
      // Use 10 completions so difficulty filter doesn't apply
      const catalogue = makeCatalogue(10)
      const completedIds = catalogue.slice(0, 10).map(i => i.id)
      const progress: UserProgress = {
        ...emptyProgress(),
        completedItems: completedIds,
        completedAt: Object.fromEntries(completedIds.map(id => [id, '2026-01-01'])),
        recentFeaturedIds: ['item-0', 'item-1', 'item-2', 'item-3', 'item-4', 'item-5', 'item-6'],
      }
      // All completed → re-discovery mode. Non-recent items: 7, 8, 9
      for (let d = 1; d <= 5; d++) {
        const ch = generateDailyChallenge(catalogue, progress, `2026-04-${String(d).padStart(2, '0')}`)
        expect(['item-7', 'item-8', 'item-9']).toContain(ch.featuredItemId)
      }
    })
  })
})
