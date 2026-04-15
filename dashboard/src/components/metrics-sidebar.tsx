import type { ProjectDetail } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { StateBadge } from '@/components/state-badge'
import { cn } from '@/lib/utils'
import { ExternalLink } from 'lucide-react'

function healthColor(health: number): string {
  if (health >= 75) return 'text-green-600'
  if (health >= 50) return 'text-amber-600'
  return 'text-red-600'
}

function healthBg(health: number): string {
  if (health >= 75) return 'bg-green-500'
  if (health >= 50) return 'bg-amber-500'
  return 'bg-red-500'
}

function costBarColor(pct: number): string {
  if (pct >= 90) return 'bg-red-500'
  if (pct >= 70) return 'bg-amber-500'
  return 'bg-zinc-500'
}

export function MetricsSidebar({ project }: { project: ProjectDetail }) {
  const costPct =
    project.cost.budgetCap > 0
      ? (project.cost.totalSpend / project.cost.budgetCap) * 100
      : 0
  return (
    <div className="flex flex-col gap-3" data-testid="metrics-sidebar">
      {/* Health */}
      <Card size="sm">
        <CardContent>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Health</span>
            <span
              className={cn('text-2xl font-bold tabular-nums', healthColor(project.health))}
              data-testid="metric-health"
            >
              {project.health}
            </span>
          </div>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full transition-all', healthBg(project.health))}
              style={{ width: `${Math.min(project.health, 100)}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Cost */}
      <Card size="sm">
        <CardContent>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Cost</span>
            <span className="text-sm font-medium tabular-nums text-foreground">
              ${project.cost.totalSpend.toFixed(2)}{' '}
              <span className="text-muted-foreground">/ ${project.cost.budgetCap.toFixed(0)}</span>
            </span>
          </div>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full transition-all', costBarColor(costPct))}
              style={{ width: `${Math.min(costPct, 100)}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Phase */}
      <Card size="sm">
        <CardContent>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Current Phase</span>
            <StateBadge state={project.state} />
          </div>
        </CardContent>
      </Card>

      {/* Deploy links */}
      {(project.productionUrl || project.stagingUrl) && (
        <Card size="sm">
          <CardContent className="flex flex-col gap-2">
            {project.productionUrl && (
              <a
                href={project.productionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <ExternalLink className="size-3" />
                Production
              </a>
            )}
            {project.stagingUrl && (
              <a
                href={project.stagingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <ExternalLink className="size-3" />
                Staging
              </a>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
