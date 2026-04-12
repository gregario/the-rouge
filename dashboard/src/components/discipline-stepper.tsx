'use client'

import type { DisciplineProgress, SeedingDiscipline } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Check, Circle, Loader2 } from 'lucide-react'

const DISCIPLINE_ORDER: SeedingDiscipline[] = [
  'brainstorming',
  'competition',
  'taste',
  'spec',
  'infrastructure',
  'design',
  'legal-privacy',
  'marketing',
]

const DISCIPLINE_LABELS: Record<SeedingDiscipline, string> = {
  brainstorming: 'Brainstorming',
  competition: 'Competition',
  taste: 'Taste',
  spec: 'Spec',
  infrastructure: 'Infrastructure',
  design: 'Design',
  'legal-privacy': 'Legal & Privacy',
  marketing: 'Marketing',
}

function StatusIcon({ status }: { status: DisciplineProgress['status'] }) {
  if (status === 'complete') {
    return (
      <div
        data-testid="discipline-icon"
        data-status="complete"
        className="flex size-6 items-center justify-center rounded-full bg-green-100 text-green-600"
      >
        <Check className="size-3.5" />
      </div>
    )
  }

  if (status === 'in-progress') {
    return (
      <div
        data-testid="discipline-icon"
        data-status="in-progress"
        className="flex size-6 items-center justify-center rounded-full bg-purple-100 text-purple-600"
      >
        <Loader2 className="size-3.5 animate-spin" />
      </div>
    )
  }

  return (
    <div
      data-testid="discipline-icon"
      data-status="pending"
      className="flex size-6 items-center justify-center rounded-full bg-gray-100 text-gray-400"
    >
      <Circle className="size-3" />
    </div>
  )
}

interface DisciplineStepperProps {
  disciplines: DisciplineProgress[]
  currentDiscipline?: SeedingDiscipline
  selectedDiscipline?: SeedingDiscipline
  onSelectDiscipline?: (discipline: SeedingDiscipline) => void
}

export function DisciplineStepper({
  disciplines,
  currentDiscipline,
  selectedDiscipline,
  onSelectDiscipline,
}: DisciplineStepperProps) {
  const statusMap = new Map(
    disciplines.map((d) => [d.discipline, d.status])
  )

  return (
    <nav
      className="flex flex-col gap-0.5"
      data-testid="discipline-stepper"
      aria-label="Seeding disciplines"
    >
      {DISCIPLINE_ORDER.map((discipline, i) => {
        const status = statusMap.get(discipline) ?? 'pending'
        const isCurrent = discipline === currentDiscipline
        const isSelected = discipline === (selectedDiscipline ?? currentDiscipline)
        const isClickable = status === 'complete' || status === 'in-progress'
        const isLast = i === DISCIPLINE_ORDER.length - 1

        return (
          <button
            key={discipline}
            type="button"
            disabled={!isClickable}
            onClick={() => isClickable && onSelectDiscipline?.(discipline)}
            className={cn(
              'relative flex gap-3 text-left w-full rounded-md transition-colors',
              isClickable ? 'cursor-pointer hover:bg-gray-100' : 'cursor-default',
              isSelected && 'bg-gray-100',
            )}
            data-testid="discipline-step"
          >
            {/* Vertical connector line */}
            <div className="flex flex-col items-center">
              <StatusIcon status={status} />
              {!isLast && (
                <div
                  className={cn(
                    'mt-0.5 w-px flex-1 min-h-4',
                    status === 'complete'
                      ? 'bg-green-300'
                      : 'bg-gray-200'
                  )}
                />
              )}
            </div>

            {/* Label */}
            <div
              className={cn(
                'pb-3 text-sm leading-6',
                isSelected
                  ? 'font-semibold text-foreground'
                  : isCurrent
                    ? 'font-medium text-foreground'
                    : status === 'complete'
                      ? 'text-muted-foreground'
                      : 'text-muted-foreground/60'
              )}
            >
              {DISCIPLINE_LABELS[discipline]}
            </div>
          </button>
        )
      })}
    </nav>
  )
}
