'use client'

import React, { createContext, useContext, useCallback, useEffect, useState, useMemo } from 'react'
import type { CatalogueItem, UserProgress, DailyChallenge, CategoryBadge } from './types'
import { loadProgress, saveProgress, completeItem, updateStreak, addDailyStamp, getLocalDateString } from './progress'
import { loadDailyChallenge, saveDailyChallenge, markCardCompleted, recordFeaturedItem } from './daily-challenge'
import { generateBadges, checkNewBadges } from './badges'
import { syncProgress } from './accounts'
import type { TabName } from './navigation'
import type { User } from '@supabase/supabase-js'

interface AppState {
  catalogue: CatalogueItem[]
  progress: UserProgress
  daily: DailyChallenge
  badges: CategoryBadge[]
  newBadge: CategoryBadge | null
  cardReturnTab: TabName
  setCardReturnTab: (tab: TabName) => void
  isRevisit: (itemId: string) => boolean
  onCardComplete: (itemId: string, correctCount: number, totalCount: number) => CategoryBadge | null
  onDailyCardComplete: (cardId: string) => boolean
  dismissBadge: () => void
  displayName: string | null
  user: User | null
  setUser: (user: User | null) => void
}

const AppContext = createContext<AppState | null>(null)

export function useApp(): AppState {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be within AppProvider')
  return ctx
}

export function AppProvider({
  catalogue,
  children,
}: {
  catalogue: CatalogueItem[]
  children: React.ReactNode
}) {
  const [progress, setProgress] = useState<UserProgress>(() => {
    const p = loadProgress()
    const challenge = loadDailyChallenge(catalogue, p, getLocalDateString())
    const updated = recordFeaturedItem(p, challenge.featuredItemId)
    if (updated !== p) saveProgress(updated)
    return updated
  })
  const [daily, setDaily] = useState<DailyChallenge>(() =>
    loadDailyChallenge(catalogue, loadProgress(), getLocalDateString())
  )
  const [newBadge, setNewBadge] = useState<CategoryBadge | null>(null)
  const [cardReturnTab, setCardReturnTab] = useState<TabName>('home')
  const [user, setUser] = useState<User | null>(null)

  const displayName = user?.user_metadata?.display_name || null

  const badges = useMemo(() => generateBadges(catalogue), [catalogue])

  useEffect(() => {
    saveProgress(progress)
    // Background sync if authenticated (AC-ACCT-05)
    if (user?.email_confirmed_at) {
      syncProgress({
        completedItems: progress.completedItems,
        completedAt: progress.completedAt,
        categoryBadges: progress.categoryBadges,
        currentStreak: progress.currentStreak,
        longestStreak: progress.longestStreak,
        lastPlayedDate: progress.lastPlayedDate,
        dailyStamps: progress.dailyStamps,
        totalQuizCorrect: progress.totalQuizCorrect,
        totalQuizAnswered: progress.totalQuizAnswered,
      }).catch(() => {
        // Silently fail — offline resilience (AC-ACCT-09)
      })
    }
  }, [progress, user])

  useEffect(() => {
    saveDailyChallenge(daily)
  }, [daily])

  const isRevisit = useCallback(
    (itemId: string) => progress.completedItems.includes(itemId),
    [progress.completedItems]
  )

  const onCardComplete = useCallback(
    (itemId: string, correctCount: number, totalCount: number): CategoryBadge | null => {
      const wasAlreadyCompleted = progress.completedItems.includes(itemId)
      const updated = completeItem(progress, itemId, correctCount, totalCount)
      setProgress(updated)

      if (!wasAlreadyCompleted) {
        const earned = checkNewBadges(badges, updated.completedItems, updated.categoryBadges)
        if (earned.length > 0) {
          const badge = earned[0]
          setProgress(prev => ({
            ...prev,
            categoryBadges: [...prev.categoryBadges, badge.id],
          }))
          setNewBadge(badge)
          return badge
        }
      }
      return null
    },
    [progress, badges]
  )

  const onDailyCardComplete = useCallback(
    (cardId: string): boolean => {
      const updated = markCardCompleted(daily, cardId)
      setDaily(updated)

      if (updated.isComplete && !daily.isComplete) {
        setProgress(prev => {
          const withStreak = updateStreak(prev)
          return addDailyStamp(withStreak)
        })
        return true
      }
      return false
    },
    [daily]
  )

  const dismissBadge = useCallback(() => setNewBadge(null), [])

  const value = useMemo(
    () => ({
      catalogue,
      progress,
      daily,
      badges,
      newBadge,
      cardReturnTab,
      setCardReturnTab,
      isRevisit,
      onCardComplete,
      onDailyCardComplete,
      dismissBadge,
      displayName,
      user,
      setUser,
    }),
    [catalogue, progress, daily, badges, newBadge, cardReturnTab, isRevisit, onCardComplete, onDailyCardComplete, dismissBadge, displayName, user]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
