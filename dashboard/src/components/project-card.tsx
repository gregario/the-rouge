'use client'

import { useRouter } from 'next/navigation'
import type { ProjectSummary } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { StateBadge } from '@/components/state-badge'
import { ProviderIcons } from '@/components/stack-icons'
import { cn } from '@/lib/utils'
import { AlertTriangle } from 'lucide-react'

function progressColor(progress: number, hasEscalation: boolean): string {
  if (hasEscalation) return 'text-red-600'
  if (progress >= 100) return 'text-green-600'
  if (progress >= 50) return 'text-blue-600'
  if (progress > 0) return 'text-amber-600'
  return 'text-gray-400'
}

function progressRingColor(progress: number, hasEscalation: boolean): string {
  if (hasEscalation) return 'stroke-red-500'
  if (progress >= 100) return 'stroke-green-500'
  if (progress >= 50) return 'stroke-blue-500'
  if (progress > 0) return 'stroke-amber-500'
  return 'stroke-gray-300'
}

function ProgressRing({ progress, hasEscalation, size = 48 }: { progress: number; hasEscalation: boolean; size?: number }) {
  const strokeWidth = 4
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const filled = (Math.min(progress, 100) / 100) * circumference
  const center = size / 2

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={center} cy={center} r={radius} fill="none" className="stroke-gray-200" strokeWidth={strokeWidth} />
        <circle
          cx={center} cy={center} r={radius} fill="none"
          className={progressRingColor(progress, hasEscalation)}
          strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference - filled}
        />
      </svg>
      <span className={cn('absolute text-[11px] font-bold tabular-nums', progressColor(progress, hasEscalation))}>
        {progress}%
      </span>
    </div>
  )
}

function SegmentedBar({ completed, total, colorClass }: { completed: number; total: number; colorClass: string }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={cn('h-2 flex-1 rounded-full transition-colors', i < completed ? colorClass : 'bg-gray-200')} />
      ))}
    </div>
  )
}

function formatAge(timestamp?: string): string | null {
  if (!timestamp) return null
  const ms = Date.now() - new Date(timestamp).getTime()
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const days = Math.floor(hr / 24)
  return `${days}d ago`
}

function formatCost(cost?: number): string | null {
  if (cost === undefined || cost === null || cost === 0) return null
  return `$${cost.toFixed(2)}`
}

function titleCase(slug: string): string {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export function ProjectCard({ project }: { project: ProjectSummary }) {
  const isComplete = project.state === 'complete'
  const isSeeding = project.state === 'seeding'
  const hasEscalation = !!project.escalation
  const router = useRouter()

  const age = formatAge(project.lastCheckpointAt)
  const cost = formatCost(project.cost.totalSpend)

  // Can't wrap in <Link> because the card contains a nested deploy-URL
  // anchor with stopPropagation — that would be invalid nested
  // interactive content. The role="link" fallback gets the card in
  // the tab order and readable to screen readers; keyboard handler
  // also responds to Space, not just Enter, to match native link
  // activation. Proper refactor (extract URL strip outside the card
  // surface) deferred to a follow-up.
  return (
    <div
      onClick={() => router.push(`/projects/${project.slug}`)}
      className="block cursor-pointer group/link"
      role="link"
      tabIndex={0}
      aria-label={`Open project ${project.name}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          router.push(`/projects/${project.slug}`)
        }
      }}
    >
      <Card className="h-full border border-gray-200 bg-gray-50 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
        <CardContent className="flex flex-col gap-4 p-6">
          {/* Header: name + state pill + liveness chip */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-semibold text-gray-900 truncate">{project.name}</h3>
              <p className="mt-0.5 text-sm text-gray-500 truncate">{project.description}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              {/* ProjectSummary (the home-page card source) doesn't
                  carry buildRunning; the scanner doesn't track PIDs.
                  Badge falls back to non-paused styling. Paused
                  detection lives on the detail page. */}
              <StateBadge state={project.state} size="lg" />
              {project.awaitingGate && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900 ring-1 ring-amber-300"
                  title={project.pendingGateDiscipline
                    ? `Waiting on your answer for ${project.pendingGateDiscipline}`
                    : 'Waiting on your input'}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  awaiting you
                </span>
              )}
            </div>
          </div>

          {/* Escalation alert — inline when present */}
          {hasEscalation && project.escalation && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-red-600" />
              <span className="text-xs text-red-800">{project.escalation.reason}</span>
            </div>
          )}

          {/* Progress ring + milestone/discipline bar */}
          <div className="flex items-center gap-4">
            <ProgressRing progress={project.progress} hasEscalation={hasEscalation} />

            <div className="flex-1 min-w-0">
              {/* Milestone progress for building projects */}
              {!isComplete && !isSeeding && project.milestonesTotal > 0 && (
                <div data-testid="milestone-progress">
                  <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
                    <span className="font-medium">Milestones</span>
                    <span className="tabular-nums font-semibold text-gray-900">
                      {project.milestonesCompleted} / {project.milestonesTotal}
                    </span>
                  </div>
                  <SegmentedBar completed={project.milestonesCompleted} total={project.milestonesTotal} colorClass="bg-blue-500" />
                  {project.currentMilestone && (
                    <p className="mt-1.5 text-xs text-gray-500 truncate">
                      {project.currentMilestone}
                    </p>
                  )}
                </div>
              )}

              {/* Discipline progress for seeding projects */}
              {isSeeding && project.seedingProgress && (
                <div data-testid="discipline-progress">
                  <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
                    <span className="font-medium">Disciplines</span>
                    <span className="tabular-nums font-semibold text-gray-900">
                      {project.seedingProgress.completedCount} / {project.seedingProgress.totalCount}
                    </span>
                  </div>
                  <SegmentedBar
                    completed={project.seedingProgress.completedCount}
                    total={project.seedingProgress.totalCount}
                    colorClass="bg-purple-500"
                  />
                </div>
              )}

              {/* Shipped date for complete projects */}
              {isComplete && (
                <div data-testid="shipped-date">
                  <p className="text-sm text-green-600 font-medium">
                    Shipped
                  </p>
                  {cost && <p className="text-xs text-gray-500">Build cost: {cost}</p>}
                </div>
              )}
            </div>
          </div>

          {/* Footer: cost + last activity + providers + URL */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-200">
            <div className="flex items-center gap-3">
              <ProviderIcons providers={project.providers} />
              {!isComplete && cost && (
                <span className="text-[10px] tabular-nums text-gray-400">{cost}</span>
              )}
              {!isComplete && age && (
                <span className="text-[10px] text-gray-400">{age}</span>
              )}
            </div>
            {(project.productionUrl || project.stagingUrl) && (
              <a
                href={project.productionUrl || project.stagingUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="truncate text-xs text-gray-500 hover:text-gray-900 hover:underline max-w-[50%]"
                title={project.productionUrl || project.stagingUrl}
              >
                {(project.productionUrl || project.stagingUrl)?.replace(/^https?:\/\//, '')}
              </a>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
