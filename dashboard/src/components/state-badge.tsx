import type { ProjectState } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { phaseLabel, phaseGloss } from '@/lib/phase-labels'

const stateStyles: Record<string, string> = {
  // Escalation / needs attention — warm, urgent
  escalation: 'bg-red-50 text-red-700 border-red-300',
  'waiting-for-human': 'bg-red-50 text-red-700 border-red-300',
  // Building / active — productive, moving
  'story-building': 'bg-blue-50 text-blue-700 border-blue-300',
  foundation: 'bg-blue-50 text-blue-700 border-blue-300',
  'foundation-eval': 'bg-blue-50 text-blue-700 border-blue-300',
  'milestone-check': 'bg-blue-50 text-blue-700 border-blue-300',
  'milestone-fix': 'bg-blue-50 text-blue-700 border-blue-300',
  analyzing: 'bg-blue-50 text-blue-700 border-blue-300',
  'generating-change-spec': 'bg-blue-50 text-blue-700 border-blue-300',
  'vision-check': 'bg-blue-50 text-blue-700 border-blue-300',
  shipping: 'bg-blue-50 text-blue-700 border-blue-300',
  // Seeding / spec — creative, forming
  seeding: 'bg-purple-50 text-purple-700 border-purple-300',
  // Final review — attention, not alarm
  'final-review': 'bg-amber-50 text-amber-700 border-amber-300',
  // Complete / shipped — success
  complete: 'bg-green-50 text-green-700 border-green-300',
  // Ready / parked — neutral
  ready: 'bg-slate-100 text-slate-600 border-slate-300',
}

// States where Rouge is actively running a phase (the loop should have
// a live PID). Used to render a "Paused" overlay on the badge when
// state claims building but no process is alive — previously the
// badge said e.g. "Building this story" in blue while the action bar
// said "Build stopped", which gave users contradictory signals.
const MID_PHASE_STATES: ReadonlySet<ProjectState> = new Set([
  'foundation',
  'foundation-eval',
  'story-building',
  'milestone-check',
  'milestone-fix',
  'analyzing',
  'generating-change-spec',
  'vision-check',
  'shipping',
  'final-review',
])

export function StateBadge({
  state,
  className,
  size = 'default',
  buildRunning,
}: {
  state: ProjectState
  className?: string
  size?: 'default' | 'lg'
  // When state is a mid-phase state but no loop is alive, the badge
  // renders with a subtle "Paused" suffix + muted styling so the
  // visual matches what the ActionBar is saying. Omit for surfaces
  // (project cards on the dashboard home) that don't have PID info.
  buildRunning?: boolean
}) {
  const isPaused = buildRunning === false && MID_PHASE_STATES.has(state)
  const style = isPaused
    ? 'bg-slate-100 text-slate-600 border-slate-300'
    : stateStyles[state] ?? 'bg-slate-100 text-slate-600 border-slate-300'

  return (
    <Badge
      variant="outline"
      className={cn(
        style,
        size === 'lg' && 'h-7 px-3 text-sm font-semibold',
        className,
      )}
      data-state={state}
      data-paused={isPaused ? 'true' : undefined}
      title={phaseGloss(state)}
    >
      {phaseLabel(state)}
      {isPaused && (
        <span className="ml-1.5 text-[10px] uppercase tracking-wider opacity-70">
          · paused
        </span>
      )}
    </Badge>
  )
}
