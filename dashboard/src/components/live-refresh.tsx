'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { useBridgeEvents } from '@/lib/use-bridge-events'

/**
 * Subscribes to bridge events and triggers Next.js router refresh
 * when relevant events arrive. Invisible component — just side effects.
 */
export function LiveRefresh({ projectSlug }: { projectSlug?: string }) {
  const router = useRouter()
  const onEvent = useCallback(() => {
    router.refresh()
  }, [router])
  useBridgeEvents(onEvent, projectSlug)
  return null
}
