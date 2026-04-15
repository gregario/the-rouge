import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { projects as mockProjects } from '@/data/projects'
import { isBridgeEnabled, fetchBridgeProjects } from '@/lib/bridge-client'
import type { ProjectSummary, ProjectState, Provider } from '@/lib/types'
import { ProjectCard } from '@/components/project-card'

export const dynamic = 'force-dynamic'

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
      archived: Boolean(p.archived),
      archivedAt: typeof p.archivedAt === 'string' ? p.archivedAt : undefined,
      isPlaceholderName: Boolean(p.isPlaceholderName),
      messageCount: typeof p.messageCount === 'number' ? p.messageCount : undefined,
      firstMessagePreview: typeof p.firstMessagePreview === 'string' ? p.firstMessagePreview : undefined,
    }
  })
}

async function getArchivedProjects(): Promise<{ projects: ProjectSummary[]; error?: string }> {
  if (!isBridgeEnabled()) {
    return { projects: mockProjects.filter((p) => p.archived) }
  }
  try {
    const data = await fetchBridgeProjects()
    const arr = Array.isArray(data) ? data : data.projects ?? []
    return { projects: mapBridgeProjects(arr).filter((p) => p.archived) }
  } catch (err) {
    return { projects: [], error: err instanceof Error ? err.message : String(err) }
  }
}

export default async function ArchivedPage() {
  const { projects, error } = await getArchivedProjects()
  const sorted = [...projects].sort((a, b) => {
    const ta = new Date(a.archivedAt ?? a.updatedAt).getTime()
    const tb = new Date(b.archivedAt ?? b.updatedAt).getTime()
    return tb - ta
  })

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors w-fit">
        <ArrowLeft className="size-4" />
        Dashboard
      </Link>

      <div className="mt-6 mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Archived</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Projects hidden from the main dashboard. Open one and use the Unarchive button to bring it back.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>API error:</strong> {error}
        </div>
      )}

      {sorted.length === 0 && !error && (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No archived projects. Archive one from its project page to see it here.
          </p>
        </div>
      )}

      {sorted.length > 0 && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((project) => <ProjectCard key={project.id} project={project} />)}
        </div>
      )}
    </div>
  )
}
