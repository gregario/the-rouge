'use client'

import { useEffect, useState } from 'react'
import type { ProjectState } from '@/lib/types'
import type { StoryContext } from '@/bridge/story-context-reader'
import { phaseLabel, phaseGloss } from '@/lib/phase-labels'
import { Loader2, Flag, CheckCircle2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CurrentFocusCardProps {
  state: ProjectState
  buildRunning?: boolean
  buildStartedAt?: string
  currentStoryName?: string
  currentMilestoneName?: string
  storyContext?: StoryContext | null
  latestToolSummary?: string
  latestToolAt?: string
  escalationSummary?: string
}

function formatElapsed(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000))
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const rem = sec % 60
  if (min < 60) return rem ? `${min}m ${rem}s` : `${min}m`
  const hr = Math.floor(min / 60)
  const rmin = min % 60
  return rmin ? `${hr}h ${rmin}m` : `${hr}h`
}

/**
 * The hero band above the milestone timeline. Answers the *single*
 * question "what is Rouge doing right now, and should I feel OK about
 * it?"
 *
 * Three visual modes:
 *   - escalation → red band with the escalation summary + "open below"
 *   - building (any mid-phase state) → blue band with phase label,
 *     current story (if any), latest tool call, and elapsed timer
 *   - terminal (ready / complete) → subtle neutral band
 *
 * The pill / IDLE labels that lived in earlier iterations are gone —
 * this is the sole place the user looks for "is it alive right now?"
 * and the page-level design elsewhere doesn't duplicate the signal.
 */
export function CurrentFocusCard({
  state,
  buildRunning = false,
  buildStartedAt,
  currentStoryName,
  currentMilestoneName,
  storyContext,
  latestToolSummary,
  latestToolAt,
  escalationSummary,
}: CurrentFocusCardProps) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!buildRunning) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [buildRunning])

  // Escalation mode — overrides everything else.
  if (state === 'escalation' || state === 'waiting-for-human') {
    return (
      <div
        className="flex items-start gap-3 rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-3"
        data-testid="current-focus-escalation"
      >
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-amber-900">
            {phaseLabel(state)}
          </div>
          <div className="mt-0.5 truncate text-xs text-amber-900/80">
            {escalationSummary ?? "Open the escalation below to respond."}
          </div>
        </div>
      </div>
    )
  }

  if (state === 'complete') {
    return (
      <div
        className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3"
        data-testid="current-focus-complete"
      >
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-600" />
        <div className="text-sm font-semibold text-green-900">Shipped</div>
      </div>
    )
  }

  if (state === 'ready' || state === 'seeding') {
    return (
      <div
        className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3"
        data-testid="current-focus-idle"
      >
        <Flag className="mt-0.5 size-5 shrink-0 text-gray-500" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-gray-800">{phaseLabel(state)}</div>
          <div className="mt-0.5 text-xs text-gray-500">{phaseGloss(state)}</div>
        </div>
      </div>
    )
  }

  // Mid-phase building state. Compose the sub-line from whatever we
  // have: active story title (if one exists for this phase — foundation
  // / foundation-eval don't have one), latest tool call (if the phase
  // events feed saw one), or the phase gloss as a fallback.
  const hasStoryContext = Boolean(currentStoryName && state === 'story-building')
  const elapsed = buildStartedAt
    ? formatElapsed(now - new Date(buildStartedAt).getTime())
    : null
  const toolAge = latestToolAt
    ? formatElapsed(now - new Date(latestToolAt).getTime())
    : null

  return (
    <div
      className={cn(
        'rounded-lg border bg-white px-4 py-3',
        buildRunning ? 'border-blue-200' : 'border-gray-200',
      )}
      data-testid="current-focus-building"
    >
      <div className="flex items-start gap-3">
        {buildRunning ? (
          <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-blue-600" />
        ) : (
          <Flag className="mt-0.5 size-5 shrink-0 text-gray-500" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-semibold text-gray-900">
              {phaseLabel(state)}
            </span>
            {hasStoryContext && (
              <>
                <span className="text-gray-300">·</span>
                <span className="truncate text-sm text-gray-700" title={currentStoryName}>
                  {currentStoryName}
                </span>
              </>
            )}
            {currentMilestoneName && !hasStoryContext && (
              <>
                <span className="text-gray-300">·</span>
                <span className="truncate text-xs text-gray-500" title={currentMilestoneName}>
                  in {currentMilestoneName}
                </span>
              </>
            )}
            {elapsed && (
              <span className="ml-auto shrink-0 text-xs tabular-nums text-gray-500">
                {elapsed}
              </span>
            )}
          </div>
          <div className="mt-1 truncate text-xs text-gray-500">
            {latestToolSummary
              ? `${latestToolSummary}${toolAge ? ` · ${toolAge} ago` : ''}`
              : storyContext?.story?.name
                ? storyContext.story.name
                : phaseGloss(state)}
          </div>
        </div>
      </div>
    </div>
  )
}
