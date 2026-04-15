'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DoctorStep } from './doctor-step'
import { SecretsStep } from './secrets-step'
import { SlackStep } from './slack-step'
import { DaemonStep } from './daemon-step'
import { FinishStep } from './finish-step'

type StepId = 'prereqs' | 'secrets' | 'slack' | 'daemon' | 'finish'

interface Step {
  id: StepId
  label: string
  comingSoon?: boolean
}

const steps: Step[] = [
  { id: 'prereqs', label: 'Prerequisites' },
  { id: 'secrets', label: 'Integrations (optional)' },
  { id: 'slack', label: 'Slack (optional)' },
  { id: 'daemon', label: 'Background daemon' },
  { id: 'finish', label: 'Finish' },
]

export function SetupWizard() {
  const [activeIdx, setActiveIdx] = useState(0)
  const [readyMap, setReadyMap] = useState<Record<StepId, boolean>>({
    prereqs: false, secrets: false, slack: false, daemon: false, finish: false,
  })

  const active = steps[activeIdx]
  const canAdvance = readyMap[active.id]

  function goTo(idx: number) {
    if (idx < 0 || idx >= steps.length) return
    if (steps[idx].comingSoon) return
    setActiveIdx(idx)
  }

  function markReady(id: StepId, ready: boolean) {
    setReadyMap((m) => ({ ...m, [id]: ready }))
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Set up Rouge</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            One-time setup — takes under 5 minutes. You can come back to this page
            anytime from the nav.
          </p>
        </div>
        <button
          type="button"
          onClick={async () => {
            await fetch('/api/system/setup-state', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ skipped: true }),
            })
            window.location.href = '/'
          }}
          className="shrink-0 text-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
        >
          Skip for now
        </button>
      </header>

      {/* Step indicator */}
      <nav className="mb-8 flex flex-wrap items-center gap-2" aria-label="Setup progress">
        {steps.map((step, i) => {
          const isActive = i === activeIdx
          const isDone = readyMap[step.id] && i !== activeIdx
          const disabled = step.comingSoon
          return (
            <div key={step.id} className="flex items-center gap-2">
              <button
                type="button"
                disabled={disabled}
                onClick={() => goTo(i)}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive && 'bg-accent text-accent-foreground',
                  !isActive && !disabled && 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                  disabled && 'cursor-not-allowed text-muted-foreground/50',
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
                {disabled && <span className="text-xs opacity-70">(soon)</span>}
              </button>
              {i < steps.length - 1 && <span className="text-muted-foreground/40">→</span>}
            </div>
          )
        })}
      </nav>

      {/* Step body */}
      <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
        {active.id === 'prereqs' && <DoctorStep onReady={(r) => markReady('prereqs', r)} />}
        {active.id === 'secrets' && <SecretsStep onReady={(r) => markReady('secrets', r)} />}
        {active.id === 'slack' && <SlackStep onReady={(r) => markReady('slack', r)} />}
        {active.id === 'daemon' && <DaemonStep onReady={(r) => markReady('daemon', r)} />}
        {active.id === 'finish' && <FinishStep onReady={(r) => markReady('finish', r)} />}
      </div>

      {/* Footer actions */}
      <div className="mt-6 flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            ← Back to dashboard
          </Link>
          <a
            href="https://github.com/gregario/the-rouge/tree/main/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground"
          >
            Full docs ↗
          </a>
        </div>
        <div className="flex items-center gap-3">
          {activeIdx > 0 && (
            <Button variant="outline" onClick={() => {
              // Skip any "coming-soon" steps when going back.
              let i = activeIdx - 1
              while (i >= 0 && steps[i].comingSoon) i--
              if (i >= 0) setActiveIdx(i)
            }}>
              Back
            </Button>
          )}
          {activeIdx < steps.length - 1 && (
            <Button
              onClick={() => {
                // Skip any "coming-soon" steps when advancing.
                let i = activeIdx + 1
                while (i < steps.length && steps[i].comingSoon) i++
                if (i < steps.length) setActiveIdx(i)
              }}
              disabled={!canAdvance}
              title={!canAdvance && active.id === 'prereqs' ? 'Fix the red items above first' : undefined}
            >
              Next
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
