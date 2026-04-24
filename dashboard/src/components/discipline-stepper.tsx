'use client'

import { useEffect, useRef, useState } from 'react'
import type { DisciplineProgress, SeedingDiscipline } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Check, Circle, Loader2 } from 'lucide-react'

const DISCIPLINE_ORDER: SeedingDiscipline[] = [
  'brainstorming',
  'competition',
  'taste',
  'sizing',
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
  sizing: 'Sizing',
  spec: 'Spec',
  infrastructure: 'Infrastructure',
  design: 'Design',
  'legal-privacy': 'Legal & Privacy',
  marketing: 'Marketing',
}

function StatusIcon({
  status,
  justCompleted,
}: {
  status: DisciplineProgress['status']
  justCompleted?: boolean
}) {
  if (status === 'complete') {
    return (
      <div
        data-testid="discipline-icon"
        data-status="complete"
        className={cn(
          'flex size-6 items-center justify-center rounded-full bg-green-100 text-green-600',
          // Pulse once when a discipline flips to complete. The `key`
          // trick on the parent retriggers the animation reliably.
          justCompleted && 'animate-in zoom-in-50 duration-500',
        )}
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
  // When set, the matching discipline gets an amber "awaiting you"
  // dot so users see which discipline is blocked on their input.
  pendingGateDiscipline?: SeedingDiscipline
}

export function DisciplineStepper({
  disciplines,
  currentDiscipline,
  selectedDiscipline,
  onSelectDiscipline,
  pendingGateDiscipline,
}: DisciplineStepperProps) {
  const statusMap = new Map(
    disciplines.map((d) => [d.discipline, d.status])
  )

  // Track which disciplines flipped to complete this render cycle so we
  // can retrigger the pulse animation on just those. Keyed on the
  // StatusIcon so the animation plays cleanly.
  const prevStatusRef = useRef<Map<SeedingDiscipline, DisciplineProgress['status']>>(new Map())
  const [justCompleted, setJustCompleted] = useState<Set<SeedingDiscipline>>(new Set())
  useEffect(() => {
    const newly = new Set<SeedingDiscipline>()
    for (const d of DISCIPLINE_ORDER) {
      const prev = prevStatusRef.current.get(d)
      const cur = statusMap.get(d)
      if (cur === 'complete' && prev !== 'complete') newly.add(d)
      if (cur) prevStatusRef.current.set(d, cur)
    }
    if (newly.size > 0) {
      setJustCompleted(newly)
      const id = setTimeout(() => setJustCompleted(new Set()), 1200)
      return () => clearTimeout(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disciplines])

  return (
    <nav
      className="flex flex-col gap-0.5"
      data-testid="discipline-stepper"
      aria-label="Seeding disciplines"
    >
      {DISCIPLINE_ORDER.map((discipline, i) => {
        const rawStatus = statusMap.get(discipline) ?? 'pending'
        const isCurrent = discipline === currentDiscipline
        // The launcher only writes 'pending' / 'complete' to state.json —
        // it never sets 'in-progress' explicitly. So a discipline that's
        // currently active shows up as 'pending' in the raw data and the
        // stepper greyed it out. Derive the effective status here:
        // current + pending = in-progress.
        const status: DisciplineProgress['status'] =
          isCurrent && rawStatus === 'pending' ? 'in-progress' : rawStatus
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
              <StatusIcon
                key={justCompleted.has(discipline) ? `${discipline}-pulse` : discipline}
                status={status}
                justCompleted={justCompleted.has(discipline)}
              />
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
                'pb-3 text-sm leading-6 flex items-center gap-1.5',
                isSelected
                  ? 'font-semibold text-foreground'
                  : isCurrent
                    ? 'font-medium text-foreground'
                    : status === 'complete'
                      ? 'text-muted-foreground'
                      : 'text-muted-foreground/60'
              )}
            >
              <span>{DISCIPLINE_LABELS[discipline]}</span>
              {discipline === pendingGateDiscipline && (
                <span
                  className="inline-flex h-1.5 w-1.5 rounded-full bg-amber-500"
                  aria-label="Awaiting your answer"
                  title="Rouge is waiting on your answer for this discipline"
                />
              )}
            </div>
          </button>
        )
      })}
    </nav>
  )
}
