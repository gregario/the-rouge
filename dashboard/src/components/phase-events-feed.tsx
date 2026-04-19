'use client'

import { useEffect, useState } from 'react'
import { fetchBridgePhaseEvents, type PhaseEventsPayload, type PhaseEventPayload } from '@/lib/bridge-client'
import { Wrench, CheckCircle2, XCircle, MessageSquare, Flag, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PhaseEventsFeedProps {
  slug: string
  // When true, polls every 1.5s. When false, fetches once (post-phase view).
  live?: boolean
  tail?: number
  // Optional filter: only show events stamped with this story_id. Used
  // by the per-story feed inside active story cards so each card shows
  // its own tool calls, not the full project-wide stream.
  storyId?: string
  // Compact layout — used inside story cards where the full panel
  // header + "N events" counter would be visual noise.
  compact?: boolean
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts)
    const hh = d.getHours().toString().padStart(2, '0')
    const mm = d.getMinutes().toString().padStart(2, '0')
    const ss = d.getSeconds().toString().padStart(2, '0')
    return `${hh}:${mm}:${ss}`
  } catch {
    return ts
  }
}

function EventRow({ ev }: { ev: PhaseEventPayload }) {
  const common = 'flex items-start gap-2 py-1.5 text-xs'
  const timeClass = 'shrink-0 w-16 pt-0.5 font-mono text-[10px] text-gray-400 tabular-nums'

  if (ev.type === 'phase_start') {
    return (
      <div className={common}>
        <span className={timeClass}>{formatTime(ev.ts)}</span>
        <Flag className="mt-0.5 size-3.5 shrink-0 text-blue-600" />
        <span className="text-gray-700">
          Phase <span className="font-semibold">{ev.phase}</span> started
          {ev.model && <span className="text-gray-400"> · {ev.model}</span>}
        </span>
      </div>
    )
  }

  if (ev.type === 'phase_end') {
    const ok = ev.exit_code === 0
    return (
      <div className={common}>
        <span className={timeClass}>{formatTime(ev.ts)}</span>
        {ok
          ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-green-600" />
          : <XCircle className="mt-0.5 size-3.5 shrink-0 text-red-600" />
        }
        <span className="text-gray-700">
          Phase <span className="font-semibold">{ev.phase}</span> {ok ? 'completed' : `exited (${ev.exit_code ?? 'unknown'})`}
          {typeof ev.duration_ms === 'number' && (
            <span className="text-gray-400"> · {Math.round(ev.duration_ms / 1000)}s</span>
          )}
        </span>
      </div>
    )
  }

  if (ev.type === 'tool_use') {
    return (
      <div className={common}>
        <span className={timeClass}>{formatTime(ev.ts)}</span>
        <Wrench className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
        <span className="min-w-0">
          <span className="font-semibold text-gray-900">{ev.name}</span>
          {ev.summary && <span className="ml-1.5 text-gray-500 break-all">{ev.summary}</span>}
        </span>
      </div>
    )
  }

  if (ev.type === 'tool_result') {
    const ok = ev.status !== 'error'
    return (
      <div className={common}>
        <span className={timeClass}>{formatTime(ev.ts)}</span>
        {ok
          ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-green-600" />
          : <XCircle className="mt-0.5 size-3.5 shrink-0 text-red-600" />
        }
        <span className={cn('min-w-0 text-gray-500', !ok && 'text-red-700')}>
          {ev.summary || (ok ? 'ok' : 'error')}
        </span>
      </div>
    )
  }

  if (ev.type === 'text') {
    return (
      <div className={common}>
        <span className={timeClass}>{formatTime(ev.ts)}</span>
        <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-gray-500" />
        <span className="min-w-0 whitespace-pre-wrap text-gray-700">{ev.text}</span>
      </div>
    )
  }

  return null
}

/**
 * Live tool-call feed driven by the launcher's stream-json parsing.
 *
 * Renders events from <project>/phase_events.jsonl. During a running
 * phase this shows what Claude is doing right now — tool calls, results,
 * narration — without having to wait for phase completion. When no
 * events file exists (either the phase is running on a pre-stream-json
 * launcher, or no build has ever run), renders a short explanatory
 * empty state.
 */
export function PhaseEventsFeed({
  slug,
  live = false,
  tail = 100,
  storyId,
  compact = false,
}: PhaseEventsFeedProps) {
  const [payload, setPayload] = useState<PhaseEventsPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetchBridgePhaseEvents(slug, tail, { storyId })
        .then((data) => {
          if (!cancelled) {
            setPayload(data)
            setError(null)
          }
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : String(err))
        })
    }
    load()
    if (live) {
      const i = setInterval(load, 1500)
      return () => { cancelled = true; clearInterval(i) }
    }
    return () => { cancelled = true }
  }, [slug, live, tail, storyId])

  if (error) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <p className="text-xs text-red-600">Phase events error: {error}</p>
      </div>
    )
  }

  if (!payload) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
        <Loader2 className="mx-auto size-5 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!payload.exists || payload.events.length === 0) {
    // Be specific about what we're waiting for. The generic "Waiting
    // for the first event…" from earlier told users nothing about
    // whether the subprocess was starting up, blocked, or had
    // finished. The phrasing now differentiates the cases we know
    // about.
    const emptyMessage = live
      ? payload.exists
        ? 'Subprocess is running — waiting for its first tool call or message.'
        : 'Starting the phase subprocess…'
      : 'No phase events recorded for this project yet.'
    if (compact) {
      return (
        <p className="text-xs text-gray-500">
          {live
            ? storyId
              ? 'Waiting for Rouge to pick up this story. Activity will appear here as tool calls land.'
              : emptyMessage
            : 'No activity recorded for this story yet.'}
        </p>
      )
    }
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center">
        <p className="text-sm text-gray-500">{emptyMessage}</p>
        <p className="mt-1 text-xs text-gray-400">
          Event capture runs through <code>claude -p --output-format stream-json</code>. If this stays empty during a build, check the Raw Log in diagnostics for subprocess errors.
        </p>
      </div>
    )
  }

  if (compact) {
    // Bare list — no outer chrome. The host container (the story
    // card) already provides a heading + frame.
    return (
      <div className="max-h-48 overflow-auto">
        {payload.events.map((ev, i) => (
          <EventRow key={`${ev.ts}-${ev.id ?? i}-${i}`} ev={ev} />
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
        <span className="text-sm font-semibold text-gray-900">Phase activity</span>
        <span className="text-xs text-gray-500">
          {payload.totalCount} event{payload.totalCount === 1 ? '' : 's'}
          {payload.truncated && ` · showing last ${payload.events.length}`}
        </span>
      </div>
      <div className="max-h-96 overflow-auto px-4 py-2">
        {payload.events.map((ev, i) => (
          <EventRow key={`${ev.ts}-${ev.id ?? i}-${i}`} ev={ev} />
        ))}
      </div>
    </div>
  )
}
