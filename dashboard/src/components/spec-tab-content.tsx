'use client'

import { useState, useEffect } from 'react'
import type { SeedingProgress, SeedingDiscipline } from '@/lib/types'
import { DisciplineStepper } from '@/components/discipline-stepper'
import { ChatPanel } from '@/components/chat-panel'
import { SpecView, type ProjectSpec } from '@/components/spec-view'
import { cn } from '@/lib/utils'
import { Eye, MessageSquare } from 'lucide-react'

type Mode = 'view' | 'revise'

interface SpecTabContentProps {
  spec: ProjectSpec | null
  slug: string
  seedingProgress?: SeedingProgress
  defaultMode: Mode
  selectedDiscipline?: SeedingDiscipline
  onSelectDiscipline: (d: SeedingDiscipline | undefined) => void
  // When true, Revise is locked (build is actively running and changing the
  // spec would cause drift between the running loop and updated artifacts).
  reviseLocked?: boolean
  reviseLockReason?: string
  // Surfaced from scanner/seeding-state. When set, DisciplineStepper
  // renders an "awaiting you" badge next to that discipline so users
  // see which discipline is blocking.
  pendingGateDiscipline?: SeedingDiscipline
}

export function SpecTabContent({
  spec,
  slug,
  seedingProgress,
  defaultMode,
  selectedDiscipline,
  onSelectDiscipline,
  reviseLocked = false,
  reviseLockReason,
  pendingGateDiscipline,
}: SpecTabContentProps) {
  const hasAnySpecContent = !!(
    spec?.hasVision || spec?.hasMilestones || spec?.hasLegacySpec
  )

  // Three stages:
  //   1. Legacy project (no seedingProgress) — just SpecView, no toggle
  //   2. Creating (seedingProgress but no artifacts yet) — chat only, no toggle
  //   3. Reviewing (artifacts exist) — View/Revise toggle
  const stage: 'legacy' | 'creating' | 'reviewing' = !seedingProgress
    ? 'legacy'
    : !hasAnySpecContent
      ? 'creating'
      : 'reviewing'

  const [mode, setMode] = useState<Mode>(defaultMode)

  // Sync mode when defaultMode changes (e.g., state transitions from seeding to ready).
  // If Revise gets locked while user is in Revise mode, flip them to View.
  useEffect(() => {
    if (reviseLocked && mode === 'revise') {
      setMode('view')
    } else {
      setMode(defaultMode)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultMode, reviseLocked])

  const completedDisciplines = seedingProgress?.disciplines
    .filter(d => d.status === 'complete')
    .map(d => d.discipline) ?? []

  // Stage 1: Legacy project — SpecView only
  if (stage === 'legacy') {
    return <SpecView spec={spec} />
  }

  // Stage 2: Creating (no artifacts yet) — chat only, no toggle
  if (stage === 'creating' && seedingProgress) {
    return <SeedingLayout
      seedingProgress={seedingProgress}
      slug={slug}
      completedDisciplines={completedDisciplines}
      selectedDiscipline={selectedDiscipline}
      onSelectDiscipline={onSelectDiscipline}
    />
  }

  // Stage 3: Reviewing — View/Revise toggle
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 p-1 w-fit">
        <button
          onClick={() => setMode('view')}
          className={cn(
            'flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium transition-colors',
            mode === 'view'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          )}
          data-testid="spec-mode-view"
        >
          <Eye className="size-3.5" />
          View
        </button>
        <button
          onClick={() => !reviseLocked && setMode('revise')}
          disabled={reviseLocked}
          title={reviseLocked ? (reviseLockReason ?? 'Locked while build is running') : undefined}
          className={cn(
            'flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium transition-colors',
            reviseLocked
              ? 'cursor-not-allowed text-gray-300'
              : mode === 'revise'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
          )}
          data-testid="spec-mode-revise"
        >
          <MessageSquare className="size-3.5" />
          Revise with Rouge
        </button>
      </div>

      {mode === 'view' ? (
        <SpecView spec={spec} />
      ) : seedingProgress ? (
        <SeedingLayout
          seedingProgress={seedingProgress}
          slug={slug}
          completedDisciplines={completedDisciplines}
          selectedDiscipline={selectedDiscipline}
          onSelectDiscipline={onSelectDiscipline}
        />
      ) : null}
    </div>
  )
}

function SeedingLayout({
  seedingProgress,
  slug,
  completedDisciplines,
  selectedDiscipline,
  onSelectDiscipline,
}: {
  seedingProgress: SeedingProgress
  slug: string
  completedDisciplines: string[]
  selectedDiscipline?: SeedingDiscipline
  onSelectDiscipline: (d: SeedingDiscipline | undefined) => void
}) {
  return (
    <div className="grid min-h-[60vh] grid-cols-1 gap-6 lg:grid-cols-5">
      <div className="lg:col-span-1">
        <div className="sticky top-4 rounded-lg border border-gray-200 bg-gray-50 p-5">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Disciplines
          </h3>
          <DisciplineStepper
            disciplines={seedingProgress.disciplines}
            currentDiscipline={seedingProgress.currentDiscipline}
            selectedDiscipline={selectedDiscipline}
            onSelectDiscipline={onSelectDiscipline}
            pendingGateDiscipline={pendingGateDiscipline}
          />
        </div>
      </div>
      <div className="flex flex-col lg:col-span-4">
        <ChatPanel
          messages={[]}
          slug={slug}
          completedDisciplines={completedDisciplines}
          currentDiscipline={seedingProgress.currentDiscipline}
          selectedDiscipline={selectedDiscipline}
        />
      </div>
    </div>
  )
}
