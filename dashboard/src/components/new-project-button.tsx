'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus } from 'lucide-react'
import { createBridgeProject, isBridgeEnabled } from '@/lib/bridge-client'

/**
 * Chat-first new-spec button. No modal, no naming upfront — click and
 * you're dropped straight into the seeding chat on an "Untitled" spec.
 * The marketing phase (or a manual rename) names it later, when the
 * product actually has a shape. This dissolves the catch-22 of needing
 * a name before you've talked through what the thing is.
 */
export function NewProjectButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function start() {
    if (busy) return
    if (!isBridgeEnabled()) {
      setError('Bridge not enabled — cannot create specs')
      return
    }
    setBusy(true)
    setError(null)
    try {
      // Unique-enough slug that doesn't pretend to be meaningful.
      // Base36 timestamp is short (~7 chars) and filesystem-safe.
      const slug = `untitled-${Date.now().toString(36)}`
      const result = await createBridgeProject(slug, 'Untitled')
      router.push(`/projects/${result.slug}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="inline-flex items-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        <span className="ml-1.5">{busy ? 'Starting…' : 'New spec'}</span>
      </button>
      {error && (
        <span className="text-xs text-red-700 max-w-[220px] text-right">{error}</span>
      )}
    </div>
  )
}
