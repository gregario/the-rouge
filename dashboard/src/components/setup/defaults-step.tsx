'use client'

import { useEffect, useState } from 'react'
import { Check, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Help } from '@/components/ui/help'

/**
 * Configures the per-project defaults Rouge writes into state.json at
 * project creation. Today there's one knob — `budget_cap_usd` — but the
 * step exists so future defaults (LLM provider, etc.) have a home that
 * isn't buried in a config file.
 */
export function DefaultsStep({ onReady }: { onReady: (ready: boolean) => void }) {
  const [cap, setCap] = useState<number | null>(null)
  const [draft, setDraft] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [savedBanner, setSavedBanner] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Step is always ready — defaults already exist, user may just skim.
    onReady(true)
    fetch('/api/system/budget')
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.cap === 'number') {
          setCap(d.cap)
          setDraft(String(d.cap))
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      setCap(n)
      setSavedBanner(`Default cap updated to $${n}. Applies to new projects only — existing projects keep their current cap.`)
      setTimeout(() => setSavedBanner(null), 4000)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const dirty = cap !== null && Number(draft) !== cap && draft.trim() !== ''

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">New-project defaults</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Settings copied into every new project&apos;s <code>state.json</code> when it&apos;s
          created. You can change any of these per-project later without touching this step.
        </p>
        <Help className="mt-2">
          <p><strong>Budget cap.</strong> The launcher pauses a build and escalates when cumulative spend passes this value. Per-project — every project has its own, started from this default.</p>
          <p><strong>Why $100?</strong> A realistic foundation + a few milestones + QA on a small product lands in the $30–80 range. $100 gives most builds enough room without one runaway wiping out a weekend&apos;s budget.</p>
          <p><strong>Existing projects aren&apos;t touched.</strong> Changing this only affects projects created after the save.</p>
        </Help>
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <strong>Error:</strong> {error}
        </div>
      )}

      {savedBanner && (
        <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          <Check className="inline h-4 w-4 mr-1" /> {savedBanner}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="default-budget-cap">
            Default budget cap (USD)
          </label>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">$</span>
            <input
              id="default-budget-cap"
              type="number" min="0" step="10"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save() }}
              disabled={saving || cap === null}
              placeholder={cap === null ? 'Loading…' : undefined}
              className="w-32 rounded-md border border-border bg-background px-3 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button size="sm" onClick={save} disabled={saving || !dirty}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span className="ml-2">Save default</span>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Applied to every new project at creation. Tweak per-project from the project page or the &ldquo;Build this&rdquo; confirmation.
          </p>
        </div>
      </div>
    </div>
  )
}
