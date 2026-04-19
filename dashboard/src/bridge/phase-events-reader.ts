import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export type PhaseEventType =
  | 'phase_start'
  | 'phase_end'
  | 'text'
  | 'tool_use'
  | 'tool_result'

export interface PhaseEvent {
  ts: string
  type: PhaseEventType
  // Optional fields — shape depends on type. Kept loose because the
  // launcher owns the canonical schema and this reader is a passthrough.
  phase?: string
  pid?: number
  model?: string
  text?: string
  id?: string
  name?: string
  summary?: string
  status?: 'ok' | 'error'
  exit_code?: number | null
  duration_ms?: number
  // Story/milestone context stamped by the launcher at writer creation
  // time so the dashboard can scope a feed per story. Absent for
  // project-level phases (foundation, analyzing, shipping).
  story_id?: string
  milestone_name?: string
}

export interface PhaseEventsTail {
  // Newest last, so the UI can render top-down without re-sorting.
  events: PhaseEvent[]
  totalCount: number
  truncated: boolean
  mtime: string | null
  sizeBytes: number
  exists: boolean
}

const EVENTS_FILENAME = 'phase_events.jsonl'

function emptyTail(): PhaseEventsTail {
  return { events: [], totalCount: 0, truncated: false, mtime: null, sizeBytes: 0, exists: false }
}

/**
 * Read the most recent `tailCount` events from a project's
 * phase_events.jsonl. Malformed lines are skipped (the launcher writes
 * one JSON object per line, but a partial write during a crash could
 * leave a half-line we don't want to blow up on).
 *
 * Tailing the whole file is fine for interactive use — phase_events
 * grows bounded per phase (hundreds of lines typical, thousands worst
 * case). If we start seeing MB-scale files in practice, switch to a
 * read-from-end strategy.
 */
export interface ReadPhaseEventsOptions {
  tailCount?: number
  // Filter to events stamped with this story_id. Applied BEFORE the
  // tail slice so tailCount = N returns the last N events *for this
  // story*, not the last N overall that happen to include this story.
  // Matches nothing when no events carry story_id (e.g. a project
  // whose only phase run was foundation).
  storyId?: string
}

export function readPhaseEvents(projectDir: string, optsOrTail: ReadPhaseEventsOptions | number = {}): PhaseEventsTail {
  const opts: ReadPhaseEventsOptions = typeof optsOrTail === 'number'
    ? { tailCount: optsOrTail }
    : optsOrTail
  const tailCount = opts.tailCount ?? 100
  const storyId = opts.storyId

  const path = join(projectDir, EVENTS_FILENAME)
  if (!existsSync(path)) return emptyTail()
  try {
    const stat = statSync(path)
    const mtime = stat.mtime.toISOString()
    const sizeBytes = stat.size
    if (sizeBytes === 0) {
      return { events: [], totalCount: 0, truncated: false, mtime, sizeBytes, exists: true }
    }
    const raw = readFileSync(path, 'utf-8')
    const lines = raw.split('\n')
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
    const parsed: PhaseEvent[] = []
    for (const line of lines) {
      if (!line) continue
      try {
        const obj = JSON.parse(line)
        if (obj && typeof obj === 'object' && typeof obj.ts === 'string' && typeof obj.type === 'string') {
          if (storyId && obj.story_id !== storyId) continue
          parsed.push(obj as PhaseEvent)
        }
      } catch {
        // skip malformed
      }
    }
    const totalCount = parsed.length
    const events = totalCount > tailCount ? parsed.slice(-tailCount) : parsed
    return {
      events,
      totalCount,
      truncated: totalCount > tailCount,
      mtime,
      sizeBytes,
      exists: true,
    }
  } catch {
    return emptyTail()
  }
}

export { EVENTS_FILENAME }
