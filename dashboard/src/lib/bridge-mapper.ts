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
import { narrowEnum } from '@/lib/validate-enum'

// Known-valid enum members — used by narrowEnum to reject launcher
// typos ('brainstormng') instead of casting them through and causing
// blank renders downstream.
const SEEDING_DISCIPLINES: readonly SeedingDiscipline[] = [
  'brainstorming', 'competition', 'taste', 'sizing', 'spec',
  'infrastructure', 'design', 'legal-privacy', 'marketing',
]
const DISCIPLINE_STATUSES: readonly DisciplineStatus[] = ['pending', 'in-progress', 'complete', 'skipped']
const PROJECT_STATES: readonly ProjectState[] = [
  'seeding', 'ready', 'foundation', 'foundation-eval', 'story-building',
  'milestone-check', 'milestone-fix', 'analyzing', 'generating-change-spec',
  'vision-check', 'shipping', 'final-review', 'complete',
  'escalation', 'waiting-for-human',
]

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
  added_at?: string
  added_by?: string
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
  // Providers derived from cycle_context.infrastructure by the detail
  // API route. Used for "Live on Cloudflare" style badges and the
  // project-card stack icons. Previously hardcoded to [] in the
  // mapper, so none of those UI elements rendered.
  providers?: string[]
  // Deploy URLs — populated by the project-detail API route from
  // infrastructure_manifest.json + cycle_context.json.deploy_history
  // before reaching this mapper.
  stagingUrl?: string
  productionUrl?: string
  // Build subprocess state + gated-autonomy signals. Populated by
  // the detail API route before this mapper sees the payload.
  buildRunning?: boolean
  buildPid?: number
  buildStartedAt?: string
  awaitingGate?: boolean
  pendingGateDiscipline?: string
  lastHeartbeatAt?: string
}

function mapSeedingProgress(raw: RougeState['seedingProgress']): SeedingProgress | undefined {
  if (!raw || !raw.disciplines) return undefined
  // Validate discipline and status rather than casting blind. A
  // launcher-side typo used to propagate as a bogus enum value,
  // breaking downstream components that expected to match it in a
  // known set. Unknown values now drop with a one-time console
  // warning; the UI renders without them rather than crashing.
  const disciplines = raw.disciplines
    .map((d) => {
      const discipline = narrowEnum(d.discipline, SEEDING_DISCIPLINES, 'seedingProgress.discipline')
      const status = narrowEnum(d.status, DISCIPLINE_STATUSES, 'seedingProgress.status')
      if (!discipline || !status) return null
      return { discipline, status }
    })
    .filter((x): x is { discipline: SeedingDiscipline; status: DisciplineStatus } => x !== null)
  return {
    disciplines,
    completedCount: raw.completedCount ?? 0,
    totalCount: raw.totalCount ?? 8,
    currentDiscipline: narrowEnum(raw.currentDiscipline, SEEDING_DISCIPLINES, 'seedingProgress.currentDiscipline'),
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
    addedAt: s.added_at,
    addedBy: s.added_by,
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

function mapEscalation(e: RougeEscalation & { handoff_started_at?: string }): Escalation {
  const tier = (Math.max(0, Math.min(3, e.tier)) as EscalationTier)
  // Preserve 'status' — consumed by the page-level filter that decides
  // which escalations render as active drawers.
  const status = e.status === 'resolved' ? 'resolved' : 'pending'
  return {
    id: e.id,
    tier,
    reason: e.summary ?? e.reason ?? e.classification ?? 'Escalation raised',
    // Validate the phase-of-origin field; bad values fall back to
    // 'escalation' so the UI never renders an un-styleable state.
    state: narrowEnum(e.state, PROJECT_STATES, 'escalation.state') ?? 'escalation',
    status,
    createdAt: e.created_at,
    resolvedAt: e.resolved_at,
    resolution: e.resolution,
    handoff_started_at: e.handoff_started_at,
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
  const isReviewing = state.current_state === 'milestone-check'
  const isFixing = state.current_state === 'milestone-fix'

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
        // Overlay review-loop status on the current milestone when the
        // project is in milestone-check/milestone-fix. The launcher
        // doesn't persist these as milestone statuses (they're
        // inferred from project.current_state + current_milestone); the
        // mapper is the one place to derive them. UI timelines render
        // 'under-review' / 'fixing' distinctly from 'in-progress' so
        // users can see when Rouge is reviewing vs. still building.
        if (m.name === state.current_milestone) {
          if (isReviewing) mapped.status = 'under-review'
          else if (isFixing) mapped.status = 'fixing'
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
    // Validated: a typo in state.current_state used to leak straight
    // into the UI's state-badge switch and render as raw text. Now it
    // falls back to 'ready' and warns once.
    state: narrowEnum(state.current_state, PROJECT_STATES, 'project.current_state') ?? 'ready',
    // Narrow the raw string[] to Provider[]. Unknown values drop
    // silently (they still render, via ProviderIcons' fallback, but
    // in TS we only allow the recognised set).
    providers: (state.providers ?? []).filter(
      (p): p is 'vercel' | 'cloudflare' | 'github-pages' | 'supabase' | 'sentry' | 'posthog' =>
        ['vercel', 'cloudflare', 'github-pages', 'supabase', 'sentry', 'posthog'].includes(p),
    ),
    progress: computeProgress(milestones),
    health: computeHealth(state, computeProgress(milestones)),
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
    buildRunning: state.buildRunning,
    buildPid: state.buildPid,
    buildStartedAt: state.buildStartedAt,
    awaitingGate: state.awaitingGate,
    pendingGateDiscipline: state.pendingGateDiscipline as SeedingDiscipline | undefined,
    lastHeartbeatAt: state.lastHeartbeatAt,
    createdAt: now,
    updatedAt: now,
    archived: state.archived === true,
    archivedAt: state.archivedAt,
  }
}
