import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// Per-story enrichment assembled from cycle_context.json + story_context.json.
// Decisions are matched to stories by file-overlap (decision.affects ∩ story.files_changed).

export interface StoryDecision {
  decision?: string
  context?: string
  rationale?: string
  confidence?: string
  affects?: string[]
  alternatives_considered?: string[]
}

export interface StoryQuestion {
  question?: string
  found_in?: string
  resolved_as?: string
  needs_clarification_from?: string
  severity?: string
}

export interface StoryEnrichment {
  storyId: string
  details?: string
  filesChanged?: string[]
  testsAdded?: number
  testsPassing?: number
  /** Acceptance criteria for the story. Read from cycle_context.json's
   *  implemented[] entries and falls back to task_ledger.json when
   *  the story hasn't been through a completed build cycle yet. */
  acceptanceCriteria?: string[]
  envLimitations?: string[]
  issuesEncountered?: string[]
  decisions: StoryDecision[]
  questions: StoryQuestion[]
}

export type StoryEnrichmentMap = Record<string, StoryEnrichment>

function safeReadJson(path: string): unknown {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

export function readStoryEnrichment(projectDir: string): StoryEnrichmentMap {
  const result: StoryEnrichmentMap = {}

  // Source 1: cycle_context.json (implemented stories + factory_decisions + factory_questions)
  const cycleCtx = safeReadJson(join(projectDir, 'cycle_context.json')) as Record<string, unknown> | null
  if (!cycleCtx) return result

  const implemented = (cycleCtx.implemented ?? []) as Array<{
    story_id?: string
    details?: string
    files_changed?: string[]
    tests_added?: number
    tests_passing?: number
    acceptance_criteria?: string[]
    env_limitations?: string[]
    issues_encountered?: string[]
  }>

  const factoryDecisions = (cycleCtx.factory_decisions ?? []) as StoryDecision[]
  const factoryQuestions = (cycleCtx.factory_questions ?? []) as StoryQuestion[]

  // Build per-story base from implemented[]
  for (const impl of implemented) {
    if (!impl.story_id) continue
    result[impl.story_id] = {
      storyId: impl.story_id,
      details: impl.details,
      filesChanged: impl.files_changed,
      testsAdded: impl.tests_added,
      testsPassing: impl.tests_passing,
      acceptanceCriteria: impl.acceptance_criteria,
      envLimitations: impl.env_limitations,
      issuesEncountered: impl.issues_encountered,
      decisions: [],
      questions: [],
    }
  }

  // Fallback for stories that haven't completed a build cycle yet
  // (no implemented[] entry). Pull acceptance criteria from
  // task_ledger.json so the StoryList can show them even before the
  // story is built. V3 spec discipline writes per-story ACs here.
  const ledger = safeReadJson(join(projectDir, 'task_ledger.json')) as
    | { milestones?: Array<{ stories?: Array<{ id?: string; acceptance_criteria?: string[] }> }> }
    | null
  if (ledger?.milestones) {
    for (const m of ledger.milestones) {
      for (const s of m.stories ?? []) {
        if (!s.id || !s.acceptance_criteria?.length) continue
        if (!result[s.id]) {
          result[s.id] = {
            storyId: s.id,
            acceptanceCriteria: s.acceptance_criteria,
            decisions: [],
            questions: [],
          }
        } else if (!result[s.id].acceptanceCriteria?.length) {
          result[s.id].acceptanceCriteria = s.acceptance_criteria
        }
      }
    }
  }

  // Match decisions to stories by file overlap
  for (const dec of factoryDecisions) {
    if (!dec.affects?.length) continue
    const affectsSet = new Set(dec.affects)
    for (const enrichment of Object.values(result)) {
      if (!enrichment.filesChanged?.length) continue
      const overlap = enrichment.filesChanged.some(f => affectsSet.has(f))
      if (overlap) {
        enrichment.decisions.push(dec)
      }
    }
  }

  // Match questions to stories by found_in containing the story name
  for (const q of factoryQuestions) {
    if (!q.found_in) continue
    const foundLower = q.found_in.toLowerCase()
    for (const enrichment of Object.values(result)) {
      if (foundLower.includes(enrichment.storyId.toLowerCase())) {
        enrichment.questions.push(q)
      }
    }
  }

  // Source 2: story_context.json (related_stories has env_limitations + issues for current-cycle stories)
  const storyCtx = safeReadJson(join(projectDir, 'story_context.json')) as Record<string, unknown> | null
  if (storyCtx) {
    const related = (storyCtx.related_stories ?? []) as Array<{
      id: string
      files_changed?: string[]
      env_limitations?: string[]
      issues_encountered?: string[]
    }>
    for (const rel of related) {
      if (!rel.id || !result[rel.id]) continue
      // Merge env_limitations and issues that might be in story_context but not cycle_context
      const enrichment = result[rel.id]
      if (!enrichment.envLimitations?.length && rel.env_limitations?.length) {
        enrichment.envLimitations = rel.env_limitations
      }
      if (!enrichment.issuesEncountered?.length && rel.issues_encountered?.length) {
        enrichment.issuesEncountered = rel.issues_encountered
      }
    }
  }

  return result
}
