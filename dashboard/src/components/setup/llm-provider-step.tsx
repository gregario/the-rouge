'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Check, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Help } from '@/components/ui/help'
import { cn } from '@/lib/utils'

type Mode = 'subscription' | 'api' | 'bedrock' | 'vertex'

const MODE_LABEL: Record<Mode, string> = {
  subscription: 'Claude Code subscription',
  api: 'Anthropic API key',
  bedrock: 'AWS Bedrock',
  vertex: 'Google Vertex AI',
}

const MODE_BLURB: Record<Mode, string> = {
  subscription: 'Recommended. Uses your Claude Pro/Max plan via `claude login`. Cheapest for typical usage. Rate-limited on a 5-hour + weekly window.',
  api: 'Billed per token to your Anthropic API account. No rate-limit pauses, but cost scales with build size.',
  bedrock: 'Anthropic models served via your AWS account. Useful if your org requires cloud-provider routing.',
  vertex: 'Anthropic models served via your GCP account. Useful if your org requires cloud-provider routing.',
}

// Keys mirror INTEGRATION_KEYS.llm in src/launcher/secrets.js.
const FIELDS_BY_MODE: Record<Mode, string[]> = {
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

export function LlmProviderStep({ onReady }: { onReady: (ready: boolean) => void }) {
  const [mode, setMode] = useState<Mode>('subscription')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [stored, setStored] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [savedBanner, setSavedBanner] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadStored() {
    try {
      const res = await fetch('/api/system/secrets')
      const data = await res.json()
      setStored(data.integrations?.llm ?? {})
    } catch { /* non-fatal */ }
  }

  useEffect(() => {
    // Subscription is the default, and requires no in-wizard fields —
    // step is ready immediately. Only non-subscription modes with empty
    // creds need the user to fill something in, and that's enforced on
    // save, not on advance.
    onReady(true)
    loadStored()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save() {
    const fields = FIELDS_BY_MODE[mode]
    if (fields.length === 0) {
      // Subscription: nothing to save. Just confirm.
      setSavedBanner('Subscription mode selected. Run `claude login` in your terminal if you haven\'t already.')
      setTimeout(() => setSavedBanner(null), 4000)
      return
    }
    const toSave = fields.filter((k) => drafts[k])
    if (toSave.length === 0) {
      setError('Paste at least one value before saving.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const results = await Promise.all(toSave.map((key) =>
        fetch('/api/system/secrets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ integration: 'llm', key, value: drafts[key] }),
        }),
      ))
      const failed = results.filter((r) => !r.ok)
      if (failed.length > 0) throw new Error(`${failed.length} save(s) failed`)
      setDrafts({})
      setSavedBanner(`Saved ${toSave.length} ${MODE_LABEL[mode]} credential${toSave.length > 1 ? 's' : ''}.`)
      setTimeout(() => setSavedBanner(null), 3000)
      await loadStored()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const fields = FIELDS_BY_MODE[mode]

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">LLM provider</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Which Anthropic auth Rouge should use when it spawns Claude Code. The default (subscription) works for most users.
          You can switch per-project later from the project page.
        </p>
        <Help className="mt-2">
          <p><strong>Subscription vs API — which should I pick?</strong> If you already pay for Claude Pro or Max, stay on subscription: it&apos;s flat-rate and cheapest for typical builds. Pick API if you don&apos;t have a subscription, or if you routinely hit the 5-hour / weekly rate limit and don&apos;t want to wait.</p>
          <p><strong>Bedrock / Vertex:</strong> only if your org requires AWS or GCP routing. Otherwise skip — direct API is simpler.</p>
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

      <div className="space-y-2">
        {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
          <label
            key={m}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
              mode === m ? 'border-foreground bg-accent/40' : 'border-border hover:bg-accent/20',
            )}
          >
            <input
              type="radio"
              name="llm-provider"
              checked={mode === m}
              onChange={() => { setMode(m); setError(null) }}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">{MODE_LABEL[m]}</span>
                {m === 'subscription' && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">default</span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{MODE_BLURB[m]}</p>
            </div>
          </label>
        ))}
      </div>

      {fields.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Nothing to configure here. Run <code className="rounded bg-muted px-1">claude login</code> in your terminal
          if you haven&apos;t already — prerequisites step catches that.
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">{MODE_LABEL[mode]} credentials</h3>
          {fields.map((key) => {
            const isStored = stored[key]
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
                <input
                  type={key === 'AWS_BEDROCK_REGION' || key === 'GCP_VERTEX_REGION' || key === 'GCP_VERTEX_PROJECT' || key === 'GCP_VERTEX_ADC' ? 'text' : 'password'}
                  autoComplete="off"
                  placeholder={isStored ? `(stored — paste new to replace)` : FIELD_HINT[key] ?? 'paste value'}
                  value={drafts[key] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )
          })}
          <div className="flex items-center justify-end pt-1">
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span className="ml-2">Save</span>
            </Button>
          </div>
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            Live validation of these credentials will arrive in a follow-up. For now, Rouge surfaces auth errors when a build starts.
          </p>
        </div>
      )}
    </div>
  )
}
