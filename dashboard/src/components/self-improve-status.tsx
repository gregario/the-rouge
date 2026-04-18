'use client'

import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'

// Self-improvement loop status card. Polls /api/system/self-improve
// which wraps `gh issue list --label self-improvement`. Renders
// a total count + the five most recent issues with titles + links
// to GitHub. Gracefully degrades to "no proposals yet" when gh is
// unavailable or no issues exist.

interface ImproveIssue {
  number: number
  title: string
  url: string
  createdAt: string
  state: string
}

interface ImproveData {
  total: number
  recent: ImproveIssue[]
}

export function SelfImproveStatus() {
  const [data, setData] = useState<ImproveData | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/system/self-improve')
      .then((r) => r.ok ? r.json() as Promise<ImproveData> : null)
      .then((d) => {
        if (!cancelled && d) {
          setData(d)
          setLoaded(true)
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => { cancelled = true }
  }, [])

  if (!loaded) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 p-5">
        <div className="h-4 w-32 rounded bg-muted animate-pulse" />
      </div>
    )
  }

  if (!data || data.total === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4" />
          <span>No self-improvement proposals yet.</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground/80">
          Rouge drafts improvement issues after each product completes. They'll land here tagged{' '}
          <code className="text-[10px]">self-improvement</code>.
        </p>
      </div>
    )
  }

  const open = data.recent.filter((i) => i.state === 'OPEN').length
  const closed = data.total - open

  return (
    <div className="rounded-lg border border-border bg-gray-50 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-amber-500" />
            Self-improvement proposals
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {data.total} total — {open} open, {closed} closed
          </p>
        </div>
        <a
          href="https://github.com/gregario/the-rouge/issues?q=label%3Aself-improvement"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          View all
        </a>
      </div>
      <ul className="mt-3 space-y-1.5">
        {data.recent.map((issue) => (
          <li key={issue.number} className="text-xs">
            <a
              href={issue.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-700 hover:text-gray-900"
            >
              <span className="font-mono text-[10px] text-gray-400">#{issue.number}</span>{' '}
              <span className={issue.state === 'OPEN' ? 'text-gray-900' : 'text-gray-500 line-through'}>
                {issue.title}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
