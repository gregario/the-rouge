'use client'

import type { Escalation, ProjectState } from '@/lib/types'
import { useState, useCallback, useEffect } from 'react'
import { isBridgeEnabled, sendCommand, fetchBuildStatus } from '@/lib/bridge-client'
import { Button } from '@/components/ui/button'
import { EscalationDrawer } from '@/components/escalation-drawer'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { AlertTriangle, ExternalLink, Loader2, Play, Rocket, SkipForward, Square } from 'lucide-react'

interface ActionBarProps {
  state: ProjectState
  slug?: string
  productionUrl?: string
  escalation?: Escalation
}

export function ActionBar({ state, slug, productionUrl, escalation }: ActionBarProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const [buildRunning, setBuildRunning] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'start' | 'stop' | null>(null)
  const [buildStartedAt, setBuildStartedAt] = useState<string | null>(null)
  const [commandError, setCommandError] = useState<string | null>(null)
  const [commandNotice, setCommandNotice] = useState<string | null>(null)

  // Poll build status every 5s so the button reflects subprocess state
  // even before the Rouge loop has written its first checkpoint.
  useEffect(() => {
    if (!slug || !isBridgeEnabled()) return
    let cancelled = false
    const check = async () => {
      try {
        const status = await fetchBuildStatus(slug)
        if (!cancelled) {
          setBuildRunning(status.running)
          setBuildStartedAt(status.startedAt ?? null)
        }
      } catch {
        // Silent — status poll is best-effort
      }
    }
    check()
    const interval = setInterval(check, 5000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [slug])

  const runCommand = useCallback(async (command: string) => {
    if (!slug || !isBridgeEnabled()) return
    setLoading(command)
    setCommandError(null)
    setCommandNotice(null)
    try {
      const result = await sendCommand(slug, command)
      // Idempotent stop: surface a brief notice so the user sees the
      // action had a useful effect even though nothing was running.
      if (command === 'stop' && result?.alreadyStopped) {
        if (result.stateRolledBack) {
          setCommandNotice('Build was not running. Cleared stale state — project is back to Ready.')
        } else {
          setCommandNotice('Build was already stopped.')
        }
      }
      // Refresh build status after start/stop
      if (command === 'start' || command === 'stop') {
        try {
          const status = await fetchBuildStatus(slug)
          setBuildRunning(status.running)
          setBuildStartedAt(status.startedAt ?? null)
        } catch {}
      }
    } catch (err) {
      // Caught errors used to go through console.error, which Next.js's
      // dev-mode overlay hooks. Show them inline next to the button
      // instead — same information reaches the user without the red box.
      const msg = err instanceof Error ? err.message : String(err)
      setCommandError(`${command} failed: ${msg}`)
    } finally {
      setLoading(null)
    }
  }, [slug])

  // Start/Stop go through confirmation; other commands run immediately.
  const execCommand = useCallback(async (command: string) => {
    if (command === 'start' || command === 'stop') {
      setConfirmAction(command)
      return
    }
    await runCommand(command)
  }, [runCommand])

  // Complete projects don't show the action bar (or just a production link)
  if (state === 'complete') {
    if (!productionUrl) return null
    return (
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-end px-4 py-2 sm:px-6 lg:px-8">
          <a
            href={productionUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm" className="gap-1.5">
              <ExternalLink className="size-3.5" />
              View in Production
            </Button>
          </a>
        </div>
      </div>
    )
  }

  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white/95 backdrop-blur-sm"
        data-testid="action-bar"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2 sm:px-6 lg:px-8">
          <span className="text-xs text-muted-foreground">
            {stateHint(state, buildRunning)}
          </span>
          <div className="flex items-center gap-3">
            {commandError && (
              <span
                className="text-xs text-red-700"
                data-testid="action-bar-error"
              >
                {commandError}
              </span>
            )}
            {commandNotice && !commandError && (
              <span
                className="text-xs text-muted-foreground"
                data-testid="action-bar-notice"
              >
                {commandNotice}
              </span>
            )}
            {(state === 'escalation' || state === 'waiting-for-human') && escalation && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-amber-400 text-amber-700 hover:bg-amber-50"
                onClick={() => setDrawerOpen(true)}
                data-testid="open-escalation-button"
              >
                <AlertTriangle className="size-3.5" />
                Respond to Escalation
              </Button>
            )}
            {renderActions(state, execCommand, loading, buildRunning)}
          </div>
        </div>
      </div>

      {escalation && (
        <EscalationDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          escalation={escalation}
          projectState={state}
          slug={slug}
        />
      )}

      <ConfirmDialog
        open={confirmAction === 'start'}
        title="Start building?"
        description={
          <>
            <p>Rouge will run the autonomous build loop:</p>
            <ul className="mt-2 space-y-1 list-disc pl-5">
              <li>Foundation phase first (schema, auth, deploy setup)</li>
              <li>Then milestone-by-milestone story execution</li>
              <li>Budget cap: <strong>$50</strong> (set in rouge.config.json)</li>
              <li>Max runtime: 60 minutes per phase</li>
              <li>You can Stop at any time</li>
            </ul>
          </>
        }
        confirmLabel="Start Build"
        onConfirm={() => {
          setConfirmAction(null)
          runCommand('start')
        }}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        open={confirmAction === 'stop'}
        title="Stop the build loop?"
        description={
          <>
            <p>
              Currently running: <strong>{state}</strong>
              {buildStartedAt && ` · started ${formatElapsed(buildStartedAt)} ago`}
            </p>
            <p className="mt-2">
              Stopping sends <strong>SIGINT</strong> (graceful). The current Claude
              session will be terminated. Checkpoints and committed code are
              preserved.
            </p>
            <p className="mt-2 text-xs text-gray-500">
              If SIGINT doesn&apos;t take effect in 5s, SIGKILL is sent.
            </p>
          </>
        }
        confirmLabel="Stop Build"
        variant="danger"
        onConfirm={() => {
          setConfirmAction(null)
          runCommand('stop')
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </>
  )
}

function formatElapsed(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'under a minute'
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'}`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}m`
}

function stateHint(state: ProjectState, buildRunning: boolean): string {
  switch (state) {
    case 'ready':
      return 'Project is specced and ready to build'
    case 'story-building':
    case 'milestone-check':
    case 'milestone-fix':
    case 'story-diagnosis':
    case 'foundation':
    case 'foundation-eval':
    case 'analyzing':
    case 'generating-change-spec':
    case 'vision-check':
    case 'shipping':
      // state.json says building, but no subprocess is polling as alive
      // → half-started session. The Stop button's idempotent path will
      // roll this back to Ready when clicked.
      return buildRunning
        ? 'Build in progress'
        : 'State says building but no process detected — press Stop to clean up'
    case 'waiting-for-human':
      return 'Waiting for your input'
    case 'escalation':
      return 'Blocked — needs human intervention'
    case 'final-review':
      return 'All milestones complete — ready to ship'
    default:
      return ''
  }
}

function renderActions(
  state: ProjectState,
  execCommand: (cmd: string) => Promise<void>,
  loading: string | null,
  buildRunning: boolean,
) {
  const isLoading = (cmd: string) => loading === cmd
  const icon = (cmd: string, Icon: typeof Rocket) =>
    isLoading(cmd) ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />

  // If a build subprocess is running, show Stop regardless of project state.
  // This catches the window between clicking Start and the first checkpoint write
  // (when state.current_state hasn't transitioned yet).
  if (buildRunning) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 border-red-300 text-red-700 hover:bg-red-50"
        onClick={() => execCommand('stop')}
        disabled={loading !== null}
      >
        {icon('stop', Square)}
        Stop Build
      </Button>
    )
  }

  switch (state) {
    case 'ready':
      return (
        <Button size="sm" className="gap-1.5" onClick={() => execCommand('start')} disabled={loading !== null}>
          {icon('start', Rocket)}
          Start Build
        </Button>
      )

    case 'story-building':
    case 'milestone-check':
    case 'milestone-fix':
    case 'story-diagnosis':
    case 'foundation':
    case 'foundation-eval':
    case 'analyzing':
    case 'generating-change-spec':
    case 'vision-check':
    case 'shipping':
      return (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 border-red-300 text-red-700 hover:bg-red-50"
          onClick={() => execCommand('stop')}
          disabled={loading !== null}
        >
          {icon('stop', Square)}
          Stop Build
        </Button>
      )

    case 'waiting-for-human':
    case 'escalation':
      return (
        <>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => execCommand('skip')} disabled={loading !== null}>
            {icon('skip', SkipForward)}
            Skip
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => execCommand('resume')} disabled={loading !== null}>
            {icon('resume', Play)}
            Resume
          </Button>
        </>
      )

    case 'final-review':
      return (
        <Button
          size="sm"
          className="gap-1.5 bg-green-600 text-white hover:bg-green-700"
          onClick={() => execCommand('ship')}
          disabled={loading !== null}
        >
          {icon('ship', Rocket)}
          Ship It
        </Button>
      )

    default:
      return null
  }
}
