'use client'

import type { Escalation, ProjectState } from '@/lib/types'
import { useState, useCallback, useEffect } from 'react'
import { isBridgeEnabled, sendCommand, fetchBuildStatus } from '@/lib/bridge-client'
import { Button } from '@/components/ui/button'
import { EscalationDrawer } from '@/components/escalation-drawer'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { AlertTriangle, ExternalLink, Loader2, Play, Rocket, RotateCcw, SkipForward, Square } from 'lucide-react'

// Mid-phase states — rouge-loop is expected to be actively running a
// Claude subprocess while the project sits in one of these. When a
// project is in one of these states but no PID is alive, we're in a
// "zombie" — state hasn't been rolled back after the loop died (crash,
// SIGINT, phase completion racing with stop). Used by the ActionBar to
// render a Resume/Reset pair instead of a dead Stop button.
const MID_PHASE_STATES: ReadonlySet<ProjectState> = new Set([
  'foundation',
  'foundation-eval',
  'story-building',
  'milestone-check',
  'milestone-fix',
  'analyzing',
  'generating-change-spec',
  'vision-check',
  'shipping',
  // final-review is included because the loop is still actively running
  // the final-review phase and may need to be stopped mid-review.
  'final-review',
])

interface ActionBarProps {
  state: ProjectState
  slug?: string
  productionUrl?: string
  escalation?: Escalation
  onCommandComplete?: () => void
}

export function ActionBar({ state, slug, productionUrl, escalation, onCommandComplete }: ActionBarProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const [buildRunning, setBuildRunning] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'start' | 'stop' | 'reset' | null>(null)
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
      // Refresh build status + page data after any command that can
      // change state or process liveness. Reset flips state back to
      // Ready without touching the subprocess (there shouldn't be one
      // if Reset succeeded); Start/Stop obviously change both.
      if (command === 'start' || command === 'stop' || command === 'reset') {
        try {
          const status = await fetchBuildStatus(slug)
          setBuildRunning(status.running)
          setBuildStartedAt(status.startedAt ?? null)
        } catch {}
        // Trigger parent refetch so `project.state` reflects the server-side
        // transition (ready → foundation on start, etc.) without waiting for
        // the SSE state-change event, which can lag or drop. Without this,
        // the Build tab stays disabled until the user manually refreshes.
        onCommandComplete?.()
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
  }, [slug, onCommandComplete])

  // Start/Stop/Reset go through confirmation; other commands run
  // immediately. "resume" is an alias for start-without-confirm —
  // used by the Resume Build button shown in mid-phase zombie states,
  // where the Start dialog's "Rouge will run foundation first" copy
  // would be misleading.
  const execCommand = useCallback(async (command: string) => {
    if (command === 'resume') {
      await runCommand('start')
      return
    }
    if (command === 'start' || command === 'stop' || command === 'reset') {
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

      <ConfirmDialog
        open={confirmAction === 'reset'}
        title="Reset project to Ready?"
        description={
          <>
            <p>
              Current state: <strong>{state}</strong>. Reset clears this flag
              and sets state back to <strong>Ready</strong>.
            </p>
            <p className="mt-2">
              Commits, milestones, and cycle context on disk are
              <strong> preserved</strong>. On the next Start, rouge-loop
              will begin from foundation again — already-built files
              short-circuit quickly.
            </p>
            <p className="mt-2 text-xs text-gray-500">
              Use Resume instead if you want to pick up at <strong>{state}</strong> without re-running foundation.
            </p>
          </>
        }
        confirmLabel="Reset to Ready"
        variant="danger"
        onConfirm={() => {
          setConfirmAction(null)
          runCommand('reset')
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
    case 'foundation':
    case 'foundation-eval':
    case 'analyzing':
    case 'generating-change-spec':
    case 'vision-check':
    case 'shipping':
      // state.json says building; if no subprocess is alive, the loop
      // died without rolling state back. Resume re-spawns rouge-loop
      // and picks up at the current phase (no work lost); Reset forces
      // state back to Ready for a clean restart.
      return buildRunning
        ? 'Build in progress'
        : `Build stopped at ${state} — resume to continue, or reset to restart from Ready`
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

  // Mid-phase + no subprocess = zombie. Used to render another Stop
  // button that did nothing (the existing rollback only covered two
  // of ten mid-phase states). Now we give the user a real way forward:
  // Resume (re-spawn rouge-loop at the current phase — preserves the
  // work committed so far) and Reset (force state → ready for a clean
  // restart). /start already handles the "state is past ready — just
  // spawn" case, so Resume just calls execCommand('start').
  if (MID_PHASE_STATES.has(state)) {
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => execCommand('reset')}
          disabled={loading !== null}
          title={`Force state back to Ready. Commits on disk are preserved; the loop will start from foundation on next Start.`}
        >
          {icon('reset', RotateCcw)}
          Reset to Ready
        </Button>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => execCommand('resume')}
          disabled={loading !== null}
          title={`Re-spawn rouge-loop at ${state}. No state change — picks up where it left off.`}
        >
          {icon('start', Play)}
          Resume Build
        </Button>
      </>
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
