import { readdirSync, readFileSync, existsSync, statSync } from 'fs'
import { join } from 'path'
import type { BridgeProjectSummary } from './types'
import { readChatLog } from './chat-reader'
import { statePath } from './state-path'
import { repairProjectState } from './state-repair'
import { safeReadJson } from '@/lib/safe-read-json'

/**
 * Scan a Rouge projects directory and return normalized summaries
 * for every project that contains a state.json file.
 *
 * Runs an idempotent state-repair pass on each project before
 * normalising — heals two known corruption shapes (stuck-seeding
 * and null-foundation) that the build/seeding flow has historically
 * produced on crash paths.
 */
export async function scanProjects(projectsRoot: string): Promise<BridgeProjectSummary[]> {
  const entries = readdirSync(projectsRoot)
  const projects: BridgeProjectSummary[] = []

  for (const entry of entries) {
    const dir = join(projectsRoot, entry)
    try {
      if (!statSync(dir).isDirectory()) continue
    } catch {
      continue
    }

    const stateFile = statePath(dir)
    if (!existsSync(stateFile)) continue

    // Repair known corruption shapes BEFORE reading state, so the
    // normalised summary reflects the healed values. Idempotent —
    // healthy projects are a no-op.
    try {
      const report = await repairProjectState(dir)
      if (report.fixes.length > 0) {
        console.log(`[state-repair] ${entry}: ${report.fixes.join('; ')}`)
      }
    } catch (err) {
      console.warn(`[state-repair] ${entry} threw:`, err instanceof Error ? err.message : err)
    }

    const raw = safeReadJson<Record<string, unknown> | null>(stateFile, null, {
      context: `scanner:${entry}`,
    })
    if (!raw) {
      // Either missing (shouldn't happen — we just checked) or
      // malformed (logged by safeReadJson). Skip so the scan completes
      // for healthy siblings.
      continue
    }
    try {
      // Fall back to task_ledger.json for milestones if state.json's
      // field is empty — V3 canonical source of truth (see README
      // "dual ledger"). Keeps milestone counts in the specs table
      // honest for projects that decomposed spec but didn't complete
      // the approval handshake.
      const withMilestones = mergeRawMilestonesFromLedger(dir, raw)
      const { providers, deploymentUrl } = deriveProviders(dir)
      projects.push(normalizeProject(entry, withMilestones, providers, deploymentUrl, dir))
    } catch (err) {
      console.warn(`[scanner] ${entry} normalise failed:`, err instanceof Error ? err.message : err)
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

// Narrow alias of the canonical RougeEscalation shape for scanner's
// internal summary computation. Keep in sync by structurally pulling
// the fields we actually read — TypeScript complains if bridge/types.ts
// drops any of these.
type RawEscalation = Pick<import('./types').RougeEscalation, 'tier' | 'summary' | 'status'>

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
  const ctx = safeReadJson<CycleContext | null>(contextPath, null, {
    context: `scanner:deriveProviders:${projectDir.split('/').pop()}`,
  })
  if (!ctx) return { providers: [] }
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
}

/**
 * Compute the project's "last activity" timestamp for the specs-table
 * "Last touched" column. Takes the max of:
 *   - seeding-state.json.last_activity (bumped on every user turn in
 *     seeding)
 *   - the provided lastCheckpointTs (from checkpoints.jsonl, covers
 *     the build loop)
 *   - state.json file mtime (fallback when neither has been written)
 * Returns undefined if nothing readable exists — the UI falls back to
 * "—" in that case.
 */
function computeLastActivity(
  projectDir: string,
  lastCheckpointTs: string | undefined,
): string | undefined {
  const candidates: number[] = []

  // Seeding-state last_activity — set every user turn during seeding.
  const sp = join(projectDir, 'seeding-state.json')
  const seedingRaw = safeReadJson<{ last_activity?: string } | null>(sp, null, {
    context: `scanner:lastActivity:${projectDir.split('/').pop()}`,
  })
  if (seedingRaw?.last_activity) {
    const t = new Date(seedingRaw.last_activity).getTime()
    if (!Number.isNaN(t)) candidates.push(t)
  }

  if (lastCheckpointTs) {
    const t = new Date(lastCheckpointTs).getTime()
    if (!Number.isNaN(t)) candidates.push(t)
  }

  // state.json mtime as a floor — always present when this function runs
  // (we only call it on projects that passed the state-file existence
  // check upstream).
  try {
    const st = statSync(statePath(projectDir))
    candidates.push(st.mtimeMs)
  } catch {
    // ignore
  }

  if (candidates.length === 0) return undefined
  return new Date(Math.max(...candidates)).toISOString()
}

// Mirror of mergeMilestonesFromLedger from project-details.ts, kept
// local to scanner.ts so the bridge module doesn't pull in lib/ types.
// When state.json.milestones is empty but task_ledger.json holds the
// full decomposition, surface those milestones so the specs table
// shows accurate counts. See project-details.ts for the full
// rationale.
function mergeRawMilestonesFromLedger(
  projectDir: string,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const existing = raw.milestones
  if (Array.isArray(existing) && existing.length > 0) return raw
  const ledgerPath = join(projectDir, 'task_ledger.json')
  if (!existsSync(ledgerPath)) return raw
  const ledger = safeReadJson<{ milestones?: unknown[] } | null>(ledgerPath, null, {
    context: `scanner:ledger:${projectDir.split('/').pop()}`,
  })
  if (!ledger || !Array.isArray(ledger.milestones) || ledger.milestones.length === 0) {
    return raw
  }
  return { ...raw, milestones: ledger.milestones }
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

  // Last-activity computation for the specs table. Seeding-state's
  // `last_activity` gets bumped on every user turn and is the freshest
  // signal during seeding. Checkpoints cover the build loop. File mtime
  // is the fallback when neither exists yet (e.g. a brand-new spec with
  // no turns).
  const lastActivityAt = computeLastActivity(projectDir, lastCheckpoint.timestamp)

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
    lastActivityAt,
    hasStateFile: true,
    providers,
    deploymentUrl,
  }
}
