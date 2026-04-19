'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Collapsed-by-default footer that holds the secondary diagnostic
 * surfaces — historical event log, raw build log, cost/event counters.
 * Consolidates what used to be three or four sibling panels below the
 * fold, each competing for attention and each occasionally misleading
 * the user. Primary build status lives above (CurrentFocusCard +
 * milestone timeline); this is where power users drill in when they
 * want to know the mechanical detail.
 */
export function DiagnosticsFooter({
  label = 'Diagnostics',
  summary,
  children,
  defaultOpen = false,
}: {
  label?: string
  summary?: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50" data-testid="diagnostics-footer">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center justify-between gap-2 px-4 py-3 text-left',
          'hover:bg-gray-100 cursor-pointer',
        )}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          {open
            ? <ChevronDown className="size-4 text-gray-500" />
            : <ChevronRight className="size-4 text-gray-500" />}
          <span className="text-sm font-semibold text-gray-900">{label}</span>
          {summary && (
            <span className="text-xs text-gray-500">{summary}</span>
          )}
        </div>
      </button>
      {open && (
        <div className="space-y-4 border-t border-gray-200 p-4">
          {children}
        </div>
      )}
    </div>
  )
}
