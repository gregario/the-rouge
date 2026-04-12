import type { PlatformData } from '@/lib/types'

export const platform: PlatformData = {
  quotas: [
    {
      provider: 'cloudflare',
      displayName: 'Cloudflare Pages & Workers',
      used: 2,
      limit: 2,
      projects: ['recipe-oracle', 'color-quiz'],
    },
    {
      provider: 'supabase',
      displayName: 'Supabase',
      used: 2,
      limit: 3,
      projects: ['recipe-oracle', 'fleet-dash'],
    },
    {
      provider: 'vercel',
      displayName: 'Vercel',
      used: 2,
      limit: 10,
      projects: ['soundscape', 'fleet-dash'],
    },
  ],
  // @deprecated — use catalogue.ts and /api/catalogue instead
  integrations: [
    {
      name: 'Supabase',
      provider: 'supabase',
      inCatalogue: true,
      usedByCount: 2,
      usedBy: ['recipe-oracle', 'fleet-dash'],
    },
    {
      name: 'Stripe',
      provider: 'stripe',
      inCatalogue: true,
      usedByCount: 0,
      usedBy: [],
    },
    {
      name: 'Cloudflare Workers',
      provider: 'cloudflare',
      inCatalogue: true,
      usedByCount: 2,
      usedBy: ['recipe-oracle', 'color-quiz'],
    },
    {
      name: 'Vercel',
      provider: 'vercel',
      inCatalogue: true,
      usedByCount: 2,
      usedBy: ['soundscape', 'fleet-dash'],
    },
    {
      name: 'Sentry',
      provider: 'sentry',
      inCatalogue: true,
      usedByCount: 0,
      usedBy: [],
    },
  ],
  totalMonthlySpend: 75.00,
  budgetRemaining: 185.00,
}
