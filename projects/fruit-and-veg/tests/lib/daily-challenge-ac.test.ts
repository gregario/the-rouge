import { describe, it, expect } from 'vitest'
import { generateDailyChallenge, markCardCompleted } from '@/lib/daily-challenge'
import type { CatalogueItem, UserProgress } from '@/lib/types'

const makeMockItem = (id: string, difficulty: 'easy' | 'medium' = 'easy'): CatalogueItem => ({
  id,
  name: id,
  image: `/images/catalogue/${id}.webp`,
  category: 'fruit',
  subcategory: 'common',
  colours: ['red'],
  growsOn: 'tree',
  origin: 'Worldwide',
  season: 'all-year',
  funFacts: [
    { text: 'I am tasty!', highlightWord: 'tasty', factType: 'surprise' },
    { text: 'I grow on trees!', highlightWord: 'trees', factType: 'growth' },
    { text: 'I am red!', highlightWord: 'red', factType: 'colour' },
  ],
  questions: [
    {
      id: `${id}-q1`,
      type: 'colour-match',
      questionText: 'What colour am I?',
      options: [
        { id: 'a', text: null, colour: '#FF0000', icon: null },
        { id: 'b', text: null, colour: '#00FF00', icon: null },
        { id: 'c', text: null, colour: '#0000FF', icon: null },
      ],
      correctOptionId: 'a',
      explanationCorrect: 'Yes! I am red!',
      explanationIncorrect: 'No, I am red!',
    },
    {
      id: `${id}-q2`,
      type: 'where-grow',
      questionText: 'Where do I grow?',
      options: [
        { id: 'a', text: 'Tree', colour: null, icon: 'tree' },
        { id: 'b', text: 'Ground', colour: null, icon: 'ground' },
        { id: 'c', text: 'Underground', colour: null, icon: 'underground' },
      ],
      correctOptionId: 'a',
      explanationCorrect: 'Yes! I grow on trees!',
      explanationIncorrect: 'No, I grow on trees!',
    },
  ],
  surpriseFact: null,
  difficulty,
})

const emptyProgress: UserProgress = {
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

const catalogue = Array.from({ length: 20 }, (_, i) =>
  makeMockItem(`item-${i}`, i < 10 ? 'easy' : 'medium')
)

describe('daily-challenge acceptance criteria', () => {
  // @criterion: AC-DAILY-05
  // @criterion-hash: 139b1cffeb4d
  describe('AC-DAILY-05: new user sees only featured card', () => {
    it('reviewItemIds is empty when user has 0 completed items', () => {
      const challenge = generateDailyChallenge(catalogue, emptyProgress, '2026-03-20')
      expect(challenge.reviewItemIds).toEqual([])
      expect(challenge.reviewItemIds).toHaveLength(0)
    })

    it('total cards is exactly 1 for a new user (featured only)', () => {
      const challenge = generateDailyChallenge(catalogue, emptyProgress, '2026-03-20')
      const totalCards = 1 + challenge.reviewItemIds.length
      expect(totalCards).toBe(1)
    })

    it('reviewItemIds is empty across multiple dates for new user', () => {
      const dates = ['2026-01-01', '2026-06-15', '2026-12-31']
      for (const date of dates) {
        const challenge = generateDailyChallenge(catalogue, emptyProgress, date)
        expect(challenge.reviewItemIds).toHaveLength(0)
      }
    })
  })

  // @criterion: AC-DAILY-06
  // @criterion-hash: 1a379dfb1376
  describe('AC-DAILY-06: daily challenge is consistent within a day', () => {
    it('same date produces identical challenge for same progress', () => {
      const c1 = generateDailyChallenge(catalogue, emptyProgress, '2026-03-20')
      const c2 = generateDailyChallenge(catalogue, emptyProgress, '2026-03-20')
      expect(c1).toEqual(c2)
    })

    it('same date produces identical challenge with non-empty progress', () => {
      const progress: UserProgress = {
        ...emptyProgress,
        completedItems: ['item-0', 'item-1', 'item-2'],
        completedAt: {
          'item-0': '2026-01-01',
          'item-1': '2026-01-02',
          'item-2': '2026-01-03',
        },
      }
      const c1 = generateDailyChallenge(catalogue, progress, '2026-05-10')
      const c2 = generateDailyChallenge(catalogue, progress, '2026-05-10')
      expect(c1.featuredItemId).toBe(c2.featuredItemId)
      expect(c1.reviewItemIds).toEqual(c2.reviewItemIds)
      expect(c1.date).toBe(c2.date)
    })

    it('calling multiple times never changes the result', () => {
      const results = Array.from({ length: 10 }, () =>
        generateDailyChallenge(catalogue, emptyProgress, '2026-07-04')
      )
      const first = results[0]
      for (const r of results) {
        expect(r.featuredItemId).toBe(first.featuredItemId)
        expect(r.reviewItemIds).toEqual(first.reviewItemIds)
      }
    })
  })

  // @criterion: AC-DAILY-08
  // @criterion-hash: 6230535fe0e0
  describe('AC-DAILY-08: partial progress tracking via markCardCompleted', () => {
    it('tracks partial completion without triggering isComplete', () => {
      const progress: UserProgress = {
        ...emptyProgress,
        completedItems: ['item-0', 'item-1', 'item-2'],
        completedAt: {
          'item-0': '2026-01-01',
          'item-1': '2026-01-02',
          'item-2': '2026-01-03',
        },
      }
      const challenge = generateDailyChallenge(catalogue, progress, '2026-03-20')
      // Should have featured + up to 2 reviews = up to 3 cards
      expect(challenge.reviewItemIds.length).toBeGreaterThan(0)

      // Complete only the featured card
      const afterOne = markCardCompleted(challenge, challenge.featuredItemId)
      expect(afterOne.completedCards).toHaveLength(1)
      expect(afterOne.completedCards).toContain(challenge.featuredItemId)
      expect(afterOne.isComplete).toBe(false)
    })

    it('completedCards accumulates across multiple markCardCompleted calls', () => {
      const progress: UserProgress = {
        ...emptyProgress,
        completedItems: ['item-0', 'item-1', 'item-2'],
        completedAt: {
          'item-0': '2026-01-01',
          'item-1': '2026-01-02',
          'item-2': '2026-01-03',
        },
      }
      const challenge = generateDailyChallenge(catalogue, progress, '2026-03-20')
      const totalCards = 1 + challenge.reviewItemIds.length

      // Complete cards one at a time
      let current = challenge
      const allCardIds = [challenge.featuredItemId, ...challenge.reviewItemIds]
      for (let i = 0; i < allCardIds.length - 1; i++) {
        current = markCardCompleted(current, allCardIds[i])
        expect(current.completedCards).toHaveLength(i + 1)
        expect(current.isComplete).toBe(false)
      }

      // Complete the last card
      current = markCardCompleted(current, allCardIds[allCardIds.length - 1])
      expect(current.completedCards).toHaveLength(totalCards)
      expect(current.isComplete).toBe(true)
    })

    it('returns same reference when marking already-completed card', () => {
      const challenge = generateDailyChallenge(catalogue, emptyProgress, '2026-03-20')
      const updated = markCardCompleted(challenge, challenge.featuredItemId)
      const duplicate = markCardCompleted(updated, challenge.featuredItemId)
      expect(duplicate).toBe(updated) // Same reference, no mutation
    })
  })

  // @criterion: AC-DAILY-09
  // @criterion-hash: 741487aef62b
  describe('AC-DAILY-09: all cards complete triggers isComplete with 3 cards', () => {
    it('isComplete triggers when featured + 2 review cards are all completed', () => {
      const progress: UserProgress = {
        ...emptyProgress,
        completedItems: ['item-0', 'item-1', 'item-2'],
        completedAt: {
          'item-0': '2026-01-01',
          'item-1': '2026-01-02',
          'item-2': '2026-01-03',
        },
      }
      const challenge = generateDailyChallenge(catalogue, progress, '2026-03-20')

      // Verify we have exactly 2 review items (3 completed items available)
      expect(challenge.reviewItemIds).toHaveLength(2)

      const totalCards = 1 + challenge.reviewItemIds.length
      expect(totalCards).toBe(3)

      // Complete all three cards
      let current = challenge
      current = markCardCompleted(current, challenge.featuredItemId)
      expect(current.isComplete).toBe(false)

      current = markCardCompleted(current, challenge.reviewItemIds[0])
      expect(current.isComplete).toBe(false)

      current = markCardCompleted(current, challenge.reviewItemIds[1])
      expect(current.isComplete).toBe(true)
      expect(current.completedCards).toHaveLength(3)
    })

    it('order of completion does not matter for triggering isComplete', () => {
      const progress: UserProgress = {
        ...emptyProgress,
        completedItems: ['item-0', 'item-1', 'item-2'],
        completedAt: {
          'item-0': '2026-01-01',
          'item-1': '2026-01-02',
          'item-2': '2026-01-03',
        },
      }
      const challenge = generateDailyChallenge(catalogue, progress, '2026-03-20')
      expect(challenge.reviewItemIds).toHaveLength(2)

      // Complete in reverse order: review2, review1, featured
      let current = challenge
      current = markCardCompleted(current, challenge.reviewItemIds[1])
      expect(current.isComplete).toBe(false)

      current = markCardCompleted(current, challenge.reviewItemIds[0])
      expect(current.isComplete).toBe(false)

      current = markCardCompleted(current, challenge.featuredItemId)
      expect(current.isComplete).toBe(true)
    })
  })

  // @criterion: AC-DAILY-11
  // @criterion-hash: a870b822583d
  describe('AC-DAILY-11: difficulty progression for new users', () => {
    it('users with 0 completions get easy featured items', () => {
      const easyIds = catalogue.filter(i => i.difficulty === 'easy').map(i => i.id)
      const challenges = Array.from({ length: 20 }, (_, i) =>
        generateDailyChallenge(catalogue, emptyProgress, `2026-04-${String(i + 1).padStart(2, '0')}`)
      )
      for (const c of challenges) {
        expect(easyIds).toContain(c.featuredItemId)
      }
    })

    it('users with 5 completions (< 10) still get easy featured items', () => {
      const progress: UserProgress = {
        ...emptyProgress,
        completedItems: ['item-0', 'item-1', 'item-2', 'item-3', 'item-4'],
        completedAt: {
          'item-0': '2026-01-01',
          'item-1': '2026-01-02',
          'item-2': '2026-01-03',
          'item-3': '2026-01-04',
          'item-4': '2026-01-05',
        },
      }
      const easyIds = catalogue.filter(i => i.difficulty === 'easy').map(i => i.id)
      const uncompletedEasyIds = easyIds.filter(id => !progress.completedItems.includes(id))

      const challenges = Array.from({ length: 15 }, (_, i) =>
        generateDailyChallenge(catalogue, progress, `2026-05-${String(i + 1).padStart(2, '0')}`)
      )
      for (const c of challenges) {
        expect(uncompletedEasyIds).toContain(c.featuredItemId)
      }
    })

    it('users with 9 completions (< 10) still prefer easy items', () => {
      const completedIds = Array.from({ length: 9 }, (_, i) => `item-${i}`)
      const progress: UserProgress = {
        ...emptyProgress,
        completedItems: completedIds,
        completedAt: Object.fromEntries(
          completedIds.map((id, i) => [id, `2026-01-${String(i + 1).padStart(2, '0')}`])
        ),
      }
      // Only item-9 remains as easy and uncompleted
      const challenge = generateDailyChallenge(catalogue, progress, '2026-03-20')
      expect(challenge.featuredItemId).toBe('item-9')
    })

    it('users with 10+ completions can get medium difficulty items', () => {
      const completedIds = Array.from({ length: 10 }, (_, i) => `item-${i}`)
      const progress: UserProgress = {
        ...emptyProgress,
        completedItems: completedIds,
        completedAt: Object.fromEntries(
          completedIds.map((id, i) => [id, `2026-01-${String(i + 1).padStart(2, '0')}`])
        ),
      }
      // All easy items (item-0 to item-9) are completed, only medium remain
      const mediumIds = catalogue.filter(i => i.difficulty === 'medium').map(i => i.id)
      const challenges = Array.from({ length: 10 }, (_, i) =>
        generateDailyChallenge(catalogue, progress, `2026-06-${String(i + 1).padStart(2, '0')}`)
      )
      for (const c of challenges) {
        expect(mediumIds).toContain(c.featuredItemId)
      }
    })
  })
})
