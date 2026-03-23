'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Flame, Sparkles, Sprout, X } from 'lucide-react'
import { useApp } from '@/lib/app-context'
import type { CategoryBadge } from '@/lib/types'

const BADGE_EMOJIS: Record<string, string> = {
  tropical: '🌴',
  citrus: '🍋',
  'stone-fruit': '🍑',
  root: '🥕',
  leafy: '🥬',
  legume: '🫘',
  allium: '🧅',
  gourd: '🎃',
  common: '⭐',
  exotic: '🌺',
}

export default function GardenView() {
  const { progress, badges, catalogue } = useApp()
  const [selectedBadge, setSelectedBadge] = useState<CategoryBadge | null>(null)

  const { currentStreak, longestStreak, completedItems, totalQuizAnswered, categoryBadges } = progress
  const earnedBadgeIds = new Set(categoryBadges)
  const hasAnyProgress = completedItems.length > 0

  return (
    <div className="flex flex-col gap-6 pb-8">
      <h1 className="text-2xl font-bold">My Garden</h1>

      {/* Streak Display */}
      <div className="bg-muted rounded-xl p-6 text-center">
        <div className="flex items-center justify-center gap-2">
          {currentStreak === 0 ? (
            <Sprout size={40} className="text-muted-foreground" />
          ) : (
            <>
              <Flame size={40} className="text-orange-500" />
              {currentStreak >= 7 && (
                <Sparkles size={24} className="text-yellow-400" />
              )}
            </>
          )}
        </div>
        <p className="text-4xl font-extrabold mt-2">{currentStreak}</p>
        <p className="text-sm font-semibold mt-1">
          {currentStreak === 0
            ? 'Start a streak today!'
            : currentStreak >= 7
              ? `Amazing \u2014 ${currentStreak} days!`
              : `${currentStreak} day${currentStreak > 1 ? 's' : ''} in a row!`}
        </p>
        {longestStreak > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            Best: {longestStreak} days
          </p>
        )}
      </div>

      {/* Badge Grid */}
      <div>
        <h2 className="text-lg font-bold mb-3">Badges</h2>
        <div className="grid grid-cols-3 gap-3">
          {badges.map((badge) => {
            const earned = earnedBadgeIds.has(badge.id)
            return (
              <button
                key={badge.id}
                onClick={() => earned && setSelectedBadge(badge)}
                disabled={!earned}
                className={`flex flex-col items-center p-3 rounded-lg transition-all min-h-[80px] min-w-[44px] ${
                  earned
                    ? 'bg-accent text-accent-foreground hover:scale-105 active:scale-95 cursor-pointer'
                    : 'bg-muted cursor-default'
                }`}
              >
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${
                    earned ? 'bg-success' : 'bg-muted'
                  }`}
                >
                  {earned ? (BADGE_EMOJIS[badge.category] || '🏆') : (
                    <span className="text-muted-foreground font-bold">?</span>
                  )}
                </div>
                <span
                  className={`text-[10px] mt-1 text-center leading-tight ${
                    earned ? 'font-semibold' : 'text-muted-foreground'
                  }`}
                >
                  {earned ? badge.name : '???'}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Stats Section */}
      <div>
        <h2 className="text-lg font-bold mb-3">Stats</h2>
        {hasAnyProgress ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              You've learned <span className="font-bold text-foreground">{completedItems.length}</span> fruits and veggies!
            </p>
            <p className="text-sm text-muted-foreground">
              You've answered <span className="font-bold text-foreground">{totalQuizAnswered}</span> questions!
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center py-6 gap-3 text-center">
            <p className="text-sm text-muted-foreground">
              No progress yet. Start your first card!
            </p>
            <Link
              href="/"
              className="px-6 py-3 bg-primary text-white rounded-xl font-bold min-h-[48px] flex items-center justify-center hover:opacity-90 active:scale-95 transition-all"
            >
              Go to today's fruit!
            </Link>
          </div>
        )}
      </div>

      {/* Badge Detail Overlay */}
      {selectedBadge && (
        <div
          className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4"
          onClick={() => setSelectedBadge(null)}
        >
          <div
            className="bg-white rounded-xl p-6 max-w-[320px] w-full shadow-lg relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedBadge(null)}
              className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>

            <div className="text-center">
              <div className="w-16 h-16 bg-success rounded-full flex items-center justify-center text-3xl mx-auto">
                {BADGE_EMOJIS[selectedBadge.category] || '🏆'}
              </div>
              <h3 className="text-lg font-bold mt-3">{selectedBadge.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedBadge.description}
              </p>
            </div>

            <div className="mt-4 space-y-1">
              {selectedBadge.requiredItemIds.map((id) => {
                const item = catalogue.find((c) => c.id === id)
                return (
                  <div key={id} className="flex items-center gap-2 text-sm">
                    <span className="text-success font-bold">✓</span>
                    <span className="font-medium capitalize">
                      {item?.name ?? id.replace(/-/g, ' ')}
                    </span>
                  </div>
                )
              })}
            </div>

            <button
              onClick={() => setSelectedBadge(null)}
              className="mt-4 w-full py-2 bg-muted rounded-lg font-semibold text-sm hover:bg-muted/80 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
