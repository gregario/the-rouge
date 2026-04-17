import { spawn } from 'child_process'

export interface ClaudeResult {
  result: string
  session_id: string | null
  total_cost_usd?: number
  timeout?: boolean
  error?: string
}

export interface Markers {
  disciplinesComplete: string[]
  seedingComplete: boolean
}

const DISCIPLINE_MARKER = /\[DISCIPLINE_COMPLETE:\s*(\S+?)\]/g
const SEEDING_COMPLETE_MARKER = /\bSEEDING_COMPLETE\b/

// Unified marker detector for the gated-autonomy protocol. Matches:
//   [GATE: <id>]        — asking the human, sets awaiting_gate
//   [DECISION: <id>]    — autonomous call, narrates what Rouge chose
//   [HEARTBEAT: <id>]   — still-working ping, resets the UI staleness
//   [DISCIPLINE_COMPLETE: <name>]  — unchanged from pre-gated flow
// The id capture is permissive — allows slashes (brainstorming/H1-...)
// and any non-bracket characters so callers can use descriptive slugs.
const SEGMENT_MARKER = /\[(GATE|DECISION|HEARTBEAT|DISCIPLINE_COMPLETE):\s*([^\]]+?)\]/g

export type MessageSegmentKind =
  | 'prose'
  | 'gate'
  | 'decision'
  | 'heartbeat'
  | 'discipline_complete'
  | 'seeding_complete'

export interface MessageSegment {
  kind: MessageSegmentKind
  /** Marker id for gate/decision/heartbeat; discipline name for
   *  discipline_complete; undefined for prose and seeding_complete. */
  id?: string
  /** Text following the marker up to the next marker or end of message.
   *  Always trimmed. May be empty for a bare marker. */
  content: string
}

export function parseClaudeOutput(raw: string): ClaudeResult {
  try {
    const parsed = JSON.parse(raw)
    return {
      result: parsed.result ?? '',
      session_id: parsed.session_id ?? null,
      total_cost_usd: parsed.total_cost_usd,
    }
  } catch {
    return {
      result: raw.slice(0, 3000),
      session_id: null,
    }
  }
}

export function detectRateLimit(text: string): boolean {
  if (text.length > 200) return false
  const lower = text.toLowerCase()
  return lower.includes('hit your limit') ||
         lower.includes('too many requests') ||
         (lower.includes('resets ') && lower.includes('limit'))
}

export function extractMarkers(text: string): Markers {
  const disciplinesComplete: string[] = []
  let match: RegExpExecArray | null
  const regex = new RegExp(DISCIPLINE_MARKER.source, 'g')
  while ((match = regex.exec(text)) !== null) {
    disciplinesComplete.push(match[1])
  }
  return {
    disciplinesComplete,
    seedingComplete: SEEDING_COMPLETE_MARKER.test(text),
  }
}

/**
 * Split a Claude response into ordered segments. Each marker "captures"
 * the text following it up to the next marker (or end of message) as
 * its content — so a `[DECISION: X]` followed by its reasoning becomes
 * one segment with kind='decision', id='X', content=<the reasoning>.
 *
 * Why a segmenter instead of a flat extractor: the seed handler needs
 * to append each marker to chat as its own message with a distinct
 * `kind` so the UI can render gates, decisions, and heartbeats
 * differently and the traffic-light can reset on each marker.
 */
export function segmentMarkers(text: string): MessageSegment[] {
  type Hit = { kindStr: string; id: string; start: number; end: number }
  const hits: Hit[] = []
  const regex = new RegExp(SEGMENT_MARKER.source, 'g')
  let m: RegExpExecArray | null
  while ((m = regex.exec(text)) !== null) {
    hits.push({
      kindStr: m[1],
      id: m[2].trim(),
      start: m.index,
      end: m.index + m[0].length,
    })
  }

  const segments: MessageSegment[] = []

  // Anything before the first marker is prose.
  const firstStart = hits.length > 0 ? hits[0].start : text.length
  const leading = text.slice(0, firstStart).trim()
  if (leading) segments.push({ kind: 'prose', content: leading })

  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i]
    const contentEnd = i + 1 < hits.length ? hits[i + 1].start : text.length
    const content = text.slice(hit.end, contentEnd).trim()
    const kind: MessageSegmentKind =
      hit.kindStr === 'GATE' ? 'gate'
      : hit.kindStr === 'DECISION' ? 'decision'
      : hit.kindStr === 'HEARTBEAT' ? 'heartbeat'
      : 'discipline_complete'
    segments.push({ kind, id: hit.id, content })
  }

  // SEEDING_COMPLETE is a bare word elsewhere in the text — emit as a
  // terminal segment so downstream doesn't need to scan the raw text.
  if (SEEDING_COMPLETE_MARKER.test(text)) {
    segments.push({ kind: 'seeding_complete', content: '' })
  }

  return segments
}

interface RunClaudeOptions {
  projectDir: string
  prompt: string
  sessionId?: string | null
  model?: string
  maxTurns?: number
  timeoutMs?: number
}

export function runClaude(options: RunClaudeOptions): Promise<ClaudeResult> {
  const {
    projectDir,
    prompt,
    sessionId,
    model = 'opus',
    maxTurns = 50,
    timeoutMs = 600_000,
  } = options

  return new Promise((resolve) => {
    const args = [
      '-p',
      '--dangerously-skip-permissions',
      '--model', model,
      '--max-turns', String(maxTurns),
      '--output-format', 'json',
    ]
    if (sessionId) {
      args.push('--resume', sessionId)
    }

    const child = spawn('claude', args, {
      cwd: projectDir,
      env: { ...process.env },
    })

    let stdout = ''
    let stderr = ''
    let resolved = false

    const timer = setTimeout(() => {
      if (resolved) return
      resolved = true
      child.kill('SIGTERM')
      resolve({ result: '', session_id: null, timeout: true })
    }, timeoutMs)

    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })

    child.on('error', (err) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      resolve({ result: '', session_id: null, error: err.message })
    })

    child.on('close', (code) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      if (code !== 0 && !stdout) {
        resolve({ result: '', session_id: null, error: stderr || `claude exited ${code}` })
        return
      }
      resolve(parseClaudeOutput(stdout))
    })

    child.stdin.write(prompt)
    child.stdin.end()
  })
}
