import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { runClaude, detectRateLimit, extractMarkers } from './claude-runner'
import { appendChatMessage } from './chat-reader'
import { readSeedingState, updateSessionId, markDisciplineComplete, markSeedingComplete, setStatus } from './seeding-state'
import { finalizeSeeding } from './seeding-finalize'
import { maybeDeriveWorkingTitle } from './derive-title'

// Locate the seeding orchestrator prompt at startup.
//
// Under Turbopack (Next 16 dev) `__dirname` points at a compiled-bundle
// path deep under `.next/`, so a `resolve(__dirname, '../..')` walk
// blows past `/` and an absolute "/src/prompts/..." string falls out.
// That silently broke project creation: `startSeedingSession` threw
// ENOENT in the background, no orchestrator context ever entered the
// session, and the agent responded to the user's first message as
// generic Opus instead of the brainstormer.
//
// Try a list of plausible absolute paths and use the first that exists.
// Same trick the budget route uses for `rouge.config.json`.
function resolveOrchestratorPromptPath(): string {
  const envHint = process.env.ROUGE_ORCHESTRATOR_PROMPT
  const candidates = [
    envHint,
    // Dashboard invoked from repo root (most common dev case).
    resolve(process.cwd(), 'src/prompts/seeding/00-swarm-orchestrator.md'),
    // Dashboard invoked from its own dir (e.g. `cd dashboard && npm run dev`).
    resolve(process.cwd(), '../src/prompts/seeding/00-swarm-orchestrator.md'),
    // __dirname-based fallbacks — brittle under Turbopack but fine when
    // the code is run directly via node (tests, standalone server).
    resolve(__dirname, '../../../src/prompts/seeding/00-swarm-orchestrator.md'),
    resolve(__dirname, '../..', '../src/prompts/seeding/00-swarm-orchestrator.md'),
  ].filter((p): p is string => typeof p === 'string' && p.length > 0)

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  // Fall through to the first candidate so the caller gets a useful
  // ENOENT message pointing at a real-looking path.
  return candidates[0]
}

const ORCHESTRATOR_PROMPT_PATH = resolveOrchestratorPromptPath()

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

  // First message from the user: inline the orchestrator prompt so the
  // agent enters the brainstorming discipline. Previously this ran from
  // a fire-and-forget `startSeedingSession` at project creation, which
  // raced with the auto-slug rename (#137) and ENOENT'd on the stale
  // project directory — leaving the session bare-bones Opus.
  let prompt = userText
  if (state.session_id === null) {
    try {
      const orchestratorPrompt = readFileSync(ORCHESTRATOR_PROMPT_PATH, 'utf-8')
      prompt = [
        orchestratorPrompt,
        '---',
        'The user has described what they want to build. Begin the seeding swarm — enter BRAINSTORMING and explore their idea per the discipline\'s rules. Their first message is below.',
        '---',
        userText,
      ].join('\n\n')
    } catch (err) {
      console.error('[seeding] orchestrator prompt unreadable:', err)
      // Fall through with raw userText — better than 500'ing the chat.
    }
  }

  const result = await runClaude({
    projectDir,
    prompt,
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
