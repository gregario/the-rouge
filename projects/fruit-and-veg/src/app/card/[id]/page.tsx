'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useApp } from '@/lib/app-context'
import { CardView } from '@/components/CardView'

export default function CardPage() {
  const { id } = useParams<{ id: string }>()
  const { catalogue } = useApp()
  const item = catalogue.find((i) => i.id === id)

  if (!item) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <p className="text-muted-foreground">Item not found</p>
        <Link
          href="/"
          className="text-primary font-semibold hover:underline"
        >
          Back to home
        </Link>
      </div>
    )
  }

  return <CardView item={item} />
}
