// Maps raw Rouge state.json data to the dashboard's ProjectDetail shape.
// The bridge returns the Rouge's internal state representation unchanged —
// this mapper bridges the schema gap so existing components render correctly.

import type {
  ProjectDetail,
  ProjectState,
  Milestone,
  MilestoneStatus,
  Story,
  StoryStatus,
  Escalation,
  EscalationTier,
  SeedingProgress,
  SeedingDiscipline,
  DisciplineStatus,
} from '@/lib/types'
import type { RougeEscalation } from '@/bridge/types'

interface RougeStory {
  id: string
  name: string
  status: string
  attempts?: number
  blocked_by?: string | null
  depends_on?: string[]
  affected_entities?: string[]
  affected_screens?: string[]
  env_limitations?: string[]
  completed_at?: string
  files_changed?: string[]
  failure_reason?: string
}

interface RougeMilestone {
  name: string
  status: string
  stories: RougeStory[]
  started_at?: string
  completed_at?: string
}

interface RougeState {
  slug?: string
  project?: string
  name?: string
  current_state?: string
  current_milestone?: string
  current_story?: string
  milestones?: RougeMilestone[]
  escalations?: RougeEscalation[]
  cycle_number?: number
  // V2 fallback
  feature_areas?: { name: string; status: string }[]
  // Seeding progress (when current_state === 'seeding')
  seedingProgress?: {
    disciplines?: { discipline: string; status: string }[]
    completedCount?: number
    totalCount?: number
    currentDiscipline?: string
  }
  // Checkpoint summary from latest checkpoint (added by bridge)
  costUsd?: number | null
  budgetCapUsd?: number | null
  lastCheckpointAt?: string | null
  lastPhase?: string | null
  checkpointCount?: number
  archived?: boolean
  archivedAt?: string
  budget_cap_usd?: number
  // Deploy URLs — populated by the project-detail API route from
  // infrastructure_manifest.json + cycle_context.json.deploy_history
  // before reaching this mapper.
  stagingUrl?: string
  productionUrl?: string
}

function mapSeedingProgress(raw: RougeState['seedingProgress']): SeedingProgress | undefined {
  if (!raw || !raw.disciplines) return undefined
  return {
    disciplines: raw.disciplines.map(d => ({
      discipline: d.discipline as SeedingDiscipline,
      status: d.status as DisciplineStatus,
    })),
    completedCount: raw.completedCount ?? 0,
    totalCount: raw.totalCount ?? 8,
    currentDiscipline: raw.currentDiscipline as SeedingDiscipline | undefined,
  }
}

function mapStoryStatus(status: string): StoryStatus {
  switch (status) {
    case 'done':
    case 'complete':
    case 'completed':
      return 'done'
    case 'in-progress':
    case 'in_progress':
      return 'in-progress'
    case 'failed':
    case 'error':
      return 'failed'
    case 'skipped':
    case 'blocked':
      return 'skipped'
    default:
      return 'pending'
  }
}

function mapMilestoneStatus(status: string): MilestoneStatus {
  switch (status) {
    case 'complete':
    case 'completed':
    case 'promoted':
    case 'done':
      return 'promoted'
    case 'in-progress':
    case 'in_progress':
      return 'in-progress'
    case 'failed':
      return 'failed'
    default:
      return 'pending'
  }
}

function mapStory(s: RougeStory): Story {
  return {
    id: s.id,
    title: s.name,
    status: mapStoryStatus(s.status),
    acceptanceCriteria: [], // Rouge doesn't track these per story
    completedAt: s.completed_at,
    failureReason: s.failure_reason,
  }
}

function mapMilestone(m: RougeMilestone, index: number): Milestone {
  return {
    id: `milestone-${index}-${m.name}`,
    title: m.name,
    description: '', // Rouge doesn't store descriptions
    status: mapMilestoneStatus(m.status),
    stories: (m.stories ?? []).map(mapStory),
    startedAt: m.started_at,
    completedAt: m.completed_at,
  }
}

function mapEscalation(e: RougeEscalation): Escalation {
  const tier = (Math.max(0, Math.min(3, e.tier)) as EscalationTier)
  return {
    id: e.id,
    tier,
    reason: e.summary ?? e.reason ?? e.classification ?? 'Escalation raised',
    state: (e.state as ProjectState) ?? 'escalation',
    createdAt: e.created_at,
    resolvedAt: e.resolved_at,
    resolution: e.resolution,
  }
}

function mapV2Milestones(
  featureAreas: { name: string; status: string }[],
): Milestone[] {
  return featureAreas.map((fa, i) => ({
    id: `area-${i}-${fa.name}`,
    title: fa.name,
    description: '',
    status: mapMilestoneStatus(fa.status),
    stories: [],
  }))
}

function computeProgress(milestones: Milestone[]): number {
  let total = 0
  let done = 0
  for (const m of milestones) {
    for (const s of m.stories) {
      total++
      if (s.status === 'done') done++
    }
  }
  return total > 0 ? Math.round((done / total) * 100) : 0
}

function computeHealth(state: RougeState, progress: number): number {
  if (state.current_state === 'complete') return 100
  if (state.escalations?.some((e) => e.status === 'pending')) return Math.min(progress, 30)
  if (state.current_state === 'waiting-for-human') return Math.min(progress, 50)
  return progress
}

/**
 * Map raw Rouge state.json to dashboard ProjectDetail shape.
 * Handles both V3 (milestones[]) and V2 (feature_areas[]) schemas.
 */
export function mapRougeStateToProjectDetail(raw: unknown, slug: string): ProjectDetail {
  const state = raw as RougeState
  const now = new Date().toISOString()

  const isBuilding = state.current_state === 'story-building' || state.current_state === 'foundation'
  const activeStoryId = isBuilding ? state.current_story : undefined

  const milestones = state.milestones
    ? state.milestones.map((m, i) => {
        const mapped = mapMilestone(m, i)
        // Override statuses for the active milestone/story — Rouge only
        // writes formal status when phases complete, but current_milestone
        // and current_story tell us what's being worked on right now.
        if (activeStoryId) {
          for (const s of mapped.stories) {
            if (s.id === activeStoryId && s.status === 'pending') {
              s.status = 'in-progress'
            }
          }
        }
        if (m.name === state.current_milestone && mapped.status === 'pending' && isBuilding) {
          mapped.status = 'in-progress'
        }
        return mapped
      })
    : state.feature_areas
      ? mapV2Milestones(state.feature_areas)
      : []

  const escalations = (state.escalations ?? []).map(mapEscalation)

  return {
    id: slug,
    name: state.project ?? state.name ?? slug,
    slug,
    description: '', // Rouge state.json doesn't have descriptions
    state: (state.current_state as ProjectState) ?? 'ready',
    providers: [], // TODO: derive from infrastructure_manifest.json when available
    progress: computeProgress(milestones),
    health: computeHealth(state, computeProgress(milestones)),
    confidence: 0.75, // Placeholder — Rouge doesn't surface this yet
    confidenceHistory: [],
    cost: {
      // Real cumulative cost from latest checkpoint, or 0 if no checkpoints yet
      totalSpend: state.costUsd ?? 0,
      // Per-project cap from state.json, falls back for ancient projects that
      // predate per-project caps. The launcher's effective cap is now always
      // state.budget_cap_usd ?? rouge.config.json.budget_cap_usd.
      budgetCap: state.budget_cap_usd ?? state.budgetCapUsd ?? 100,
      breakdown: { llmTokens: 0, deploys: 0, other: 0 },
      lastUpdated: now,
    },
    milestones,
    escalations,
    seedingProgress: mapSeedingProgress(state.seedingProgress),
    lastCheckpointAt: state.lastCheckpointAt ?? undefined,
    lastPhase: state.lastPhase ?? undefined,
    checkpointCount: state.checkpointCount,
    // Deploy URLs — the project-detail API route splices these in
    // from infrastructure_manifest.json + cycle_context.json so the
    // mapper sees them on `state`. Expose in the mapped project so
    // the page header can render an "Open staging" affordance.
    stagingUrl: state.stagingUrl ?? undefined,
    productionUrl: state.productionUrl ?? undefined,
    createdAt: now,
    updatedAt: now,
    archived: state.archived === true,
    archivedAt: state.archivedAt,
  }
}
