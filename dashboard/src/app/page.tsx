import { redirect } from 'next/navigation'
import { projects as mockProjects } from '@/data/projects'
import { isBridgeEnabled, fetchBridgeProjects } from '@/lib/bridge-client'
import { isSetupComplete } from '@/lib/setup-state'
import type { ProjectSummary, ProjectState, Provider } from '@/lib/types'
import { ProjectCard } from '@/components/project-card'
import { TopBar } from '@/components/top-bar'
import { LiveRefresh } from '@/components/live-refresh'
import { NewProjectButton } from '@/components/new-project-button'
import { cn } from '@/lib/utils'

// Render per-request so the same-origin /api/projects fetch resolves.
// Otherwise Next tries to statically prerender at build time — no server,
// no base URL, exports an error page.
export const dynamic = 'force-dynamic'

// Map bridge BridgeProjectSummary response to ProjectSummary[].
// The bridge returns a shape close to Rouge state.json — we fill in
// dashboard-specific fields with safe defaults where Rouge doesn't track them.
function mapBridgeProjects(data: Record<string, unknown>[]): ProjectSummary[] {
  return data.map((p) => {
    const milestones = (p.milestones as { total?: number; completed?: number } | undefined) ?? {}
    const escalation = p.escalation as { tier?: number; summary?: string } | undefined
    return {
      id: String(p.slug ?? ''),
      name: String(p.name ?? ''),
      slug: String(p.slug ?? ''),
      description: String(p.description ?? ''),
      state: (p.state as ProjectState) ?? 'ready',
      providers: (p.providers as Provider[]) ?? [],
      health: Number(p.health ?? 50),
      progress: Number(p.progress ?? 0),
      confidence: 0.75,
      cost: {
        totalSpend: Number(p.costUsd ?? 0), budgetCap: 500,
        breakdown: { llmTokens: 0, deploys: 0, other: 0 },
        lastUpdated: new Date().toISOString(),
      },
      lastCheckpointAt: p.lastCheckpointAt as string | undefined,
      milestonesTotal: Number(milestones.total ?? 0),
      milestonesCompleted: Number(milestones.completed ?? 0),
      currentMilestone: p.currentMilestone as string | undefined,
      escalation: escalation?.tier !== undefined
        ? { tier: escalation.tier as 0 | 1 | 2 | 3, reason: escalation.summary ?? '' }
        : undefined,
      stagingUrl: p.deploymentUrl as string | undefined,
      productionUrl: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  })
}

async function getProjects(): Promise<{ projects: ProjectSummary[]; error?: string }> {
  if (!isBridgeEnabled()) return { projects: mockProjects }
  try {
    const data = await fetchBridgeProjects()
    return { projects: mapBridgeProjects(Array.isArray(data) ? data : data.projects ?? []) }
  } catch (err) {
    // When bridge is enabled, do NOT silently fall back to mock data — surface the error
    return {
      projects: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ─── Section definitions ────────────────────────────────────────────

interface Section {
  id: string
  title: string
  accentBorder: string
  accentText: string
  filter: (p: ProjectSummary) => boolean
}

const needsAttentionStates = new Set<ProjectState>(['escalation', 'waiting-for-human'])
const buildingStates = new Set<ProjectState>([
  'foundation', 'foundation-eval', 'story-building', 'story-diagnosis',
  'milestone-check', 'milestone-fix', 'analyzing', 'generating-change-spec',
  'vision-check', 'shipping', 'final-review',
])
const specStates = new Set<ProjectState>(['seeding', 'ready'])

const sections: Section[] = [
  {
    id: 'needs-attention',
    title: 'Needs Attention',
    accentBorder: 'border-red-500',
    accentText: 'text-red-600',
    filter: (p) => needsAttentionStates.has(p.state),
  },
  {
    id: 'building',
    title: 'Building',
    accentBorder: 'border-blue-500',
    accentText: 'text-blue-600',
    filter: (p) => buildingStates.has(p.state),
  },
  {
    id: 'in-spec',
    title: 'In Spec',
    accentBorder: 'border-purple-500',
    accentText: 'text-purple-600',
    filter: (p) => specStates.has(p.state),
  },
  {
    id: 'shipped',
    title: 'Shipped',
    accentBorder: 'border-green-500',
    accentText: 'text-green-600',
    filter: (p) => p.state === 'complete',
  },
]

function sortByUpdated(list: ProjectSummary[]): ProjectSummary[] {
  return [...list].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
}

export default async function Home() {
  // First-time users: no setup-complete marker yet → send them to /setup.
  // Returning users (marker exists, even if skipped) see the dashboard.
  // Re-enter /setup anytime via the nav link.
  if (!isSetupComplete()) {
    redirect('/setup')
  }

  const { projects, error } = await getProjects()

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <LiveRefresh />
      {error && (
        <div className="mb-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>API error:</strong> {error}
          <p className="mt-1 text-xs text-red-700">
            Couldn&rsquo;t read project state. Check the launcher log
            (<code>~/.rouge/logs/rouge.log</code> or
            <code> &lt;repo&gt;/logs/rouge.log</code>) and make sure
            <code>$ROUGE_PROJECTS_DIR</code> points at a valid projects
            directory.
          </p>
        </div>
      )}
      <div className="flex items-start justify-between">
        <TopBar />
        <NewProjectButton />
      </div>

      <div className="mt-10 flex flex-col gap-12">
        {sections.map((section) => {
          const sectionProjects = sortByUpdated(projects.filter(section.filter))
          if (sectionProjects.length === 0) return null

          return (
            <div key={section.id}>
              {/* Section header */}
              <div className={cn('mb-6 flex items-center gap-3 border-l-4 pl-4', section.accentBorder)}>
                <h2 className="text-xl font-bold text-foreground">{section.title}</h2>
                <span className={cn('text-sm font-semibold tabular-nums', section.accentText)}>
                  {sectionProjects.length}
                </span>
              </div>

              {/* Project cards */}
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {sectionProjects.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
