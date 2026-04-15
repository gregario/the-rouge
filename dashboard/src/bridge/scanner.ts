import { readdirSync, readFileSync, existsSync, statSync } from 'fs'
import { join } from 'path'
import type { BridgeProjectSummary } from './types'
import { readChatLog } from './chat-reader'

/**
 * Scan a Rouge projects directory and return normalized summaries
 * for every project that contains a state.json file.
 */
export function scanProjects(projectsRoot: string): BridgeProjectSummary[] {
  const entries = readdirSync(projectsRoot)
  const projects: BridgeProjectSummary[] = []

  for (const entry of entries) {
    const dir = join(projectsRoot, entry)
    try {
      if (!statSync(dir).isDirectory()) continue
    } catch {
      continue
    }

    const stateFile = join(dir, 'state.json')
    if (!existsSync(stateFile)) continue

    try {
      const raw = JSON.parse(readFileSync(stateFile, 'utf-8'))
      const { providers, deploymentUrl } = deriveProviders(dir)
      projects.push(normalizeProject(entry, raw, providers, deploymentUrl, dir))
    } catch {
      // Skip projects with malformed state.json
      continue
    }
  }

  return projects
}

function detectSchemaVersion(raw: Record<string, unknown>): 'v2' | 'v3' {
  if (Array.isArray(raw.milestones)) return 'v3'
  if (Array.isArray(raw.feature_areas)) return 'v2'
  // Default to v2 for unrecognised shapes
  return 'v2'
}

// The slug fallback used to titleCase things like `untitled-mo0c46fx` into
// "Untitled Mo0c46fx", which leaked the filesystem artifact into the UI.
// For placeholder slugs we return empty string and let the UI render
// "Untitled spec" from isPlaceholderName instead.
function slugFallbackName(slug: string): string {
  if (slug.startsWith('untitled-') || slug === 'untitled') return ''
  return slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function isPlaceholderName(n: string): boolean {
  const t = n.trim().toLowerCase()
  return t === '' || t === 'untitled' || t === 'untitled spec'
}

function firstMessageSummary(projectDir: string): { count: number; preview?: string } {
  try {
    const log = readChatLog(projectDir)
    const humanMessages = log.filter((m) => m.role === 'human')
    if (humanMessages.length === 0) return { count: 0 }
    const first = humanMessages[0].content.trim().replace(/\s+/g, ' ')
    const preview = first.length > 140 ? first.slice(0, 137) + '…' : first
    return { count: humanMessages.length, preview }
  } catch {
    return { count: 0 }
  }
}

function computeProgress(
  state: string,
  milestones: V3Milestone[],
  seedingProgress?: { completedCount?: number; totalCount?: number },
): number {
  if (state === 'complete') return 100
  if (state === 'seeding') {
    const done = seedingProgress?.completedCount ?? 0
    const total = seedingProgress?.totalCount ?? 8
    return total > 0 ? Math.round((done / total) * 100) : 0
  }
  // Story-level progress across all milestones
  let totalStories = 0
  let doneStories = 0
  for (const m of milestones) {
    for (const s of m.stories ?? []) {
      totalStories++
      if (s.status === 'done' || s.status === 'complete' || s.status === 'completed') doneStories++
    }
  }
  return totalStories > 0 ? Math.round((doneStories / totalStories) * 100) : 0
}

function computeHealth(state: string, hasEscalation: boolean, progress: number): number {
  // Health is progress-based but penalised by state issues
  if (state === 'complete') return 100
  if (hasEscalation) return Math.min(progress, 30)
  if (state === 'waiting-for-human') return Math.min(progress, 50)
  return progress
}

interface V3Milestone {
  name: string
  status: string
  stories?: { id: string; name: string; status: string }[]
}

interface V2FeatureArea {
  name: string
  status: string
}

interface RawEscalation {
  tier: number
  summary: string
  status: string
}

interface CycleContext {
  infrastructure?: {
    staging_url?: string | null
    production_url?: string | null
    supabase_url?: string | null
    supabase_ref?: string | null
    sentry_dsn?: string | null
    readiness?: {
      posthog?: boolean
      sentry?: boolean
      supabase?: boolean
      cloudflare?: boolean
    }
  }
}

function deriveProviders(projectDir: string): {
  providers: string[]
  deploymentUrl?: string
} {
  const contextPath = join(projectDir, 'cycle_context.json')
  if (!existsSync(contextPath)) return { providers: [] }
  try {
    const ctx: CycleContext = JSON.parse(readFileSync(contextPath, 'utf-8'))
    const infra = ctx.infrastructure ?? {}
    const urls = [infra.staging_url, infra.production_url]
      .filter(Boolean)
      .join(' ')
    const providers: string[] = []
    if (urls.includes('.vercel.app')) providers.push('vercel')
    if (urls.includes('.pages.dev') || urls.includes('.workers.dev'))
      providers.push('cloudflare')
    if (infra.supabase_url && infra.supabase_ref) providers.push('supabase')
    if (infra.sentry_dsn) providers.push('sentry')
    if (infra.readiness?.posthog === true) providers.push('posthog')
    return {
      providers,
      deploymentUrl: infra.production_url || infra.staging_url || undefined,
    }
  } catch {
    return { providers: [] }
  }
}

function readLastCheckpoint(projectDir: string): { costUsd?: number; timestamp?: string } {
  const path = join(projectDir, 'checkpoints.jsonl')
  if (!existsSync(path)) return {}
  try {
    const raw = readFileSync(path, 'utf-8').trim()
    if (!raw) return {}
    const lines = raw.split('\n').filter(Boolean)
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const cp = JSON.parse(lines[i])
        return {
          costUsd: cp?.costs?.cumulative_cost_usd,
          timestamp: cp?.timestamp,
        }
      } catch { continue }
    }
    return {}
  } catch { return {} }
}

function normalizeProject(
  slug: string,
  raw: Record<string, unknown>,
  providers: string[],
  deploymentUrl: string | undefined,
  projectDir: string,
): BridgeProjectSummary {
  const version = detectSchemaVersion(raw)
  const state = (raw.current_state as string) || 'unknown'

  // Name: V3 uses raw.project, V2 may use raw.name. Fallback to a
  // slug-derived label that returns '' for `untitled-*` slugs so the
  // Specs table knows to render "Untitled spec" instead of leaking the
  // base36 timestamp.
  const rawName = ((raw.project as string) || (raw.name as string) || '').trim()
  const name = rawName || slugFallbackName(slug)
  const placeholder = isPlaceholderName(name) || slug.startsWith('untitled-')

  // Milestones
  let total = 0
  let completed = 0

  if (version === 'v3') {
    const milestones = (raw.milestones as V3Milestone[]) || []
    total = milestones.length
    completed = milestones.filter(
      m => m.status === 'complete' || m.status === 'promoted',
    ).length
  } else {
    const areas = (raw.feature_areas as V2FeatureArea[]) || []
    total = areas.length
    completed = areas.filter(a => a.status === 'complete').length
  }

  // Escalation: find latest pending
  const escalations = (raw.escalations as RawEscalation[]) || []
  const pending = escalations.find(e => e.status === 'pending')
  const escalation = pending
    ? { tier: pending.tier, summary: pending.summary }
    : undefined

  // Seeding progress
  const seedingProgress = raw.seedingProgress as { completedCount?: number; totalCount?: number } | undefined

  // Progress % and health
  const v3Milestones = version === 'v3' ? (raw.milestones as V3Milestone[]) || [] : []
  const progress = computeProgress(state, v3Milestones, seedingProgress)

  // Cost and last activity from checkpoints
  const lastCheckpoint = readLastCheckpoint(projectDir)

  // First-message preview (only useful for the Specs table on placeholder-
  // named projects, but we read it for everyone — it's trivially cheap).
  const msg = firstMessageSummary(projectDir)

  return {
    name,
    slug,
    messageCount: msg.count,
    firstMessagePreview: msg.preview,
    isPlaceholderName: placeholder,
    archived: raw.archived === true,
    archivedAt: typeof raw.archivedAt === 'string' ? raw.archivedAt : undefined,
    state,
    schemaVersion: version,
    health: computeHealth(state, !!pending, progress),
    progress,
    milestones: { total, completed },
    currentMilestone: (raw.current_milestone as string) || undefined,
    currentStory: (raw.current_story as string) || undefined,
    escalation,
    costUsd: lastCheckpoint.costUsd,
    budgetCapUsd: typeof raw.budget_cap_usd === 'number' ? (raw.budget_cap_usd as number) : undefined,
    lastCheckpointAt: lastCheckpoint.timestamp,
    hasStateFile: true,
    providers,
    deploymentUrl,
  }
}
