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
export function readPhaseEvents(projectDir: string, tailCount = 100): PhaseEventsTail {
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
