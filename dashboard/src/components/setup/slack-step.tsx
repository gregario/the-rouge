'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, Loader2, Save, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Help } from '@/components/ui/help'
import { cn } from '@/lib/utils'

type ValidationState = 'idle' | 'checking' | 'ok' | 'error'

// Slack's "create app from manifest" deep link. The Slack UI accepts the
// manifest as a query param but it's huge — we just deep-link the creator
// and tell the user to paste.
const SLACK_CREATE_URL = 'https://api.slack.com/apps?new_app=1'

export function SlackStep({ onReady }: { onReady: (ready: boolean) => void }) {
  const [manifest, setManifest] = useState<string>('')
  const [manifestCopied, setManifestCopied] = useState(false)
  const [botToken, setBotToken] = useState('')
  const [appToken, setAppToken] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [botState, setBotState] = useState<{ s: ValidationState; msg?: string }>({ s: 'idle' })
  const [appState, setAppState] = useState<{ s: ValidationState; msg?: string }>({ s: 'idle' })
  const [webhookState, setWebhookState] = useState<{ s: ValidationState; msg?: string }>({ s: 'idle' })
  const [saving, setSaving] = useState(false)
  const [savedBanner, setSavedBanner] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Slack is optional — mark step ready immediately.
    onReady(true)
    fetch('/api/system/slack/manifest')
      .then((r) => r.json())
      .then((d) => setManifest(d.yaml ?? ''))
      .catch(() => { /* non-fatal */ })
    // Preload already-stored state from /api/system/secrets so returning
    // users see green ticks without re-pasting.
    fetch('/api/system/secrets')
      .then((r) => r.json())
      .then((d) => {
        const slack = d.integrations?.slack ?? {}
        if (slack.SLACK_BOT_TOKEN) setBotState({ s: 'ok', msg: 'Stored (paste new to replace)' })
        if (slack.SLACK_APP_TOKEN) setAppState({ s: 'ok', msg: 'Stored' })
        if (slack.ROUGE_SLACK_WEBHOOK) setWebhookState({ s: 'ok', msg: 'Stored' })
      })
      .catch(() => { /* non-fatal */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function copyManifest() {
    try {
      await navigator.clipboard.writeText(manifest)
      setManifestCopied(true)
      setTimeout(() => setManifestCopied(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function validateBot() {
    if (!botToken) return
    setBotState({ s: 'checking' })
    try {
      const res = await fetch('/api/system/slack/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken }),
      })
      const body = await res.json()
      if (body.bot?.ok) {
        setBotState({ s: 'ok', msg: `Connected to ${body.bot.team} as ${body.bot.user}` })
      } else {
        setBotState({ s: 'error', msg: body.bot?.error ?? 'auth.test failed' })
      }
    } catch (err) {
      setBotState({ s: 'error', msg: err instanceof Error ? err.message : String(err) })
    }
  }

  async function validateApp() {
    if (!appToken) return
    setAppState({ s: 'checking' })
    try {
      const res = await fetch('/api/system/slack/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appToken }),
      })
      const body = await res.json()
      if (body.app?.ok) {
        setAppState({ s: 'ok', msg: 'Format looks right (no live check for app tokens)' })
      } else {
        setAppState({ s: 'error', msg: body.app?.error ?? 'Invalid' })
      }
    } catch (err) {
      setAppState({ s: 'error', msg: err instanceof Error ? err.message : String(err) })
    }
  }

  async function testWebhook() {
    if (!webhookUrl) return
    setWebhookState({ s: 'checking' })
    try {
      const res = await fetch('/api/system/slack/test-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl }),
      })
      const body = await res.json()
      if (body.ok) {
        setWebhookState({ s: 'ok', msg: 'Test message sent — check your Slack channel.' })
      } else {
        setWebhookState({ s: 'error', msg: body.error ?? 'Webhook call failed' })
      }
    } catch (err) {
      setWebhookState({ s: 'error', msg: err instanceof Error ? err.message : String(err) })
    }
  }

  async function saveAll() {
    setSaving(true)
    setError(null)
    const writes: Array<Promise<Response>> = []
    if (botToken) {
      writes.push(fetch('/api/system/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integration: 'slack', key: 'SLACK_BOT_TOKEN', value: botToken }),
      }))
    }
    if (appToken) {
      writes.push(fetch('/api/system/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integration: 'slack', key: 'SLACK_APP_TOKEN', value: appToken }),
      }))
    }
    if (webhookUrl) {
      writes.push(fetch('/api/system/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integration: 'slack', key: 'ROUGE_SLACK_WEBHOOK', value: webhookUrl }),
      }))
    }
    try {
      const results = await Promise.all(writes)
      const failed = results.filter((r) => !r.ok)
      if (failed.length > 0) throw new Error(`${failed.length} save(s) failed`)
      setBotToken('')
      setAppToken('')
      setWebhookUrl('')
      setSavedBanner(`Saved ${writes.length} Slack credential${writes.length > 1 ? 's' : ''}`)
      setTimeout(() => setSavedBanner(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Slack (optional)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Wire up Slack for build notifications and lightweight remote commands.
          The dashboard is your primary control surface — Slack is secondary.
          Skip this step if you&apos;re not using Slack.
        </p>
        <Help className="mt-2">
          <p><strong>Bot token vs App token vs Webhook — what are they?</strong></p>
          <p><strong>Bot token</strong> (<code>xoxb-…</code>): identifies your bot when it posts or reads messages. Required.</p>
          <p><strong>App token</strong> (<code>xapp-…</code>): enables Socket Mode, which lets the bot receive events over a websocket instead of a public webhook URL. Required — Rouge uses Socket Mode so you don&apos;t need to expose a public URL.</p>
          <p><strong>Webhook</strong> (<code>https://hooks.slack.com/…</code>): one-way channel for Rouge to post build notifications. Optional but recommended — it works without the bot being running.</p>
          <p><strong>Full docs:</strong> see <a href="/docs/how-to/slack-setup" className="underline">how-to/slack-setup</a> for the manual version.</p>
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

      {/* Step 1: create the app */}
      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground">1. Create the Slack app</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Open Slack&apos;s app creator, choose <strong>From a manifest</strong>, pick a workspace, paste the YAML.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={copyManifest} disabled={!manifest}>
            {manifestCopied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            <span className="ml-2">{manifestCopied ? 'Copied' : 'Copy manifest YAML'}</span>
          </Button>
          <a
            href={SLACK_CREATE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            <span className="ml-2">Open Slack app creator</span>
          </a>
        </div>
      </section>

      {/* Step 2: bot token */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-2">
        <h3 className="text-sm font-semibold text-foreground">2. Bot token</h3>
        <p className="text-xs text-muted-foreground">
          In your Slack app: <strong>OAuth &amp; Permissions</strong> → <em>Install to Workspace</em> → copy the <code className="rounded bg-muted px-1">xoxb-…</code> token.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="password" autoComplete="off" placeholder="xoxb-…"
            value={botToken} onChange={(e) => { setBotToken(e.target.value); setBotState({ s: 'idle' }) }}
            className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button size="sm" variant="outline" onClick={validateBot} disabled={!botToken || botState.s === 'checking'}>
            {botState.s === 'checking' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Validate'}
          </Button>
        </div>
        <ValidationRow state={botState} />
      </section>

      {/* Step 3: app token */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-2">
        <h3 className="text-sm font-semibold text-foreground">3. App token (Socket Mode)</h3>
        <p className="text-xs text-muted-foreground">
          <strong>Basic Information</strong> → <em>App-Level Tokens</em> → <em>Generate Token and Scopes</em> → add <code className="rounded bg-muted px-1">connections:write</code> → copy the <code className="rounded bg-muted px-1">xapp-…</code> token.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="password" autoComplete="off" placeholder="xapp-…"
            value={appToken} onChange={(e) => { setAppToken(e.target.value); setAppState({ s: 'idle' }) }}
            className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button size="sm" variant="outline" onClick={validateApp} disabled={!appToken || appState.s === 'checking'}>
            {appState.s === 'checking' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check'}
          </Button>
        </div>
        <ValidationRow state={appState} />
      </section>

      {/* Step 4: webhook */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-2">
        <h3 className="text-sm font-semibold text-foreground">4. Incoming webhook</h3>
        <p className="text-xs text-muted-foreground">
          <strong>Incoming Webhooks</strong> → enable → <em>Add New Webhook to Workspace</em> → pick a channel → copy the URL.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="url" autoComplete="off" placeholder="https://hooks.slack.com/services/…"
            value={webhookUrl} onChange={(e) => { setWebhookUrl(e.target.value); setWebhookState({ s: 'idle' }) }}
            className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button size="sm" variant="outline" onClick={testWebhook} disabled={!webhookUrl || webhookState.s === 'checking'}>
            {webhookState.s === 'checking' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test'}
          </Button>
        </div>
        <ValidationRow state={webhookState} />
      </section>

      {/* Save */}
      <div className="flex items-center justify-end pt-2">
        <Button onClick={saveAll} disabled={saving || (!botToken && !appToken && !webhookUrl)}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span className="ml-2">Save Slack credentials</span>
        </Button>
      </div>
    </div>
  )
}

function ValidationRow({ state }: { state: { s: ValidationState; msg?: string } }) {
  if (state.s === 'idle' || !state.msg) return null
  return (
    <div className={cn(
      'flex items-start gap-2 text-xs',
      state.s === 'ok' && 'text-green-700',
      state.s === 'error' && 'text-red-700',
      state.s === 'checking' && 'text-muted-foreground',
    )}>
      {state.s === 'ok' && <Check className="h-3 w-3 mt-0.5 shrink-0" />}
      {state.s === 'error' && <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />}
      <span>{state.msg}</span>
    </div>
  )
}
