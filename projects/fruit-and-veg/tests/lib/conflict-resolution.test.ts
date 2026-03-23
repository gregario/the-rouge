import { describe, it, expect } from 'vitest'
import type { UserProgress } from '@/lib/types'

// ─── AC-ACCT-07: Conflict resolution prompts user ───────────────────────────
// @criterion: AC-ACCT-07
// @criterion-hash: 62d53a581dc6
// GIVEN a new device has local progress AND server has different progress
// WHEN parent signs in
// THEN a prompt asks "Load saved / Keep device / Merge"

// Import the conflict detection logic we're about to create
import { detectConflict, mergeProgress } from '@/lib/conflict-resolution'

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

describe('AC-ACCT-07: conflict resolution detection', () => {
  it('returns no_conflict when both are empty', () => {
    const result = detectConflict(emptyProgress, emptyProgress)
    expect(result).toBe('no_conflict')
  })

  it('returns no_conflict when local is empty (server has data)', () => {
    const server = { ...emptyProgress, completedItems: ['apple', 'banana'] }
    const result = detectConflict(emptyProgress, server)
    expect(result).toBe('no_conflict')
  })

  it('returns no_conflict when server is empty (local has data)', () => {
    const local = { ...emptyProgress, completedItems: ['apple', 'banana'] }
    const result = detectConflict(local, emptyProgress)
    expect(result).toBe('no_conflict')
  })

  it('returns no_conflict when local and server have identical items', () => {
    const progress = { ...emptyProgress, completedItems: ['apple', 'banana'] }
    const result = detectConflict(progress, progress)
    expect(result).toBe('no_conflict')
  })

  it('returns conflict when both have different completed items', () => {
    const local = { ...emptyProgress, completedItems: ['apple', 'cherry'] }
    const server = { ...emptyProgress, completedItems: ['banana', 'grape'] }
    const result = detectConflict(local, server)
    expect(result).toBe('conflict')
  })

  it('returns conflict when both have items and they partially differ', () => {
    const local = { ...emptyProgress, completedItems: ['apple', 'banana', 'cherry'] }
    const server = { ...emptyProgress, completedItems: ['apple', 'grape'] }
    const result = detectConflict(local, server)
    expect(result).toBe('conflict')
  })
})

describe('AC-ACCT-07: merge progress (keep highest)', () => {
  it('merges completed items as union', () => {
    const local: UserProgress = {
      ...emptyProgress,
      completedItems: ['apple', 'cherry'],
      completedAt: { apple: '2024-01-01', cherry: '2024-01-02' },
    }
    const server: UserProgress = {
      ...emptyProgress,
      completedItems: ['banana', 'apple'],
      completedAt: { banana: '2024-01-03', apple: '2024-01-01' },
    }
    const merged = mergeProgress(local, server)
    expect(merged.completedItems).toEqual(expect.arrayContaining(['apple', 'banana', 'cherry']))
    expect(merged.completedItems).toHaveLength(3)
  })

  it('keeps higher streak values', () => {
    const local: UserProgress = { ...emptyProgress, currentStreak: 5, longestStreak: 10 }
    const server: UserProgress = { ...emptyProgress, currentStreak: 3, longestStreak: 12 }
    const merged = mergeProgress(local, server)
    expect(merged.currentStreak).toBe(5)
    expect(merged.longestStreak).toBe(12)
  })

  it('keeps higher quiz totals', () => {
    const local: UserProgress = { ...emptyProgress, totalQuizCorrect: 20, totalQuizAnswered: 30 }
    const server: UserProgress = { ...emptyProgress, totalQuizCorrect: 15, totalQuizAnswered: 40 }
    const merged = mergeProgress(local, server)
    expect(merged.totalQuizCorrect).toBe(20)
    expect(merged.totalQuizAnswered).toBe(40)
  })

  it('merges category badges as union', () => {
    const local: UserProgress = { ...emptyProgress, categoryBadges: ['fruit-common'] }
    const server: UserProgress = { ...emptyProgress, categoryBadges: ['fruit-tropical'] }
    const merged = mergeProgress(local, server)
    expect(merged.categoryBadges).toEqual(expect.arrayContaining(['fruit-common', 'fruit-tropical']))
  })

  it('merges daily stamps as union', () => {
    const local: UserProgress = { ...emptyProgress, dailyStamps: ['2024-01-01'] }
    const server: UserProgress = { ...emptyProgress, dailyStamps: ['2024-01-02'] }
    const merged = mergeProgress(local, server)
    expect(merged.dailyStamps).toEqual(expect.arrayContaining(['2024-01-01', '2024-01-02']))
  })
})
