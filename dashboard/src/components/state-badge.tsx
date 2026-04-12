import type { ProjectState } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

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
  'story-diagnosis': 'bg-blue-50 text-blue-700 border-blue-300',
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

function formatState(state: string): string {
  return state
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function StateBadge({
  state,
  className,
  size = 'default',
}: {
  state: ProjectState
  className?: string
  size?: 'default' | 'lg'
}) {
  const style = stateStyles[state] ?? 'bg-slate-100 text-slate-600 border-slate-300'

  return (
    <Badge
      variant="outline"
      className={cn(
        style,
        size === 'lg' && 'h-7 px-3 text-sm font-semibold',
        className,
      )}
      data-state={state}
    >
      {formatState(state)}
    </Badge>
  )
}
