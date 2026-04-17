'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Settings } from 'lucide-react'

/**
 * Settings menu for a single project. Lives next to the display-name
 * editor in the header. Current single action: rename the URL slug.
 *
 * Why this exists: the slug is a launcher artifact 95% of users never
 * touch. Putting it inline next to the title (with a checkbox next to
 * the display-name editor) gave it equal visual weight to the
 * display-name rename — the action people actually want — and
 * regularly surfaced the raw placeholder slug, making it look like the
 * display name had vanished (#135, #138).
 *
 * Auto-slugify (#137) handles the first-name-on-placeholder case
 * transparently. Manual slug edits after that happen through this menu.
 */
export function ProjectSettingsMenu({
  slug,
  state,
}: {
  slug: string
  state: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(slug)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canRenameSlug = state === 'seeding' || state === 'ready'

  function openMenu() {
    setDraft(slug)
    setError(null)
    setOpen(true)
  }

  function closeMenu() {
    if (saving) return
    setOpen(false)
  }

  async function save() {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === slug) {
      closeMenu()
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(slug)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: trimmed }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      if (body.slugChanged) {
        router.push(`/projects/${body.slug}`)
        router.refresh()
      } else {
        router.refresh()
      }
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openMenu}
        className="rounded-md p-1.5 text-muted-foreground/60 hover:bg-muted/60 hover:text-muted-foreground transition-colors"
        title="Project settings"
        aria-label="Project settings"
      >
        <Settings className="h-4 w-4" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={closeMenu}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-lg border border-border bg-background p-5 shadow-lg"
          >
            <h3 className="text-base font-semibold text-foreground">Project settings</h3>

            <section className="mt-4 flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground" htmlFor="project-slug">
                URL slug
              </label>
              <input
                id="project-slug"
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save()
                  if (e.key === 'Escape') closeMenu()
                }}
                disabled={!canRenameSlug || saving}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
              <p className="text-xs text-muted-foreground">
                {canRenameSlug
                  ? 'Changes the project directory and URL. Lowercase letters, digits, and hyphens.'
                  : 'Slug is locked once the build loop starts — git history and deploys key on it.'}
              </p>
            </section>

            {error && <p className="mt-3 text-xs text-red-700">{error}</p>}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeMenu}
                disabled={saving}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || !canRenameSlug || !draft.trim() || draft.trim() === slug}
                className="inline-flex items-center rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
