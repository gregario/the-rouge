import { describe, it, expect } from 'vitest'
import { generateDailyChallenge } from '@/lib/daily-challenge'
import type { CatalogueItem, UserProgress } from '@/lib/types'

// Tests for AC-DAILY-01: Home screen shows daily challenge
// These tests verify the data layer that feeds the home screen.
// The home screen renders based on the DailyChallenge object.

function makeMockItem(id: string, difficulty: 'easy' | 'medium' = 'easy'): CatalogueItem {
  return {
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
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
    questions: [],
    surpriseFact: null,
    difficulty,
  }
}

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

// @criterion: AC-DAILY-01
// @criterion-hash: 93d54e85739d
describe('AC-DAILY-01: home screen shows daily challenge', () => {
  it('generates a daily challenge with a featured item for any user', () => {
    const challenge = generateDailyChallenge(catalogue, emptyProgress, '2026-03-20')
    expect(challenge.featuredItemId).toBeDefined()
    expect(challenge.featuredItemId).not.toBe('')
  })

  it('challenge date matches the provided date', () => {
    const challenge = generateDailyChallenge(catalogue, emptyProgress, '2026-03-20')
    expect(challenge.date).toBe('2026-03-20')
  })

  it('challenge has 0 review cards for a new user (no completions)', () => {
    const challenge = generateDailyChallenge(catalogue, emptyProgress, '2026-03-20')
    expect(challenge.reviewItemIds).toHaveLength(0)
  })

  it('challenge has up to 2 review cards for a user with completions', () => {
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
    expect(challenge.reviewItemIds.length).toBeGreaterThan(0)
    expect(challenge.reviewItemIds.length).toBeLessThanOrEqual(2)
  })

  it('challenge is not complete by default', () => {
    const challenge = generateDailyChallenge(catalogue, emptyProgress, '2026-03-20')
    expect(challenge.isComplete).toBe(false)
  })

  it('challenge starts with no completed cards', () => {
    const challenge = generateDailyChallenge(catalogue, emptyProgress, '2026-03-20')
    expect(challenge.completedCards).toHaveLength(0)
  })

  it('generates a valid challenge for any date', () => {
    const dates = ['2026-01-01', '2026-06-15', '2026-12-31']
    for (const date of dates) {
      const challenge = generateDailyChallenge(catalogue, emptyProgress, date)
      expect(challenge.date).toBe(date)
      expect(challenge.featuredItemId).toBeDefined()
      expect(catalogue.map(i => i.id)).toContain(challenge.featuredItemId)
    }
  })
})
