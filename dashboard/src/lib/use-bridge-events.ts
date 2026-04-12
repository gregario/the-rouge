'use client'

import { useEffect } from 'react'
import { subscribeBridgeEvents, isBridgeEnabled } from './bridge-client'

interface BridgeEvent {
  type: string
  project: string
  timestamp: string
  data: Record<string, unknown>
}

/**
 * Subscribe to bridge SSE events. Calls onEvent for every event received.
 * When filterProject is set, only fires for events matching that project slug.
 * Does nothing when bridge is not enabled.
 */
export function useBridgeEvents(
  onEvent: (event: BridgeEvent) => void,
  filterProject?: string,
): void {
  useEffect(() => {
    if (!isBridgeEnabled()) return
    const source = subscribeBridgeEvents((raw) => {
      const event = raw as BridgeEvent
      if (!event || typeof event !== 'object') return
      // Initial connected heartbeat has no project — skip
      if (!event.type || event.type === 'connected') return
      if (filterProject && event.project !== filterProject) return
      onEvent(event)
    })
    return () => { source?.close() }
  }, [onEvent, filterProject])
}
