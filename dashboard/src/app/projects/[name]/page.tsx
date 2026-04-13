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
import { CurrentStoryCard } from '@/components/current-story-card'
import type { StoryContext } from '@/bridge/story-context-reader'
import type { StoryEnrichmentMap } from '@/bridge/story-enrichment-reader'
import { ActionBar } from '@/components/action-bar'
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
  const [buildRunning, setBuildRunning] = useState(false)

  // Poll build status so the Build tab enables as soon as a build subprocess
  // starts, even before the loop has written its first checkpoint.
  useEffect(() => {
    if (!isBridgeEnabled()) return
    let cancelled = false
    const check = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_BRIDGE_URL}/projects/${name}/build-status`)
        const data = await res.json()
        if (!cancelled) setBuildRunning(!!data.running)
      } catch {
        // silent
      }
    }
    check()
    const interval = setInterval(check, 5000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [name])

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

  // Milestone selection state
  const defaultMilestoneId = project?.milestones.find((m) => m.status === 'in-progress')?.id
    ?? project?.milestones.find((m) => m.status !== 'promoted')?.id
    ?? project?.milestones[project.milestones.length - 1]?.id
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | undefined>(defaultMilestoneId)

  // Discipline selection state for seeding
  const [selectedDiscipline, setSelectedDiscipline] = useState<SeedingDiscipline | undefined>(undefined)

  if (bridgeError) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-gray-900">Bridge error</h1>
        <p className="mt-2 text-red-700">{bridgeError}</p>
        <p className="mt-2 text-sm text-gray-500">
          The bridge server is not responding. Check that it&rsquo;s running (<code>npm run bridge</code>).
        </p>
        <a href="/" className="mt-4 inline-block text-gray-900 underline underline-offset-4">
          ← Back to dashboard
        </a>
      </div>
    )
  }

  if (!project) {
    // Bridge enabled but still loading — show a loading indicator
    if (isBridgeEnabled()) {
      return (
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <p className="text-sm text-gray-500">Loading project from bridge…</p>
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
  const buildContent = (
    <>
      {/* Current story detail — visible during story-building when context exists */}
      {storyContext?.story?.name && (
        <div className="mb-4">
          <CurrentStoryCard ctx={storyContext} />
        </div>
      )}

      {/* Merged milestone timeline + story list in ONE card */}
      {project.milestones.length > 0 && (
        <Card className="border border-gray-200 bg-gray-50 shadow-sm">
          <CardContent className="p-5">
            <MilestoneTimeline
              milestones={project.milestones}
              selectedId={selectedMilestoneId}
              onSelect={setSelectedMilestoneId}
            />
            <div className="mt-4 border-t border-gray-200 pt-4">
              <StoryList milestones={project.milestones} selectedMilestoneId={selectedMilestoneId} enrichment={storyEnrichment} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Escalation response area — visible for escalation projects */}
      {isEscalation && project.escalations[0] && (
        <div className="mt-6">
          <EscalationResponse escalation={project.escalations[0]} slug={project.slug} />
        </div>
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

      {/* Activity log — full width */}
      <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-5">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Activity</h3>
        <ActivityLog
          events={activity}
          verbose={isBridgeEnabled() ? verboseActivity : undefined}
          onToggleVerbose={isBridgeEnabled() ? setVerboseActivity : undefined}
        />
      </div>

      {/* Build log tail — raw stdout from the loop subprocess */}
      {isBridgeEnabled() && (
        <div className="mt-6">
          <BuildLogTail slug={project.slug} live={buildRunning} />
        </div>
      )}
    </>
  )

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 pb-20 sm:px-6 lg:px-8">
      <ProjectHeader project={project} infrastructure={infrastructure} />

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
      />
    </div>
  )
}
