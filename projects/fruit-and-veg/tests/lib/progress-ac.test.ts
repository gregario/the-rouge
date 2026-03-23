import { describe, it, expect, beforeEach } from 'vitest'
import {
  completeItem,
  updateStreak,
  addDailyStamp,
  getLocalDateString,
} from '@/lib/progress'
import type { UserProgress } from '@/lib/types'

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

function dateStringDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('progress acceptance criteria', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  // @criterion: AC-ACH-06
  // @criterion-hash: e6c20990b823
  describe('AC-ACH-06: streak increments on daily play', () => {
    it('increments currentStreak by 1 when lastPlayedDate is yesterday', () => {
      const progress: UserProgress = {
        ...emptyProgress,
        currentStreak: 1,
        longestStreak: 1,
        lastPlayedDate: dateStringDaysAgo(1),
      }
      const result = updateStreak(progress)
      expect(result.currentStreak).toBe(2)
      expect(result.lastPlayedDate).toBe(getLocalDateString())
    })

    it('increments from a longer streak when played yesterday', () => {
      const progress: UserProgress = {
        ...emptyProgress,
        currentStreak: 7,
        longestStreak: 10,
        lastPlayedDate: dateStringDaysAgo(1),
      }
      const result = updateStreak(progress)
      expect(result.currentStreak).toBe(8)
    })
  })

  // @criterion: AC-ACH-07
  // @criterion-hash: 4f45c9c490ec
  describe('AC-ACH-07: streak resets to 1 after missed day', () => {
    it('resets currentStreak to 1 (not 0) when lastPlayedDate is 2 days ago', () => {
      const progress: UserProgress = {
        ...emptyProgress,
        currentStreak: 5,
        longestStreak: 5,
        lastPlayedDate: dateStringDaysAgo(2),
      }
      const result = updateStreak(progress)
      expect(result.currentStreak).toBe(1)
      expect(result.currentStreak).not.toBe(0)
    })

    it('resets currentStreak to 1 when lastPlayedDate is 7 days ago', () => {
      const progress: UserProgress = {
        ...emptyProgress,
        currentStreak: 10,
        longestStreak: 10,
        lastPlayedDate: dateStringDaysAgo(7),
      }
      const result = updateStreak(progress)
      expect(result.currentStreak).toBe(1)
    })

    it('resets currentStreak to 1 on first play (no lastPlayedDate)', () => {
      const result = updateStreak(emptyProgress)
      expect(result.currentStreak).toBe(1)
      expect(result.currentStreak).not.toBe(0)
    })
  })

  // @criterion: AC-ACH-08
  // @criterion-hash: 372c08e598de
  describe('AC-ACH-08: longestStreak tracks all-time best', () => {
    it('longestStreak is always >= currentStreak after update', () => {
      const progress: UserProgress = {
        ...emptyProgress,
        currentStreak: 3,
        longestStreak: 3,
        lastPlayedDate: dateStringDaysAgo(1),
      }
      const result = updateStreak(progress)
      expect(result.longestStreak).toBeGreaterThanOrEqual(result.currentStreak)
    })

    it('preserves longestStreak when streak resets', () => {
      const progress: UserProgress = {
        ...emptyProgress,
        currentStreak: 3,
        longestStreak: 12,
        lastPlayedDate: dateStringDaysAgo(5),
      }
      const result = updateStreak(progress)
      expect(result.currentStreak).toBe(1)
      expect(result.longestStreak).toBe(12)
      expect(result.longestStreak).toBeGreaterThanOrEqual(result.currentStreak)
    })

    it('updates longestStreak when currentStreak surpasses it', () => {
      const progress: UserProgress = {
        ...emptyProgress,
        currentStreak: 5,
        longestStreak: 5,
        lastPlayedDate: dateStringDaysAgo(1),
      }
      const result = updateStreak(progress)
      expect(result.currentStreak).toBe(6)
      expect(result.longestStreak).toBe(6)
      expect(result.longestStreak).toBeGreaterThanOrEqual(result.currentStreak)
    })

    it('does not decrease longestStreak when currentStreak is lower', () => {
      const progress: UserProgress = {
        ...emptyProgress,
        currentStreak: 2,
        longestStreak: 10,
        lastPlayedDate: dateStringDaysAgo(1),
      }
      const result = updateStreak(progress)
      expect(result.currentStreak).toBe(3)
      expect(result.longestStreak).toBe(10)
    })
  })

  // @criterion: AC-ACH-12
  // @criterion-hash: 8920aefabdba
  describe('AC-ACH-12: daily stamp earned on completing all 3 daily cards', () => {
    it('adds today to dailyStamps on first call', () => {
      const result = addDailyStamp(emptyProgress)
      const today = getLocalDateString()
      expect(result.dailyStamps).toContain(today)
      expect(result.dailyStamps).toHaveLength(1)
    })

    it('does not add duplicate stamp for same day', () => {
      const today = getLocalDateString()
      const progress: UserProgress = {
        ...emptyProgress,
        dailyStamps: [today],
      }
      const result = addDailyStamp(progress)
      expect(result.dailyStamps).toEqual([today])
      expect(result.dailyStamps).toHaveLength(1)
    })

    it('accumulates stamps across different days', () => {
      const progress: UserProgress = {
        ...emptyProgress,
        dailyStamps: ['2026-03-18', '2026-03-19'],
      }
      const result = addDailyStamp(progress)
      const today = getLocalDateString()
      expect(result.dailyStamps).toContain('2026-03-18')
      expect(result.dailyStamps).toContain('2026-03-19')
      expect(result.dailyStamps).toContain(today)
    })
  })

  // @criterion: AC-CARD-10
  // @criterion-hash: 42d6714776db
  describe('AC-CARD-10: re-visit quiz does not re-award sticker', () => {
    it('does not add duplicate to completedItems on revisit', () => {
      const progress: UserProgress = {
        ...emptyProgress,
        completedItems: ['apple'],
        completedAt: { apple: '2026-03-18T10:00:00.000Z' },
      }
      const result = completeItem(progress, 'apple', 3, 3)
      expect(result.completedItems).toEqual(['apple'])
      expect(result.completedItems).toHaveLength(1)
    })

    it('does not overwrite original completedAt date on revisit', () => {
      const originalDate = '2026-03-18T10:00:00.000Z'
      const progress: UserProgress = {
        ...emptyProgress,
        completedItems: ['apple'],
        completedAt: { apple: originalDate },
      }
      const result = completeItem(progress, 'apple', 2, 3)
      expect(result.completedAt['apple']).toBe(originalDate)
    })

    it('first completion adds item and sets completedAt', () => {
      const result = completeItem(emptyProgress, 'banana', 3, 3)
      expect(result.completedItems).toContain('banana')
      expect(result.completedAt['banana']).toBeDefined()
    })
  })

  describe('completeItem: quiz stats tracked on revisits', () => {
    it('accumulates totalQuizCorrect on revisit', () => {
      const progress: UserProgress = {
        ...emptyProgress,
        completedItems: ['apple'],
        completedAt: { apple: '2026-03-18T10:00:00.000Z' },
        totalQuizCorrect: 3,
        totalQuizAnswered: 3,
      }
      const result = completeItem(progress, 'apple', 2, 3)
      expect(result.totalQuizCorrect).toBe(5)
      expect(result.totalQuizAnswered).toBe(6)
    })

    it('accumulates quiz stats across multiple revisits', () => {
      const progress: UserProgress = {
        ...emptyProgress,
        completedItems: ['apple'],
        completedAt: { apple: '2026-03-18T10:00:00.000Z' },
        totalQuizCorrect: 10,
        totalQuizAnswered: 15,
      }
      let result = completeItem(progress, 'apple', 1, 3)
      result = completeItem(result, 'apple', 3, 3)
      expect(result.totalQuizCorrect).toBe(14)
      expect(result.totalQuizAnswered).toBe(21)
    })

    it('tracks quiz stats on first completion and revisit consistently', () => {
      let result = completeItem(emptyProgress, 'carrot', 2, 3)
      expect(result.totalQuizCorrect).toBe(2)
      expect(result.totalQuizAnswered).toBe(3)
      expect(result.completedItems).toContain('carrot')

      result = completeItem(result, 'carrot', 3, 3)
      expect(result.totalQuizCorrect).toBe(5)
      expect(result.totalQuizAnswered).toBe(6)
      expect(result.completedItems).toHaveLength(1)
    })
  })
})
