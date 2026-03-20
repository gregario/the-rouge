'use client'

import { useEffect, useCallback, useRef } from 'react'
import type { CatalogueItem, CategoryBadge } from '@/lib/types'
import ItemImage from './ItemImage'

interface StickerCelebrationProps {
  item: CatalogueItem
  isRevisit: boolean
  badge: CategoryBadge | null
  onSeeCollection: () => void
  onNextCard: () => void
}

const CONFETTI_COLOURS = [
  'var(--color-primary)',
  'var(--color-accent)',
  'var(--color-success)',
  'var(--color-secondary)',
  '#FF6B9D',
  '#C084FC',
]

export default function StickerCelebration({
  item,
  isRevisit,
  badge,
  onSeeCollection,
  onNextCard,
}: StickerCelebrationProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onNextCard()
      }
    },
    [onNextCard],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === overlayRef.current) {
      onNextCard()
    }
  }

  const confettiPieces = Array.from({ length: 10 }, (_, i) => ({
    id: i,
    left: `${8 + Math.random() * 84}%`,
    delay: `${Math.random() * 0.8}s`,
    size: 6 + Math.random() * 6,
    colour: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length],
  }))

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={isRevisit ? 'You remembered!' : 'New sticker unlocked!'}
    >
      {/* Confetti particles */}
      {confettiPieces.map((piece) => (
        <div
          key={piece.id}
          className="absolute top-0 confetti-fall"
          style={{
            left: piece.left,
            width: piece.size,
            height: piece.size,
            backgroundColor: piece.colour,
            animationDelay: piece.delay,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
          }}
          aria-hidden="true"
        />
      ))}

      <div className="bg-background rounded-3xl p-8 max-w-sm w-full mx-4 flex flex-col items-center gap-5 shadow-xl relative">
        {/* Sticker */}
        <div className="sticker-unlock">
          <ItemImage item={item} size={120} />
        </div>

        <h2 className="text-2xl font-bold text-foreground text-center">
          {isRevisit ? 'You remembered!' : 'New sticker!'}
        </h2>

        <p className="text-muted-foreground text-center text-sm">{item.name}</p>

        {/* Badge celebration */}
        {badge && (
          <div className="flex flex-col items-center gap-2 pt-2 border-t border-border w-full">
            <p
              className="text-xl font-bold text-center"
              style={{ color: 'var(--color-accent)' }}
            >
              {badge.name}
            </p>
            <p className="text-sm text-foreground text-center font-medium">
              Amazing! You earned a badge!
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col gap-3 w-full pt-2">
          <button
            onClick={onSeeCollection}
            className="w-full rounded-xl bg-primary text-primary-foreground font-bold py-3 px-4 transition-all duration-200 hover:opacity-90 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            style={{ minHeight: 48 }}
          >
            See my collection
          </button>
          <button
            onClick={onNextCard}
            className="w-full rounded-xl border-2 border-border bg-background text-foreground font-bold py-3 px-4 transition-all duration-200 hover:bg-muted active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            style={{ minHeight: 48 }}
          >
            Next card
          </button>
        </div>
      </div>
    </div>
  )
}
