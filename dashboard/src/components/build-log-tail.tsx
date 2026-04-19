'use client'

import { useEffect, useState, useRef } from 'react'
import { fetchBridgeBuildLog, type BuildLogPayload } from '@/lib/bridge-client'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BuildLogTailProps {
  slug: string
  // When true (build running), polls every 5s. When false, fetches once.
  live?: boolean
  tail?: number
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function BuildLogTail({ slug, live = false, tail = 50 }: BuildLogTailProps) {
  const [log, setLog] = useState<BuildLogPayload | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const preRef = useRef<HTMLPreElement | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetchBridgeBuildLog(slug, tail)
        .then((data) => {
          if (!cancelled) {
            setLog(data)
            setError(null)
          }
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : String(err))
        })
    }
    load()
    if (live) {
      // 1.5s while live — fast enough to feel continuous without
      // hammering the filesystem. Previous 5s polling meant users
      // waited up to 5s to see new output during active builds.
      // Audit F16 considered switching to SSE; parked. SSE lowers
      // latency further but adds endpoint + reconnect complexity
      // and polling-at-1.5s is already good enough for the tail
      // pattern. Revisit if the dashboard moves to multi-tenant.
      const i = setInterval(load, 1500)
      return () => { cancelled = true; clearInterval(i) }
    }
    return () => { cancelled = true }
  }, [slug, live, tail])

  // Auto-scroll to bottom when expanded and log updates
  useEffect(() => {
    if (expanded && preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight
    }
  }, [expanded, log])

  if (error) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <p className="text-xs text-red-600">Build log error: {error}</p>
      </div>
    )
  }

  if (!log) return null

  const empty = log.totalLines === 0
  // Call this section "Raw Log" regardless of source — it's the secondary,
  // diagnostics-grade surface (claude's stderr + startup banners). The
  // primary in-flight signal lives in the phase events feed above. Not
  // claiming LIVE/IDLE here on purpose: those labels only had the weight
  // of file-mtime heuristics and misled users when the real activity was
  // in tool calls, not stdout.
  const summary = empty
    ? 'No raw output yet'
    : `${log.totalLines} line${log.totalLines === 1 ? '' : 's'} · ${formatBytes(log.sizeBytes)}`

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50">
      <button
        onClick={() => !empty && setExpanded((v) => !v)}
        disabled={empty}
        className={cn(
          'flex w-full items-center justify-between gap-2 px-4 py-3 text-left',
          !empty && 'hover:bg-gray-100 cursor-pointer',
          empty && 'cursor-default',
        )}
      >
        <div className="flex items-center gap-2">
          {!empty && (expanded
            ? <ChevronDown className="size-4 text-gray-500" />
            : <ChevronRight className="size-4 text-gray-500" />
          )}
          <span className="text-sm font-semibold text-gray-900">Raw Log</span>
          <span className="text-xs text-gray-500">{summary}</span>
        </div>
      </button>
      {expanded && !empty && (
        <pre
          ref={preRef}
          className="max-h-80 overflow-auto border-t border-gray-200 bg-gray-900 px-4 py-3 font-mono text-[11px] leading-relaxed text-gray-100"
        >
          {log.truncated && (
            <span className="block text-gray-500">
              … {log.totalLines - log.lines.length} earlier lines not shown
            </span>
          )}
          {log.lines.join('\n')}
        </pre>
      )}
    </div>
  )
}
