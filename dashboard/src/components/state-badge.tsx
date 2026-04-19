import type { ProjectState } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { phaseLabel, phaseGloss } from '@/lib/phase-labels'

// Colour palette groups phases by what they're FOR, not when they
// happen. Previously all "building" phases rendered as the same blue,
// so the user couldn't tell at a glance whether Rouge was executing
// (building), reviewing (milestone-check), or fixing (milestone-fix).
// The three families:
//   blue = actively producing code (foundation / story-building /
//          generating-change-spec)
//   amber = evaluating / reviewing (foundation-eval / milestone-check
//           / vision-check / analyzing)
//   orange = fixing something that failed review (milestone-fix)
//   purple = forming / exploratory (seeding)
//   green = success (complete)
//   red = needs human (escalation / waiting-for-human)
//   slate = parked / final gate (ready / final-review)
const stateStyles: Record<string, string> = {
  escalation: 'bg-red-50 text-red-700 border-red-300',
  'waiting-for-human': 'bg-red-50 text-red-700 border-red-300',
  // Producing
  foundation: 'bg-blue-50 text-blue-700 border-blue-300',
  'story-building': 'bg-blue-50 text-blue-700 border-blue-300',
  'generating-change-spec': 'bg-blue-50 text-blue-700 border-blue-300',
  shipping: 'bg-blue-50 text-blue-700 border-blue-300',
  // Reviewing
  'foundation-eval': 'bg-amber-50 text-amber-700 border-amber-300',
  'milestone-check': 'bg-amber-50 text-amber-700 border-amber-300',
  'vision-check': 'bg-amber-50 text-amber-700 border-amber-300',
  analyzing: 'bg-amber-50 text-amber-700 border-amber-300',
  // Fixing
  'milestone-fix': 'bg-orange-50 text-orange-700 border-orange-300',
  // Forming
  seeding: 'bg-purple-50 text-purple-700 border-purple-300',
  // Final gate / complete / ready
  'final-review': 'bg-slate-100 text-slate-700 border-slate-400',
  complete: 'bg-green-50 text-green-700 border-green-300',
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
