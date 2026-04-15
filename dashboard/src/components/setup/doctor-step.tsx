'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { DoctorResult, DoctorCheck } from '@/lib/doctor-types'

function StatusIcon({ status }: { status: DoctorCheck['status'] }) {
  if (status === 'ok') return <CheckCircle2 className="h-5 w-5 text-green-600" />
  if (status === 'blocker') return <XCircle className="h-5 w-5 text-red-600" />
  return <AlertTriangle className="h-5 w-5 text-amber-600" />
}

export function DoctorStep({ onReady }: { onReady: (ready: boolean) => void }) {
  const [result, setResult] = useState<DoctorResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/system/doctor')
      if (!res.ok) throw new Error(`Doctor failed: HTTP ${res.status}`)
      const data = (await res.json()) as DoctorResult
      setResult(data)
      onReady(data.allRequired)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      onReady(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Prerequisites</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Rouge needs a few tools on your system. Green is ready. Red blocks builds. Amber is optional.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={run}
          disabled={loading}
          className="shrink-0"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Re-run</span>
        </Button>
      </div>

      {loading && !result && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Running doctor checks…
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {result.checks.map((check) => (
              <li key={check.id} className="flex items-start gap-3 p-4">
                <StatusIcon status={check.status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-foreground">{check.label}</span>
                    <span className={cn(
                      'text-xs font-medium uppercase tracking-wide',
                      check.status === 'ok' && 'text-green-700',
                      check.status === 'blocker' && 'text-red-700',
                      check.status === 'warning' && 'text-amber-700',
                    )}>
                      {check.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{check.detail}</p>
                  {check.installHint && check.status !== 'ok' && (
                    <p className="mt-2 rounded bg-muted px-2 py-1 font-mono text-xs text-foreground">
                      {check.installHint}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <div className={cn(
            'rounded-md border p-4 text-sm',
            result.allGreen && 'border-green-300 bg-green-50 text-green-800',
            !result.allGreen && result.allRequired && 'border-amber-300 bg-amber-50 text-amber-900',
            !result.allRequired && 'border-red-300 bg-red-50 text-red-800',
          )}>
            {result.allGreen && 'All checks passed. You\'re ready to build.'}
            {!result.allGreen && result.allRequired && (
              <>All required checks passed. {result.warnings.length} optional warning{result.warnings.length > 1 ? 's' : ''} — you can continue.</>
            )}
            {!result.allRequired && (
              <>{result.blockers.length} blocker{result.blockers.length > 1 ? 's' : ''} must be fixed before Rouge can run. Install the missing tools, then click <strong>Re-run</strong>.</>
            )}
          </div>
        </>
      )}
    </div>
  )
}
