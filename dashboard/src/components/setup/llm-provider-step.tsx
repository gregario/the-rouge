'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Check, ChevronDown, Loader2, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Help } from '@/components/ui/help'
import { cn } from '@/lib/utils'

type Provider = 'subscription' | 'api' | 'bedrock' | 'vertex'

const PROVIDER_LABEL: Record<Provider, string> = {
  subscription: 'Claude Code subscription',
  api: 'Anthropic API key',
  bedrock: 'AWS Bedrock',
  vertex: 'Google Vertex AI',
}

const PROVIDER_BLURB: Record<Provider, string> = {
  subscription: 'Uses your Claude Pro/Max plan via `claude login`. Cheapest for typical usage. Rate-limited on a 5-hour + weekly window — configure a fallback below if that matters to you.',
  api: 'Billed per token to your Anthropic API account. No rate-limit pauses, but cost scales with build size. Good as a fallback when the subscription window hits.',
  bedrock: 'Anthropic models via your AWS account. Only needed if your org requires cloud-provider routing.',
  vertex: 'Anthropic models via your GCP account. Only needed if your org requires cloud-provider routing.',
}

// Keys mirror INTEGRATION_KEYS.llm in src/launcher/secrets.js.
const FIELDS_BY_PROVIDER: Record<Provider, string[]> = {
  subscription: [],
  api: ['ANTHROPIC_API_KEY'],
  bedrock: ['AWS_BEDROCK_ACCESS_KEY_ID', 'AWS_BEDROCK_SECRET_ACCESS_KEY', 'AWS_BEDROCK_REGION'],
  vertex: ['GCP_VERTEX_PROJECT', 'GCP_VERTEX_REGION', 'GCP_VERTEX_ADC'],
}

const FIELD_HINT: Record<string, string> = {
  ANTHROPIC_API_KEY: 'sk-ant-…',
  AWS_BEDROCK_ACCESS_KEY_ID: 'AKIA… (or a separate IAM user for Rouge)',
  AWS_BEDROCK_SECRET_ACCESS_KEY: 'paste value',
  AWS_BEDROCK_REGION: 'us-west-2',
  GCP_VERTEX_PROJECT: 'my-gcp-project-id',
  GCP_VERTEX_REGION: 'us-central1',
  GCP_VERTEX_ADC: '/absolute/path/to/application_default_credentials.json',
}

// Plain-text fields (paths, regions, project ids) shouldn't be masked.
const PLAINTEXT_FIELDS = new Set([
  'AWS_BEDROCK_REGION',
  'GCP_VERTEX_PROJECT',
  'GCP_VERTEX_REGION',
  'GCP_VERTEX_ADC',
])

export function LlmProviderStep({ onReady }: { onReady: (ready: boolean) => void }) {
  const [stored, setStored] = useState<Record<string, boolean>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  // Track saving at the field level (for delete) AND the provider level
  // (for the section Save button). Separate so the Save button spinner
  // doesn't compete with the trash icon spinner on the same row.
  const [saving, setSaving] = useState<string | null>(null)
  const [savingProvider, setSavingProvider] = useState<Provider | null>(null)
  const [savedBanner, setSavedBanner] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch('/api/system/secrets')
      const data = await res.json()
      setStored(data.integrations?.llm ?? {})
    } catch { /* non-fatal */ }
  }

  useEffect(() => {
    // Step is always optional — subscription is the default and needs no
    // creds pasted here. Mark ready immediately.
    onReady(true)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function saveProvider(provider: Provider) {
    const fields = FIELDS_BY_PROVIDER[provider]
    const pending = fields.filter((k) => drafts[k])
    if (pending.length === 0) return
    setSavingProvider(provider)
    setError(null)
    try {
      const results = await Promise.all(pending.map((key) =>
        fetch('/api/system/secrets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ integration: 'llm', key, value: drafts[key] }),
        }),
      ))
      const failed = results.filter((r) => !r.ok)
      if (failed.length > 0) {
        // Best-effort error body from the first failure.
        const body = await failed[0].json().catch(() => ({}))
        throw new Error(body.error ?? `${failed.length}/${pending.length} saves failed`)
      }
      setDrafts((d) => {
        const next = { ...d }
        for (const k of pending) delete next[k]
        return next
      })
      setSavedBanner(`Saved ${pending.length} ${PROVIDER_LABEL[provider]} credential${pending.length > 1 ? 's' : ''}.`)
      setTimeout(() => setSavedBanner(null), 3000)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingProvider(null)
    }
  }

  async function remove(key: string) {
    setSaving(key)
    setError(null)
    try {
      const params = new URLSearchParams({ integration: 'llm', key })
      const res = await fetch(`/api/system/secrets?${params}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(null)
    }
  }

  function providerStatus(p: Provider): { label: string; tone: 'green' | 'amber' | 'muted' } {
    if (p === 'subscription') {
      return { label: 'via claude login', tone: 'muted' }
    }
    const fields = FIELDS_BY_PROVIDER[p]
    const storedCount = fields.filter((k) => stored[k]).length
    if (storedCount === 0) return { label: 'not configured', tone: 'muted' }
    if (storedCount === fields.length) return { label: `${storedCount}/${fields.length} stored`, tone: 'green' }
    return { label: `${storedCount}/${fields.length} stored`, tone: 'amber' }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">LLM provider</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Which Anthropic auth path Rouge uses when it spawns Claude Code. Configure
          any providers you want available — you can mix them (subscription by default,
          API as a rate-limit fallback). The active provider is picked per project on
          the project page.
        </p>
        <Help className="mt-2">
          <p><strong>Which should I configure?</strong> If you have a Claude Pro or Max plan, subscription alone is enough for most work. Add an API key too if you routinely hit the 5-hour rate limit and don&apos;t want to wait — Rouge can switch to API per-project when that happens.</p>
          <p><strong>Bedrock / Vertex:</strong> only if your org requires AWS or GCP routing.</p>
          <p><strong>Safety:</strong> credentials go to your OS keychain under the <code>rouge-llm</code> prefix, like every other Rouge secret.</p>
        </Help>
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <strong>Error:</strong> {error}
        </div>
      )}

      {savedBanner && (
        <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          <Check className="inline h-4 w-4 mr-1" /> {savedBanner}
        </div>
      )}

      <div className="space-y-3">
        {(Object.keys(PROVIDER_LABEL) as Provider[]).map((p) => {
          const fields = FIELDS_BY_PROVIDER[p]
          const status = providerStatus(p)
          const storedCount = fields.filter((k) => stored[k]).length
          // Open a section if some but not all fields are stored (prompts completion).
          const defaultOpen = fields.length > 0 && storedCount > 0 && storedCount < fields.length
          return (
            <details
              key={p}
              className="group rounded-lg border border-border bg-card open:shadow-sm"
              open={defaultOpen}
            >
              <summary className="flex cursor-pointer items-center justify-between gap-3 p-4 list-none">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{PROVIDER_LABEL[p]}</span>
                    {p === 'subscription' && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">default</span>
                    )}
                    <span className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      status.tone === 'green' && 'bg-green-100 text-green-800',
                      status.tone === 'amber' && 'bg-amber-100 text-amber-800',
                      status.tone === 'muted' && 'bg-muted text-muted-foreground',
                    )}>
                      {status.label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{PROVIDER_BLURB[p]}</p>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />

              </summary>

              <div className="border-t border-border p-4 space-y-3">
                {fields.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nothing to paste. Run <code className="rounded bg-muted px-1">claude login</code> in your terminal
                    if you haven&apos;t already — the Prerequisites step catches that.
                  </p>
                ) : (
                  <form
                    onSubmit={(e) => { e.preventDefault(); saveProvider(p) }}
                    className="space-y-3"
                  >
                    {fields.map((key) => {
                      const isStored = stored[key]
                      const isDeleting = saving === key
                      const isPlain = PLAINTEXT_FIELDS.has(key)
                      return (
                        <div key={key} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium font-mono text-foreground">{key}</label>
                            {isStored && (
                              <span className="flex items-center gap-1 text-xs text-green-700">
                                <Check className="h-3 w-3" /> stored
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type={isPlain ? 'text' : 'password'}
                              autoComplete="off"
                              placeholder={isStored ? '(stored — paste new to replace)' : FIELD_HINT[key] ?? 'paste value'}
                              value={drafts[key] ?? ''}
                              onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                              className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                            {isStored && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => remove(key)}
                                disabled={isDeleting || savingProvider === p}
                                title="Delete stored value"
                              >
                                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-red-600" />}
                              </Button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    <div className="flex items-center justify-between pt-1">
                      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                        Live validation arrives in a follow-up. Auth errors surface at build start.
                      </p>
                      <Button
                        type="submit"
                        size="sm"
                        disabled={savingProvider === p || fields.every((k) => !drafts[k])}
                      >
                        {savingProvider === p ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        <span className="ml-2">Save credentials</span>
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </details>
          )
        })}
      </div>
    </div>
  )
}
