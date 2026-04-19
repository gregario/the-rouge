'use client'

import { useState, useEffect, useCallback, use } from 'react'
import { projectDetails } from '@/data/projects'
import { isBridgeEnabled, fetchBridgeProject, fetchBridgeSpec, fetchBridgeActivity, fetchBridgeInfrastructure, fetchBridgeStoryContext, fetchBridgeStoryEnrichment } from '@/lib/bridge-client'
import type { InfrastructureManifest } from '@/bridge/infrastructure-reader'
import { mapRougeStateToProjectDetail } from '@/lib/bridge-mapper'
import { useBridgeEvents } from '@/lib/use-bridge-events'
import { getProjectActivity } from '@/data/activity-by-project'
import { ProjectHeader } from '@/components/project-header'
import { MilestoneTimeline } from '@/components/milestone-timeline'
import { StoryList } from '@/components/story-list'
import { ActivityLog } from '@/components/activity-log'
import { BuildLogTail } from '@/components/build-log-tail'
import type { StoryContext } from '@/bridge/story-context-reader'
import type { StoryEnrichmentMap } from '@/bridge/story-enrichment-reader'
import { ActionBar } from '@/components/action-bar'
import { PhaseEventsFeed } from '@/components/phase-events-feed'
import { CurrentFocusCard } from '@/components/current-focus-card'
import { DiagnosticsFooter } from '@/components/diagnostics-footer'
import { fetchBridgePhaseEvents, type PhaseEventPayload } from '@/lib/bridge-client'
import { ProjectTabs } from '@/components/project-tabs'
import { SpecTabContent } from '@/components/spec-tab-content'
import type { ProjectSpec } from '@/components/spec-view'
import { Card, CardContent } from '@/components/ui/card'
import { EscalationResponse } from '@/components/escalation-response'
import { Badge } from '@/components/ui/badge'
import type { ProjectDetail, SeedingDiscipline, ActivityEvent } from '@/lib/types'

// Bridge activity event shape — compatible with ActivityEvent minus projectId/projectName
interface BridgeActivityPayload {
  id: string
  type: ActivityEvent['type']
  timestamp: string
  title: string
  description?: string
  metadata?: ActivityEvent['metadata']
}

function adaptBridgeActivity(events: BridgeActivityPayload[], slug: string, name: string): ActivityEvent[] {
  return events.map((e) => ({
    ...e,
    projectId: slug,
    projectName: name,
  }))
}

function providerLabel(providers: string[]): string | null {
  if (providers.includes('cloudflare')) return 'Live on Cloudflare'
  if (providers.includes('vercel')) return 'Live on Vercel'
  if (providers.includes('supabase')) return 'Live on Supabase'
  return null
}

export default function ProjectPage({
  params,
}: {
  params: Promise<{ name: string }>
}) {
  const { name } = use(params)
  const mockProject = projectDetails[name]
  // When bridge is enabled, start with undefined so we don't show stale mock data
  const [project, setProject] = useState<ProjectDetail | undefined>(
    isBridgeEnabled() ? undefined : mockProject
  )
  const [bridgeError, setBridgeError] = useState<string | null>(null)
  const [spec, setSpec] = useState<ProjectSpec | null>(null)
  const [infrastructure, setInfrastructure] = useState<InfrastructureManifest | null>(null)
  const [storyContext, setStoryContext] = useState<StoryContext | null>(null)
  const [storyEnrichment, setStoryEnrichment] = useState<StoryEnrichmentMap | null>(null)
  const [bridgeActivity, setBridgeActivity] = useState<ActivityEvent[] | null>(null)
  const [verboseActivity, setVerboseActivity] = useState(false)
  // buildRunning used to be a separate 5s poll to /api/projects/[name]/build-status
  // that could drift from the main project fetch and produce a Stop
  // button against a dead project (or vice versa). Audit E9 folded the
  // PID info into the main detail response so we read both from the
  // same snapshot. Falls back to `false` for the pre-bridge mock.
  const buildRunning = !!project?.buildRunning

  // Fetch from bridge when enabled — surface errors instead of silently falling back
  useEffect(() => {
    if (!isBridgeEnabled()) return
    let cancelled = false
    fetchBridgeProject(name)
      .then((data) => {
        if (!cancelled) {
          setProject(mapRougeStateToProjectDetail(data, name))
          setBridgeError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setBridgeError(err instanceof Error ? err.message : String(err))
        }
      })
    return () => { cancelled = true }
  }, [name])

  // Fetch infrastructure manifest from bridge (may be null for older projects)
  useEffect(() => {
    if (!isBridgeEnabled()) return
    let cancelled = false
    fetchBridgeInfrastructure(name)
      .then((data) => {
        if (!cancelled) setInfrastructure(data as InfrastructureManifest | null)
      })
      .catch(() => {
        // Non-fatal; header will fall back to legacy stack display
      })
    return () => { cancelled = true }
  }, [name])

  // Fetch story context + enrichment from bridge
  useEffect(() => {
    if (!isBridgeEnabled()) return
    let cancelled = false
    fetchBridgeStoryContext(name)
      .then((data) => {
        if (!cancelled) setStoryContext(data as StoryContext | null)
      })
      .catch(() => {})
    fetchBridgeStoryEnrichment(name)
      .then((data) => {
        if (!cancelled) setStoryEnrichment(data as StoryEnrichmentMap | null)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [name])

  // Fetch project spec from bridge
  useEffect(() => {
    if (!isBridgeEnabled()) return
    let cancelled = false
    fetchBridgeSpec(name)
      .then((data) => {
        if (!cancelled) setSpec(data as ProjectSpec)
      })
      .catch(() => {
        // Non-fatal; SpecView will show empty state if spec stays null
      })
    return () => { cancelled = true }
  }, [name])

  // Fetch activity from bridge
  useEffect(() => {
    if (!isBridgeEnabled()) return
    let cancelled = false
    fetchBridgeActivity(name, verboseActivity)
      .then((data: BridgeActivityPayload[]) => {
        if (!cancelled) setBridgeActivity(adaptBridgeActivity(data, name, name))
      })
      .catch(() => {
        // Non-fatal
      })
    return () => { cancelled = true }
  }, [name, verboseActivity])

  // Live updates — re-fetch this project on any matching bridge event
  const refetch = useCallback(() => {
    if (!isBridgeEnabled()) return
    fetchBridgeProject(name)
      .then((data) => setProject(mapRougeStateToProjectDetail(data, name)))
      .catch((err) => setBridgeError(err instanceof Error ? err.message : String(err)))
    fetchBridgeActivity(name, verboseActivity)
      .then((data: BridgeActivityPayload[]) => setBridgeActivity(adaptBridgeActivity(data, name, name)))
      .catch(() => {})
    fetchBridgeStoryContext(name)
      .then((data) => setStoryContext(data as StoryContext | null))
      .catch(() => {})
    fetchBridgeStoryEnrichment(name)
      .then((data) => setStoryEnrichment(data as StoryEnrichmentMap | null))
      .catch(() => {})
  }, [name, verboseActivity])
  useBridgeEvents(refetch, name)

  // Latest tool call / assistant text, for the Current Focus hero. We
  // tail just the last couple of phase events at 2s cadence while the
  // build is running; the full event feed lives inside the diagnostics
  // footer and polls its own cadence. This keeps the hero feeling live
  // without double-fetching the full tail on every tick.
  const [latestPhaseEvent, setLatestPhaseEvent] = useState<PhaseEventPayload | null>(null)
  const buildRunningForPoll = !!project?.buildRunning
  useEffect(() => {
    if (!isBridgeEnabled() || !buildRunningForPoll) {
      return
    }
    let cancelled = false
    const poll = () => {
      fetchBridgePhaseEvents(name, 5)
        .then((data) => {
          if (cancelled) return
          const meaningful = [...data.events].reverse().find(
            (e) => e.type === 'tool_use' || e.type === 'text',
          )
          setLatestPhaseEvent(meaningful ?? null)
        })
        .catch(() => {})
    }
    poll()
    const i = setInterval(poll, 2000)
    return () => { cancelled = true; clearInterval(i) }
  }, [name, buildRunningForPoll])

  // Milestone selection state. `defaultMilestoneId` is memoised on the
  // project snapshot so the timeline auto-follows the active milestone
  // as rouge-loop advances — previously it was computed once at mount
  // and stayed pinned to whatever was in-progress the first time the
  // page loaded. `manuallySelectedMilestoneId` preserves an explicit
  // click: once the user picks a specific milestone, stop auto-tracking
  // until they click back to the active one (or reload).
  const activeMilestoneId = project?.milestones.find((m) => m.status === 'in-progress')?.id
    ?? project?.milestones.find((m) => m.status !== 'promoted')?.id
    ?? project?.milestones[project?.milestones.length - 1]?.id
  const [manuallySelectedMilestoneId, setManuallySelectedMilestoneId] = useState<string | undefined>(undefined)
  const selectedMilestoneId = manuallySelectedMilestoneId ?? activeMilestoneId
  const setSelectedMilestoneId = useCallback((id: string | undefined) => {
    // If the user clicks the currently-active milestone, clear the
    // override so the timeline resumes auto-tracking on the next phase
    // transition.
    setManuallySelectedMilestoneId(id === activeMilestoneId ? undefined : id)
  }, [activeMilestoneId])

  // Discipline selection state for seeding
  const [selectedDiscipline, setSelectedDiscipline] = useState<SeedingDiscipline | undefined>(undefined)

  if (bridgeError) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-gray-900">API error</h1>
        <p className="mt-2 text-red-700">{bridgeError}</p>
        <p className="mt-2 text-sm text-gray-500">
          Couldn&rsquo;t read project state. Check the launcher log
          (<code>~/.rouge/logs/rouge.log</code>) and that
          <code> $ROUGE_PROJECTS_DIR</code> points at a valid directory.
        </p>
        <a href="/" className="mt-4 inline-block text-gray-900 underline underline-offset-4">
          ← Back to dashboard
        </a>
      </div>
    )
  }

  if (!project) {
    // Bridge enabled but still loading — skeleton matching the main
    // layout so the shift isn't jarring once data lands.
    if (isBridgeEnabled()) {
      return (
        <div className="mx-auto w-full max-w-7xl animate-pulse space-y-6 px-4 py-16 sm:px-6 lg:px-8">
          <div className="space-y-2">
            <div className="h-7 w-64 rounded bg-muted" />
            <div className="h-4 w-40 rounded bg-muted/70" />
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-24 rounded bg-muted" />
            <div className="h-8 w-24 rounded bg-muted" />
            <div className="h-8 w-24 rounded bg-muted" />
          </div>
          <div className="space-y-3 rounded-lg border border-border p-6">
            <div className="h-5 w-48 rounded bg-muted" />
            <div className="h-4 w-full rounded bg-muted/70" />
            <div className="h-4 w-5/6 rounded bg-muted/70" />
            <div className="h-4 w-2/3 rounded bg-muted/70" />
          </div>
          <span className="sr-only">Loading project from bridge…</span>
        </div>
      )
    }
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-gray-900">Project not found</h1>
        <p className="mt-2 text-gray-500">
          No project matches &ldquo;{name}&rdquo;. Check the URL or go back to the{' '}
          <a href="/" className="text-gray-900 underline underline-offset-4">
            dashboard
          </a>
          .
        </p>
      </div>
    )
  }

  const activity = bridgeActivity ?? getProjectActivity(project.slug)
  const isSeeding = project.state === 'seeding'
  const isEscalation = project.state === 'escalation' || project.state === 'waiting-for-human'
  // Only pending escalations need a drawer. Historical resolved ones
  // stay in state.escalations as history but shouldn't render as
  // actionable cards. Earlier iterations cast through `any` to read
  // status which the mapper wasn't carrying through — three resolved
  // escalations then rendered as if they were live.
  const pendingEscalations = isEscalation
    ? project.escalations.filter((e) => e.status !== 'resolved')
    : []

  // Unified layout: ProjectTabs with Spec (View/Revise modes) + Build.
  // Build is disabled ONLY if seeding, OR if state is 'ready' AND no build
  // subprocess is running yet. Once a build starts, Build tab enables
  // immediately so the user can watch activity/milestones as they arrive.
  const buildDisabled = isSeeding || (project.state === 'ready' && !buildRunning)
  // Default to Build tab whenever Build is enabled (build has started or
  // project is past ready). Spec tab is primary only during seeding/ready idle.
  const defaultTab: 'spec' | 'build' = buildDisabled ? 'spec' : 'build'
  // Spec defaults to Revise during active seeding, View once past seeding.
  const defaultSpecMode: 'view' | 'revise' = isSeeding ? 'revise' : 'view'
  // Pull the most actionable escalation summary into the hero so the
  // user sees *why* Rouge stopped without scrolling down to the drawer.
  const topEscalationSummary = pendingEscalations[0]
    ? ((pendingEscalations[0] as { summary?: string; reason?: string }).summary
      ?? (pendingEscalations[0] as { summary?: string; reason?: string }).reason
      ?? undefined)
    : undefined

  // Derive a short "latest tool call" line for the hero from the
  // polled phase events. `tool_use` events carry the tool name + a
  // path/command summary; `text` events carry a brief narrative
  // sentence. Either is more specific than the phase gloss.
  const latestToolSummary = latestPhaseEvent
    ? latestPhaseEvent.type === 'tool_use'
      ? `${latestPhaseEvent.name}${latestPhaseEvent.summary ? ` ${latestPhaseEvent.summary}` : ''}`
      : latestPhaseEvent.type === 'text' && latestPhaseEvent.text
        ? latestPhaseEvent.text
        : undefined
    : undefined

  const buildContent = (
    <>
      {/* Hero — the one place the user looks for "what is Rouge doing
          right now?". Replaces the stack of pill + current-story card
          + phase-events panel + IDLE/LIVE badges that earlier
          iterations scattered across the page. */}
      <CurrentFocusCard
        state={project.state}
        buildRunning={buildRunning}
        buildStartedAt={project.buildStartedAt}
        currentStoryName={storyContext?.story?.name}
        currentMilestoneName={
          project.milestones.find((m) => m.status === 'in-progress')?.title
        }
        storyContext={storyContext}
        latestToolSummary={latestToolSummary}
        latestToolAt={latestPhaseEvent?.ts}
        escalationSummary={topEscalationSummary}
      />

      {/* Merged milestone timeline + story list in ONE card */}
      {project.milestones.length > 0 && (
        <Card className="mt-4 border border-gray-200 bg-gray-50 shadow-sm">
          <CardContent className="p-5">
            <MilestoneTimeline
              milestones={project.milestones}
              selectedId={selectedMilestoneId}
              onSelect={setSelectedMilestoneId}
            />
            <div className="mt-4 border-t border-gray-200 pt-4">
              <StoryList
                milestones={project.milestones}
                selectedMilestoneId={selectedMilestoneId}
                enrichment={storyEnrichment}
                slug={project.slug}
                buildRunning={buildRunning}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Build cost progress bar for BUILDING projects */}
      {project.state !== 'complete' && project.cost.budgetCap > 0 && project.cost.totalSpend > 0 && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500">Build Cost</span>
            <span className="text-sm font-medium tabular-nums text-gray-900">
              ${project.cost.totalSpend.toFixed(2)} / ${project.cost.budgetCap.toFixed(0)} budget
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className={`h-full rounded-full transition-all ${
                (project.cost.totalSpend / project.cost.budgetCap) * 100 >= 90
                  ? 'bg-red-500'
                  : (project.cost.totalSpend / project.cost.budgetCap) * 100 >= 70
                    ? 'bg-amber-500'
                    : 'bg-blue-500'
              }`}
              style={{ width: `${Math.min((project.cost.totalSpend / project.cost.budgetCap) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Deployment badge for completed projects */}
      {project.state === 'complete' && (
        <div className="mt-6 flex items-center gap-3">
          <span className="text-sm text-gray-500">
            Build cost: ${project.cost.totalSpend.toFixed(2)}
          </span>
          {providerLabel(project.providers) && (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
              {providerLabel(project.providers)}
            </Badge>
          )}
        </div>
      )}

      {/* Diagnostics — the secondary surfaces that answer
          "what happened and when" collapsed into one footer. Phase
          activity (detailed tool-call stream), history (checkpoint
          transitions), and raw build log (stderr fallback) were each
          competing for the reader's attention at the same level as the
          milestone plan; they all belong here now. Default collapsed
          so the page leads with "what's happening" not "what the log
          says". */}
      {isBridgeEnabled() && (
        <DiagnosticsFooter
          label="Diagnostics"
          summary="Phase events · History · Raw log"
        >
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Phase events
            </h3>
            <PhaseEventsFeed slug={project.slug} live={buildRunning} />
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
              History
            </h3>
            <ActivityLog
              events={activity}
              verbose={verboseActivity}
              onToggleVerbose={setVerboseActivity}
            />
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Raw log
            </h3>
            <BuildLogTail slug={project.slug} live={buildRunning} />
          </div>
        </DiagnosticsFooter>
      )}
    </>
  )

  // Escalation banner, hoisted above the tabs. Previously lived inside
  // buildContent, which meant switching to the Spec tab hid the
  // escalation drawer and the user lost access to Respond / Hand off /
  // Dismiss. Rendering here keeps the escalation visible and actionable
  // regardless of which tab is active. Stacks one panel per pending
  // escalation so multi-escalation situations don't collapse into the
  // first one (audit F15).

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 pb-20 sm:px-6 lg:px-8">
      <ProjectHeader project={project} infrastructure={infrastructure} />

      {pendingEscalations.length > 0 && (
        <div className="mt-6 space-y-4">
          {pendingEscalations.length > 1 && (
            <p className="text-xs text-muted-foreground">
              {pendingEscalations.length} escalations pending — resolve each one below.
            </p>
          )}
          {pendingEscalations.map((esc, i) => (
            <EscalationResponse
              key={(esc as { id?: string }).id ?? i}
              escalation={esc}
              slug={project.slug}
              onResolved={refetch}
            />
          ))}
        </div>
      )}

      <div className="mt-8">
        <ProjectTabs
          defaultTab={defaultTab}
          buildDisabled={buildDisabled}
          specContent={
            <SpecTabContent
              spec={spec}
              slug={project.slug}
              seedingProgress={project.seedingProgress}
              defaultMode={defaultSpecMode}
              selectedDiscipline={selectedDiscipline}
              onSelectDiscipline={setSelectedDiscipline}
              reviseLocked={buildRunning}
              reviseLockReason="Stop the build to revise the spec"
              pendingGateDiscipline={project.pendingGateDiscipline}
            />
          }
          buildContent={buildContent}
        />
      </div>

      {/* Action bar — fixed bottom */}
      <ActionBar
        state={project.state}
        slug={project.slug}
        productionUrl={project.productionUrl}
        escalation={project.escalations[0]}
        onCommandComplete={refetch}
      />
    </div>
  )
}
