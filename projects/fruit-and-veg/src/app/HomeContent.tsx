'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/app-context'
import { FeaturedCard } from '@/components/FeaturedCard'
import { ReviewCard } from '@/components/ReviewCard'
import { ProgressDots } from '@/components/ProgressDots'
import { DailyStampCelebration } from '@/components/DailyStampCelebration'

export function HomeContent() {
  const router = useRouter()
  const { catalogue, progress, daily, setCardReturnTab } = useApp()
  const [showStampCelebration, setShowStampCelebration] = useState(false)
  const [prevComplete, setPrevComplete] = useState(daily.isComplete)

  const featuredItem = catalogue.find((i) => i.id === daily.featuredItemId)
  const reviewItems = daily.reviewItemIds
    .map((id) => catalogue.find((i) => i.id === id))
    .filter(Boolean)

  const totalCards = 1 + daily.reviewItemIds.length
  const completedCount = daily.completedCards.length
  const allCompleted = progress.completedItems.length === catalogue.length
  const isBrandNew = progress.completedItems.length === 0

  // Detect when daily challenge just completed
  useEffect(() => {
    if (daily.isComplete && !prevComplete) {
      setShowStampCelebration(true)
    }
    setPrevComplete(daily.isComplete)
  }, [daily.isComplete, prevComplete])

  const handleCardClick = (itemId: string) => {
    setCardReturnTab('home')
    router.push(`/card/${itemId}`)
  }

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-extrabold">
          Hi there!
        </h1>
        {allCompleted && (
          <p className="text-sm font-bold text-accent mt-1">
            Re-Discovery Mode!
          </p>
        )}
        {!allCompleted && (
          <p className="text-sm text-muted-foreground mt-1">
            Today&apos;s Challenge
          </p>
        )}
      </div>

      {/* Featured Card */}
      {featuredItem && (
        <FeaturedCard
          item={featuredItem}
          completed={daily.completedCards.includes(featuredItem.id)}
          onClick={() => handleCardClick(featuredItem.id)}
        />
      )}

      {/* Review Cards (hidden for brand new users) */}
      {!isBrandNew && reviewItems.length > 0 && (
        <div>
          <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">
            Review
          </p>
          <div className="grid grid-cols-2 gap-3">
            {reviewItems.map(
              (item) =>
                item && (
                  <ReviewCard
                    key={item.id}
                    item={item}
                    completed={daily.completedCards.includes(item.id)}
                    onClick={() => handleCardClick(item.id)}
                  />
                )
            )}
          </div>
        </div>
      )}

      {/* Progress Dots */}
      <ProgressDots total={totalCards} completed={completedCount} />

      {/* Encouragement text */}
      {completedCount < totalCards && (
        <p className="text-center text-sm text-muted-foreground">
          {isBrandNew
            ? 'Meet your first fruit!'
            : completedCount === 0
              ? `${totalCards} cards today!`
              : `${totalCards - completedCount} more to go!`}
        </p>
      )}

      {/* Daily complete message */}
      {daily.isComplete && !showStampCelebration && (
        <p className="text-center text-sm font-bold text-success">
          Daily Challenge Complete! Come back tomorrow for a new fruit!
        </p>
      )}

      {/* Daily Stamp Celebration Overlay */}
      {showStampCelebration && (
        <DailyStampCelebration
          streak={progress.currentStreak}
          onDismiss={() => setShowStampCelebration(false)}
        />
      )}
    </div>
  )
}
