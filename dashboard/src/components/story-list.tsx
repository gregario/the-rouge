'use client'

import { useState } from 'react'
import type { Milestone, StoryStatus } from '@/lib/types'
import type { StoryEnrichment, StoryEnrichmentMap } from '@/bridge/story-enrichment-reader'
import { Badge } from '@/components/ui/badge'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { cn } from '@/lib/utils'
import { Check, Circle, Loader2, SkipForward, X, ChevronDown, ChevronRight, FileCode, TestTube2, AlertTriangle, ListChecks } from 'lucide-react'

function storyStatusStyle(status: StoryStatus): string {
  switch (status) {
    case 'done':
      return 'bg-green-50 text-green-700 border-green-300'
    case 'in-progress':
      return 'bg-blue-50 text-blue-700 border-blue-300'
    case 'failed':
      return 'bg-red-50 text-red-700 border-red-300'
    case 'skipped':
      return 'bg-gray-100 text-gray-500 border-gray-300'
    case 'pending':
    default:
      return 'bg-gray-100 text-gray-400 border-gray-300'
  }
}

function storyStatusIcon(status: StoryStatus) {
  switch (status) {
    case 'done':
      return <Check className="size-3" />
    case 'in-progress':
      return <Loader2 className="size-3 animate-spin" />
    case 'failed':
      return <X className="size-3" />
    case 'skipped':
      return <SkipForward className="size-3" />
    case 'pending':
    default:
      return <Circle className="size-2.5" />
  }
}

function formatStatus(status: string): string {
  return status
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function confidenceColor(c?: string): string {
  switch (c) {
    case 'high': return 'text-green-700'
    case 'medium': return 'text-amber-700'
    case 'low': return 'text-red-700'
    default: return 'text-gray-500'
  }
}

// ─── Enrichment sub-components ─────────────────────────────────

function StoryDetails({ enrichment }: { enrichment: StoryEnrichment }) {
  const [decisionsOpen, setDecisionsOpen] = useState(false)
  const [questionsOpen, setQuestionsOpen] = useState(false)
  const [acsOpen, setAcsOpen] = useState(false)

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-gray-200 pt-3">
      {/* Summary line */}
      {enrichment.details && (
        <p className="text-xs leading-relaxed text-gray-700">{enrichment.details.slice(0, 500)}{enrichment.details.length > 500 ? '…' : ''}</p>
      )}

      {/* Acceptance criteria — shown for stories with ACs on file. Falls
          back to task_ledger.json when the story hasn't completed a
          cycle yet (story-enrichment-reader seeds these pre-build). */}
      {enrichment.acceptanceCriteria && enrichment.acceptanceCriteria.length > 0 && (
        <div>
          <button
            onClick={() => setAcsOpen((v) => !v)}
            className="flex items-center gap-1.5 text-left hover:opacity-80"
            data-testid="acceptance-criteria-toggle"
          >
            {acsOpen
              ? <ChevronDown className="size-3 text-gray-500" />
              : <ChevronRight className="size-3 text-gray-500" />
            }
            <ListChecks className="size-3 text-gray-500" />
            <span className="text-[11px] font-semibold text-gray-600">
              Acceptance criteria ({enrichment.acceptanceCriteria.length})
            </span>
          </button>
          {acsOpen && (
            <ul className="mt-1.5 ml-5 flex list-disc flex-col gap-1.5 pl-2 text-[11px] leading-relaxed text-gray-700">
              {enrichment.acceptanceCriteria.map((ac, i) => (
                <li key={i}>{ac}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Files + tests row */}
      <div className="flex flex-wrap items-center gap-3">
        {enrichment.filesChanged && enrichment.filesChanged.length > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
            <FileCode className="size-3" />
            {enrichment.filesChanged.length} file{enrichment.filesChanged.length === 1 ? '' : 's'}
          </span>
        )}
        {enrichment.testsPassing !== undefined && (
          <span className="inline-flex items-center gap-1 text-[10px] text-green-700">
            <TestTube2 className="size-3" />
            {enrichment.testsPassing}/{enrichment.testsAdded ?? enrichment.testsPassing} tests
          </span>
        )}
      </div>

      {/* Files changed list */}
      {enrichment.filesChanged && enrichment.filesChanged.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {enrichment.filesChanged.map(f => (
            <span key={f} className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-600">
              {f}
            </span>
          ))}
        </div>
      )}

      {/* Env limitations */}
      {enrichment.envLimitations && enrichment.envLimitations.length > 0 && (
        <div className="flex flex-col gap-1">
          {enrichment.envLimitations.map((lim, i) => (
            <div key={i} className="flex items-start gap-1.5 rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
              <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-600" />
              {lim}
            </div>
          ))}
        </div>
      )}

      {/* Decisions */}
      {enrichment.decisions.length > 0 && (
        <div>
          <button
            onClick={() => setDecisionsOpen(v => !v)}
            className="flex items-center gap-1.5 text-left hover:opacity-80"
          >
            {decisionsOpen
              ? <ChevronDown className="size-3 text-gray-500" />
              : <ChevronRight className="size-3 text-gray-500" />
            }
            <span className="text-[11px] font-semibold text-gray-600">
              Decisions ({enrichment.decisions.length})
            </span>
          </button>
          {decisionsOpen && (
            <div className="mt-1.5 flex flex-col gap-2">
              {enrichment.decisions.map((d, i) => (
                <div key={i} className="rounded-md border border-gray-200 bg-white p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[11px] font-medium text-gray-900">{d.decision}</p>
                    {d.confidence && (
                      <span className={cn('shrink-0 text-[9px] font-bold uppercase', confidenceColor(d.confidence))}>
                        {d.confidence}
                      </span>
                    )}
                  </div>
                  {d.rationale && (
                    <p className="mt-1 text-[10px] leading-relaxed text-gray-500">{d.rationale}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Questions */}
      {enrichment.questions.length > 0 && (
        <div>
          <button
            onClick={() => setQuestionsOpen(v => !v)}
            className="flex items-center gap-1.5 text-left hover:opacity-80"
          >
            {questionsOpen
              ? <ChevronDown className="size-3 text-gray-500" />
              : <ChevronRight className="size-3 text-gray-500" />
            }
            <span className="text-[11px] font-semibold text-gray-600">
              Open questions ({enrichment.questions.length})
            </span>
          </button>
          {questionsOpen && (
            <div className="mt-1.5 flex flex-col gap-2">
              {enrichment.questions.map((q, i) => (
                <div key={i} className="rounded-md border border-gray-200 bg-white p-2.5">
                  <p className="text-[11px] text-gray-900">{q.question}</p>
                  {q.resolved_as && (
                    <p className="mt-1 text-[10px] text-gray-600">
                      <span className="font-semibold">Resolved: </span>{q.resolved_as}
                    </p>
                  )}
                  {q.severity && (
                    <span className="mt-1 inline-block text-[9px] font-bold uppercase text-gray-400">
                      {q.severity}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────

interface StoryListProps {
  milestones: Milestone[]
  selectedMilestoneId?: string
  enrichment?: StoryEnrichmentMap | null
}

export function StoryList({ milestones, selectedMilestoneId, enrichment }: StoryListProps) {
  // Use selectedMilestoneId if provided, otherwise fall back to current milestone logic
  const currentMilestone = selectedMilestoneId
    ? milestones.find((m) => m.id === selectedMilestoneId)
    : milestones.find((m) => m.status === 'in-progress') ??
      milestones.find((m) => m.status !== 'promoted') ??
      milestones[milestones.length - 1]

  if (!currentMilestone) return null

  const stories = currentMilestone.stories

  return (
    <div data-testid="story-list">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-medium text-foreground">
          {currentMilestone.title}
        </h3>
        <span className="text-xs text-muted-foreground">
          {stories.filter((s) => s.status === 'done').length}/{stories.length} stories
        </span>
      </div>

      <Accordion>
        {stories.map((story) => {
          // Match enrichment by story id — try both the raw id and the kebab-cased title
          const storyEnrichment = enrichment?.[story.id] ?? enrichment?.[story.title.toLowerCase().replace(/\s+/g, '-')]

          return (
            <AccordionItem key={story.id} value={story.id}>
              <AccordionTrigger className="gap-2 py-2">
                <div className="flex flex-1 items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn('gap-1', storyStatusStyle(story.status))}
                    data-testid="story-status"
                  >
                    {storyStatusIcon(story.status)}
                    {formatStatus(story.status)}
                  </Badge>
                  <span className="text-sm" data-testid="story-title">
                    {story.title}
                  </span>
                  {/* Quick stats inline when enrichment exists */}
                  {storyEnrichment?.filesChanged && (
                    <span className="ml-auto hidden items-center gap-1 text-[10px] text-gray-400 sm:inline-flex">
                      <FileCode className="size-3" />
                      {storyEnrichment.filesChanged.length}
                      {storyEnrichment.testsPassing !== undefined && (
                        <>
                          <TestTube2 className="ml-1 size-3" />
                          {storyEnrichment.testsPassing}
                        </>
                      )}
                      {storyEnrichment.decisions.length > 0 && (
                        <span className="ml-1 rounded bg-gray-100 px-1 py-0.5 text-[9px] font-semibold">
                          {storyEnrichment.decisions.length}d
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-2 pl-2">
                  {/* Acceptance criteria (always shown) */}
                  {story.acceptanceCriteria.length > 0 && (
                    <>
                      <p className="text-xs font-medium text-muted-foreground">
                        Acceptance criteria
                      </p>
                      <ul className="flex flex-col gap-1">
                        {story.acceptanceCriteria.map((criterion, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 text-xs text-muted-foreground"
                            data-testid="acceptance-criterion"
                          >
                            <span
                              className={cn(
                                'mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-sm border',
                                story.status === 'done'
                                  ? 'border-green-400 bg-green-100 text-green-600'
                                  : 'border-gray-300'
                              )}
                            >
                              {story.status === 'done' && <Check className="size-2.5" />}
                            </span>
                            {criterion}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}

                  {story.failureReason && (
                    <div className="mt-1 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700">
                      <span className="font-medium">Failure: </span>
                      {story.failureReason}
                    </div>
                  )}

                  {/* Enrichment details (files, tests, decisions, questions) */}
                  {storyEnrichment && <StoryDetails enrichment={storyEnrichment} />}
                </div>
              </AccordionContent>
            </AccordionItem>
          )
        })}
      </Accordion>
    </div>
  )
}
