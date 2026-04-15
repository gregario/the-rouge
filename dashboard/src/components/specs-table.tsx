'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowUpDown, Loader2, Rocket, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ProjectSummary } from '@/lib/types'
import { SpecDepthPill, depthForProject } from './spec-depth-pill'

type SortKey = 'touched' | 'depth' | 'name' | 'cost'

const DEPTH_ORDER: Record<ReturnType<typeof depthForProject>, number> = {
  brainstorm: 0, researched: 1, specced: 2, designed: 3, ready: 4,
}

function timeAgo(iso?: string): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const diff = Math.max(0, Date.now() - then)
  const days = Math.floor(diff / 86400000)
  if (days >= 1) return `${days}d ago`
  const hours = Math.floor(diff / 3600000)
  if (hours >= 1) return `${hours}h ago`
  const mins = Math.floor(diff / 60000)
  if (mins >= 1) return `${mins}m ago`
  return 'just now'
}

export function SpecsTable({ specs }: { specs: ProjectSummary[] }) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('touched')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [promoting, setPromoting] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = specs
    if (q) {
      list = specs.filter((p) =>
        p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q))
    }
    const sign = sortDir === 'asc' ? 1 : -1
    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case 'touched': {
          const ta = new Date(a.updatedAt ?? a.lastCheckpointAt ?? 0).getTime()
          const tb = new Date(b.updatedAt ?? b.lastCheckpointAt ?? 0).getTime()
          return sign * (tb - ta)
        }
        case 'depth':
          return sign * (DEPTH_ORDER[depthForProject(b)] - DEPTH_ORDER[depthForProject(a)])
        case 'name':
          return sign * b.name.localeCompare(a.name) * -1
        case 'cost':
          return sign * ((b.cost?.totalSpend ?? 0) - (a.cost?.totalSpend ?? 0))
      }
    })
    return list
  }, [specs, query, sortKey, sortDir])

  function onSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(k)
      setSortDir(k === 'name' ? 'asc' : 'desc')
    }
  }

  async function deleteSpec(slug: string, messageCount: number, name: string) {
    // Confirm only when there's real content. Empty placeholders nuke
    // silently — that's their whole reason for existing.
    if (messageCount > 0) {
      const label = name || 'this spec'
      const ok = window.confirm(
        `Delete "${label}"? This permanently removes ${messageCount} message${messageCount > 1 ? 's' : ''} and the project directory. This cannot be undone.`,
      )
      if (!ok) return
    }
    setDeleting(slug)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(slug)}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      // Optimistic reload — page is RSC so a full refresh is fine.
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setDeleting(null)
    }
  }

  async function promote(slug: string) {
    setPromoting(slug)
    setError(null)
    try {
      // "Promotion" = starting the build loop. A spec in the `ready` state
      // has everything it needs; /start kicks off the Karpathy Loop and
      // the project moves into `foundation` (building).
      const res = await fetch(`/api/projects/${encodeURIComponent(slug)}/start`, {
        method: 'POST',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      // The project moves out of Specs and into Building on next render.
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPromoting(null)
    }
  }

  if (specs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
        No specs yet. Click <strong>+ New Project</strong> to start one.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search specs…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          Sort:
          {(['touched', 'depth', 'name', 'cost'] as SortKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onSort(k)}
              className={cn(
                'rounded-md px-2 py-1 transition-colors',
                sortKey === k
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'hover:bg-accent/50 hover:text-foreground',
              )}
            >
              {k === 'touched' ? 'Last touched' : k[0].toUpperCase() + k.slice(1)}
              {sortKey === k && <ArrowUpDown className={cn('ml-1 inline h-3 w-3', sortDir === 'asc' && 'rotate-180')} />}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border">
        <div
          className="grid gap-3 border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
          style={{ gridTemplateColumns: '1fr 140px 100px 100px 110px' }}
        >
          <span>Spec</span>
          <span>Depth</span>
          <span className="text-right tabular-nums">Cost</span>
          <span className="text-right tabular-nums">Touched</span>
          <span className="text-right">Action</span>
        </div>
        <ul className="divide-y divide-border">
          {filtered.map((p) => {
            const depth = depthForProject(p)
            const isReady = depth === 'ready'
            const isPromoting = promoting === p.slug
            return (
              <li
                key={p.id}
                className="grid items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/40"
                style={{ gridTemplateColumns: '1fr 140px 100px 100px 110px' }}
              >
                <Link
                  href={`/projects/${p.slug}`}
                  className="group min-w-0 flex flex-col hover:underline underline-offset-2"
                >
                  {p.isPlaceholderName ? (
                    <>
                      <div className="truncate font-medium text-muted-foreground italic">
                        Untitled spec
                      </div>
                      <div className="truncate text-xs text-muted-foreground/70">
                        {p.firstMessagePreview
                          ? <>&ldquo;{p.firstMessagePreview}&rdquo;</>
                          : 'empty — nothing sent yet'}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="truncate font-medium text-foreground">{p.name}</div>
                      {p.description && (
                        <div className="truncate text-xs text-muted-foreground">{p.description}</div>
                      )}
                    </>
                  )}
                </Link>
                <div><SpecDepthPill project={p} /></div>
                <div className="text-right tabular-nums text-muted-foreground">
                  ${(p.cost?.totalSpend ?? 0).toFixed(2)}
                </div>
                <div className="text-right tabular-nums text-muted-foreground">
                  {timeAgo(p.updatedAt ?? p.lastCheckpointAt)}
                </div>
                <div className="flex items-center justify-end gap-2">
                  {isReady ? (
                    <Button
                      size="sm"
                      onClick={() => promote(p.slug)}
                      disabled={isPromoting}
                      className="h-7"
                    >
                      {isPromoting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Rocket className="h-3 w-3" />}
                      <span className="ml-1.5 text-xs">Build this</span>
                    </Button>
                  ) : (
                    <Link
                      href={`/projects/${p.slug}`}
                      className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                    >
                      Open →
                    </Link>
                  )}
                  {/* Delete button on every spec row. Empty placeholders
                      nuke silently; non-empty specs get a confirm. */}
                  <button
                    type="button"
                    onClick={() => deleteSpec(p.slug, p.messageCount ?? 0, p.name)}
                    disabled={deleting === p.slug}
                    title={p.messageCount ? 'Delete spec (asks for confirmation)' : 'Delete empty spec'}
                    className="p-1 text-muted-foreground/60 hover:text-red-600 transition-colors disabled:opacity-50"
                  >
                    {deleting === p.slug
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
        {filtered.length === 0 && query && (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            No specs match &ldquo;{query}&rdquo;.
          </div>
        )}
      </div>
    </div>
  )
}
