import { UserProgress } from './types'

const PROGRESS_KEY = 'fruit-and-veg-progress'

const defaultProgress: UserProgress = {
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

export function loadProgress(): UserProgress {
  if (typeof window === 'undefined') return { ...defaultProgress }
  try {
    const stored = localStorage.getItem(PROGRESS_KEY)
    if (!stored) return { ...defaultProgress }
    const parsed = JSON.parse(stored)
    return { ...defaultProgress, ...parsed }
  } catch {
    return { ...defaultProgress }
  }
}

export function saveProgress(progress: UserProgress): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress))
  } catch {
    // Storage full — progress held in memory only
  }
}

export function completeItem(
  progress: UserProgress,
  itemId: string,
  correctCount: number,
  totalCount: number
): UserProgress {
  if (progress.completedItems.includes(itemId)) {
    // Re-visit — don't re-award, but count quiz stats
    return {
      ...progress,
      totalQuizCorrect: progress.totalQuizCorrect + correctCount,
      totalQuizAnswered: progress.totalQuizAnswered + totalCount,
    }
  }

  const now = new Date().toISOString()
  return {
    ...progress,
    completedItems: [...progress.completedItems, itemId],
    completedAt: { ...progress.completedAt, [itemId]: now },
    totalQuizCorrect: progress.totalQuizCorrect + correctCount,
    totalQuizAnswered: progress.totalQuizAnswered + totalCount,
  }
}

export function getLocalDateString(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isYesterday(dateStr: string): boolean {
  const date = new Date(dateStr + 'T00:00:00')
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  return (
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  )
}

export function updateStreak(progress: UserProgress): UserProgress {
  const today = getLocalDateString()
  if (progress.lastPlayedDate === today) return progress

  let newStreak: number
  if (progress.lastPlayedDate && isYesterday(progress.lastPlayedDate)) {
    newStreak = progress.currentStreak + 1
  } else {
    newStreak = 1
  }

  const newLongest = Math.max(newStreak, progress.longestStreak)
  return {
    ...progress,
    currentStreak: newStreak,
    longestStreak: newLongest,
    lastPlayedDate: today,
  }
}

export function addDailyStamp(progress: UserProgress): UserProgress {
  const today = getLocalDateString()
  if (progress.dailyStamps.includes(today)) return progress
  return {
    ...progress,
    dailyStamps: [...progress.dailyStamps, today],
  }
}
