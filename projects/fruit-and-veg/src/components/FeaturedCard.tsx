'use client'

import { CatalogueItem } from '@/lib/types'
import { Star } from 'lucide-react'
import ItemImage from './ItemImage'

interface FeaturedCardProps {
  item: CatalogueItem
  completed: boolean
  onClick: () => void
}

export function FeaturedCard({ item, completed, onClick }: FeaturedCardProps) {
  return (
    <button
      onClick={onClick}
      className="relative w-full rounded-xl p-4 text-left shadow-md transition-transform hover:scale-[1.03] active:scale-[0.97]"
      style={{
        backgroundColor: getCategoryBg(item.category),
        boxShadow: '0 0 20px rgb(255 107 53 / 0.3), 0 4px 8px -1px rgb(0 0 0 / 0.08)',
      }}
      aria-label={`Today's fruit: ${item.name}${completed ? ' (completed)' : ''}`}
    >
      <div className="flex items-center gap-1 mb-2">
        <Star size={16} className="text-accent fill-accent" />
        <span className="text-xs font-bold uppercase tracking-wider text-secondary">
          {completed ? 'Done ✓' : "Today's Fruit"}
        </span>
      </div>

      <div className="flex flex-col items-center gap-3">
        <div className="relative w-40 h-40">
          <ItemImage item={item} size={160} />
          {completed && (
            <div className="absolute top-1 right-1 w-8 h-8 rounded-full bg-success flex items-center justify-center">
              <span className="text-white text-sm font-bold">✓</span>
            </div>
          )}
        </div>
        <h2 className="text-xl font-bold text-secondary">{item.name}</h2>
      </div>
    </button>
  )
}

function getCategoryBg(category: string): string {
  switch (category) {
    case 'fruit': return 'var(--color-cat-fruit)'
    case 'vegetable': return 'var(--color-cat-vegetable)'
    case 'berry': return 'var(--color-cat-berry)'
    default: return 'var(--color-muted)'
  }
}
