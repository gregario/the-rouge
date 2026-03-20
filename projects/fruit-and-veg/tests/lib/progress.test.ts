import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  loadProgress,
  saveProgress,
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

describe('progress', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('loadProgress', () => {
    it('returns default progress when localStorage is empty', () => {
      const progress = loadProgress()
      expect(progress).toEqual(emptyProgress)
    })

    it('loads saved progress from localStorage', () => {
      const saved = { ...emptyProgress, completedItems: ['apple', 'banana'] }
      localStorage.setItem('fruit-and-veg-progress', JSON.stringify(saved))
      const progress = loadProgress()
      expect(progress.completedItems).toEqual(['apple', 'banana'])
    })

    it('returns default progress on corrupted data', () => {
      localStorage.setItem('fruit-and-veg-progress', 'not-json')
      const progress = loadProgress()
      expect(progress).toEqual(emptyProgress)
    })
  })

  describe('saveProgress', () => {
    it('saves progress to localStorage', () => {
      const progress = { ...emptyProgress, completedItems: ['apple'] }
      saveProgress(progress)
      const stored = JSON.parse(localStorage.getItem('fruit-and-veg-progress')!)
      expect(stored.completedItems).toEqual(['apple'])
    })
  })

  describe('completeItem', () => {
    it('adds new item to completedItems', () => {
      const result = completeItem(emptyProgress, 'apple', 3, 3)
      expect(result.completedItems).toContain('apple')
      expect(result.completedAt['apple']).toBeDefined()
      expect(result.totalQuizCorrect).toBe(3)
      expect(result.totalQuizAnswered).toBe(3)
    })

    it('does not add duplicate items', () => {
      const withApple = {
        ...emptyProgress,
        completedItems: ['apple'],
        completedAt: { apple: '2026-01-01' },
      }
      const result = completeItem(withApple, 'apple', 2, 3)
      expect(result.completedItems).toEqual(['apple'])
      expect(result.totalQuizCorrect).toBe(2) // Still counts quiz stats
    })

    it('tracks quiz correct and total counts', () => {
      const result = completeItem(emptyProgress, 'banana', 1, 3)
      expect(result.totalQuizCorrect).toBe(1)
      expect(result.totalQuizAnswered).toBe(3)
    })
  })

  describe('updateStreak', () => {
    it('starts streak at 1 for first play', () => {
      const result = updateStreak(emptyProgress)
      expect(result.currentStreak).toBe(1)
      expect(result.lastPlayedDate).toBe(getLocalDateString())
    })

    it('increments streak for consecutive days', () => {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`

      const progress = {
        ...emptyProgress,
        currentStreak: 3,
        longestStreak: 5,
        lastPlayedDate: yesterdayStr,
      }
      const result = updateStreak(progress)
      expect(result.currentStreak).toBe(4)
    })

    it('resets streak after missed day', () => {
      const twoDaysAgo = new Date()
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 3)
      const dateStr = `${twoDaysAgo.getFullYear()}-${String(twoDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(twoDaysAgo.getDate()).padStart(2, '0')}`

      const progress = {
        ...emptyProgress,
        currentStreak: 5,
        longestStreak: 5,
        lastPlayedDate: dateStr,
      }
      const result = updateStreak(progress)
      expect(result.currentStreak).toBe(1)
      expect(result.longestStreak).toBe(5) // Preserved
    })

    it('updates longestStreak when exceeded', () => {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`

      const progress = {
        ...emptyProgress,
        currentStreak: 5,
        longestStreak: 5,
        lastPlayedDate: yesterdayStr,
      }
      const result = updateStreak(progress)
      expect(result.longestStreak).toBe(6)
    })

    it('does not double-increment on same day', () => {
      const today = getLocalDateString()
      const progress = {
        ...emptyProgress,
        currentStreak: 3,
        longestStreak: 3,
        lastPlayedDate: today,
      }
      const result = updateStreak(progress)
      expect(result.currentStreak).toBe(3)
    })
  })

  describe('addDailyStamp', () => {
    it('adds today to dailyStamps', () => {
      const result = addDailyStamp(emptyProgress)
      expect(result.dailyStamps).toContain(getLocalDateString())
    })

    it('does not add duplicate stamps', () => {
      const today = getLocalDateString()
      const progress = { ...emptyProgress, dailyStamps: [today] }
      const result = addDailyStamp(progress)
      expect(result.dailyStamps).toEqual([today])
    })
  })
})
