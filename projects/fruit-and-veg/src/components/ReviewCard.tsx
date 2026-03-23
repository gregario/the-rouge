'use client'

import { CatalogueItem } from '@/lib/types'
import ItemImage from './ItemImage'

interface ReviewCardProps {
  item: CatalogueItem
  completed: boolean
  onClick: () => void
}

export function ReviewCard({ item, completed, onClick }: ReviewCardProps) {
  return (
    <button
      onClick={onClick}
      className="relative flex-1 rounded-lg p-3 text-left shadow-sm transition-transform hover:scale-[1.03] active:scale-[0.97]"
      style={{ backgroundColor: 'var(--color-muted)' }}
      aria-label={`Review: ${item.name}${completed ? ' (reviewed)' : ''}`}
    >
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {completed ? 'Reviewed ✓' : 'Review'}
      </span>

      <div className="flex flex-col items-center gap-2 mt-1">
        <div className="relative">
          <ItemImage item={item} size={64} />
          {completed && (
            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-success flex items-center justify-center">
              <span className="text-white text-[10px] font-bold">✓</span>
            </div>
          )}
        </div>
        <span className="text-sm font-semibold text-center">{item.name}</span>
      </div>
    </button>
  )
}
