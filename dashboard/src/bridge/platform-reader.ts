import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

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
}

// Provider limits (free tier / common defaults — display only, not enforced)
const DEFAULT_LIMITS: Record<string, number> = {
  cloudflare: 2,
  supabase: 2,
  vercel: 10,
  sentry: 5,
  posthog: 20,
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

  for (const entry of entries) {
    const projectDir = join(projectsRoot, entry)
    try {
      if (!statSync(projectDir).isDirectory()) continue
    } catch {
      continue
    }

    const statePath = join(projectDir, 'state.json')
    const contextPath = join(projectDir, 'cycle_context.json')
    if (!existsSync(statePath)) continue

    let state: Record<string, unknown> = {}
    try {
      state = JSON.parse(readFileSync(statePath, 'utf-8'))
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
        existsSync(join(projectsRoot, e, 'state.json'))
      )
    } catch {
      return false
    }
  }).length

  return { quotas, totalProjects }
}
