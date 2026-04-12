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
