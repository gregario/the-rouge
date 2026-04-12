'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface CycleRhythmProps {
  lastCheckpointAt?: string
  lastPhase?: string
  checkpointCount?: number
}

function formatAge(ms: number): string {
  const sec = Math.floor(ms / 1000)
  if (sec < 10) return 'just now'
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const days = Math.floor(hr / 24)
  return `${days}d ago`
}

function ageSeverity(ms: number): 'fresh' | 'stale' | 'cold' {
  const min = ms / 60000
  if (min < 10) return 'fresh'  // green
  if (min < 30) return 'stale'  // amber
  return 'cold'  // red
}

export function CycleRhythm({ lastCheckpointAt, lastPhase, checkpointCount }: CycleRhythmProps) {
  // Tick every 15s so the age stays accurate without needing a refetch
  const [, setTick] = useState(0)
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 15_000)
    return () => clearInterval(i)
  }, [])

  if (!lastCheckpointAt) {
    return (
      <div className="flex flex-col items-center gap-0.5" title="No checkpoints yet">
        <span className="text-sm font-semibold text-gray-400">—</span>
        <span className="text-[10px] text-muted-foreground">Last Activity</span>
      </div>
    )
  }

  const ms = Date.now() - new Date(lastCheckpointAt).getTime()
  const severity = ageSeverity(ms)
  const colorClass = severity === 'fresh'
    ? 'text-green-700'
    : severity === 'stale'
      ? 'text-amber-700'
      : 'text-red-700'

  const tooltip = [
    `${checkpointCount ?? 0} checkpoint${checkpointCount === 1 ? '' : 's'}`,
    lastPhase ? `latest phase: ${lastPhase}` : null,
    `timestamp: ${lastCheckpointAt}`,
  ].filter(Boolean).join(' · ')

  return (
    <div className="flex flex-col items-center gap-0.5" title={tooltip}>
      <span className={cn('text-sm font-semibold tabular-nums', colorClass)}>
        {formatAge(ms)}
      </span>
      <span className="text-[10px] text-muted-foreground">Last Activity</span>
    </div>
  )
}
