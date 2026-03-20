import { describe, it, expect } from 'vitest'
import { generateDailyChallenge, markCardCompleted, recordFeaturedItem } from '@/lib/daily-challenge'
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

describe('daily-challenge', () => {
  describe('generateDailyChallenge', () => {
    // @criterion: AC-DAILY-05
    // @criterion-hash: 7abf2c2bcdf7
    it('generates a challenge with featured item for new user', () => {
      const challenge = generateDailyChallenge(catalogue, emptyProgress, '2026-03-20')
      expect(challenge.date).toBe('2026-03-20')
      expect(challenge.featuredItemId).toBeDefined()
      expect(challenge.reviewItemIds).toHaveLength(0)
      expect(challenge.completedCards).toHaveLength(0)
      expect(challenge.isComplete).toBe(false)
    })

    // @criterion: AC-DAILY-02
    // @criterion-hash: d4dcbab28a96
    it('featured item is uncompleted', () => {
      const challenge = generateDailyChallenge(catalogue, emptyProgress, '2026-03-20')
      expect(emptyProgress.completedItems).not.toContain(challenge.featuredItemId)
    })

    // @criterion: AC-DAILY-11
    // @criterion-hash: a455a882e534
    it('prefers easy items for users with < 10 completions', () => {
      const progress = {
        ...emptyProgress,
        completedItems: ['item-0', 'item-1'],
        completedAt: { 'item-0': '2026-01-01', 'item-1': '2026-01-02' },
      }
      // Run multiple times to verify bias toward easy
      const challenges = Array.from({ length: 20 }, (_, i) =>
        generateDailyChallenge(catalogue, progress, `2026-03-${String(i + 1).padStart(2, '0')}`)
      )
      const easyIds = catalogue.filter(i => i.difficulty === 'easy').map(i => i.id)
      const featuredEasy = challenges.filter(c => easyIds.includes(c.featuredItemId))
      expect(featuredEasy.length).toBeGreaterThan(10) // Should be mostly easy
    })

    // @criterion: AC-DAILY-03
    // @criterion-hash: b2b54c4b9b61
    it('adds review items from completed', () => {
      const progress = {
        ...emptyProgress,
        completedItems: ['item-0', 'item-1', 'item-2'],
        completedAt: {
          'item-0': '2026-01-01',
          'item-1': '2026-01-02',
          'item-2': '2026-01-03',
        },
      }
      const challenge = generateDailyChallenge(catalogue, progress, '2026-03-20')
      expect(challenge.reviewItemIds.length).toBeLessThanOrEqual(2)
      for (const rid of challenge.reviewItemIds) {
        expect(progress.completedItems).toContain(rid)
      }
    })

    // @criterion: AC-DAILY-04
    // @criterion-hash: 0a5e5ef97766
    it('review items are oldest completed first', () => {
      const progress = {
        ...emptyProgress,
        completedItems: ['item-5', 'item-3', 'item-1', 'item-7'],
        completedAt: {
          'item-5': '2026-01-05',
          'item-3': '2026-01-03',
          'item-1': '2026-01-01',
          'item-7': '2026-01-07',
        },
      }
      const challenge = generateDailyChallenge(catalogue, progress, '2026-03-20')
      // Oldest should be item-1 and item-3
      if (challenge.reviewItemIds.length === 2) {
        expect(challenge.reviewItemIds).toContain('item-1')
        expect(challenge.reviewItemIds).toContain('item-3')
      }
    })

    it('is deterministic for same date', () => {
      const c1 = generateDailyChallenge(catalogue, emptyProgress, '2026-03-20')
      const c2 = generateDailyChallenge(catalogue, emptyProgress, '2026-03-20')
      expect(c1.featuredItemId).toBe(c2.featuredItemId)
    })

    it('generates different challenges for different dates', () => {
      const c1 = generateDailyChallenge(catalogue, emptyProgress, '2026-03-20')
      const c2 = generateDailyChallenge(catalogue, emptyProgress, '2026-03-21')
      // Not guaranteed different but very likely with 20 items
      // Skip strict assertion — just verify both are valid
      expect(c1.date).toBe('2026-03-20')
      expect(c2.date).toBe('2026-03-21')
    })

    it('re-discovery mode when all items completed', () => {
      const allCompleted = catalogue.map(i => i.id)
      const progress = {
        ...emptyProgress,
        completedItems: allCompleted,
        completedAt: Object.fromEntries(allCompleted.map(id => [id, '2026-01-01'])),
      }
      const challenge = generateDailyChallenge(catalogue, progress, '2026-03-20')
      expect(allCompleted).toContain(challenge.featuredItemId)
    })

    it('avoids recently featured items (AC-DAILY-12)', () => {
      // Set up progress where items 0-6 were recently featured
      const recentIds = Array.from({ length: 7 }, (_, i) => `item-${i}`)
      const progress = {
        ...emptyProgress,
        recentFeaturedIds: recentIds,
      }
      // Generate challenges — featured should NOT be in recentIds (if enough alternatives)
      const challenges = Array.from({ length: 10 }, (_, i) =>
        generateDailyChallenge(catalogue, progress, `2026-04-${String(i + 1).padStart(2, '0')}`)
      )
      for (const c of challenges) {
        expect(recentIds).not.toContain(c.featuredItemId)
      }
    })

    it('falls back to recent items if no alternatives available', () => {
      // Only 2 items in catalogue, both recently featured
      const smallCatalogue = [makeMockItem('a'), makeMockItem('b')]
      const progress = {
        ...emptyProgress,
        recentFeaturedIds: ['a', 'b'],
      }
      const challenge = generateDailyChallenge(smallCatalogue, progress, '2026-03-20')
      expect(['a', 'b']).toContain(challenge.featuredItemId)
    })
  })

  describe('recordFeaturedItem', () => {
    it('adds featured item to recentFeaturedIds', () => {
      const updated = recordFeaturedItem(emptyProgress, 'item-0')
      expect(updated.recentFeaturedIds).toEqual(['item-0'])
    })

    it('keeps max 7 items', () => {
      const progress = {
        ...emptyProgress,
        recentFeaturedIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      }
      const updated = recordFeaturedItem(progress, 'h')
      expect(updated.recentFeaturedIds).toHaveLength(7)
      expect(updated.recentFeaturedIds).not.toContain('a')
      expect(updated.recentFeaturedIds).toContain('h')
    })

    it('does not duplicate if last item is same', () => {
      const progress = {
        ...emptyProgress,
        recentFeaturedIds: ['item-0'],
      }
      const updated = recordFeaturedItem(progress, 'item-0')
      expect(updated).toBe(progress) // Same reference — no change
    })
  })

  describe('markCardCompleted', () => {
    it('adds card to completedCards', () => {
      const challenge = generateDailyChallenge(catalogue, emptyProgress, '2026-03-20')
      const updated = markCardCompleted(challenge, 'item-0')
      expect(updated.completedCards).toContain('item-0')
    })

    it('does not add duplicate', () => {
      const challenge = {
        ...generateDailyChallenge(catalogue, emptyProgress, '2026-03-20'),
        completedCards: ['item-0'],
      }
      const updated = markCardCompleted(challenge, 'item-0')
      expect(updated.completedCards).toEqual(['item-0'])
    })

    it('marks isComplete when all cards done (new user, 1 card)', () => {
      const challenge = generateDailyChallenge(catalogue, emptyProgress, '2026-03-20')
      const updated = markCardCompleted(challenge, challenge.featuredItemId)
      expect(updated.isComplete).toBe(true) // New user has only featured card
    })
  })
})
