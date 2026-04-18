import { useState } from 'react'
import type { ActivityEvent, ActivityEventType } from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  DollarSign,
  GitCommit,
  ArrowRight,
  Rocket,
  Trophy,
  CheckCircle2,
  XCircle,
  Circle,
  Wrench,
} from 'lucide-react'

function eventIcon(type: ActivityEventType) {
  switch (type) {
    case 'deploy':
      return <Rocket className="size-3.5" />
    case 'phase-transition':
      return <ArrowRight className="size-3.5" />
    case 'escalation':
      return <AlertTriangle className="size-3.5" />
    case 'commit':
      return <GitCommit className="size-3.5" />
    case 'cost-alert':
      return <DollarSign className="size-3.5" />
    case 'milestone-promoted':
      return <Trophy className="size-3.5" />
    case 'story-completed':
      return <CheckCircle2 className="size-3.5" />
    case 'failure':
      return <XCircle className="size-3.5" />
    case 'checkpoint':
      return <Circle className="size-3.5" />
    case 'manual-intervention':
      return <Wrench className="size-3.5" />
    default:
      return <ArrowRight className="size-3.5" />
  }
}

function eventIconColor(event: ActivityEvent): string {
  if (event.type === 'escalation' || event.type === 'failure') return 'text-red-600 bg-red-100 border-red-300'
  if (event.type === 'manual-intervention') return 'text-violet-600 bg-violet-100 border-violet-300'
  if (event.type === 'cost-alert') return 'text-amber-600 bg-amber-100 border-amber-300'
  if (event.type === 'checkpoint') return 'text-gray-400 bg-gray-50 border-gray-200'
  if (event.type === 'phase-transition') return 'text-blue-600 bg-blue-100 border-blue-300'

  if (event.type === 'deploy') {
    const status = event.metadata?.deployStatus
    if (status === 'failed') return 'text-red-600 bg-red-100 border-red-300'
    if (status === 'rollback') return 'text-amber-600 bg-amber-100 border-amber-300'
    return 'text-green-600 bg-green-100 border-green-300'
  }

  if (event.type === 'milestone-promoted' || event.type === 'story-completed') {
    return 'text-green-600 bg-green-100 border-green-300'
  }

  return 'text-gray-500 bg-gray-100 border-gray-300'
}

function eventLeftBorder(event: ActivityEvent): string {
  if (event.type === 'escalation' || event.type === 'failure') return 'border-l-red-400'
  if (event.type === 'manual-intervention') return 'border-l-violet-400'
  if (event.type === 'cost-alert') return 'border-l-amber-400'
  if (event.type === 'phase-transition') return 'border-l-blue-200'
  if (event.type === 'deploy') {
    const status = event.metadata?.deployStatus
    if (status === 'failed') return 'border-l-red-400'
    if (status === 'rollback') return 'border-l-amber-400'
    return 'border-l-green-400'
  }
  if (event.type === 'milestone-promoted' || event.type === 'story-completed') return 'border-l-green-400'
  return 'border-l-transparent'
}

function relativeTime(dateString: string): string {
  const now = new Date()
  const date = new Date(dateString)
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60_000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return `${diffDays}d ago`
  return new Date(dateString).toLocaleDateString('en-IE', {
    day: 'numeric',
    month: 'short',
  })
}

function formatDayHeader(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const eventDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.floor((today.getTime() - eventDay.getTime()) / 86400000)

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return date.toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' })
}

function groupByDay(events: ActivityEvent[]): Map<string, ActivityEvent[]> {
  const groups = new Map<string, ActivityEvent[]>()
  for (const event of events) {
    const day = new Date(event.timestamp).toISOString().split('T')[0]
    const existing = groups.get(day)
    if (existing) {
      existing.push(event)
    } else {
      groups.set(day, [event])
    }
  }
  return groups
}

function isDeploy(event: ActivityEvent): boolean {
  return event.type === 'deploy'
}

const PAGE_SIZE = 25

export interface ActivityLogProps {
  events: ActivityEvent[]
  verbose?: boolean
  onToggleVerbose?: (verbose: boolean) => void
}

export function ActivityLog({ events, verbose, onToggleVerbose }: ActivityLogProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const sorted = [...events].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )

  const showToggle = typeof verbose === 'boolean' && typeof onToggleVerbose === 'function'

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col">
        {showToggle && (
          <ToggleHeader verbose={verbose} onToggleVerbose={onToggleVerbose!} />
        )}
        <div className="py-8 text-center text-sm text-muted-foreground">
          No activity recorded yet.
        </div>
      </div>
    )
  }

  const visibleEvents = sorted.slice(0, visibleCount)
  const dayGroups = groupByDay(visibleEvents)
  const hasMore = visibleCount < sorted.length

  return (
    <div className="flex flex-col" data-testid="activity-log">
      {showToggle && (
        <ToggleHeader
          verbose={verbose}
          onToggleVerbose={onToggleVerbose!}
          totalCount={sorted.length}
        />
      )}
      {Array.from(dayGroups.entries()).map(([day, dayEvents]) => (
        <div key={day}>
          {/* Day header */}
          <div className="sticky top-0 z-10 bg-gray-50 py-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {formatDayHeader(dayEvents[0].timestamp)}
            </span>
          </div>

          {/* Events for this day */}
          {dayEvents.map((event) => (
            <div
              key={event.id}
              className={cn(
                'flex items-start gap-3 border-l-2 border-b border-gray-200 py-3 pl-3 last:border-b-0',
                eventLeftBorder(event),
                isDeploy(event) && 'bg-white/50 rounded-r-md',
              )}
            >
              {/* Icon */}
              <div
                className={cn(
                  'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border',
                  eventIconColor(event),
                  isDeploy(event) && 'size-8',
                )}
              >
                {eventIcon(event.type)}
              </div>

              {/* Content */}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={cn(
                    'font-medium text-foreground',
                    isDeploy(event) ? 'text-sm' : 'text-sm',
                  )}>
                    {event.title}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {relativeTime(event.timestamp)}
                  </span>
                </div>
                {event.description && (
                  <p className="text-xs text-muted-foreground">{event.description}</p>
                )}
                {(event.metadata?.deployUrl || event.metadata?.url) &&
                  event.type === 'deploy' &&
                  event.metadata?.deployStatus !== 'failed' && (
                    <a
                      href={event.metadata.deployUrl || (event.metadata.url as string)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 transition-colors hover:text-blue-800"
                    >
                      {event.metadata.deployUrl || (event.metadata.url as string)}
                    </a>
                  )}
                {event.metadata?.commitSha && (
                  <code className="text-[10px] text-muted-foreground font-mono">
                    {event.metadata.commitSha}
                  </code>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
      {hasMore && (
        <button
          type="button"
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          className="mt-3 self-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Load more ({sorted.length - visibleCount} remaining)
        </button>
      )}
    </div>
  )
}

function ToggleHeader({
  verbose,
  onToggleVerbose,
  totalCount,
}: {
  verbose: boolean
  onToggleVerbose: (v: boolean) => void
  totalCount?: number
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <span className="text-xs text-muted-foreground">
        {verbose ? 'All checkpoints' : 'Critical events'}
        {typeof totalCount === 'number' ? ` · ${totalCount}` : ''}
      </span>
      <button
        type="button"
        onClick={() => onToggleVerbose(!verbose)}
        className="text-xs font-medium text-blue-600 hover:text-blue-800"
        title={verbose
          ? 'Collapse back to critical events (milestones, escalations, deploys)'
          : 'Include every checkpoint alongside critical events'}
      >
        {verbose ? 'Show critical only' : 'Show all events'}
      </button>
    </div>
  )
}
