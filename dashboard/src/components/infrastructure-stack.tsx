import type { InfrastructureManifest } from '@/bridge/infrastructure-reader'
import { AlertTriangle } from 'lucide-react'

interface InfrastructureStackProps {
  manifest: InfrastructureManifest
}

interface Row {
  label: string
  value: string
  detail?: string
}

function buildRows(m: InfrastructureManifest): Row[] {
  const rows: Row[] = []

  if (m.framework?.name) {
    const parts = [m.framework.name]
    if (m.framework.router) parts.push(m.framework.router)
    if (m.framework.version && m.framework.version !== 'latest') parts.push(m.framework.version)
    rows.push({
      label: 'Framework',
      value: parts.join(' · '),
      detail: m.framework.reason,
    })
  }

  if (m.database?.provider || m.database?.type) {
    const parts: string[] = []
    if (m.database.type) parts.push(m.database.type)
    if (m.database.provider && m.database.provider !== m.database.type) {
      parts.push(`via ${m.database.provider}`)
    }
    rows.push({
      label: 'Database',
      value: parts.join(' '),
      detail: m.database.reason,
    })
  }

  if (m.auth?.strategy) {
    rows.push({
      label: 'Auth',
      value: m.auth.strategy,
      detail: m.auth.notes,
    })
  }

  if (m.deploy?.target) {
    const parts = [m.deploy.target]
    if (m.deploy.mode) parts.push(`(${m.deploy.mode})`)
    rows.push({
      label: 'Deploy',
      value: parts.join(' '),
      detail: m.deploy.reason,
    })
  }

  if (m.storage?.provider) {
    const parts = [m.storage.provider]
    if (m.storage.buckets?.length) parts.push(`[${m.storage.buckets.join(', ')}]`)
    rows.push({
      label: 'Storage',
      value: parts.join(' '),
      detail: m.storage.reason,
    })
  }

  if (m.notifications?.strategy) {
    const parts = [m.notifications.strategy]
    if (m.notifications.pwa) parts.push('· PWA')
    if (m.notifications.email) parts.push('· Email')
    rows.push({
      label: 'Notifications',
      value: parts.join(' '),
      detail: m.notifications.reason,
    })
  }

  return rows
}

export function InfrastructureStack({ manifest }: InfrastructureStackProps) {
  const rows = buildRows(manifest)
  const riskFlags = manifest.risk_flags ?? []

  if (rows.length === 0 && riskFlags.length === 0) {
    return <p className="text-xs text-gray-400">Stack not yet configured</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {riskFlags.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {riskFlags.map((flag) => (
            <div
              key={flag.flag}
              className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-amber-900">{flag.flag}</span>
                <span className="text-xs text-amber-800">{flag.description}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline gap-3">
              <span className="w-28 shrink-0 text-xs font-semibold uppercase tracking-wider text-gray-400">
                {row.label}
              </span>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm text-gray-900">{row.value}</span>
                {row.detail && (
                  <span className="text-xs text-gray-500">{row.detail}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
