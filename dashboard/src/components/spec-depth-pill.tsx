'use client'

import { cn } from '@/lib/utils'
import type { ProjectSummary } from '@/lib/types'

// Depth = how far along the seeding conversation is. Drives the pill color
// on the Specs table so you can scan which ideas are half-baked vs ready to
// build. Derived from state + milestone/progress hints; more granular
// stages land later when we surface per-discipline completion.

type Depth = 'brainstorm' | 'researched' | 'specced' | 'designed' | 'ready'

const LABEL: Record<Depth, string> = {
  brainstorm: 'brainstorm',
  researched: 'researched',
  specced: 'specced',
  designed: 'designed',
  ready: 'ready to build',
}

const STYLES: Record<Depth, string> = {
  brainstorm: 'bg-violet-100 text-violet-800 border-violet-300',
  researched: 'bg-cyan-100 text-cyan-800 border-cyan-300',
  specced: 'bg-blue-100 text-blue-800 border-blue-300',
  designed: 'bg-purple-100 text-purple-800 border-purple-300',
  ready: 'bg-green-100 text-green-800 border-green-300',
}

export function depthForProject(p: ProjectSummary): Depth {
  if (p.state === 'ready') return 'ready'
  // For now, seeding = brainstorm. Future: read per-discipline completion
  // from state.json and map brainstorm/competition/taste/spec/design/marketing
  // progress to the five depths.
  return 'brainstorm'
}

export function SpecDepthPill({ project }: { project: ProjectSummary }) {
  const depth = depthForProject(project)
  return (
    <span className={cn(
      'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
      STYLES[depth],
    )}>
      {LABEL[depth]}
    </span>
  )
}
