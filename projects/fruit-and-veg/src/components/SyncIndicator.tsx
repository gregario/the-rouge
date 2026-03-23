'use client'

import { Cloud, CloudOff, Loader2 } from 'lucide-react'

interface SyncIndicatorProps {
  status: 'idle' | 'syncing' | 'synced' | 'offline'
}

export function SyncIndicator({ status }: SyncIndicatorProps) {
  if (status === 'idle') return null

  return (
    <span
      aria-label={
        status === 'synced'
          ? 'Progress synced'
          : status === 'offline'
          ? 'Offline — progress saved locally'
          : 'Syncing progress'
      }
      className="flex items-center"
    >
      {status === 'synced' && <Cloud size={16} className="text-success" />}
      {status === 'offline' && <CloudOff size={16} className="text-amber-500" />}
      {status === 'syncing' && <Loader2 size={16} className="animate-spin text-muted-foreground" />}
    </span>
  )
}
