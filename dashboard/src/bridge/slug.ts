import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Project-slug helpers.
 *
 * A project's slug is the URL-safe directory name under `projects/<slug>`.
 * Brand-new projects get a placeholder slug (`untitled-<base36-ts>`) so the
 * user can start chatting before naming. Once they name the product, the
 * slug should follow — otherwise the "Rename Project URL" UI surfaces the
 * placeholder and the display name appears to vanish (#135, #137).
 */

const PLACEHOLDER_PREFIX = 'untitled-'

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

export function isPlaceholderSlug(slug: string): boolean {
  return slug === 'untitled' || slug.startsWith(PLACEHOLDER_PREFIX)
}

/**
 * Returns the desired slug, or `<desired>-2`, `<desired>-3`, ... if earlier
 * names are already taken. Returns null if even 100 variants collide
 * (defensive — should never happen in practice).
 */
export function uniqueSlug(
  desired: string,
  projectsRoot: string,
  reservedSelf?: string,
): string | null {
  const isFree = (candidate: string) =>
    candidate === reservedSelf || !existsSync(join(projectsRoot, candidate))

  if (isFree(desired)) return desired
  for (let i = 2; i < 100; i++) {
    const candidate = `${desired}-${i}`
    if (isFree(candidate)) return candidate
  }
  return null
}
