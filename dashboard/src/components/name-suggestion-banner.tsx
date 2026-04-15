'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Shows a banner on Untitled specs when the seeding swarm has proposed
 * a product name. Reads `state.json.suggestedName` via the project API
 * (no type plumbing). One-click accept renames display + slug.
 * Dismissible. Inert today until the marketing prompt starts emitting
 * suggestedName — the scaffolding is ready.
 */
export function NameSuggestionBanner({
  slug,
  currentName,
  state,
}: {
  slug: string
  currentName: string
  state: string
}) {
  const router = useRouter()
  const [suggestedName, setSuggestedName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Poll for a suggestedName — cheap, only runs while on an Untitled spec.
  useEffect(() => {
    if (currentName.trim().toLowerCase() !== 'untitled') return
    let cancelled = false
    const check = async () => {
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(slug)}`)
        if (!res.ok) return
        const body = await res.json()
        if (cancelled) return
        if (typeof body.suggestedName === 'string' && body.suggestedName.trim()) {
          setSuggestedName(body.suggestedName.trim())
        }
      } catch { /* silent */ }
    }
    check()
    const interval = setInterval(check, 15000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [slug, currentName])

  // Only show when:
  // - there IS a suggestion
  // - current name is still a placeholder (Untitled)
  // - suggestion differs from current
  // - user hasn't dismissed it this session
  const show =
    !dismissed &&
    !!suggestedName &&
    currentName.trim().toLowerCase() === 'untitled' &&
    suggestedName.trim().toLowerCase() !== currentName.trim().toLowerCase()

  if (!show || !suggestedName) return null

  async function accept() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(slug)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: suggestedName,
          // Only rename slug while still seeding/ready.
          slug: state === 'seeding' || state === 'ready' ? suggestedName : undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      if (body.slugChanged) {
        router.push(`/projects/${body.slug}`)
        router.refresh()
      } else {
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 flex items-start gap-3">
      <Sparkles className="h-5 w-5 text-violet-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-violet-900">
          The seeding swarm suggests naming this <strong>{suggestedName}</strong>.
        </p>
        {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" onClick={accept} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          <span className={busy ? 'ml-2' : ''}>Use this name</span>
        </Button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="p-1 text-violet-700 hover:text-violet-900"
          title="Dismiss"
          disabled={busy}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
