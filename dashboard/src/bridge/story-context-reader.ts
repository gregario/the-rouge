import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// Partial shape of story_context.json — only the fields the dashboard renders.
// The file is written by the Rouge loop when starting a new story; it can be
// large and contains many fields that are loop-internal.

export interface StoryContextDecision {
  decision?: string
  context?: string
  rationale?: string
  confidence?: 'high' | 'medium' | 'low' | string
  affects?: string[]
  alternatives_considered?: string[]
}

export interface StoryContextQuestion {
  question?: string
  resolved_as?: string
  severity?: 'minor' | 'major' | string
  needs_clarification_from?: string
  found_in?: string
}

export interface StoryContextRelatedStory {
  id: string
  status?: string
  files_changed?: string[]
  env_limitations?: string[]
  issues_encountered?: string[]
}

export interface StoryContext {
  _assembled_at?: string
  story?: {
    id?: string
    name?: string
    status?: string
    attempt_number?: number
    depends_on?: string[]
    affected_entities?: string[]
    affected_screens?: string[]
    fix_memory?: unknown[]
  }
  related_stories?: StoryContextRelatedStory[]
  relevant_decisions?: StoryContextDecision[]
  relevant_questions?: StoryContextQuestion[]
}

export function readStoryContext(projectDir: string): StoryContext | null {
  const path = join(projectDir, 'story_context.json')
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as StoryContext
  } catch {
    return null
  }
}
