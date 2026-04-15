'use client'

import { useEffect, useState } from 'react'
import { DollarSign, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Help } from '@/components/ui/help'
import { cn } from '@/lib/utils'

interface BudgetData {
  cap: number
  spend: { total: number; byProject: Record<string, number> }
  configPath?: string | null
}

/**
 * Compact one-line budget strip for the dashboard header.
 * Shows spend/cap + progress bar + Edit + Why? — all inline.
 */
export function BudgetPanel() {
  const [data, setData] = useState<BudgetData | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/system/budget')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = (await res.json()) as BudgetData
      setData(d)
      setDraft(String(d.cap))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function save() {
    const n = Number(draft)
    if (!Number.isFinite(n) || n < 0) {
      setError('Cap must be a non-negative number')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/system/budget', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cap: n }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setEditing(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading budget…
      </div>
    )
  }

  if (!data) {
    return error ? (
      <span className="text-xs text-red-700">Budget: {error}</span>
    ) : null
  }

  const pct = data.cap > 0 ? Math.min(100, (data.spend.total / data.cap) * 100) : 0
  const overCap = data.spend.total > data.cap
  const color = overCap ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-green-500'

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2 text-sm">
        <DollarSign className="h-4 w-4 text-muted-foreground" />
        <span className={cn('font-semibold tabular-nums', overCap && 'text-red-600')}>
          ${data.spend.total.toFixed(2)}
        </span>
        <span className="text-muted-foreground">/</span>
        {editing ? (
          <span className="flex items-center gap-1">
            <span className="text-muted-foreground">$</span>
            <input
              type="number" min="0" step="1"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-16 rounded-md border border-border bg-background px-2 py-0.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
            <Button size="sm" onClick={save} disabled={saving} className="h-6 px-2">
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            </Button>
            <button
              type="button"
              onClick={() => { setEditing(false); setDraft(String(data.cap)) }}
              className="text-xs text-muted-foreground hover:text-foreground px-1"
            >
              Cancel
            </button>
          </span>
        ) : (
          <>
            <span className="text-muted-foreground tabular-nums">${data.cap.toFixed(0)} cap</span>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 ml-1"
            >
              Edit
            </button>
          </>
        )}
      </div>
      <div className="h-1 w-40 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${Math.max(1, pct)}%` }} />
      </div>
      {overCap && (
        <span className="text-xs text-red-700">Over cap — raise it or pause active builds.</span>
      )}
      {error && (
        <span className="text-xs text-red-700">{error}</span>
      )}
      <Help>
        <p><strong>What counts as spend?</strong> Cumulative Claude API cost across all projects, read from each project&apos;s <code>state.json</code> (<code>costs.cumulative_cost_usd</code>).</p>
        <p><strong>What does the cap do?</strong> Rouge pauses a running loop if its project&apos;s spend exceeds <code>budget_cap_usd</code>. Global cap lives in rouge.config.json.</p>
      </Help>
    </div>
  )
}
