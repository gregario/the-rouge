'use client'

import { Activity } from 'lucide-react'
import type { SeedingChatMessage } from '@/bridge/types'

interface SeedingProgressIndicatorProps {
  messages: SeedingChatMessage[]
  currentDiscipline?: string
  // When true, we're actively waiting on Rouge — indicator renders
  // even if the most recent marker is slightly stale. When false,
  // we only show the indicator if there's fresh work (last marker
  // within 5 min).
  isActive: boolean
}

const FRESH_WINDOW_MS = 5 * 60 * 1000

/**
 * Compact progress line shown above the chat input while Rouge is
 * in deep autonomous work. Reads the [WROTE:] and [HEARTBEAT:] marker
 * stream and distills it to one line: "Writing specs — 4 of 8 done"
 * or "FA5 on disk — complex tier, 31 ACs".
 *
 * The design principle: during deep work, chat bubbles get noisy
 * (one card per file, heartbeats every few minutes). The progress
 * indicator carries the "still alive, making progress" signal in
 * one quiet line, leaving chat bubbles for narrative + gates.
 * See docs/design/seeding-interaction-principles.md (principle 4 +
 * principle 6) + the audit doc for the broader rationale.
 */
export function SeedingProgressIndicator({
  messages,
  currentDiscipline,
  isActive,
}: SeedingProgressIndicatorProps) {
  // Filter to autonomous markers in the current discipline. Ignore
  // older disciplines — their writes aren't "in flight" any more.
  const relevant = messages.filter((m) => {
    if (m.role !== 'rouge') return false
    if (m.kind !== 'wrote_artifact' && m.kind !== 'heartbeat') return false
    if (currentDiscipline && m.metadata?.discipline && m.metadata.discipline !== currentDiscipline) {
      return false
    }
    return true
  })

  if (relevant.length === 0) return null

  const latest = relevant[relevant.length - 1]
  const latestTs = new Date(latest.timestamp).getTime()
  const isStale = !isActive && Date.now() - latestTs > FRESH_WINDOW_MS
  if (isStale) return null

  const wroteCount = relevant.filter((m) => m.kind === 'wrote_artifact').length
  const latestSummary = firstLine(latest.content)

  return (
    <div
      className="mx-3 mb-2 flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50/50 px-3 py-1.5 text-xs text-blue-900"
      data-testid="seeding-progress-indicator"
      aria-live="polite"
    >
      <Activity className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">
        {latest.kind === 'wrote_artifact' && wroteCount > 1 && (
          <span className="mr-1.5 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium">
            {wroteCount} artifacts
          </span>
        )}
        {latestSummary}
      </span>
    </div>
  )
}

function firstLine(content: string): string {
  const trimmed = (content || '').trim()
  if (!trimmed) return 'Working…'
  const nl = trimmed.indexOf('\n')
  const line = nl === -1 ? trimmed : trimmed.slice(0, nl)
  return line.length > 120 ? line.slice(0, 117) + '…' : line
}
