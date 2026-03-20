import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  completeItem,
  updateStreak,
  addDailyStamp,
  loadProgress,
  saveProgress,
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

describe('progress edge cases', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('AC-ACH-06: streak increments on consecutive daily play', () => {
    it('play yesterday then play today yields streak +1', () => {
      vi.useFakeTimers()

      // Set clock to "yesterday" at noon
      const yesterday = new Date('2026-03-19T12:00:00')
      vi.setSystemTime(yesterday)

      // First play — streak starts at 1
      let progress = updateStreak(emptyProgress)
      expect(progress.currentStreak).toBe(1)
      expect(progress.lastPlayedDate).toBe('2026-03-19')

      // Advance to "today" at noon
      const today = new Date('2026-03-20T12:00:00')
      vi.setSystemTime(today)

      // Second play — streak should be 2
      progress = updateStreak(progress)
      expect(progress.currentStreak).toBe(2)
      expect(progress.lastPlayedDate).toBe('2026-03-20')
    })

    it('three consecutive days yields streak of 3', () => {
      vi.useFakeTimers()

      vi.setSystemTime(new Date('2026-03-18T10:00:00'))
      let progress = updateStreak(emptyProgress)
      expect(progress.currentStreak).toBe(1)

      vi.setSystemTime(new Date('2026-03-19T10:00:00'))
      progress = updateStreak(progress)
      expect(progress.currentStreak).toBe(2)

      vi.setSystemTime(new Date('2026-03-20T10:00:00'))
      progress = updateStreak(progress)
      expect(progress.currentStreak).toBe(3)
    })
  })

  describe('AC-ACH-07: streak resets after missed day', () => {
    it('resets to 1 (not 0) when two days are skipped', () => {
      vi.useFakeTimers()

      vi.setSystemTime(new Date('2026-03-17T12:00:00'))
      let progress = updateStreak(emptyProgress)
      expect(progress.currentStreak).toBe(1)

      // Skip March 18, play on March 19 — gap of 2 days
      vi.setSystemTime(new Date('2026-03-19T12:00:00'))
      progress = updateStreak(progress)
      expect(progress.currentStreak).toBe(1)
      expect(progress.currentStreak).toBeGreaterThan(0)
    })

    it('resets to 1 after a week-long break', () => {
      vi.useFakeTimers()

      vi.setSystemTime(new Date('2026-03-10T12:00:00'))
      let progress = updateStreak({
        ...emptyProgress,
        currentStreak: 5,
        longestStreak: 5,
        lastPlayedDate: '2026-03-10',
      })

      // Jump ahead 7 days
      vi.setSystemTime(new Date('2026-03-17T12:00:00'))
      progress = updateStreak(progress)
      expect(progress.currentStreak).toBe(1)
    })
  })

  describe('AC-ACH-08: longestStreak tracks all-time best', () => {
    it('longestStreak survives a streak reset and rebuild', () => {
      vi.useFakeTimers()

      // Build a streak of 3
      vi.setSystemTime(new Date('2026-03-15T12:00:00'))
      let progress = updateStreak(emptyProgress)
      vi.setSystemTime(new Date('2026-03-16T12:00:00'))
      progress = updateStreak(progress)
      vi.setSystemTime(new Date('2026-03-17T12:00:00'))
      progress = updateStreak(progress)
      expect(progress.currentStreak).toBe(3)
      expect(progress.longestStreak).toBe(3)

      // Miss a day, reset
      vi.setSystemTime(new Date('2026-03-19T12:00:00'))
      progress = updateStreak(progress)
      expect(progress.currentStreak).toBe(1)
      expect(progress.longestStreak).toBe(3) // preserved

      // Rebuild to 2 — still below longest
      vi.setSystemTime(new Date('2026-03-20T12:00:00'))
      progress = updateStreak(progress)
      expect(progress.currentStreak).toBe(2)
      expect(progress.longestStreak).toBe(3) // still preserved
    })

    it('longestStreak updates when current surpasses it after a reset', () => {
      vi.useFakeTimers()

      // Start with a longest of 2
      let progress: UserProgress = {
        ...emptyProgress,
        currentStreak: 2,
        longestStreak: 2,
        lastPlayedDate: '2026-03-14',
      }

      // Miss a day, reset
      vi.setSystemTime(new Date('2026-03-16T12:00:00'))
      progress = updateStreak(progress)
      expect(progress.currentStreak).toBe(1)
      expect(progress.longestStreak).toBe(2)

      // Build a new streak of 3 — surpasses longest
      vi.setSystemTime(new Date('2026-03-17T12:00:00'))
      progress = updateStreak(progress)
      vi.setSystemTime(new Date('2026-03-18T12:00:00'))
      progress = updateStreak(progress)
      expect(progress.currentStreak).toBe(3)
      expect(progress.longestStreak).toBe(3) // updated
    })
  })

  describe('Edge: multiple completions in one day — streak only increments once', () => {
    it('calling updateStreak multiple times on the same day does not change streak', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-03-20T09:00:00'))

      let progress = updateStreak(emptyProgress)
      expect(progress.currentStreak).toBe(1)

      // Call again same day at different times
      vi.setSystemTime(new Date('2026-03-20T14:00:00'))
      progress = updateStreak(progress)
      expect(progress.currentStreak).toBe(1)

      vi.setSystemTime(new Date('2026-03-20T23:59:59'))
      progress = updateStreak(progress)
      expect(progress.currentStreak).toBe(1)
    })

    it('returns same object reference when lastPlayedDate is already today', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-03-20T10:00:00'))

      const progress = updateStreak(emptyProgress)
      const second = updateStreak(progress)
      // updateStreak returns the same progress when date matches
      expect(second).toBe(progress)
    })
  })

  describe('Edge: re-visiting a completed item only updates quiz stats', () => {
    it('does not add duplicate to completedItems on revisit', () => {
      const progress: UserProgress = {
        ...emptyProgress,
        completedItems: ['apple'],
        completedAt: { apple: '2026-03-18T10:00:00.000Z' },
        totalQuizCorrect: 3,
        totalQuizAnswered: 3,
      }
      const result = completeItem(progress, 'apple', 2, 3)
      expect(result.completedItems).toEqual(['apple'])
      expect(result.completedItems).toHaveLength(1)
      // Quiz stats updated
      expect(result.totalQuizCorrect).toBe(5)
      expect(result.totalQuizAnswered).toBe(6)
    })

    it('preserves original completedAt timestamp on revisit', () => {
      const originalTimestamp = '2026-03-15T08:30:00.000Z'
      const progress: UserProgress = {
        ...emptyProgress,
        completedItems: ['broccoli'],
        completedAt: { broccoli: originalTimestamp },
      }
      const result = completeItem(progress, 'broccoli', 1, 3)
      expect(result.completedAt['broccoli']).toBe(originalTimestamp)
    })

    it('does not touch completedAt for other items on revisit', () => {
      const progress: UserProgress = {
        ...emptyProgress,
        completedItems: ['apple', 'banana'],
        completedAt: {
          apple: '2026-03-15T08:00:00.000Z',
          banana: '2026-03-16T09:00:00.000Z',
        },
        totalQuizCorrect: 6,
        totalQuizAnswered: 6,
      }
      const result = completeItem(progress, 'apple', 3, 3)
      expect(result.completedAt['banana']).toBe('2026-03-16T09:00:00.000Z')
      expect(result.completedItems).toHaveLength(2)
    })
  })

  describe('AC-DAILY-08: daily stamp not duplicated', () => {
    it('addDailyStamp twice on same day produces only one stamp', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-03-20T10:00:00'))

      let progress = addDailyStamp(emptyProgress)
      expect(progress.dailyStamps).toHaveLength(1)
      expect(progress.dailyStamps).toContain('2026-03-20')

      progress = addDailyStamp(progress)
      expect(progress.dailyStamps).toHaveLength(1)
    })

    it('returns unchanged progress when stamp already exists for today', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-03-20T10:00:00'))

      const progress: UserProgress = {
        ...emptyProgress,
        dailyStamps: ['2026-03-20'],
      }
      const result = addDailyStamp(progress)
      // Should return the same object since no change was needed
      expect(result).toBe(progress)
    })

    it('calling addDailyStamp many times same day never exceeds one stamp', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-03-20T08:00:00'))

      let progress = addDailyStamp(emptyProgress)
      for (let i = 0; i < 10; i++) {
        progress = addDailyStamp(progress)
      }
      expect(progress.dailyStamps).toHaveLength(1)
    })
  })

  describe('Edge: loadProgress handles unknown fields in localStorage', () => {
    it('preserves known fields and ignores unknown ones gracefully', () => {
      const stored = {
        completedItems: ['apple'],
        totalQuizCorrect: 5,
        totalQuizAnswered: 8,
        unknownField: 'should be carried through by spread',
        anotherExtra: 42,
      }
      localStorage.setItem('fruit-and-veg-progress', JSON.stringify(stored))

      const progress = loadProgress()
      // Known fields are loaded
      expect(progress.completedItems).toEqual(['apple'])
      expect(progress.totalQuizCorrect).toBe(5)
      expect(progress.totalQuizAnswered).toBe(8)
      // Default values fill in missing known fields
      expect(progress.currentStreak).toBe(0)
      expect(progress.longestStreak).toBe(0)
      expect(progress.lastPlayedDate).toBeNull()
      expect(progress.dailyStamps).toEqual([])
      expect(progress.categoryBadges).toEqual([])
      expect(progress.recentFeaturedIds).toEqual([])
    })

    it('handles corrupted JSON in localStorage by returning defaults', () => {
      localStorage.setItem('fruit-and-veg-progress', '{invalid json!!!')
      const progress = loadProgress()
      expect(progress.completedItems).toEqual([])
      expect(progress.currentStreak).toBe(0)
    })

    it('handles empty localStorage by returning defaults', () => {
      const progress = loadProgress()
      expect(progress.completedItems).toEqual([])
      expect(progress.currentStreak).toBe(0)
      expect(progress.longestStreak).toBe(0)
      expect(progress.lastPlayedDate).toBeNull()
    })

    it('round-trips through save and load correctly', () => {
      const progress: UserProgress = {
        ...emptyProgress,
        completedItems: ['carrot', 'pea'],
        currentStreak: 4,
        longestStreak: 7,
        lastPlayedDate: '2026-03-20',
        dailyStamps: ['2026-03-19', '2026-03-20'],
        totalQuizCorrect: 12,
        totalQuizAnswered: 18,
      }
      saveProgress(progress)
      const loaded = loadProgress()
      expect(loaded).toEqual(progress)
    })
  })

  describe('Edge: completeItem with correctCount=0 (all wrong)', () => {
    it('completes the item even with zero correct answers', () => {
      const result = completeItem(emptyProgress, 'turnip', 0, 3)
      expect(result.completedItems).toContain('turnip')
      expect(result.completedAt['turnip']).toBeDefined()
      expect(result.totalQuizCorrect).toBe(0)
      expect(result.totalQuizAnswered).toBe(3)
    })

    it('accumulates zero-correct stats on revisit without duplicating item', () => {
      const progress: UserProgress = {
        ...emptyProgress,
        completedItems: ['turnip'],
        completedAt: { turnip: '2026-03-18T10:00:00.000Z' },
        totalQuizCorrect: 0,
        totalQuizAnswered: 3,
      }
      const result = completeItem(progress, 'turnip', 0, 3)
      expect(result.completedItems).toHaveLength(1)
      expect(result.totalQuizCorrect).toBe(0)
      expect(result.totalQuizAnswered).toBe(6)
    })

    it('all-wrong first attempt followed by perfect revisit tracks stats correctly', () => {
      let progress = completeItem(emptyProgress, 'radish', 0, 3)
      expect(progress.totalQuizCorrect).toBe(0)
      expect(progress.totalQuizAnswered).toBe(3)

      progress = completeItem(progress, 'radish', 3, 3)
      expect(progress.totalQuizCorrect).toBe(3)
      expect(progress.totalQuizAnswered).toBe(6)
      expect(progress.completedItems).toHaveLength(1)
    })
  })
})
