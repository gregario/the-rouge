'use client'

import type { Milestone, MilestoneStatus } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Check, Circle, Loader2, X } from 'lucide-react'

function statusIcon(status: MilestoneStatus) {
  switch (status) {
    case 'promoted':
      return <Check className="size-3.5" />
    case 'in-progress':
      return <Loader2 className="size-3.5 animate-spin" />
    case 'failed':
      return <X className="size-3.5" />
    case 'pending':
    default:
      return <Circle className="size-3" />
  }
}

function statusColors(status: MilestoneStatus, isSelected: boolean): string {
  if (isSelected) {
    switch (status) {
      case 'promoted':
        return 'bg-green-200 text-green-800 border-green-600 ring-2 ring-green-400/50'
      case 'in-progress':
        return 'bg-blue-200 text-blue-800 border-blue-600 ring-2 ring-blue-400/50'
      case 'failed':
        return 'bg-red-200 text-red-800 border-red-600 ring-2 ring-red-400/50'
      case 'pending':
      default:
        return 'bg-gray-200 text-gray-600 border-gray-500 ring-2 ring-gray-400/50'
    }
  }
  switch (status) {
    case 'promoted':
      return 'bg-green-100 text-green-700 border-green-400'
    case 'in-progress':
      return 'bg-blue-100 text-blue-700 border-blue-400'
    case 'failed':
      return 'bg-red-100 text-red-700 border-red-400'
    case 'pending':
    default:
      return 'bg-gray-100 text-gray-400 border-gray-300'
  }
}

function lineColor(status: MilestoneStatus): string {
  switch (status) {
    case 'promoted':
      return 'bg-green-400'
    case 'in-progress':
      return 'bg-blue-400'
    case 'failed':
      return 'bg-red-400'
    case 'pending':
    default:
      return 'bg-gray-300'
  }
}

interface MilestoneTimelineProps {
  milestones: Milestone[]
  selectedId?: string
  onSelect?: (id: string) => void
}

export function MilestoneTimeline({ milestones, selectedId, onSelect }: MilestoneTimelineProps) {
  if (milestones.length === 0) return null

  return (
    <div
      className="flex items-start gap-0 overflow-x-auto py-2 scrollbar-none"
      data-testid="milestone-timeline"
      style={{ scrollbarWidth: 'none' }}
    >
      {milestones.map((milestone, index) => {
        const isSelected = milestone.id === selectedId
        const isClickable = milestone.status !== 'pending'

        return (
          <div
            key={milestone.id}
            className="flex items-start"
            data-testid="milestone-step"
          >
            {/* Step */}
            <button
              type="button"
              disabled={!isClickable}
              onClick={() => isClickable && onSelect?.(milestone.id)}
              className={cn(
                'flex flex-col items-center gap-1.5 transition-transform',
                isSelected ? 'min-w-[140px] scale-105' : 'min-w-[120px]',
                isClickable ? 'cursor-pointer' : 'cursor-default',
              )}
              data-testid="milestone-button"
            >
              {/* Circle */}
              <div
                className={cn(
                  'flex shrink-0 items-center justify-center rounded-full border transition-all',
                  statusColors(milestone.status, isSelected),
                  isSelected ? 'size-9 border-2' : 'size-7',
                )}
                data-testid="milestone-icon"
                data-status={milestone.status}
              >
                {statusIcon(milestone.status)}
              </div>

              {/* Label */}
              <span
                className={cn(
                  'max-w-[120px] text-center text-xs leading-tight transition-colors',
                  isSelected
                    ? 'font-semibold text-foreground'
                    : isClickable
                      ? 'text-muted-foreground hover:text-foreground'
                      : 'text-muted-foreground/60',
                )}
              >
                {milestone.title}
              </span>
            </button>

            {/* Connector line */}
            {index < milestones.length - 1 && (
              <div
                className={cn(
                  'mt-3.5 h-0.5 w-8 shrink-0 self-start',
                  isSelected ? 'mt-[18px]' : '',
                  lineColor(milestone.status),
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
