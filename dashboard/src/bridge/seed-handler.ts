import { readFileSync } from 'fs'
import { resolve } from 'path'
import { runClaude, detectRateLimit, extractMarkers } from './claude-runner'
import { appendChatMessage } from './chat-reader'
import { readSeedingState, updateSessionId, markDisciplineComplete, markSeedingComplete, setStatus } from './seeding-state'
import { finalizeSeeding } from './seeding-finalize'
import { maybeDeriveWorkingTitle } from './derive-title'

// Read from rouge-dashboard.config.json if available, otherwise use relative path
const configPath = resolve(__dirname, '../../rouge-dashboard.config.json')
let ORCHESTRATOR_PROMPT_PATH: string
try {
  const config = JSON.parse(readFileSync(configPath, 'utf-8'))
  ORCHESTRATOR_PROMPT_PATH = resolve(__dirname, '../..', config.orchestrator_prompt || '../src/prompts/seeding/00-swarm-orchestrator.md')
} catch {
  ORCHESTRATOR_PROMPT_PATH = resolve(__dirname, '../../../src/prompts/seeding/00-swarm-orchestrator.md')
}

function genId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function appendMessages(
  projectDir: string,
  human: string | null,
  rouge: string,
  discipline?: string,
): void {
  const now = new Date().toISOString()
  if (human !== null) {
    appendChatMessage(projectDir, {
      id: genId(),
      role: 'human',
      content: human,
      timestamp: now,
      metadata: discipline ? { discipline } : undefined,
    })
  }
  appendChatMessage(projectDir, {
    id: genId(),
    role: 'rouge',
    content: rouge,
    timestamp: new Date().toISOString(),
    metadata: discipline ? { discipline } : undefined,
  })
}

export interface SendMessageResult {
  ok: boolean
  error?: string
  status: number
  rateLimited?: boolean
  disciplineComplete?: string[]
  seedingComplete?: boolean
  readyTransition?: boolean
  missingArtifacts?: string[]
}

export async function handleSeedMessage(
  projectDir: string,
  userText: string,
): Promise<SendMessageResult> {
  const state = readSeedingState(projectDir)
  // Note: we intentionally allow messages even when status === 'complete'.
  // The Revise mode in the dashboard uses this path to let users continue
  // the conversation after seeding completes — to amend spec, add missing
  // artifacts, or clarify decisions. Claude remembers context via session_id.

  const result = await runClaude({
    projectDir,
    prompt: userText,
    sessionId: state.session_id,
  })

  if (result.timeout) {
    return { ok: false, status: 504, error: 'Claude timed out' }
  }

  if (result.error) {
    return { ok: false, status: 500, error: result.error }
  }

  // Capture the discipline that was active when this message started.
  // We tag messages with this discipline (even if markers advance it afterwards).
  const activeDiscipline = state.current_discipline

  // Detect rate limit
  if (detectRateLimit(result.result)) {
    setStatus(projectDir, 'paused')
    appendMessages(projectDir, userText, result.result, activeDiscipline)
    return { ok: false, status: 429, error: 'Claude rate-limited', rateLimited: true }
  }

  // Persist session_id if new
  if (result.session_id && result.session_id !== state.session_id) {
    updateSessionId(projectDir, result.session_id)
  }

  // Activate session if not yet active
  if (state.status === 'not-started' || state.status === 'paused') {
    setStatus(projectDir, 'active')
  }

  // Parse markers
  const markers = extractMarkers(result.result)
  for (const d of markers.disciplinesComplete) {
    markDisciplineComplete(projectDir, d)
  }

  // Append conversation (user message + rouge response) tagged with the
  // discipline that was active BEFORE markers fired.
  appendMessages(projectDir, userText, result.result, activeDiscipline)

  // If this was the first user message and the project is still
  // placeholder-named, derive a working title in the background.
  // Fire-and-forget: the chat response does not wait on it.
  void maybeDeriveWorkingTitle(projectDir, userText)

  // Check for SEEDING_COMPLETE
  let readyTransition = false
  let missingArtifacts: string[] | undefined
  if (markers.seedingComplete) {
    const finalizeResult = finalizeSeeding(projectDir)
    if (finalizeResult.ok) {
      markSeedingComplete(projectDir)
      readyTransition = true
    } else {
      missingArtifacts = finalizeResult.missingArtifacts
    }
  }

  return {
    ok: true,
    status: 200,
    disciplineComplete: markers.disciplinesComplete.length > 0 ? markers.disciplinesComplete : undefined,
    seedingComplete: markers.seedingComplete,
    readyTransition,
    missingArtifacts,
  }
}

export async function startSeedingSession(
  projectDir: string,
  projectName: string,
): Promise<SendMessageResult> {
  const orchestratorPrompt = readFileSync(ORCHESTRATOR_PROMPT_PATH, 'utf-8')
  const initialPrompt = orchestratorPrompt +
    '\n\n---\n\nThe user wants to build a product called "' + projectName + '". Start the seeding swarm. Ask the first question.'

  const result = await runClaude({
    projectDir,
    prompt: initialPrompt,
    sessionId: null,
  })

  if (result.timeout) {
    return { ok: false, status: 504, error: 'Claude timed out' }
  }
  if (result.error) {
    return { ok: false, status: 500, error: result.error }
  }

  // First-ever message always starts with brainstorming
  const activeDiscipline = 'brainstorming'

  if (detectRateLimit(result.result)) {
    setStatus(projectDir, 'paused')
    appendMessages(projectDir, null, result.result, activeDiscipline)
    return { ok: false, status: 429, error: 'Claude rate-limited', rateLimited: true }
  }

  if (result.session_id) {
    updateSessionId(projectDir, result.session_id)
  }
  setStatus(projectDir, 'active')

  const markers = extractMarkers(result.result)
  for (const d of markers.disciplinesComplete) {
    markDisciplineComplete(projectDir, d)
  }

  // Only Rouge's message (no user input initiated this)
  appendMessages(projectDir, null, result.result, activeDiscipline)

  return {
    ok: true,
    status: 200,
    disciplineComplete: markers.disciplinesComplete.length > 0 ? markers.disciplinesComplete : undefined,
  }
}
