import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { statePath, hasStateFile } from './state-path'

export interface ProviderProject {
  slug: string
  name: string
  deployUrl?: string
  status: 'active' | 'paused'
}

export interface ProviderQuota {
  provider: 'vercel' | 'cloudflare' | 'supabase' | 'sentry' | 'posthog'
  displayName: string
  projects: ProviderProject[]
  // Quota limits — real numbers would come from provider APIs. Use defaults for now.
  limit?: number
}

export interface PlatformData {
  quotas: ProviderQuota[]
  totalProjects: number
  // Aggregated spend figures across all non-archived projects. Cap total is
  // the sum of per-project budget_cap_usd (falling back to globalDefault for
  // projects that predate per-project caps). Spend total sums
  // state.costs.cumulative_cost_usd, same field as the project cards.
  totalSpendUsd: number
  totalCapUsd: number
}

// Provider limits (free tier / common defaults — display only, not enforced)
const DEFAULT_LIMITS: Record<string, number> = {
  cloudflare: 2,
  supabase: 2,
  vercel: 10,
  sentry: 5,
  posthog: 20,
}

// Read rouge.config.json's global default cap. Projects that predate
// per-project caps still fall back to this at enforcement time, so we mirror
// that in aggregation.
function readGlobalDefaultCap(projectsRoot: string): number {
  const candidates = [
    join(projectsRoot, '..', 'rouge.config.json'),
    join(process.cwd(), 'rouge.config.json'),
  ]
  for (const p of candidates) {
    try {
      if (existsSync(p)) {
        const cfg = JSON.parse(readFileSync(p, 'utf-8')) as { budget_cap_usd?: number }
        if (typeof cfg.budget_cap_usd === 'number') return cfg.budget_cap_usd
      }
    } catch { /* next */ }
  }
  return 100
}

export function readPlatformData(projectsRoot: string): PlatformData {
  const entries = readdirSync(projectsRoot)
  const providerMap: Record<string, ProviderProject[]> = {
    vercel: [],
    cloudflare: [],
    supabase: [],
    sentry: [],
    posthog: [],
  }
  const globalDefaultCap = readGlobalDefaultCap(projectsRoot)
  let totalSpendUsd = 0
  let totalCapUsd = 0

  for (const entry of entries) {
    const projectDir = join(projectsRoot, entry)
    try {
      if (!statSync(projectDir).isDirectory()) continue
    } catch {
      continue
    }

    const stateFile = statePath(projectDir)
    const contextPath = join(projectDir, 'cycle_context.json')
    if (!existsSync(stateFile)) continue

    let state: Record<string, unknown> = {}
    try {
      state = JSON.parse(readFileSync(stateFile, 'utf-8'))
    } catch {
      // ignore
    }

    let ctx: Record<string, unknown> = {}
    try {
      if (existsSync(contextPath)) ctx = JSON.parse(readFileSync(contextPath, 'utf-8'))
    } catch {
      // ignore
    }

    const infra = (ctx.infrastructure as Record<string, unknown> | undefined) ?? {}
    const deployUrl =
      (infra.production_url as string | undefined) ||
      (infra.staging_url as string | undefined) ||
      undefined
    const name = (state.project as string | undefined) ?? (state.name as string | undefined) ?? entry
    const currentState = state.current_state as string | undefined

    // Platform status is binary: deployment is either actively serving or paused.
    // "complete" state doesn't mean paused — a shipped project can still be live.
    // Only `waiting-for-human` maps to paused; everything else is active.
    const status: 'active' | 'paused' =
      currentState === 'waiting-for-human' ? 'paused' : 'active'

    // Archived projects don't count toward spend or cap totals — they're
     // parked, not active budget. Mirrors the homepage filter.
    if (state.archived !== true) {
      const costs = (state.costs as { cumulative_cost_usd?: number } | undefined) ?? {}
      const spend = typeof costs.cumulative_cost_usd === 'number' ? costs.cumulative_cost_usd : 0
      const cap = typeof state.budget_cap_usd === 'number' ? (state.budget_cap_usd as number) : globalDefaultCap
      totalSpendUsd += spend
      totalCapUsd += cap
    }

    const project: ProviderProject = { slug: entry, name, deployUrl, status }

    // Match providers by URL
    const url = deployUrl ?? ''
    if (url.includes('.vercel.app')) providerMap.vercel.push(project)
    if (url.includes('.pages.dev') || url.includes('.workers.dev'))
      providerMap.cloudflare.push(project)
    if (infra.supabase_url && infra.supabase_ref) providerMap.supabase.push(project)
    if (infra.sentry_dsn) providerMap.sentry.push(project)

    // PostHog detection — readiness.posthog is true when env var is set.
    // PostHog uses a single shared key across projects, so this just means
    // the project is tagged with a product name.
    const readiness = (infra.readiness as Record<string, unknown> | undefined) ?? {}
    if (readiness.posthog === true) providerMap.posthog.push(project)
  }

  const quotas: ProviderQuota[] = [
    {
      provider: 'cloudflare',
      displayName: 'Cloudflare',
      projects: providerMap.cloudflare,
      limit: DEFAULT_LIMITS.cloudflare,
    },
    {
      provider: 'vercel',
      displayName: 'Vercel',
      projects: providerMap.vercel,
      limit: DEFAULT_LIMITS.vercel,
    },
    {
      provider: 'supabase',
      displayName: 'Supabase',
      projects: providerMap.supabase,
      limit: DEFAULT_LIMITS.supabase,
    },
    {
      provider: 'sentry',
      displayName: 'Sentry',
      projects: providerMap.sentry,
      limit: DEFAULT_LIMITS.sentry,
    },
    {
      provider: 'posthog',
      displayName: 'PostHog',
      projects: providerMap.posthog,
      limit: DEFAULT_LIMITS.posthog,
    },
  ]

  const totalProjects = entries.filter((e) => {
    try {
      return (
        statSync(join(projectsRoot, e)).isDirectory() &&
        hasStateFile(join(projectsRoot, e))
      )
    } catch {
      return false
    }
  }).length

  return {
    quotas,
    totalProjects,
    totalSpendUsd,
    totalCapUsd,
  }
}
