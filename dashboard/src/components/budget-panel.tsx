'use client'

import { useEffect, useState } from 'react'
import { DollarSign, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface BudgetData {
  cap: number
  spend: { total: number; byProject: Record<string, number> }
  configPath?: string | null
}

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
      <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading budget…
      </div>
    )
  }

  if (!data) {
    return error ? (
      <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
    ) : null
  }

  const pct = data.cap > 0 ? Math.min(100, (data.spend.total / data.cap) * 100) : 0
  const overCap = data.spend.total > data.cap
  const color = overCap ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-green-500'

  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm w-full max-w-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <DollarSign className="h-4 w-4" />
          Budget
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Edit cap
          </button>
        )}
      </div>

      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={cn('text-lg font-semibold tabular-nums', overCap && 'text-red-600')}>
          ${data.spend.total.toFixed(2)}
        </span>
        <span className="text-xs text-muted-foreground">/</span>
        {editing ? (
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">$</span>
            <input
              type="number" min="0" step="1"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-20 rounded-md border border-border bg-background px-2 py-0.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            </Button>
            <button
              type="button"
              onClick={() => { setEditing(false); setDraft(String(data.cap)) }}
              className="text-xs text-muted-foreground hover:text-foreground px-1"
            >
              Cancel
            </button>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground tabular-nums">${data.cap.toFixed(0)} cap</span>
        )}
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${Math.max(1, pct)}%` }} />
      </div>

      {overCap && (
        <p className="mt-2 text-xs text-red-700">Over cap — raise it or pause active builds.</p>
      )}
      {error && (
        <p className="mt-2 text-xs text-red-700">{error}</p>
      )}
    </div>
  )
}
