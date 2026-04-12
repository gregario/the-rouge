import { fetchBridgePlatform, isBridgeEnabled } from '@/lib/bridge-client'
import { platform } from '@/data/platform'
import { ProviderSlotCard } from '@/components/provider-slot-card'
import { LiveRefresh } from '@/components/live-refresh'

interface PlatformData {
  quotas: Array<{
    provider: string
    displayName: string
    projects: Array<{
      slug: string
      name: string
      deployUrl?: string
      status: 'active' | 'paused'
    }>
    limit?: number
  }>
  totalProjects: number
}

async function getData(): Promise<{ data?: PlatformData; error?: string }> {
  if (!isBridgeEnabled()) {
    return { data: { quotas: [], totalProjects: 0 } }
  }
  try {
    const data = await fetchBridgePlatform()
    return { data }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export default async function PlatformPage() {
  const { data, error } = await getData()

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <LiveRefresh />

      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Platform</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Provider quotas, deploys, and infrastructure management.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Bridge error:</strong> {error}
        </div>
      )}

      {data && (
        <>
          <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-6 py-5">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                Monthly Spend
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">
                ${platform.totalMonthlySpend.toFixed(0)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-6 py-5">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                Budget Remaining
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-green-600">
                ${platform.budgetRemaining.toFixed(0)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-6 py-5">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                Projects
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">
                {data.totalProjects}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-6 py-5">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                Total Deploys
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">
                {data.quotas.reduce((sum, q) => sum + q.projects.length, 0)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.quotas.map((q) => (
              <ProviderSlotCard
                key={q.provider}
                provider={q.provider}
                displayName={q.displayName}
                projects={q.projects}
                limit={q.limit}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
