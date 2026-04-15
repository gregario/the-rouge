'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore, Loader2 } from 'lucide-react'

/**
 * Toggle archive flag on state.json. Archive hides the project from the
 * main dashboard and pushes it to /archived — soft-delete for builds with
 * real work attached (git, deploys, checkpoints) where hard-delete would
 * be destructive. Unarchive returns it to the main dashboard.
 *
 * The API refuses to archive a project that's in an active build state
 * — the user must stop the loop first.
 */
export function ArchiveButton({
  slug,
  archived,
}: {
  slug: string
  archived: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(slug)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !archived }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      if (!archived) {
        // Just archived — user probably wants off the project page.
        router.push('/')
      } else {
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-gray-300 transition-colors disabled:opacity-60"
      >
        {busy
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : archived
            ? <ArchiveRestore className="h-3.5 w-3.5" />
            : <Archive className="h-3.5 w-3.5" />}
        <span>{archived ? 'Unarchive' : 'Archive'}</span>
      </button>
      {error && <span className="text-xs text-red-700 max-w-[260px] text-right">{error}</span>}
    </div>
  )
}
