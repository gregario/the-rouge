'use client'

import Link from 'next/link'

interface ProviderProject {
  slug: string
  name: string
  deployUrl?: string
  status: 'active' | 'paused'
}

interface ProviderSlotCardProps {
  provider: string
  displayName: string
  projects: ProviderProject[]
  limit?: number
}

export function ProviderSlotCard({
  provider: _provider,
  displayName,
  projects,
  limit,
}: ProviderSlotCardProps) {
  const used = projects.length
  const atCapacity = limit !== undefined && used >= limit
  const utilization = limit ? (used / limit) * 100 : 0

  const barColor =
    utilization >= 100
      ? 'bg-red-500'
      : utilization >= 80
        ? 'bg-amber-500'
        : 'bg-green-500'

  return (
    <div
      className="rounded-lg border border-gray-200 bg-gray-50 p-5"
      data-testid="provider-slot-card"
    >
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">{displayName}</h3>
          <span
            className={`text-xs font-medium ${atCapacity ? 'text-red-600' : 'text-gray-500'}`}
          >
            {used}
            {limit !== undefined ? ` / ${limit}` : ''} slots
          </span>
        </div>
        {limit !== undefined && (
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${Math.min(utilization, 100)}%` }}
            />
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2 border-t border-gray-200 pt-4">
        {projects.length === 0 && (
          <p className="text-sm text-gray-400">No projects deployed here.</p>
        )}
        {projects.map((p) => (
          <div
            key={p.slug}
            className="flex items-center justify-between rounded-md border border-gray-200 bg-white p-3"
          >
            <div className="min-w-0 flex-1">
              <Link
                href={`/projects/${p.slug}`}
                className="text-sm font-medium text-gray-900 hover:underline"
              >
                {p.name}
              </Link>
              {p.deployUrl && (
                <a
                  href={p.deployUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-xs text-gray-500 hover:underline"
                >
                  {p.deployUrl}
                </a>
              )}
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={p.status} />
              <button
                className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500 hover:border-gray-300 hover:text-gray-900"
                title="Not wired up yet"
              >
                {p.status === 'active' ? 'Pause' : 'Activate'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: 'active' | 'paused' }) {
  const styles = {
    active: 'bg-green-50 text-green-700 border-green-300',
    paused: 'bg-amber-50 text-amber-700 border-amber-300',
  }
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${styles[status]}`}
    >
      {status}
    </span>
  )
}
