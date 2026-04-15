'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function FinishStep({ onReady }: { onReady: (ready: boolean) => void }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Always "ready" — the whole point of this step is to finish.
  if (!busy) onReady(true)

  async function finish(skipped: boolean) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/system/setup-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skipped }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      // Go to the dashboard home (which will no longer redirect).
      router.push('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">You&apos;re ready</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Click <strong>Finish</strong> to go to the dashboard and create your first project.
          You can come back to this wizard anytime from the nav.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-start gap-4">
          <Rocket className="h-8 w-8 text-red-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-foreground">
              From here, the fastest path is the <strong>New Project</strong> button on the dashboard.
              It&apos;ll walk you through naming and seeding your first product.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Seeding usually takes 10–20 minutes of back-and-forth with Claude.
              You can leave it running and check back.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Button variant="ghost" onClick={() => finish(true)} disabled={busy}>
          Skip for now
        </Button>
        <Button onClick={() => finish(false)} disabled={busy} className="sm:w-auto">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
          <span className="ml-2">Finish & go to dashboard</span>
        </Button>
      </div>
    </div>
  )
}
