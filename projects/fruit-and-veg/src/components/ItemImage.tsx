'use client'

import { useState } from 'react'
import type { CatalogueItem } from '@/lib/types'

interface ItemImageProps {
  item: CatalogueItem
  size: number
  className?: string
}

export default function ItemImage({ item, size, className = '' }: ItemImageProps) {
  const [hasError, setHasError] = useState(false)

  const fallbackColour = item.colours[0] ?? '#ccc'

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      {!hasError ? (
        <img
          src={item.image}
          alt={item.name}
          width={size}
          height={size}
          className="rounded-full object-cover"
          style={{ width: size, height: size }}
          onError={() => setHasError(true)}
        />
      ) : (
        <div
          className="rounded-full flex items-center justify-center text-white font-bold"
          style={{
            width: size,
            height: size,
            backgroundColor: fallbackColour,
            fontSize: Math.max(12, size / 4),
          }}
          role="img"
          aria-label={item.name}
        >
          {item.name}
        </div>
      )}
    </div>
  )
}
