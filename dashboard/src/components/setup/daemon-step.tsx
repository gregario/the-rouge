'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, Power, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface DaemonStatus {
  platform: 'macos' | 'linux' | 'windows' | 'unsupported'
  supported: boolean
  installed: boolean
  loaded?: boolean
  path?: string
}

export function DaemonStep({ onReady }: { onReady: (ready: boolean) => void }) {
  const [status, setStatus] = useState<DaemonStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/system/daemon')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setStatus(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    onReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function install() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/system/daemon', { method: 'POST' })
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body.reason ?? `HTTP ${res.status}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function uninstall() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/system/daemon', { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Background daemon</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Keep the Rouge dashboard running in the background so it's there when you need it.
          Install once and it auto-starts at login. Shut down anytime via the Power icon in the nav.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <strong>Error:</strong> {error}
        </div>
      )}

      {loading && !status && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking daemon status…
        </div>
      )}

      {status && !status.supported && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Background daemon isn&apos;t supported on <strong>{status.platform}</strong> yet (planned for Phase 2.5b).
          You can still run the dashboard manually with <code className="rounded bg-amber-100 px-1">rouge start</code>.
        </div>
      )}

      {status && status.supported && (
        <div className={cn(
          'rounded-lg border p-4',
          status.installed && status.loaded && 'border-green-300 bg-green-50',
          status.installed && !status.loaded && 'border-amber-300 bg-amber-50',
          !status.installed && 'border-border bg-card',
        )}>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              {status.installed && status.loaded && (
                <div className="flex items-center gap-2 text-green-800">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">Installed and loaded</span>
                </div>
              )}
              {status.installed && !status.loaded && (
                <div className="text-amber-900">
                  <span className="font-medium">Installed but not loaded</span>
                  <p className="mt-0.5 text-xs">Reinstall to reload.</p>
                </div>
              )}
              {!status.installed && (
                <div className="text-foreground">
                  <span className="font-medium">Not installed</span>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Dashboard won&apos;t auto-start at login. Start manually with <code className="rounded bg-muted px-1">rouge start</code>.
                  </p>
                </div>
              )}
              {status.path && (
                <p className="mt-2 text-xs text-muted-foreground font-mono break-all">{status.path}</p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              {!status.installed && (
                <Button onClick={install} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                  <span className="ml-2">Install daemon</span>
                </Button>
              )}
              {status.installed && (
                <>
                  <Button variant="outline" onClick={install} disabled={busy} title="Reload the launch agent">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                    <span className="ml-2">Reinstall</span>
                  </Button>
                  <Button variant="ghost" onClick={uninstall} disabled={busy} title="Remove the launch agent">
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
