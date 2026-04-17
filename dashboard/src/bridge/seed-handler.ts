import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { runClaude, detectRateLimit, extractMarkers } from './claude-runner'
import { appendChatMessage } from './chat-reader'
import { readSeedingState, updateSessionId, markDisciplineComplete, markDisciplinePrompted, markSeedingComplete, setStatus } from './seeding-state'
import { finalizeSeeding } from './seeding-finalize'
import { maybeDeriveWorkingTitle } from './derive-title'
import { loadDisciplinePrompt, type Discipline } from './discipline-prompts'
import { verifyDisciplineArtifact } from './discipline-artifacts'
import { DISCIPLINE_SEQUENCE } from './types'

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

// Resolved lazily per-call (not cached at module load) so tests can
// point this at a fixture via `ROUGE_ORCHESTRATOR_PROMPT` after the
// module has already imported.
function currentOrchestratorPromptPath(): string {
  return resolveOrchestratorPromptPath()
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

  const activeDiscipline = resolveActiveDiscipline(state.current_discipline)
  const alreadyPrompted = state.disciplines_prompted ?? []
  const isFirstTurn = state.session_id === null
  const needsDisciplinePrompt =
    activeDiscipline !== null && !alreadyPrompted.includes(activeDiscipline)

  // Build the prompt. Two injections can fire:
  //
  // 1) Orchestrator prompt on the session's very first turn — sets the
  //    swarm context, discipline list, markers protocol (#146).
  // 2) The ACTIVE discipline's full sub-prompt the first time we enter
  //    that discipline in this session (#147). Without this, the agent
  //    had been improvising each discipline from the orchestrator's
  //    one-line summary and skipping the real rules (ask user/pain/
  //    trigger, one question at a time, produce the Design Document, etc).
  //    Session resume carries the prompt forward for subsequent turns in
  //    the same discipline — we inject once per discipline, not per turn.
  const sections: string[] = []
  if (isFirstTurn) {
    try {
      sections.push(readFileSync(currentOrchestratorPromptPath(), 'utf-8'))
    } catch (err) {
      console.error('[seeding] orchestrator prompt unreadable:', err)
    }
  }
  if (needsDisciplinePrompt && activeDiscipline) {
    const sub = loadDisciplinePrompt(activeDiscipline)
    if (sub) {
      sections.push(
        '---',
        `DISCIPLINE TRANSITION — entering ${activeDiscipline.toUpperCase()}. Follow the rules below exactly. Ignore any temptation to shortcut into later disciplines (spec, infrastructure, deployment choice) — that is a separate phase. Complete this discipline's artifact on disk before emitting its completion marker.`,
        sub,
      )
    } else {
      console.error(`[seeding] discipline prompt unreadable for ${activeDiscipline}`)
    }
  }
  if (isFirstTurn && sections.length > 0) {
    sections.push(
      '---',
      'The user has described what they want to build. Their first message is below — respond in character as the active discipline.',
    )
  }
  sections.push(userText)
  const prompt = sections.join('\n\n')

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

  // Detect rate limit BEFORE marking the discipline prompted so a rate-
  // limited turn retries with the same injection next time.
  if (detectRateLimit(result.result)) {
    setStatus(projectDir, 'paused')
    appendMessages(projectDir, userText, result.result, activeDiscipline ?? undefined)
    return { ok: false, status: 429, error: 'Claude rate-limited', rateLimited: true }
  }

  // We successfully handed the discipline's sub-prompt to Claude; record
  // it so we don't re-inject on every subsequent turn in the same phase.
  if (needsDisciplinePrompt && activeDiscipline) {
    markDisciplinePrompted(projectDir, activeDiscipline)
  }

  // Persist session_id if new
  if (result.session_id && result.session_id !== state.session_id) {
    updateSessionId(projectDir, result.session_id)
  }

  // Activate session if not yet active
  if (state.status === 'not-started' || state.status === 'paused') {
    setStatus(projectDir, 'active')
  }

  // Parse markers. We only advance discipline state for markers whose
  // artifact actually exists on disk — the orchestrator prompt forbids
  // premature markers, but the agent has been known to emit them
  // anyway (#147). Dashboard-side enforcement is the backstop.
  const markers = extractMarkers(result.result)
  const acceptedDisciplines: string[] = []
  const rejectedDisciplines: Array<{ discipline: string; reason: string }> = []
  for (const d of markers.disciplinesComplete) {
    if (!isKnownDiscipline(d)) {
      rejectedDisciplines.push({ discipline: d, reason: 'unknown discipline name' })
      continue
    }
    const check = verifyDisciplineArtifact(projectDir, d)
    if (check.ok) {
      markDisciplineComplete(projectDir, d)
      acceptedDisciplines.push(d)
    } else {
      console.warn(
        `[seeding] rejecting DISCIPLINE_COMPLETE(${d}) — ${check.reason}`,
      )
      rejectedDisciplines.push({ discipline: d, reason: check.reason ?? 'artifact missing' })
    }
  }

  // Append conversation (user message + rouge response) tagged with the
  // discipline that was active BEFORE markers fired. If the agent emitted
  // markers for disciplines whose artifacts aren't on disk, append a
  // follow-up note so both the human (in the UI) and the agent (via
  // session history on the next turn) see that the marker was rejected.
  appendMessages(projectDir, userText, result.result, activeDiscipline ?? undefined)
  if (rejectedDisciplines.length > 0) {
    const note = rejectedDisciplines
      .map(
        (r) =>
          `[SYSTEM NOTE] DISCIPLINE_COMPLETE(${r.discipline}) was rejected — ${r.reason}. The discipline remains active. Continue the work on disk and emit the marker only when the artifact exists with real content.`,
      )
      .join('\n')
    appendChatMessage(projectDir, {
      id: genId(),
      role: 'rouge',
      content: note,
      timestamp: new Date().toISOString(),
      metadata: { discipline: activeDiscipline ?? undefined },
    })
  }

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
    disciplineComplete: acceptedDisciplines.length > 0 ? acceptedDisciplines : undefined,
    seedingComplete: markers.seedingComplete,
    readyTransition,
    missingArtifacts,
  }
}

function isKnownDiscipline(name: string): name is Discipline {
  return (DISCIPLINE_SEQUENCE as readonly string[]).includes(name)
}

function resolveActiveDiscipline(raw: string | undefined): Discipline | null {
  if (!raw) return DISCIPLINE_SEQUENCE[0] as Discipline
  return isKnownDiscipline(raw) ? raw : null
}
