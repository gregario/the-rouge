'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Pencil, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Inline-editable project title. Click to edit — updates display name
 * via PATCH /api/projects/[slug]. If the current state allows slug
 * rename (seeding/ready), the slug is regenerated from the new name
 * and the URL follows.
 */
export function ProjectTitleEditable({
  slug,
  name,
  state,
  className,
}: {
  slug: string
  name: string
  state: string
  className?: string
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [alsoRenameSlug, setAlsoRenameSlug] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canRenameSlug = state === 'seeding' || state === 'ready'

  function startEdit() {
    setDraft(name)
    setAlsoRenameSlug(canRenameSlug && name === 'Untitled') // default on when renaming from Untitled
    setError(null)
    setEditing(true)
  }

  function cancel() {
    setDraft(name)
    setEditing(false)
    setError(null)
  }

  async function save() {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === name) { cancel(); return }
    setSaving(true)
    setError(null)
    try {
      const payload: { displayName: string; slug?: string } = { displayName: trimmed }
      if (alsoRenameSlug && canRenameSlug) {
        payload.slug = trimmed
      }
      const res = await fetch(`/api/projects/${encodeURIComponent(slug)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      if (body.slugChanged) {
        router.push(`/projects/${body.slug}`)
        router.refresh()
      } else {
        router.refresh()
      }
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEdit}
        className={cn(
          'group inline-flex items-center gap-2 rounded-md -mx-1.5 px-1.5 py-0.5 hover:bg-muted/60 transition-colors',
          className,
        )}
        title="Rename"
      >
        <span className="text-2xl font-bold tracking-tight text-gray-900">{name}</span>
        <Pencil className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') cancel()
          }}
          autoFocus
          disabled={saving}
          className="rounded-md border border-border bg-background px-2 py-1 text-2xl font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button type="button" onClick={save} disabled={saving} className="rounded-md border border-border p-1.5 hover:bg-accent" title="Save (Enter)">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-green-600" />}
        </button>
        <button type="button" onClick={cancel} disabled={saving} className="rounded-md border border-border p-1.5 hover:bg-accent" title="Cancel (Esc)">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
      {canRenameSlug && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={alsoRenameSlug}
            onChange={(e) => setAlsoRenameSlug(e.target.checked)}
            disabled={saving}
          />
          Also rename the project directory (URL will change)
        </label>
      )}
      {!canRenameSlug && (
        <p className="text-xs text-muted-foreground">
          Directory slug is locked once the build loop starts — only the display name will change.
        </p>
      )}
      {error && (
        <p className="text-xs text-red-700">{error}</p>
      )}
    </div>
  )
}
