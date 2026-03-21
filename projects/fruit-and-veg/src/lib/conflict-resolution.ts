import type { UserProgress } from './types'

export type ConflictResult = 'no_conflict' | 'conflict'

/**
 * Detects whether local and server progress have a meaningful conflict.
 * A conflict exists when BOTH sides have completed items and they differ.
 */
export function detectConflict(
  local: UserProgress,
  server: UserProgress
): ConflictResult {
  // No conflict if either side is empty
  if (local.completedItems.length === 0 || server.completedItems.length === 0) {
    return 'no_conflict'
  }

  // No conflict if identical
  const localSet = new Set(local.completedItems)
  const serverSet = new Set(server.completedItems)
  if (
    localSet.size === serverSet.size &&
    local.completedItems.every((id) => serverSet.has(id))
  ) {
    return 'no_conflict'
  }

  return 'conflict'
}

/**
 * Merges two progress records keeping the highest/union of everything.
 * Used for the "Merge (keep highest)" conflict resolution option.
 */
export function mergeProgress(
  local: UserProgress,
  server: UserProgress
): UserProgress {
  const completedSet = new Set([...local.completedItems, ...server.completedItems])
  const mergedCompletedAt = { ...server.completedAt, ...local.completedAt }
  const badgeSet = new Set([...local.categoryBadges, ...server.categoryBadges])
  const stampSet = new Set([...local.dailyStamps, ...server.dailyStamps])

  return {
    completedItems: Array.from(completedSet),
    completedAt: mergedCompletedAt,
    categoryBadges: Array.from(badgeSet),
    currentStreak: Math.max(local.currentStreak, server.currentStreak),
    longestStreak: Math.max(local.longestStreak, server.longestStreak),
    lastPlayedDate: local.lastPlayedDate && server.lastPlayedDate
      ? local.lastPlayedDate > server.lastPlayedDate ? local.lastPlayedDate : server.lastPlayedDate
      : local.lastPlayedDate || server.lastPlayedDate,
    dailyStamps: Array.from(stampSet),
    totalQuizCorrect: Math.max(local.totalQuizCorrect, server.totalQuizCorrect),
    totalQuizAnswered: Math.max(local.totalQuizAnswered, server.totalQuizAnswered),
    recentFeaturedIds: local.recentFeaturedIds,
  }
}
