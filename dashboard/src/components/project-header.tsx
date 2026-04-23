import type { ProjectDetail } from '@/lib/types'
import type { InfrastructureManifest } from '@/bridge/infrastructure-reader'
import { StateBadge } from '@/components/state-badge'
import { StackBar } from '@/components/stack-icons'
import { ProjectStack } from '@/components/project-stack'
import { InfrastructureStack } from '@/components/infrastructure-stack'
import { CycleRhythm } from '@/components/cycle-rhythm'
import { ProjectTitleEditable } from '@/components/project-title-editable'
import { ProjectSettingsMenu } from '@/components/project-settings-menu'
import { ArchiveButton } from '@/components/archive-button'
import { ProjectBudgetCapInline } from '@/components/project-budget-cap-inline'
import { ExternalLink, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

function healthColor(health: number): string {
  if (health >= 75) return 'text-green-600'
  if (health >= 50) return 'text-amber-600'
  return 'text-red-600'
}

function healthRingColor(health: number): string {
  if (health >= 75) return 'stroke-green-500'
  if (health >= 50) return 'stroke-amber-500'
  return 'stroke-red-500'
}

function HealthRingSmall({ health }: { health: number }) {
  const size = 36
  const strokeWidth = 3
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const progress = (health / 100) * circumference
  const center = size / 2

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={center} cy={center} r={radius} fill="none" className="stroke-gray-200" strokeWidth={strokeWidth} />
        <circle cx={center} cy={center} r={radius} fill="none" className={healthRingColor(health)} strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference - progress} />
      </svg>
      <span className={cn('absolute text-[10px] font-bold tabular-nums', healthColor(health))}>
        {health}
      </span>
    </div>
  )
}

export function ProjectHeader({
  project,
  infrastructure,
  onBudgetSaved,
}: {
  project: ProjectDetail
  infrastructure?: InfrastructureManifest | null
  onBudgetSaved?: () => void
}) {

  return (
    <div className="flex flex-col gap-4">
      {/* Back link + archive toggle */}
      <div className="flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors w-fit">
          <ArrowLeft className="size-4" />
          Dashboard
        </Link>
        {project.state !== 'seeding' && project.state !== 'ready' && (
          <ArchiveButton slug={project.slug} archived={!!project.archived} />
        )}
      </div>

      {/* Archived banner */}
      {project.archived && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          This project is archived. It won&apos;t appear on the main dashboard until you unarchive it.
        </div>
      )}

      {/* Title row with inline metrics */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <ProjectTitleEditable slug={project.slug} name={project.name} state={project.state} />
          <ProjectSettingsMenu slug={project.slug} state={project.state} />
          <StateBadge state={project.state} size="lg" buildRunning={project.buildRunning} />
        </div>

        {/* Real metrics only — Build Cost & Last Activity pulled from latest checkpoint */}
        <div className="flex items-center gap-5" data-testid="header-metrics">
          <CycleRhythm
            lastCheckpointAt={project.lastCheckpointAt}
            lastPhase={project.lastPhase}
            checkpointCount={project.checkpointCount}
          />
          {project.state === 'complete' ? (
            <div className="flex flex-col items-center gap-0.5" title="Build cost">
              <span className="text-sm font-semibold tabular-nums text-gray-900">
                ${project.cost.totalSpend.toFixed(2)}
              </span>
              <span className="text-[10px] text-muted-foreground">Build Cost</span>
            </div>
          ) : (
            <ProjectBudgetCapInline
              slug={project.slug}
              cap={project.cost.budgetCap}
              totalSpend={project.cost.totalSpend}
              onSaved={onBudgetSaved}
            />
          )}
        </div>
      </div>

      <p className="text-sm text-gray-500 max-w-2xl">{project.description}</p>

      {/* Deploy + repo links */}
      <div className="flex flex-wrap items-center gap-3">
        {project.productionUrl && (
          <a
            href={project.productionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 transition-colors hover:text-gray-900 hover:border-gray-300"
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
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 transition-colors hover:text-gray-900 hover:border-gray-300"
          >
            <ExternalLink className="size-3" />
            Staging
          </a>
        )}
        {/* Repository link removed — the mapper never populated
            project.repoUrl so the button existed as dead UI for
            months. If repo visibility is wanted, wire it through
            from cycle_context.github_repo. */}
      </div>

      {/* Stack status card */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
          Stack
        </h3>
        {infrastructure
          ? <InfrastructureStack manifest={infrastructure} />
          : project.stack
            ? <ProjectStack stack={project.stack} />
            : <StackBar providers={project.providers} />}
      </div>
    </div>
  )
}
