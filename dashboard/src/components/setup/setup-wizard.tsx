'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DoctorStep } from './doctor-step'

// Phase 3a ships the wizard shell + the doctor (prereqs) step only.
// Phases 3b and 3c will fill in Secrets, Slack, Daemon, and Finish.
const steps = [
  { id: 'prereqs', label: 'Prerequisites', status: 'active' as const },
  { id: 'secrets', label: 'Integrations', status: 'coming-soon' as const },
  { id: 'slack', label: 'Slack (optional)', status: 'coming-soon' as const },
  { id: 'daemon', label: 'Background daemon', status: 'coming-soon' as const },
  { id: 'finish', label: 'Create first project', status: 'coming-soon' as const },
]

export function SetupWizard() {
  const [activeId, setActiveId] = useState('prereqs')
  const [prereqsReady, setPrereqsReady] = useState(false)

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Set up Rouge</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          One-time setup — takes under 5 minutes. You can come back to this page
          anytime from the nav.
        </p>
      </header>

      {/* Step indicator */}
      <nav className="mb-8 flex flex-wrap items-center gap-2" aria-label="Setup progress">
        {steps.map((step, i) => {
          const isActive = step.id === activeId
          const isDone = step.id === 'prereqs' && prereqsReady
          const isComingSoon = step.status === 'coming-soon'
          return (
            <div key={step.id} className="flex items-center gap-2">
              <button
                type="button"
                disabled={isComingSoon}
                onClick={() => !isComingSoon && setActiveId(step.id)}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive && 'bg-accent text-accent-foreground',
                  !isActive && !isComingSoon && 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                  isComingSoon && 'cursor-not-allowed text-muted-foreground/50',
                )}
              >
                <span className={cn(
                  'inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs',
                  isDone && 'border-green-600 bg-green-600 text-white',
                  !isDone && isActive && 'border-foreground bg-foreground text-background',
                  !isDone && !isActive && 'border-muted-foreground/40 text-muted-foreground',
                )}>
                  {isDone ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                {step.label}
                {isComingSoon && <span className="text-xs opacity-70">(soon)</span>}
              </button>
              {i < steps.length - 1 && <span className="text-muted-foreground/40">→</span>}
            </div>
          )
        })}
      </nav>

      {/* Step body */}
      <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
        {activeId === 'prereqs' && <DoctorStep onReady={setPrereqsReady} />}
      </div>

      {/* Footer actions */}
      <div className="mt-6 flex items-center justify-between">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to dashboard
        </Link>
        <div className="flex items-center gap-3">
          {!prereqsReady && (
            <span className="text-xs text-muted-foreground">
              Fix the red items above to continue.
            </span>
          )}
          <Button disabled title="Coming in Phase 3b">
            Next: Integrations
          </Button>
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Phase 3a: prerequisite check only. Integrations, Slack, daemon, and first-project steps land in upcoming phases.
      </p>
    </div>
  )
}
