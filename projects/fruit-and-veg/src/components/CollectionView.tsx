'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Star } from 'lucide-react'
import { useApp } from '@/lib/app-context'
import ItemImage from './ItemImage'
import type { Category } from '@/lib/types'

type FilterTab = 'all' | Category

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'fruit', label: 'Fruits' },
  { key: 'vegetable', label: 'Vegetables' },
  { key: 'berry', label: 'Berries' },
]

const CATEGORY_BG: Record<Category, string> = {
  fruit: 'bg-cat-fruit',
  vegetable: 'bg-cat-vegetable',
  berry: 'bg-cat-berry',
}

export default function CollectionView() {
  const { catalogue, progress, badges } = useApp()
  const [activeTab, setActiveTab] = useState<FilterTab>('all')

  const completedSet = useMemo(
    () => new Set(progress.completedItems),
    [progress.completedItems]
  )

  const filteredItems = useMemo(() => {
    if (activeTab === 'all') return catalogue
    return catalogue.filter((item) => item.category === activeTab)
  }, [catalogue, activeTab])

  const filteredCompletedCount = useMemo(() => {
    return filteredItems.filter((item) => completedSet.has(item.id)).length
  }, [filteredItems, completedSet])

  const earnedBadgeIds = useMemo(
    () => new Set(progress.categoryBadges),
    [progress.categoryBadges]
  )

  function tabHasBadge(tab: FilterTab): boolean {
    if (tab === 'all') return false
    return badges.some(
      (b) =>
        earnedBadgeIds.has(b.id) &&
        catalogue.some(
          (item) =>
            item.category === tab && b.requiredItemIds.includes(item.id)
        )
    )
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Collection</h1>
        <span className="text-sm text-muted-foreground">
          {filteredCompletedCount} / {filteredItems.length} collected
        </span>
      </div>

      {/* Category Filter Tabs */}
      <div
        className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
        role="tablist"
        style={{ scrollbarWidth: 'none' }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-shrink-0 flex items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors min-h-[36px] ${
                isActive
                  ? 'bg-primary text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {tab.label}
              {tabHasBadge(tab.key) && (
                <Star size={12} className="fill-current" />
              )}
            </button>
          )
        })}
      </div>

      {/* Empty State */}
      {filteredCompletedCount === 0 && activeTab === 'all' && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-lg font-semibold text-primary">
            Tap any fruit to start learning!
          </p>
          <span className="text-3xl mt-2 animate-bounce" aria-hidden="true">
            ↓
          </span>
        </div>
      )}

      {/* Item Grid */}
      <div className="grid grid-cols-3 min-[360px]:grid-cols-4 gap-3">
        {filteredItems.map((item) => {
          const isCompleted = completedSet.has(item.id)
          const bgClass = CATEGORY_BG[item.category]

          return (
            <Link
              key={item.id}
              href={`/card/${item.id}`}
              className="flex flex-col items-center gap-1 transition-transform hover:scale-105 active:scale-95"
            >
              <div
                className={`min-w-[44px] min-h-[44px] w-full aspect-square rounded-xl flex items-center justify-center overflow-hidden ${
                  isCompleted ? bgClass : 'bg-muted'
                }`}
              >
                {isCompleted ? (
                  <ItemImage item={item} size={48} />
                ) : (
                  <span className="text-2xl font-bold text-muted-foreground">
                    ?
                  </span>
                )}
              </div>
              <span className="text-xs text-center leading-tight truncate w-full">
                {item.name}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
