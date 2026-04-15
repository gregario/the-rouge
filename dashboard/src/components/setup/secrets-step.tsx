'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Check, Loader2, Save, ShieldCheck, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ValidationResult {
  key: string
  status: 'valid' | 'invalid' | 'error'
  message?: string
}

type IntegrationMap = Record<string, Record<string, boolean>>

// Keep Slack out — it lives in its own step (Phase 4 wizard).
const CORE_INTEGRATIONS = ['stripe', 'supabase', 'sentry', 'cloudflare', 'vercel']

const INTEGRATION_BLURBS: Record<string, string> = {
  stripe: 'Payments. Needed if a Rouge-built product takes money.',
  supabase: 'Postgres + auth. Default database for most builds.',
  sentry: 'Error tracking for deployed products.',
  cloudflare: 'DNS and edge. Optional — for custom domains.',
  vercel: 'Deployment target. Needed for Vercel-hosted products.',
}

function ValidationSection({
  integration, results, validating, onValidate, storedCount,
}: {
  integration: string
  results?: ValidationResult[]
  validating: boolean
  onValidate: () => void
  storedCount: number
}) {
  if (storedCount === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs">
      <Button size="sm" variant="outline" onClick={onValidate} disabled={validating}>
        {validating ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
        <span className="ml-1.5">{validating ? 'Checking' : 'Validate live'}</span>
      </Button>
      {results && results.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {results.map((r) => (
            <span key={r.key} className={cn(
              'flex items-center gap-1',
              r.status === 'valid' && 'text-green-700',
              r.status === 'invalid' && 'text-red-700',
              r.status === 'error' && 'text-amber-700',
            )}>
              {r.status === 'valid' ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
              <code className="font-mono">{r.key}</code>
              {r.message && <span className="text-muted-foreground">— {r.message}</span>}
            </span>
          ))}
        </div>
      )}
      {!results && (
        <span className="text-muted-foreground">
          Checks {integration} keys against the live API.
        </span>
      )}
    </div>
  )
}

export function SecretsStep({ onReady }: { onReady: (ready: boolean) => void }) {
  const [integrations, setIntegrations] = useState<IntegrationMap>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [savedBanner, setSavedBanner] = useState<string | null>(null)
  const [validating, setValidating] = useState<string | null>(null)
  const [validationByIntegration, setValidationByIntegration] = useState<Record<string, ValidationResult[]>>({})

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/system/secrets')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setIntegrations(data.integrations ?? {})
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // Secrets are optional for continuing — mark ready immediately.
    onReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save(integration: string, key: string) {
    const value = drafts[`${integration}.${key}`]
    if (!value) return
    setSaving(`${integration}.${key}`)
    try {
      const res = await fetch('/api/system/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integration, key, value }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setDrafts((d) => ({ ...d, [`${integration}.${key}`]: '' }))
      setSavedBanner(`${integration} · ${key} saved`)
      setTimeout(() => setSavedBanner(null), 2500)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(null)
    }
  }

  async function validate(integration: string) {
    setValidating(integration)
    try {
      const res = await fetch('/api/system/secrets/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integration }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json()
      setValidationByIntegration((v) => ({ ...v, [integration]: body.results ?? [] }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setValidating(null)
    }
  }

  async function remove(integration: string, key: string) {
    setSaving(`${integration}.${key}`)
    try {
      const params = new URLSearchParams({ integration, key })
      const res = await fetch(`/api/system/secrets?${params}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Integrations</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Optional. Store API keys for the integrations Rouge can wire into products.
          Values go to your OS keychain under the <code className="rounded bg-muted px-1">rouge-*</code> prefix —
          your personal keychain entries are not touched. You can add these later.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <strong>Error:</strong> {error}
        </div>
      )}

      {savedBanner && (
        <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          <Check className="inline h-4 w-4 mr-1" />
          {savedBanner}
        </div>
      )}

      {loading && Object.keys(integrations).length === 0 && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading integrations…
        </div>
      )}

      <div className="space-y-3">
        {CORE_INTEGRATIONS.map((integration) => {
          const keys = integrations[integration]
          if (!keys) return null
          const storedCount = Object.values(keys).filter(Boolean).length
          const totalCount = Object.keys(keys).length
          return (
            <details
              key={integration}
              className="group rounded-lg border border-border bg-card open:shadow-sm"
              open={storedCount > 0 && storedCount < totalCount}
            >
              <summary className="flex cursor-pointer items-center justify-between gap-3 p-4 list-none">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium capitalize text-foreground">{integration}</span>
                    <span className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      storedCount === totalCount && 'bg-green-100 text-green-800',
                      storedCount > 0 && storedCount < totalCount && 'bg-amber-100 text-amber-800',
                      storedCount === 0 && 'bg-muted text-muted-foreground',
                    )}>
                      {storedCount}/{totalCount} stored
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {INTEGRATION_BLURBS[integration]}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground group-open:rotate-90 transition-transform">▶</span>
              </summary>

              <div className="border-t border-border p-4 space-y-3">
                <ValidationSection
                  integration={integration}
                  results={validationByIntegration[integration]}
                  validating={validating === integration}
                  onValidate={() => validate(integration)}
                  storedCount={storedCount}
                />
                {Object.entries(keys).map(([key, stored]) => {
                  const draftKey = `${integration}.${key}`
                  const isSaving = saving === draftKey
                  return (
                    <div key={key} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-sm font-medium font-mono text-foreground">{key}</label>
                        {stored && (
                          <span className="flex items-center gap-1 text-xs text-green-700">
                            <Check className="h-3 w-3" /> stored
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="password"
                          autoComplete="off"
                          placeholder={stored ? '(value stored — paste new to replace)' : 'paste value'}
                          value={drafts[draftKey] ?? ''}
                          onChange={(e) => setDrafts((d) => ({ ...d, [draftKey]: e.target.value }))}
                          className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        <Button
                          size="sm"
                          onClick={() => save(integration, key)}
                          disabled={!drafts[draftKey] || isSaving}
                        >
                          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        </Button>
                        {stored && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => remove(integration, key)}
                            disabled={isSaving}
                            title="Delete stored value"
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </details>
          )
        })}
      </div>
    </div>
  )
}
