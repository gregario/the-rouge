'use client'

import { Check, Circle, Loader2, X, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProvisioningStep {
  status: 'done' | 'in-progress' | 'failed' | 'skipped'
  url?: string | null
  target?: string
  provider?: string
  reason?: string
}

interface ProvisioningChecklistProps {
  steps: Record<string, ProvisioningStep>
}

const STEP_LABELS: Record<string, string> = {
  github_repo: 'GitHub repo',
  database: 'Database',
  deploy_target: 'Deploy target',
}

function StepIcon({ status }: { status: ProvisioningStep['status'] }) {
  switch (status) {
    case 'done':
      return (
        <div className="flex size-5 items-center justify-center rounded-full bg-green-100 text-green-600">
          <Check className="size-3" />
        </div>
      )
    case 'in-progress':
      return (
        <div className="flex size-5 items-center justify-center rounded-full bg-blue-100 text-blue-600">
          <Loader2 className="size-3 animate-spin" />
        </div>
      )
    case 'failed':
      return (
        <div className="flex size-5 items-center justify-center rounded-full bg-red-100 text-red-600">
          <X className="size-3" />
        </div>
      )
    case 'skipped':
      return (
        <div className="flex size-5 items-center justify-center rounded-full bg-gray-100 text-gray-400">
          <AlertTriangle className="size-3" />
        </div>
      )
    default:
      return (
        <div className="flex size-5 items-center justify-center rounded-full bg-gray-100 text-gray-400">
          <Circle className="size-2.5" />
        </div>
      )
  }
}

function stepDetail(key: string, step: ProvisioningStep): string | null {
  if (key === 'github_repo' && step.url) return step.url
  if (key === 'database' && step.provider) return step.provider
  if (key === 'deploy_target' && step.target) return step.target
  if (step.reason) return step.reason
  return null
}

export function ProvisioningChecklist({ steps }: ProvisioningChecklistProps) {
  const entries = Object.entries(steps)
  if (entries.length === 0) return null

  return (
    <div className="mb-3 rounded-md border border-gray-200 bg-white px-3 py-2">
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Infrastructure
      </p>
      <div className="flex flex-col gap-1">
        {entries.map(([key, step]) => {
          const detail = stepDetail(key, step)
          return (
            <div key={key} className="flex items-center gap-2 text-xs">
              <StepIcon status={step.status} />
              <span className={cn(
                'font-medium',
                step.status === 'done' ? 'text-muted-foreground' : 'text-foreground',
              )}>
                {STEP_LABELS[key] || key}
              </span>
              {detail && (
                <span className="truncate text-muted-foreground/70">
                  — {detail}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
