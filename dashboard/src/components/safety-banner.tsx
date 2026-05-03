/**
 * Persistent safety banner — top of every dashboard page.
 *
 * Surfaces three things that should be visible at every entry into the
 * Rouge surface, not just buried in the README:
 *
 *   1. Rouge runs `claude -p --dangerously-skip-permissions`. Full
 *      filesystem access. No sandbox.
 *   2. Real cloud resources, real API credits. Misconfiguration can
 *      cost thousands of dollars.
 *   3. The mitigation: set a budget cap before any real build, run on
 *      a dedicated machine.
 *
 * The banner is dismissable per-browser-session via localStorage. The
 * intent is "you've seen it; you understand the surface." Killing it
 * permanently is intentional friction-free for users who already know,
 * and visible by default for anyone hitting the dashboard fresh.
 *
 * Server-rendered as visible by default; client-side hydration reads
 * localStorage and may hide it. This avoids a flash-of-banner for
 * returning users while still showing the banner pre-hydration to
 * anyone who'd dismissed it (they see it once more if they clear
 * localStorage). The trade-off is acceptable; the cost of NOT showing
 * the banner is much higher than the cost of showing it occasionally
 * to someone who's already dismissed it.
 */

'use client'

import { useEffect, useState } from 'react'

const DISMISS_KEY = 'rouge.safety-banner.dismissed'

export function SafetyBanner() {
  const [dismissed, setDismissed] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === '1') {
        setDismissed(true)
      }
    } catch {
      /* localStorage unavailable — show the banner */
    }
  }, [])

  function dismiss() {
    setDismissed(true)
    try {
      window.localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* localStorage unavailable — banner will reappear next render */
    }
  }

  // Pre-hydration: render visible (server output) so the banner is
  // present before JS executes. Post-hydration: respect localStorage.
  if (hydrated && dismissed) return null

  return (
    <div
      role="alert"
      className="border-b border-red-300 bg-red-50 text-red-900"
    >
      <div className="mx-auto flex max-w-screen-2xl items-start gap-3 px-4 py-3 text-sm">
        <span aria-hidden className="mt-0.5 text-base leading-none">⚠️</span>
        <div className="flex-1">
          <p className="font-semibold">
            Rouge runs Claude Code with{' '}
            <code className="rounded bg-red-100 px-1 py-0.5 font-mono text-xs">
              --dangerously-skip-permissions
            </code>
            . Misconfiguration can cost thousands of dollars.
          </p>
          <p className="mt-1 text-red-800">
            Full filesystem access, real cloud resources, real API credits, no
            sandbox. Set <code className="font-mono text-xs">budget_cap_usd</code>{' '}
            in <code className="font-mono text-xs">rouge.config.json</code>{' '}
            before any real build, run on a dedicated machine, and keep your
            work committed.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss safety banner"
          className="ml-2 shrink-0 rounded border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
        >
          Got it — dismiss
        </button>
      </div>
    </div>
  )
}
