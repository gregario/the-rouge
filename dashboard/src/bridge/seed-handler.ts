import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { runClaude, detectRateLimit, extractMarkers, segmentMarkers, type MessageSegment } from './claude-runner'
import { appendChatMessage } from './chat-reader'
import { readSeedingState, writeSeedingState, updateSessionId, markDisciplineComplete, markDisciplinePrompted, markSeedingComplete, setStatus, appendPendingCorrection, peekPendingCorrection, clearPendingCorrection, isAwaitingGateFor, setAwaitingGate, clearPendingGate, updateHeartbeat, effectiveMode, setAwaitingApproval, clearAwaitingApproval, isAwaitingApproval, updateDisciplineStatusInState } from './seeding-state'
import type { SeedingMessageKind } from './types'
import { finalizeSeeding } from './seeding-finalize'
import { maybeDeriveWorkingTitle } from './derive-title'
import { loadDisciplinePrompt, type Discipline } from './discipline-prompts'
import { verifyDisciplineArtifact } from './discipline-artifacts'
import { DISCIPLINE_SEQUENCE } from './types'
import { runAutoClassifier } from './auto-classifier'
import { listApplicableDisciplines, validateTierCompletion, type ProjectSize } from './tier-registry'

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
    // discipline_complete, discipline_skipped, and seeding_complete are
    // state-machine signals — the marker itself isn't shown to the user
    // as its own chat bubble; the acceptance/rejection SYSTEM NOTEs
    // downstream cover the UX. Skip here so we don't double-post.
    if (seg.kind === 'discipline_complete' || seg.kind === 'discipline_skipped' || seg.kind === 'seeding_complete') {
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
    case 'wrote': return 'wrote_artifact'
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
    if (seg.kind === 'decision' || seg.kind === 'heartbeat' || seg.kind === 'wrote') {
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
  /**
   * The HTTP handler (daemon path, Fix B) has ALREADY appended the
   * user's human chat message to seeding-chat.jsonl before this turn
   * started. Skip the in-turn human-append so we don't double-write.
   *
   * Distinct from isKickoff: a Fix-B daemon user-turn still runs the
   * reconciler, the derive-title path, and everything else a user
   * turn does — it just doesn't own the human-append. isKickoff means
   * "not a user turn at all" (continuation) and has broader semantics.
   *
   * When Phase 4 deletes the inline path, this flag becomes
   * unconditionally true and can be removed.
   */
  humanMessageAlreadyPersisted?: boolean
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
  options?: { humanMessageAlreadyPersisted?: boolean },
): Promise<SendMessageResult> {
  return runSeedingTurn(projectDir, userText, {
    humanMessageAlreadyPersisted: options?.humanMessageAlreadyPersisted,
  })
}

/**
 * Phase 1 seed-loop architecture: when ROUGE_USE_SEED_DAEMON is set,
 * the HTTP handler enqueues the user message and ensures a detached
 * daemon is running to drain it, then returns immediately (202-style).
 *
 * When the flag is NOT set, falls through to the existing inline
 * path — HTTP handler awaits the full subprocess chain.
 *
 * This is the feature-flagged introduction of the daemon architecture.
 * Both paths are fully functional; the flag selects which one the
 * POST /seed/message route handler runs. When we've validated the
 * daemon path on real sessions, a follow-up PR flips the default and
 * eventually deletes the inline path (Phase 4).
 *
 * See docs/plans/2026-04-19-seed-loop-architecture.md for rationale.
 */
export async function handleSeedMessageRouted(
  projectDir: string,
  userText: string,
): Promise<SendMessageResult> {
  if (process.env.ROUGE_USE_SEED_DAEMON === '1') {
    return handleSeedMessageViaDaemon(projectDir, userText)
  }
  return runSeedingTurn(projectDir, userText, {})
}

async function handleSeedMessageViaDaemon(
  projectDir: string,
  userText: string,
): Promise<SendMessageResult> {
  // Lazy-import so the daemon-spawn module (and its child_process
  // side-effects) doesn't load unless the flag is on. Keeps the
  // unflagged path byte-identical to pre-Phase-1 behaviour.
  const { enqueueMessage } = await import('./seed-queue')
  const { ensureSeedDaemon } = await import('./seed-daemon-spawn')

  // Fix B: pre-persist the human chat message synchronously BEFORE
  // returning 202. Without this, the client's refetch after the POST
  // resolves finds an empty seeding-chat.jsonl (the daemon hasn't
  // written anything yet — runClaude is still in flight), sets
  // messages to [] and clears the optimistic placeholder, leaving the
  // chat visibly BLANK for the full turn duration. Writing the
  // human entry here closes the window.
  //
  // The daemon sees `humanAlreadyPersisted: true` on the queue entry
  // and passes `humanMessageAlreadyPersisted: true` to the turn,
  // suppressing its own human-append. See TurnOptions comment for the
  // two append-site gates.
  const state = readSeedingState(projectDir)
  const activeDiscipline = resolveActiveDiscipline(state.current_discipline)
  try {
    appendChatMessage(projectDir, {
      id: genId(),
      role: 'human',
      content: userText,
      timestamp: new Date().toISOString(),
      metadata: activeDiscipline ? { discipline: activeDiscipline } : undefined,
    })
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: `failed to persist human message: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  // Enqueue AFTER the append so a subsequent daemon drain sees the
  // `humanAlreadyPersisted` flag on an entry whose corresponding chat
  // row already exists on disk.
  let messageId: string
  try {
    messageId = enqueueMessage(projectDir, userText, { humanAlreadyPersisted: true })
  } catch (err) {
    // Append succeeded but enqueue failed. The chat now shows the
    // user's message but nothing will process it. Write a system_note
    // so the UI surfaces the problem alongside the stranded message
    // rather than relying on the transient 500 toast.
    try {
      appendChatMessage(projectDir, {
        id: genId(),
        role: 'rouge',
        content:
          "Couldn't queue your message for the seeding daemon — disk/queue write failed. Please retry.",
        timestamp: new Date().toISOString(),
        kind: 'system_note',
      })
    } catch { /* best-effort; not worth failing the response on a compensator */ }
    return {
      ok: false,
      status: 500,
      error: `failed to enqueue: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const spawn = await ensureSeedDaemon(projectDir)
  if (!spawn.ok) {
    // Daemon spawn failed — the message is queued (and the human
    // chat entry is persisted), but nothing's going to process it.
    // Surface as a 500 so the UI knows, and include the messageId so
    // operators can correlate. On the next user message the handler
    // re-tries ensureSeedDaemon; the stranded entry gets drained
    // then.
    return {
      ok: false,
      status: 500,
      error: `seed daemon spawn failed: ${spawn.error ?? 'unknown'} (messageId=${messageId})`,
    }
  }

  // Return immediately. The daemon will run the turn asynchronously;
  // the dashboard learns about the result via state.json + chat-log
  // changes picked up by the watcher (or, from Phase 2 onwards, via
  // a 2s poll of those files). The client-side refetch that fires
  // right after this POST resolves WILL include the human chat
  // message thanks to the pre-persist above.
  return { ok: true, status: 202 }
}

/**
 * The seeding turn function — the heart of inline-path seeding, and the
 * function the daemon delegates to via `handleSeedMessage`.
 *
 * Human-append semantics — two gates:
 *   1. `isKickoff` — this turn is system-triggered (continuation
 *      kickoff or autonomous chunk). `text` is a [SYSTEM] instruction,
 *      NOT user prose. Never append as human.
 *   2. `humanMessageAlreadyPersisted` — this turn was triggered by a
 *      user message, but the caller (Fix B daemon path's HTTP handler)
 *      has already written the human chat entry to disk. Don't
 *      double-append.
 *
 * Under the flag-off inline path, BOTH options are false and this
 * function owns the human-append (line `appendChatMessage` below).
 * Under the flag-on daemon path, `humanMessageAlreadyPersisted: true`
 * is passed and the append is suppressed. Both gates also apply to the
 * secondary append site in the rate-limit branch (see below).
 */
async function runSeedingTurn(
  projectDir: string,
  text: string,
  options: TurnOptions,
): Promise<SendMessageResult> {
  const {
    isKickoff = false,
    chunkDepth = 0,
    humanMessageAlreadyPersisted = false,
  } = options
  // Canonical "should we append the user's text as a human chat
  // message in this turn?" — used at both append sites below.
  const shouldAppendHumanMessage = !isKickoff && !humanMessageAlreadyPersisted

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
    const reconciled = await reconcileDisciplineState(projectDir, preGatePending?.discipline ?? null)
    if (reconciled.length > 0) {
      console.log(`[seeding] reconciled stranded disciplines: ${reconciled.join(', ')}`)
      // Strip the [SYSTEM NOTE] prefix — the new `kind: 'system_note'`
      // drives UI styling, making the inline bracket tag redundant and
      // visually naff.
      const note = `Reconciled earlier discipline state: ${reconciled.join(', ')} artifact verified on disk. Accept to continue or reply with feedback to revise.`
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

    // If a discipline is awaiting approval and the user sends a message:
    // - Acceptance words ("accept", "approve", "yes", "ok", "continue",
    //   "lgtm") → treat as clicking Accept & continue
    // - Anything else → treat as revision feedback
    const preApprovalState = readSeedingState(projectDir)
    if (isAwaitingApproval(preApprovalState)) {
      const trimmedLower = text.trim().toLowerCase().replace(/[.!,]/g, '')
      const isAcceptance = ['accept', 'approve', 'approved', 'yes', 'ok', 'okay',
        'continue', 'lgtm', 'looks good', 'accept recommendations',
        'accept and continue', 'accept & continue'].includes(trimmedLower)

      if (isAcceptance && preApprovalState.discipline_awaiting_approval) {
        console.log(`[seeding] user typed "${trimmedLower}" while ${preApprovalState.discipline_awaiting_approval} awaiting approval — treating as Accept`)
        const disc = preApprovalState.discipline_awaiting_approval
        clearAwaitingApproval(projectDir)
        await markDisciplineComplete(projectDir, disc)
        // Don't process the text through Claude — just advance
        // The approval endpoint would fire a kickoff, but since we're
        // inside runSeedingTurn already, we need to let the continuation
        // logic below handle the kickoff. Set acceptedDisciplines so
        // the return signals the advancement.
        // We skip the Claude call by returning early here.
        appendChatMessage(projectDir, {
          id: genId(),
          role: 'human',
          content: text,
          timestamp: new Date().toISOString(),
          metadata: { discipline: disc },
        })
        appendChatMessage(projectDir, {
          id: genId(),
          role: 'rouge',
          content: `${disc} approved. Advancing to the next discipline.`,
          timestamp: new Date().toISOString(),
          kind: 'system_note',
          metadata: { discipline: disc },
        })
        // Fire a continuation that triggers the classifier (after
        // brainstorming) and kicks off the next applicable discipline.
        try {
          await runContinuationTurn(projectDir, [
            `[SYSTEM] Discipline ${disc} approved by user. State has advanced.`,
            `Continue with the next discipline.`,
          ].join(' '), 0, `post-approval-${disc}`)
        } catch (err) {
          console.error(`[seeding] post-approval kickoff failed:`, err)
        }
        return { ok: true, status: 200, disciplineComplete: [disc], seedingComplete: false, readyTransition: false }
      }

      console.log(`[seeding] user sent message while ${preApprovalState.discipline_awaiting_approval} awaiting approval — treating as revision`)
      clearAwaitingApproval(projectDir)
      // Also clear the final approval flag if set
      if (preApprovalState.seeding_awaiting_final_approval) {
        const ss = readSeedingState(projectDir)
        delete ss.seeding_awaiting_final_approval
        writeSeedingState(projectDir, ss)
      }
    }

    // Final seeding approval: if every discipline is user-approved
    // (in disciplines_complete) but seeding_complete was never set,
    // surface a final approval card instead of auto-finalizing.
    const postReconcileState = readSeedingState(projectDir)
    const applicable = postReconcileState.applicable_disciplines ?? DISCIPLINE_SEQUENCE as unknown as string[]
    const allApproved = applicable.every(
      (d: string) => (postReconcileState.disciplines_complete ?? []).includes(d),
    )
    if (allApproved && !postReconcileState.seeding_complete && !postReconcileState.seeding_awaiting_final_approval) {
      const ss = readSeedingState(projectDir)
      ss.seeding_awaiting_final_approval = true
      writeSeedingState(projectDir, ss)
      appendChatMessage(projectDir, {
        id: genId(),
        role: 'rouge',
        content:
          `All disciplines complete. Review the seeding summary and approve to start building, or select a discipline to revise.`,
        timestamp: new Date().toISOString(),
        kind: 'seeding_summary',
      })
    }
  }

  const state = readSeedingState(projectDir)
  // Note: we intentionally allow messages even when status === 'complete'.
  // The Revise mode in the dashboard uses this path to let users continue
  // the conversation after seeding completes — to amend spec, add missing
  // artifacts, or clarify decisions. Claude remembers context via session_id.

  const activeDiscipline = resolveActiveDiscipline(state.current_discipline)
  // For message tagging: prefer the gate's discipline or the approval
  // discipline over current_discipline. This prevents gate answers and
  // revision feedback from being tagged with the wrong discipline when
  // the server has already advanced current_discipline.
  const messageTagDiscipline = resolveActiveDiscipline(
    state.pending_gate?.discipline ?? state.discipline_awaiting_approval ?? state.current_discipline,
  )
  const alreadyPrompted = state.disciplines_prompted ?? []
  const isFirstTurn = state.session_id === null
  // Sizing is auto-completed by the classifier — never inject its prompt
  // into a Claude session. The LLM doesn't decide project size.
  const needsDisciplinePrompt =
    activeDiscipline !== null &&
    activeDiscipline !== 'sizing' &&
    !alreadyPrompted.includes(activeDiscipline)

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
    // shouldAppendHumanMessage gates this too: under Fix B the handler
    // already wrote the human entry, so pass null here to avoid
    // double-append. The rate-limited Rouge response still lands.
    appendMessages(
      projectDir,
      shouldAppendHumanMessage ? text : null,
      result.result,
      activeDiscipline ?? undefined,
    )
    return { ok: false, status: 429, error: 'Claude rate-limited', rateLimited: true }
  }

  // Claude returned a real response — the correction (if any) reached
  // it via the prompt above. Safe to clear now.
  if (pendingCorrection) {
    clearPendingCorrection(projectDir)
  }

  // We successfully handed the discipline's sub-prompt to Claude; record
  // it so we don't re-inject on every subsequent turn in the same phase.
  // Also flips the discipline's status to 'in-progress' in state.json so
  // the dashboard stepper reads it directly (Phase 0 of the seed-loop
  // architecture plan — docs/plans/2026-04-19-seed-loop-architecture.md).
  if (needsDisciplinePrompt && activeDiscipline) {
    await markDisciplinePrompted(projectDir, activeDiscipline)
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

  // P3-005 fix: Verify that if both DISCIPLINE_COMPLETE and GATE appear,
  // the COMPLETE comes BEFORE the GATE in the segment array. Claude should
  // never emit [GATE:] prose [DISCIPLINE_COMPLETE:] in that order.
  let orderViolation = false
  if (turnHasGate) {
    const gateIndex = prelimSegments.findIndex((s) => s.kind === 'gate')
    const completeIndex = prelimSegments.findIndex((s) => s.kind === 'discipline_complete')
    if (completeIndex !== -1 && completeIndex > gateIndex) {
      orderViolation = true
    }
  }

  const acceptedDisciplines: string[] = []
  const rejectedDisciplines: Array<{ discipline: string; reason: string }> = []

  // Process DISCIPLINE_COMPLETE markers (require artifact verification).
  for (const d of markers.disciplinesComplete) {
    if (!isKnownDiscipline(d)) {
      rejectedDisciplines.push({ discipline: d, reason: 'unknown discipline name' })
      continue
    }
    if (turnHasGate) {
      // P3-005: Include ordering information in the rejection reason if
      // the COMPLETE appeared AFTER the GATE (order violation).
      const reason = orderViolation
        ? `cannot emit [GATE:] then [DISCIPLINE_COMPLETE:] in the same turn — gates must be at the END of a turn, after all other markers. End the turn after the gate, wait for the human answer, then complete on a later turn.`
        : `cannot emit DISCIPLINE_COMPLETE and a [GATE:] in the same turn — end the turn after the gate, wait for the human answer, then complete on a later turn.`
      rejectedDisciplines.push({
        discipline: d,
        reason,
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
      // Don't complete immediately — enter awaiting_approval so the
      // user must click "Accept & continue" before state advances.
      setAwaitingApproval(projectDir, d)
      await updateDisciplineStatusInState(projectDir, d, 'awaiting_approval')
      acceptedDisciplines.push(d)

      const isKill = d === 'taste' && check.killVerdict
      const approvalContent = isKill
        ? `**Taste verdict: KILL.** The idea didn't pass the taste gate. Review the graveyard entry and archive this project, or revise to continue.`
        : `**${d}** artifact verified on disk. Accept to continue to the next discipline, or reply with feedback to revise.`
      appendChatMessage(projectDir, {
        id: genId(),
        role: 'rouge',
        content: approvalContent,
        timestamp: new Date().toISOString(),
        kind: 'approve_prompt',
        metadata: { discipline: d, killVerdict: isKill || undefined },
      })
    } else {
      console.warn(
        `[seeding] rejecting DISCIPLINE_COMPLETE(${d}) — ${check.reason}`,
      )
      rejectedDisciplines.push({ discipline: d, reason: check.reason ?? 'artifact missing' })
    }
  }

  // ─── Deterministic tier gating: auto-classify after brainstorming ───
  //
  // When brainstorming completes, the bridge runs the auto-classifier to
  // determine project size, auto-completes sizing, and auto-skips every
  // discipline not applicable at that tier. The LLM NEVER decides which
  // disciplines to skip — the bridge does, deterministically.
  // Classifier trigger: fire when brainstorming is complete AND we haven't
  // classified yet. Brainstorming may complete via marker (acceptedDisciplines)
  // OR via reconciliation (artifact on disk from a previous turn). Check
  // both, but only fire once (applicable_disciplines guards against re-runs).
  const currentSeedState = readSeedingState(projectDir)
  const brainstormingComplete = (currentSeedState.disciplines_complete ?? []).includes('brainstorming')
  const alreadyClassified = currentSeedState.applicable_disciplines != null
  if (brainstormingComplete && !alreadyClassified) {
    const classResult = runAutoClassifier(projectDir)
    if (classResult.ok) {
      // Mark sizing as complete (artifact is sizing.json, just written by classifier)
      await markDisciplineComplete(projectDir, 'sizing')
      acceptedDisciplines.push('sizing')

      const applicable = listApplicableDisciplines(classResult.projectSize)

      // Write applicable_disciplines and project_size to seeding state
      const postClassState = readSeedingState(projectDir)
      postClassState.applicable_disciplines = applicable
      postClassState.project_size = classResult.projectSize
      writeSeedingState(projectDir, postClassState)

      // Auto-skip non-applicable disciplines
      for (const disc of DISCIPLINE_SEQUENCE) {
        if (disc === 'brainstorming' || disc === 'sizing') continue
        if (!applicable.includes(disc)) {
          await markDisciplineComplete(projectDir, disc)
          acceptedDisciplines.push(disc)
          appendChatMessage(projectDir, {
            id: genId(),
            role: 'rouge',
            content: `Discipline ${disc.toUpperCase()} auto-skipped — not applicable at ${classResult.projectSize} tier.`,
            timestamp: new Date().toISOString(),
            kind: 'system_note',
            metadata: { discipline: disc },
          })
        }
      }

      // Announce the classification result
      appendChatMessage(projectDir, {
        id: genId(),
        role: 'rouge',
        content:
          `Project classified as **${classResult.projectSize}** tier ` +
          `(${classResult.signalSource === 'explicit-section' ? 'from classifier signals section' : 'from keyword analysis'}). ` +
          `${applicable.length} discipline(s) applicable: ${applicable.join(', ')}. ` +
          `${classResult.reasoning}`,
        timestamp: new Date().toISOString(),
        kind: 'system_note',
        metadata: { discipline: 'sizing' },
      })
    } else {
      // Classification failed — stash a correction so the LLM adds
      // the ## Classifier Signals section on the next brainstorming turn
      appendChatMessage(projectDir, {
        id: genId(),
        role: 'rouge',
        content:
          `Auto-classification failed: ${classResult.reason}. ` +
          `The brainstorming artifact needs a ## Classifier Signals section with ` +
          `entity_count, integration_count, role_count, journey_count, screen_count.`,
        timestamp: new Date().toISOString(),
        kind: 'system_note',
        metadata: { discipline: 'sizing' },
      })
      appendPendingCorrection(
        projectDir,
        `[SYSTEM NOTE] Auto-classification of project size failed: ${classResult.reason}. ` +
        `Your brainstorming artifact must include a ## Classifier Signals section at the end ` +
        `with these fields as "- field_name: N" lines: entity_count, integration_count, ` +
        `role_count, journey_count, screen_count. Add this section to the brainstorming ` +
        `artifact and re-emit [DISCIPLINE_COMPLETE: brainstorming].`,
      )
    }
  }

  // Process DISCIPLINE_SKIPPED markers (no artifact required — tier gate).
  // Skipped disciplines are accepted unconditionally and advance state
  // the same way completed disciplines do. The orchestrator already
  // evaluated applicability; the bridge just records the skip.
  //
  // The marker format is `[DISCIPLINE_SKIPPED: <name> — <reason>]` where
  // <reason> is the tier-gate explanation. Extract just the discipline
  // name (first token before the em dash or hyphen separator).
  // P0-007 fix: .trim() the raw marker BEFORE split to strip whitespace
  // from malformed `[DISCIPLINE_SKIPPED: Marketing  — not a web app]`.
  // P2-007 fix: If split produces only one element (no separator found),
  // accept the entire trimmed rawSkip as the discipline name rather than
  // failing silently. This handles bare `[DISCIPLINE_SKIPPED: Marketing]`
  // where the reason was omitted.
  for (const rawSkip of markers.disciplinesSkipped) {
    const parts = rawSkip.trim().split(/\s*[—–-]\s*/)
    const disciplineName = parts.length > 0 ? parts[0].trim() : rawSkip.trim()
    if (!isKnownDiscipline(disciplineName)) {
      console.warn(`[seeding] unknown discipline in DISCIPLINE_SKIPPED: ${rawSkip}`)
      continue
    }
    await markDisciplineComplete(projectDir, disciplineName)
    acceptedDisciplines.push(disciplineName)
    // Append a system note so the user sees the skip in the chat.
    appendChatMessage(projectDir, {
      id: genId(),
      role: 'rouge',
      content: `Discipline ${disciplineName.toUpperCase()} skipped — not applicable at this project size.`,
      timestamp: new Date().toISOString(),
      kind: 'system_note',
      metadata: { discipline: disciplineName },
    })
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
  if (shouldAppendHumanMessage) {
    appendChatMessage(projectDir, {
      id: genId(),
      role: 'human',
      content: text,
      timestamp: new Date().toISOString(),
      metadata: messageTagDiscipline ? { discipline: messageTagDiscipline } : undefined,
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

  // SEEDING_COMPLETE is now code-controlled via the approve-seeding
  // endpoint. If the LLM emits it, ignore and correct.
  if (markers.seedingComplete) {
    const ignoreNote = 'SEEDING_COMPLETE ignored — seeding finalization is controlled by user approval. Do not emit this marker.'
    appendChatMessage(projectDir, {
      id: genId(),
      role: 'rouge',
      content: ignoreNote,
      timestamp: new Date().toISOString(),
      kind: 'system_note',
      metadata: { discipline: activeDiscipline ?? undefined },
    })
    appendPendingCorrection(projectDir, `[SYSTEM NOTE] ${ignoreNote}`)
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
  const isNowAwaitingApproval = isAwaitingApproval(postContinuationState)
  const shouldContinueForAdvance =
    acceptedDisciplines.length > 0 &&
    !markers.seedingComplete &&
    !atDepthLimit &&
    !isNowAwaitingApproval
  // Only auto-continue a non-advancing turn if Claude actually emitted
  // decision/heartbeat markers — that's the signal it's in the middle
  // of autonomous work. A turn that was pure prose (no markers) is
  // probably Claude asking the user unprompted; continuing would
  // interrupt a question the user hasn't seen yet.
  const emittedAutonomousMarkers = prelimSegments.some(
    (s) => s.kind === 'decision' || s.kind === 'heartbeat' || s.kind === 'wrote',
  )
  const shouldContinueForAutonomous =
    !shouldContinueForAdvance &&
    !markers.seedingComplete &&
    acceptedDisciplines.length === 0 &&
    rejectedDisciplines.length === 0 &&
    emittedAutonomousMarkers &&
    postContinuationState.mode !== 'awaiting_gate' &&
    !isNowAwaitingApproval &&
    postContinuationState.status === 'active' &&
    !atDepthLimit

  // P2-008 fix: Re-check gate status immediately before auto-continuation.
  // applyMarkerStateEffects (line 709) may have set a NEW gate mid-turn
  // (e.g. user answered gate A, Claude cleared it, then emitted gate B
  // in the same response). If that happened, postContinuationState.mode
  // will be awaiting_gate and we must NOT fire a continuation — that
  // would double-prompt (continuation kickoff + unanswered gate).
  const finalGateCheck = readSeedingState(projectDir)
  if (shouldContinueForAdvance && finalGateCheck.mode !== 'awaiting_gate') {
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
  } else if (shouldContinueForAutonomous && finalGateCheck.mode !== 'awaiting_gate') {
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
    seedingComplete: false,
    readyTransition: false,
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
async function reconcileDisciplineState(
  projectDir: string,
  preClearGateDiscipline: string | null = null,
): Promise<string[]> {
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
    // If there's already a discipline awaiting approval, don't propose
    // another one — only one can be pending at a time.
    if (state.discipline_awaiting_approval) break
    const check = verifyDisciplineArtifact(projectDir, d)
    if (check.ok) {
      setAwaitingApproval(projectDir, d)
      await updateDisciplineStatusInState(projectDir, d, 'awaiting_approval')
      newlyComplete.push(d)

      const isKill = d === 'taste' && check.killVerdict
      const approvalContent = isKill
        ? `**Taste verdict: KILL.** The idea didn't pass the taste gate. Review the graveyard entry and archive this project, or revise to continue.`
        : `**${d}** artifact verified on disk. Accept to continue to the next discipline, or reply with feedback to revise.`
      appendChatMessage(projectDir, {
        id: genId(),
        role: 'rouge',
        content: approvalContent,
        timestamp: new Date().toISOString(),
        kind: 'approve_prompt',
        metadata: { discipline: d, killVerdict: isKill || undefined },
      })
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
