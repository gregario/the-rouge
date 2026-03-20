import { CatalogueItem, DailyChallenge, UserProgress } from './types'

const DAILY_KEY = 'fruit-and-veg-daily'

function hashDate(dateStr: string): number {
  let hash = 0
  for (let i = 0; i < dateStr.length; i++) {
    const char = dateStr.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return Math.abs(hash)
}

function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xFFFFFFFF
    return (s >>> 0) / 0xFFFFFFFF
  }
}

export function generateDailyChallenge(
  catalogue: CatalogueItem[],
  progress: UserProgress,
  dateStr: string,
): DailyChallenge {
  const rand = seededRandom(hashDate(dateStr))

  // Recent featured IDs to avoid repeating within 7 days
  const recentIds = new Set(progress.recentFeaturedIds ?? [])

  // Featured item: uncompleted, prefer easy if < 10 completions, avoid recent
  const uncompleted = catalogue.filter(
    item => !progress.completedItems.includes(item.id)
  )

  let featuredItemId: string
  if (uncompleted.length === 0) {
    // Re-discovery mode: random completed item, avoiding recent if possible
    const nonRecent = catalogue.filter(item => !recentIds.has(item.id))
    const pool = nonRecent.length > 0 ? nonRecent : catalogue
    const idx = Math.floor(rand() * pool.length)
    featuredItemId = pool[idx].id
  } else {
    let pool = uncompleted
    if (progress.completedItems.length < 10) {
      const easyPool = uncompleted.filter(item => item.difficulty === 'easy')
      if (easyPool.length > 0) pool = easyPool
    }
    // Filter out recently featured items if enough alternatives exist
    const nonRecent = pool.filter(item => !recentIds.has(item.id))
    if (nonRecent.length > 0) pool = nonRecent
    const idx = Math.floor(rand() * pool.length)
    featuredItemId = pool[idx].id
  }

  // Review items: completed, oldest first, up to 2
  const completed = [...progress.completedItems]
    .sort((a, b) => {
      const aTime = progress.completedAt[a] || ''
      const bTime = progress.completedAt[b] || ''
      return aTime.localeCompare(bTime)
    })
    .filter(id => id !== featuredItemId)

  const reviewItemIds = completed.slice(0, 2)

  return {
    date: dateStr,
    featuredItemId,
    reviewItemIds,
    completedCards: [],
    isComplete: false,
  }
}

export function loadDailyChallenge(
  catalogue: CatalogueItem[],
  progress: UserProgress,
  dateStr: string,
): DailyChallenge {
  if (typeof window === 'undefined') {
    return generateDailyChallenge(catalogue, progress, dateStr)
  }

  try {
    const stored = sessionStorage.getItem(DAILY_KEY)
    if (stored) {
      const challenge: DailyChallenge = JSON.parse(stored)
      if (challenge.date === dateStr) return challenge
    }
  } catch {
    // Fall through to generate
  }

  const challenge = generateDailyChallenge(catalogue, progress, dateStr)
  try {
    sessionStorage.setItem(DAILY_KEY, JSON.stringify(challenge))
  } catch {
    // Proceed without caching
  }
  return challenge
}

export function saveDailyChallenge(challenge: DailyChallenge): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(DAILY_KEY, JSON.stringify(challenge))
  } catch {
    // Ignore
  }
}

export function recordFeaturedItem(progress: UserProgress, featuredId: string): UserProgress {
  const recent = progress.recentFeaturedIds ?? []
  if (recent[recent.length - 1] === featuredId) return progress
  const updated = [...recent, featuredId].slice(-7)
  return { ...progress, recentFeaturedIds: updated }
}

export function markCardCompleted(
  challenge: DailyChallenge,
  cardId: string,
): DailyChallenge {
  if (challenge.completedCards.includes(cardId)) return challenge
  const completedCards = [...challenge.completedCards, cardId]
  const totalCards = 1 + challenge.reviewItemIds.length
  const isComplete = completedCards.length >= totalCards
  return { ...challenge, completedCards, isComplete }
}
