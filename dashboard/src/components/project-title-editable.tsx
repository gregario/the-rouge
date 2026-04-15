'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Pencil, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Always-present title input. Behavior:
 * - Untitled project → starts in editing mode, auto-focused, placeholder
 *   prompts the user ("What are you building?"). Notion/Linear pattern —
 *   the input IS the title, not a modal to open.
 * - Named project → renders as h1 with a persistent pencil hint (not
 *   hover-only). Click to edit.
 *
 * Untitled detection matches what we seed from the New-spec button
 * (display name "Untitled" or a slug beginning with `untitled-`).
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
  const isUntitled = isUntitledName(name) || slug.startsWith('untitled-')
  const [editing, setEditing] = useState(isUntitled)
  const [draft, setDraft] = useState(isUntitled ? '' : name)
  const [alsoRenameSlug, setAlsoRenameSlug] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const canRenameSlug = state === 'seeding' || state === 'ready'

  // When the name arrives late via bridge (e.g., auto-derive writes a
  // working title after first message), slide out of editing mode so the
  // user isn't stuck with focus they didn't ask for.
  useEffect(() => {
    if (!isUntitled && editing && !draft) {
      setEditing(false)
      setDraft(name)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name])

  // Auto-focus on entering editing mode. Defer to next tick so the input
  // actually exists in the DOM.
  useEffect(() => {
    if (editing) {
      const t = setTimeout(() => inputRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [editing])

  function startEdit() {
    setDraft(isUntitled ? '' : name)
    setAlsoRenameSlug(canRenameSlug && isUntitled)
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
    // Empty submit on an untitled project = no-op, stay in edit mode.
    if (!trimmed) {
      if (isUntitled) { setError(null); return }
      cancel(); return
    }
    if (trimmed === name) { cancel(); return }
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
        <Pencil className="h-4 w-4 text-muted-foreground/60 group-hover:text-muted-foreground transition-colors" />
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') cancel()
          }}
          onBlur={() => {
            // Blur-to-save only when there's something to save. Empty-on-
            // untitled keeps the edit box open so the user can come back.
            if (draft.trim() && draft.trim() !== name) save()
          }}
          placeholder={isUntitled ? 'What are you building? (you can rename anytime)' : ''}
          disabled={saving}
          className="min-w-[20rem] rounded-md border border-border bg-background px-2 py-1 text-2xl font-bold text-gray-900 placeholder:font-normal placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button type="button" onClick={save} disabled={saving || !draft.trim()} className="rounded-md border border-border p-1.5 hover:bg-accent disabled:opacity-40" title="Save (Enter)">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-green-600" />}
        </button>
        {!isUntitled && (
          <button type="button" onClick={cancel} disabled={saving} className="rounded-md border border-border p-1.5 hover:bg-accent" title="Cancel (Esc)">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>
      {canRenameSlug && draft.trim() && (
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

function isUntitledName(n: string): boolean {
  const t = n.trim().toLowerCase()
  return t === '' || t === 'untitled' || t === 'untitled spec'
}
