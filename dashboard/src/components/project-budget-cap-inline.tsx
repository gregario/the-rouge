'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Pencil, X } from 'lucide-react'

/**
 * Inline-editable per-project budget cap. Shown next to the spend figure
 * in the project header. Writes `budget_cap_usd` on state.json via
 * PATCH /api/projects/[slug] — the launcher reads it on the next phase
 * and enforces accordingly.
 *
 * Displayed bare (no icon) to keep the header quiet. Click the cap number
 * to edit.
 */
export function ProjectBudgetCapInline({
  slug,
  cap,
  totalSpend,
}: {
  slug: string
  cap: number
  totalSpend: number
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(cap))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const n = Number(draft)
    if (!Number.isFinite(n) || n < 0) {
      setError('Cap must be a non-negative number')
      return
    }
    if (n === cap) {
      setEditing(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(slug)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budgetCap: n }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setEditing(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <div className="flex items-center gap-1 text-sm">
          <span className="tabular-nums text-gray-900">${totalSpend.toFixed(2)}</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-muted-foreground">$</span>
          <input
            type="number" min="0" step="10" autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') { setEditing(false); setDraft(String(cap)); setError(null) }
            }}
            disabled={saving}
            className="w-16 rounded-md border border-border bg-background px-1.5 py-0.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-md border border-border p-1 hover:bg-accent"
            title="Save (Enter)"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 text-green-600" />}
          </button>
          <button
            type="button"
            onClick={() => { setEditing(false); setDraft(String(cap)); setError(null) }}
            disabled={saving}
            className="rounded-md border border-border p-1 hover:bg-accent"
            title="Cancel (Esc)"
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
        <span className="text-[10px] text-muted-foreground">Build Cost · cap</span>
        {error && <span className="text-[10px] text-red-700">{error}</span>}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Edit cap"
      className="group flex flex-col items-end gap-0.5 rounded-md -mx-1 px-1 py-0.5 hover:bg-muted/60 transition-colors"
    >
      <span className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums text-gray-900">
        ${totalSpend.toFixed(2)}
        <span className="text-muted-foreground font-normal">/</span>
        <span className="text-muted-foreground tabular-nums">${cap.toFixed(0)}</span>
        <Pencil className="h-3 w-3 text-muted-foreground/60 group-hover:text-muted-foreground transition-colors" />
      </span>
      <span className="text-[10px] text-muted-foreground">Build Cost · cap</span>
    </button>
  )
}
