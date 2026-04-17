import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { runClaude, detectRateLimit, extractMarkers, segmentMarkers, type MessageSegment } from './claude-runner'
import { appendChatMessage } from './chat-reader'
import { readSeedingState, updateSessionId, markDisciplineComplete, markDisciplinePrompted, markSeedingComplete, setStatus, appendPendingCorrection, peekPendingCorrection, clearPendingCorrection, isAwaitingGateFor, setAwaitingGate, clearPendingGate, updateHeartbeat, effectiveMode } from './seeding-state'
import type { SeedingMessageKind } from './types'
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

/**
 * Append a human message (if any) followed by one chat message per
 * marker segment from Claude's response. Each segment is tagged with
 * its `kind` (prose/gate/decision/heartbeat/...) so the UI can render
 * distinctly and the traffic-light can reset on every marker.
 *
 * Why segmented: the pre-gated-autonomy path wrote the full Claude
 * response as one chat message tagged only with a discipline name.
 * That's what produced the colourcontrast symptom — a single wall-of-
 * text arrived after 6.5 minutes of silence, and no visible structure
 * told the user what Rouge actually decided. Splitting on markers
 * makes decisions and gates first-class chat entities.
 */
function appendSegmentedRougeMessages(
  projectDir: string,
  segments: MessageSegment[],
  discipline?: string,
): void {
  for (const seg of segments) {
    // discipline_complete and seeding_complete are state-machine
    // signals — the marker itself isn't shown to the user as its own
    // chat bubble; the acceptance/rejection SYSTEM NOTEs downstream
    // cover the UX. Skip here so we don't double-post.
    if (seg.kind === 'discipline_complete' || seg.kind === 'seeding_complete') {
      continue
    }
    const kind = segmentKindToMessageKind(seg.kind)
    appendChatMessage(projectDir, {
      id: genId(),
      role: 'rouge',
      content: seg.content,
      timestamp: new Date().toISOString(),
      kind,
      metadata: {
        ...(discipline ? { discipline } : {}),
        ...(seg.id ? { markerId: seg.id } : {}),
      },
    })
  }
}

function segmentKindToMessageKind(k: MessageSegment['kind']): SeedingMessageKind {
  switch (k) {
    case 'gate': return 'gate_question'
    case 'decision': return 'autonomous_decision'
    case 'heartbeat': return 'heartbeat'
    default: return 'prose'
  }
}

/**
 * Walk the parsed segments and update session state accordingly.
 *
 * Rules:
 *  - [DECISION:] / [HEARTBEAT:] → bump last_heartbeat_at so the UI
 *    traffic-light resets.
 *  - [GATE:] → flip to awaiting_gate with the gate id. Only the LAST
 *    gate in the response is the one Rouge is currently waiting on;
 *    earlier gates in the same turn were answered-by-context as Claude
 *    produced the response.
 *
 * Discipline derivation for gates: the gate id is expected to be
 * `<discipline>/<slug>` (e.g. `brainstorming/H2-north-star`). If the
 * id doesn't contain a slash, fall back to activeDiscipline.
 */
function applyMarkerStateEffects(
  projectDir: string,
  segments: MessageSegment[],
  activeDiscipline: string | null,
): void {
  let lastGate: { discipline: string; id: string } | null = null
  let sawTimingMarker = false

  for (const seg of segments) {
    if (seg.kind === 'decision' || seg.kind === 'heartbeat') {
      sawTimingMarker = true
    } else if (seg.kind === 'gate' && seg.id) {
      const [maybeDiscipline, ...rest] = seg.id.split('/')
      if (rest.length > 0) {
        lastGate = { discipline: maybeDiscipline, id: seg.id }
      } else if (activeDiscipline) {
        lastGate = { discipline: activeDiscipline, id: seg.id }
      }
    }
  }

  if (sawTimingMarker) {
    updateHeartbeat(projectDir)
  }
  if (lastGate) {
    setAwaitingGate(projectDir, lastGate.discipline, lastGate.id)
  }
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

interface TurnOptions {
  /** Turn was triggered by the dashboard after a discipline completed, not
   * by user input. The `text` passed in is a system instruction, so we
   * skip logging a human message to the chat. */
  isKickoff?: boolean
  /** How many recursive turns have already fired from the originating
   *  user message. 0 means this IS the user's turn. Used to cap the
   *  auto-continuation chain so a runaway discipline can't burn
   *  unbounded tokens. See MAX_CHUNK_DEPTH. */
  chunkDepth?: number
}

// Max turns we'll auto-chain from a single user message. Covers:
//   - one discipline-advance kickoff (discipline A completes, enter B)
//   - plus autonomous-chunk continuations within a discipline (Claude
//     emits decisions, returns, bridge fires again)
//
// Initial value (5) was too tight for Spec — the colour-contrast session
// hit the cap after writing 2 of 8 feature-area specs, forcing the user
// to nudge mid-discipline. 10 gives each discipline ~5-10 min of
// autonomous headroom. Revisit if real seedings still hit the cap
// frequently.
const MAX_CHUNK_DEPTH = 10

export async function handleSeedMessage(
  projectDir: string,
  userText: string,
): Promise<SendMessageResult> {
  return runSeedingTurn(projectDir, userText, {})
}

async function runSeedingTurn(
  projectDir: string,
  text: string,
  options: TurnOptions,
): Promise<SendMessageResult> {
  const { isKickoff = false, chunkDepth = 0 } = options

  // Gated-autonomy: a user-initiated turn IS the answer to any pending
  // gate. But ORDERING MATTERS: we must capture the pre-clear gate
  // BEFORE running the reconciler, then pass that gate into the
  // reconciler as a hint, THEN clear the gate after reconciliation
  // completes.
  //
  // The alternative (clear first, then reconcile) is what shipped in
  // the initial PR 1 and is a bug: reconcileDisciplineState reads
  // state.mode fresh each call. Clearing the gate before the reconciler
  // runs means the reconciler sees mode=running_autonomous and
  // advances past the discipline the user was still mid-question on.
  // That reproduced the colour-contrast bug (user's "a" tagged as spec
  // because reconciler had already advanced taste to complete).
  const preGatePending =
    !isKickoff && effectiveMode(readSeedingState(projectDir)) === 'awaiting_gate'
      ? readSeedingState(projectDir).pending_gate ?? null
      : null

  // Reconcile stranded state before anything else. Earlier runs may have
  // had markers rejected (e.g. wrong artifact path pre-#150) that later
  // got valid artifacts on disk when the verifier widened; without this
  // pass, those disciplines stay "pending" forever while later ones
  // accumulate around them. Walk in sequence, mark any discipline whose
  // artifact now passes verification, and stop at the first gap so we
  // respect the orchestrator's sequential rule.
  //
  // Skipped on auto-kickoff turns: the user-initiated turn that
  // triggered the kickoff just reconciled, and nothing's changed on
  // disk between that turn and this recursive one. No artifacts have
  // been written by Claude yet in this kickoff.
  if (!isKickoff) {
    const reconciled = reconcileDisciplineState(projectDir, preGatePending?.discipline ?? null)
    if (reconciled.length > 0) {
      console.log(`[seeding] reconciled stranded disciplines: ${reconciled.join(', ')}`)
      // Strip the [SYSTEM NOTE] prefix — the new `kind: 'system_note'`
      // drives UI styling, making the inline bracket tag redundant and
      // visually naff.
      const note = `Reconciled earlier discipline state: ${reconciled.join(', ')} now marked complete (artifact verified on disk). Seeding continues.`
      appendChatMessage(projectDir, {
        id: genId(),
        role: 'rouge',
        content: note,
        timestamp: new Date().toISOString(),
        kind: 'system_note',
      })
    }
    // NOW clear the pending gate — after the reconciler has had its
    // chance to respect it. The user's message IS the gate answer,
    // so switch back to running_autonomous mode for the rest of
    // the turn.
    if (preGatePending) {
      clearPendingGate(projectDir)
    }
  }

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
  // Deliver any correction stashed from the previous turn (e.g. a
  // rejected DISCIPLINE_COMPLETE). Claude doesn't see the chat-log note
  // we appended — its `--resume` only replays the server-side session —
  // so without this, rejections would be invisible to the agent and it
  // would either advance blindly or repeat the same mistake.
  //
  // Peek rather than consume: if runClaude times out or errors below,
  // the correction must stay stashed so the next turn can deliver it.
  // We only clear after Claude returns successfully (post rate-limit
  // check).
  const pendingCorrection = peekPendingCorrection(projectDir)
  if (pendingCorrection) {
    sections.push('---', pendingCorrection)
  }
  if (isFirstTurn && sections.length > 0) {
    sections.push(
      '---',
      'The user has described what they want to build. Their first message is below — respond in character as the active discipline.',
    )
  }
  sections.push(text)
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
  // limited turn retries with the same injection next time. Also don't
  // clear the pending correction — a rate-limit means Claude never got
  // to act on it.
  if (detectRateLimit(result.result)) {
    setStatus(projectDir, 'paused')
    appendMessages(projectDir, isKickoff ? null : text, result.result, activeDiscipline ?? undefined)
    return { ok: false, status: 429, error: 'Claude rate-limited', rateLimited: true }
  }

  // Claude returned a real response — the correction (if any) reached
  // it via the prompt above. Safe to clear now.
  if (pendingCorrection) {
    clearPendingCorrection(projectDir)
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
  //
  // Sequential enforcement: we also reject a marker if any earlier
  // discipline in DISCIPLINE_SEQUENCE is still pending AND has no valid
  // artifact on disk. That prevents the out-of-order-completion bug
  // where a later marker got accepted while an earlier one sat rejected.
  // Reconciliation (above) already picks up earlier disciplines that DO
  // have artifacts, so by this point the only remaining gaps are real.
  const markers = extractMarkers(result.result)
  // Parse segments once here so we can enforce the "gate at the end,
  // or not at all" rule from the orchestrator prompt: if the response
  // contains a [GATE:], no [DISCIPLINE_COMPLETE:] from the same turn
  // is acceptable — Claude is asking AND declaring done, which means
  // the user couldn't possibly have answered before the declaration.
  // Without this, the colourcontrast-class bug reappears at the
  // prompt layer: Claude writes a discipline artifact autonomously,
  // emits COMPLETE, and asks the next gate all in one turn.
  const prelimSegments = segmentMarkers(result.result)
  const turnHasGate = prelimSegments.some((s) => s.kind === 'gate')

  const acceptedDisciplines: string[] = []
  const rejectedDisciplines: Array<{ discipline: string; reason: string }> = []
  for (const d of markers.disciplinesComplete) {
    if (!isKnownDiscipline(d)) {
      rejectedDisciplines.push({ discipline: d, reason: 'unknown discipline name' })
      continue
    }
    if (turnHasGate) {
      rejectedDisciplines.push({
        discipline: d,
        reason: `cannot emit DISCIPLINE_COMPLETE and a [GATE:] in the same turn — end the turn after the gate, wait for the human answer, then complete on a later turn.`,
      })
      continue
    }
    const gap = firstUncompletedEarlierDiscipline(projectDir, d)
    if (gap) {
      rejectedDisciplines.push({
        discipline: d,
        reason: `cannot complete ${d} — earlier discipline ${gap} is still pending with no artifact. Complete ${gap} first.`,
      })
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

  // Append conversation. Human entry first (skipped on kickoff — the
  // `text` was a system instruction, not user input), then the rouge
  // response split on markers into one chat message per segment. Each
  // segment carries its kind (gate/decision/heartbeat/prose) so the UI
  // renders distinctly and the traffic-light chip can reset on each
  // marker arrival.
  //
  // If the agent emitted markers for disciplines whose artifacts aren't
  // on disk, append a follow-up SYSTEM NOTE so both the human (in the
  // chat UI) and the agent (via session history on the next turn) see
  // that the marker was rejected.
  if (!isKickoff) {
    appendChatMessage(projectDir, {
      id: genId(),
      role: 'human',
      content: text,
      timestamp: new Date().toISOString(),
      metadata: activeDiscipline ? { discipline: activeDiscipline } : undefined,
    })
  }
  // Reuse the segments parsed above for the gate-and-complete guard.
  appendSegmentedRougeMessages(projectDir, prelimSegments, activeDiscipline ?? undefined)
  applyMarkerStateEffects(projectDir, prelimSegments, activeDiscipline)
  if (rejectedDisciplines.length > 0) {
    // Claude-facing note keeps the [SYSTEM NOTE] prefix — that text is
    // delivered via appendPendingCorrection on the next turn and the
    // bracket tag helps the agent parse it as an instruction.
    const claudeNote = rejectedDisciplines
      .map(
        (r) =>
          `[SYSTEM NOTE] DISCIPLINE_COMPLETE(${r.discipline}) was rejected — ${r.reason}. The discipline remains active. Continue the work on disk and emit the marker only when the artifact exists with real content.`,
      )
      .join('\n')
    // Human-facing note drops the prefix — UI styling from kind=system_note
    // conveys the meaning; raw bracket tags read as scaffolding.
    const humanNote = rejectedDisciplines
      .map(
        (r) =>
          `DISCIPLINE_COMPLETE(${r.discipline}) was rejected — ${r.reason}. The discipline remains active; Rouge will keep working and emit the marker only when the artifact is truly done.`,
      )
      .join('\n')
    appendChatMessage(projectDir, {
      id: genId(),
      role: 'rouge',
      content: humanNote,
      timestamp: new Date().toISOString(),
      kind: 'system_note',
      metadata: { discipline: activeDiscipline ?? undefined },
    })
    // Delivered to Claude on the next turn (session memory alone wouldn't
    // carry this note — our chat log is separate from Claude's session).
    appendPendingCorrection(projectDir, claudeNote)
  }

  // If this was the first user message and the project is still
  // placeholder-named, derive a working title in the background.
  // Fire-and-forget: the chat response does not wait on it. Skipped on
  // kickoff turns — the `text` is a system instruction, not a real user
  // message.
  if (!isKickoff) {
    void maybeDeriveWorkingTitle(projectDir, text)
  }

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

  // Auto-continuation. Two shapes:
  //
  // 1. **Discipline advance** — `[DISCIPLINE_COMPLETE]` accepted, seeding
  //    not done. Fire a new turn that injects the next discipline's
  //    sub-prompt and asks it to start.
  // 2. **Autonomous chunk** — turn ended in `running_autonomous` with
  //    neither a gate nor a discipline-complete. Under the chunked-turn
  //    contract, this means "I've emitted my chunk, the bridge fires
  //    the next one." The orchestrator prompt promises this behaviour.
  //    Without it, Claude stops mid-discipline whenever it returns,
  //    and the user watches the chat sit idle — which is exactly the
  //    "paused at end of brainstorming for 4 min" symptom.
  //
  // Both paths share a single cap (MAX_CHUNK_DEPTH) on the recursive
  // chain per originating user message. Hitting the cap surfaces a
  // chat note so the user knows to nudge with a message.
  const atDepthLimit = chunkDepth + 1 >= MAX_CHUNK_DEPTH
  const postContinuationState = readSeedingState(projectDir)
  const shouldContinueForAdvance =
    acceptedDisciplines.length > 0 &&
    !markers.seedingComplete &&
    !atDepthLimit
  // Only auto-continue a non-advancing turn if Claude actually emitted
  // decision/heartbeat markers — that's the signal it's in the middle
  // of autonomous work. A turn that was pure prose (no markers) is
  // probably Claude asking the user unprompted; continuing would
  // interrupt a question the user hasn't seen yet.
  const emittedAutonomousMarkers = prelimSegments.some(
    (s) => s.kind === 'decision' || s.kind === 'heartbeat',
  )
  const shouldContinueForAutonomous =
    !shouldContinueForAdvance &&
    !markers.seedingComplete &&
    acceptedDisciplines.length === 0 &&
    rejectedDisciplines.length === 0 &&
    emittedAutonomousMarkers &&
    postContinuationState.mode !== 'awaiting_gate' &&
    postContinuationState.status === 'active' &&
    !atDepthLimit

  if (shouldContinueForAdvance) {
    const nextDiscipline = resolveActiveDiscipline(postContinuationState.current_discipline)
    const alreadyKicked = postContinuationState.disciplines_prompted ?? []
    if (nextDiscipline && !alreadyKicked.includes(nextDiscipline)) {
      const previous = acceptedDisciplines.join(', ')
      const kickoffText = [
        `[SYSTEM] Discipline(s) ${previous} accepted — artifact verified on disk. State has advanced.`,
        `You are now entering ${nextDiscipline.toUpperCase()}. The sub-prompt for that discipline is attached to this turn; follow its rules exactly.`,
        `Begin the new discipline by asking its first question to the human, in the format the sub-prompt specifies. Do NOT summarise the previous discipline's conclusions — the human already has them.`,
      ].join(' ')
      await runContinuationTurn(projectDir, kickoffText, chunkDepth + 1, `kickoff-${nextDiscipline}`)
    }
  } else if (shouldContinueForAutonomous) {
    const activeDisc = resolveActiveDiscipline(postContinuationState.current_discipline)
    const continuationText = [
      '[SYSTEM] Continue the autonomous chunk for the current discipline.',
      'Emit your next 1–3 [DECISION:] markers (and any [HEARTBEAT:] while working) and return.',
      'Return BEFORE you hit ~60s of work so the user sees progress. If the discipline artifact is on disk with full content, emit [DISCIPLINE_COMPLETE:', activeDisc ?? '<current>', '] instead of further decisions.',
      'If you need a human decision, emit [GATE:] and stop — do NOT emit a decision and a gate in the same turn.',
    ].join(' ')
    await runContinuationTurn(projectDir, continuationText, chunkDepth + 1, 'autonomous-chunk')
  } else if (
    !markers.seedingComplete &&
    atDepthLimit &&
    (acceptedDisciplines.length > 0 ||
      (postContinuationState.mode !== 'awaiting_gate' && postContinuationState.status === 'active'))
  ) {
    // Chain budget exhausted. Surface a note with a one-click Continue
    // affordance so the user doesn't have to type to resume.
    appendChatMessage(projectDir, {
      id: genId(),
      role: 'rouge',
      content: `Auto-continuation budget reached (${MAX_CHUNK_DEPTH} chunks). Click Continue to resume — Rouge will pick up where it left off.`,
      timestamp: new Date().toISOString(),
      kind: 'resume_prompt',
      metadata: { discipline: activeDiscipline ?? undefined },
    })
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

/**
 * Wrap a recursive kickoff/continuation turn with a single try/catch so
 * failures don't crash the outer turn but ARE visible to the user.
 *
 * Label is included in the failure message for diagnosability:
 * "kickoff-competition" vs "autonomous-chunk".
 */
async function runContinuationTurn(
  projectDir: string,
  text: string,
  chunkDepth: number,
  label: string,
): Promise<void> {
  try {
    await runSeedingTurn(projectDir, text, { isKickoff: true, chunkDepth })
  } catch (err) {
    console.error(`[seeding] continuation turn (${label}) failed:`, err)
    const msg = err instanceof Error ? err.message : String(err)
    appendChatMessage(projectDir, {
      id: genId(),
      role: 'rouge',
      content: `Auto-continuation (${label}) failed: ${msg}. Send any message to resume.`,
      timestamp: new Date().toISOString(),
      kind: 'system_note',
    })
  }
}

function isKnownDiscipline(name: string): name is Discipline {
  return (DISCIPLINE_SEQUENCE as readonly string[]).includes(name)
}

function resolveActiveDiscipline(raw: string | undefined): Discipline | null {
  if (!raw) return DISCIPLINE_SEQUENCE[0] as Discipline
  return isKnownDiscipline(raw) ? raw : null
}

/**
 * Walk disciplines in sequence; mark any not-yet-complete discipline
 * whose artifact passes verification. Stops at the first gap so we
 * preserve the orchestrator's sequential rule. Returns the list of
 * disciplines newly marked complete this pass.
 *
 * Exists because early runs had markers rejected (artifact-path
 * mismatches fixed in #150/#151) and the state never caught up when the
 * verifier later accepted those paths. This pass picks up the stranded
 * work on the next user turn automatically. See the testimonials
 * session symptom: `disciplines_complete: ['competition','taste','spec']`
 * while brainstorming stayed pending with a real 41KB artifact on disk.
 */
function reconcileDisciplineState(
  projectDir: string,
  preClearGateDiscipline: string | null = null,
): string[] {
  const state = readSeedingState(projectDir)
  const complete = new Set(state.disciplines_complete ?? [])
  const newlyComplete: string[] = []

  for (const d of DISCIPLINE_SEQUENCE) {
    if (complete.has(d)) continue
    // Gated-autonomy guard: if Rouge has asked a gate in this discipline
    // and the human hasn't answered, treat it as a gap even if an
    // artifact landed on disk. Without this, a Claude turn that wrote a
    // discipline's artifact while the user was still staring at an
    // unanswered question would advance state out from under them —
    // exactly the colour-contrast regression (taste gate asked, user
    // was mid-answer, reconciler saw taste.md on disk, marked taste
    // complete, user's answer got tagged as spec).
    //
    // We check BOTH the current in-memory state (in case something set
    // awaiting_gate mid-turn) AND the pre-clear pointer the caller
    // passed in (the human's message auto-clears awaiting_gate before
    // this runs, so the in-memory state alone is insufficient).
    if (isAwaitingGateFor(state, d)) break
    if (preClearGateDiscipline === d) break
    const check = verifyDisciplineArtifact(projectDir, d)
    if (check.ok) {
      markDisciplineComplete(projectDir, d)
      complete.add(d)
      newlyComplete.push(d)
    } else {
      // First real gap — don't look further. If brainstorming genuinely
      // has no artifact, we cannot mark competition etc. as complete
      // even if those have artifacts.
      break
    }
  }

  return newlyComplete
}

/**
 * Returns the first discipline earlier than `target` in the sequence
 * that is NOT complete and has no verifiable artifact on disk. If
 * non-null, emitting `[DISCIPLINE_COMPLETE: target]` should be rejected
 * because earlier work is genuinely missing.
 */
function firstUncompletedEarlierDiscipline(
  projectDir: string,
  target: Discipline,
): string | null {
  const state = readSeedingState(projectDir)
  const complete = new Set(state.disciplines_complete ?? [])
  for (const d of DISCIPLINE_SEQUENCE) {
    if (d === target) return null
    if (complete.has(d)) continue
    // Artifact present but unmarked — reconciliation (called earlier in
    // the turn) should have caught this. If it didn't, the artifact
    // doesn't pass verification, so count this as a real gap.
    const check = verifyDisciplineArtifact(projectDir, d)
    if (!check.ok) return d
  }
  return null
}
