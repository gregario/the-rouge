'use client'

import { useState } from 'react'
import type { StoryContext } from '@/bridge/story-context-reader'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CurrentStoryCardProps {
  ctx: StoryContext
}

function statusPillClass(status?: string): string {
  switch (status) {
    case 'in-progress':
      return 'bg-blue-100 text-blue-800 border-blue-200'
    case 'done':
      return 'bg-green-100 text-green-800 border-green-200'
    case 'failed':
      return 'bg-red-100 text-red-800 border-red-200'
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200'
  }
}

function confidenceColor(c?: string): string {
  switch (c) {
    case 'high': return 'text-green-700'
    case 'medium': return 'text-amber-700'
    case 'low': return 'text-red-700'
    default: return 'text-gray-500'
  }
}

function MetaRow({ label, items }: { label: string; items?: string[] }) {
  if (!items || items.length === 0) return null
  return (
    <div className="flex items-baseline gap-2">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        {label}
      </span>
      <span className="text-xs text-gray-700">{items.join(' · ')}</span>
    </div>
  )
}

export function CurrentStoryCard({ ctx }: CurrentStoryCardProps) {
  const [decisionsOpen, setDecisionsOpen] = useState(false)
  const [questionsOpen, setQuestionsOpen] = useState(false)

  const story = ctx.story
  if (!story?.name) return null

  const decisions = ctx.relevant_decisions ?? []
  const questions = ctx.relevant_questions ?? []

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-700">
              Current Story
            </span>
            {story.attempt_number !== undefined && story.attempt_number > 1 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                Attempt {story.attempt_number}
              </span>
            )}
          </div>
          <h3 className="text-base font-semibold text-gray-900">{story.name}</h3>
          {story.id && (
            <span className="text-[11px] font-mono text-gray-500">{story.id}</span>
          )}
        </div>
        {story.status && (
          <span className={cn(
            'rounded-full border px-2.5 py-0.5 text-xs font-medium',
            statusPillClass(story.status),
          )}>
            {story.status}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        <MetaRow label="Depends on" items={story.depends_on} />
        <MetaRow label="Entities" items={story.affected_entities} />
        <MetaRow label="Screens" items={story.affected_screens} />
      </div>

      {decisions.length > 0 && (
        <div className="mt-4 border-t border-blue-200/60 pt-3">
          <button
            onClick={() => setDecisionsOpen((v) => !v)}
            className="flex items-center gap-2 text-left hover:opacity-80"
          >
            {decisionsOpen
              ? <ChevronDown className="size-3.5 text-gray-500" />
              : <ChevronRight className="size-3.5 text-gray-500" />
            }
            <span className="text-xs font-semibold text-gray-700">
              Decisions made ({decisions.length})
            </span>
          </button>
          {decisionsOpen && (
            <div className="mt-2 flex flex-col gap-2.5">
              {decisions.map((d, i) => (
                <div key={i} className="rounded-md border border-gray-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-medium text-gray-900">{d.decision ?? '(no decision title)'}</p>
                    {d.confidence && (
                      <span className={cn('shrink-0 text-[10px] font-semibold uppercase', confidenceColor(d.confidence))}>
                        {d.confidence}
                      </span>
                    )}
                  </div>
                  {d.rationale && (
                    <p className="mt-1.5 text-xs leading-relaxed text-gray-600">{d.rationale}</p>
                  )}
                  {d.affects && d.affects.length > 0 && (
                    <p className="mt-1.5 text-[10px] font-mono text-gray-400">
                      {d.affects.join(' · ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {questions.length > 0 && (
        <div className="mt-3 border-t border-blue-200/60 pt-3">
          <button
            onClick={() => setQuestionsOpen((v) => !v)}
            className="flex items-center gap-2 text-left hover:opacity-80"
          >
            {questionsOpen
              ? <ChevronDown className="size-3.5 text-gray-500" />
              : <ChevronRight className="size-3.5 text-gray-500" />
            }
            <span className="text-xs font-semibold text-gray-700">
              Open questions ({questions.length})
            </span>
          </button>
          {questionsOpen && (
            <div className="mt-2 flex flex-col gap-2">
              {questions.map((q, i) => (
                <div key={i} className="rounded-md border border-gray-200 bg-white p-3">
                  <p className="text-xs text-gray-900">{q.question}</p>
                  {q.resolved_as && (
                    <p className="mt-1 text-[11px] text-gray-600">
                      <span className="font-semibold">Resolved: </span>{q.resolved_as}
                    </p>
                  )}
                  {q.severity && (
                    <span className="mt-1.5 inline-block text-[10px] font-semibold uppercase text-gray-400">
                      {q.severity}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {ctx._assembled_at && (
        <p className="mt-3 text-[10px] text-gray-400">
          Context assembled {new Date(ctx._assembled_at).toLocaleString()}
        </p>
      )}
    </div>
  )
}
