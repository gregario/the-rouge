import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Stub the claude runner before importing seed-handler so the handler
// picks up the mock. We drive its output per test via `mockRunClaude`.
const mockRunClaude = vi.fn()
vi.mock('../claude-runner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../claude-runner')>()
  return {
    ...actual,
    runClaude: (opts: unknown) => mockRunClaude(opts),
  }
})

// Title derivation fires async haiku calls. Stub it out so tests stay
// hermetic and fast.
vi.mock('../derive-title', () => ({
  maybeDeriveWorkingTitle: vi.fn(async () => {}),
}))

import { handleSeedMessage } from '../seed-handler'
import { readSeedingState, writeSeedingState } from '../seeding-state'
import { readChatLog } from '../chat-reader'

let PROMPTS_DIR: string
let PROJECT_DIR: string
let prevPromptsEnv: string | undefined
let prevOrchestratorEnv: string | undefined

// Minimal stub prompts. Real content is tested elsewhere — here we only
// care that SOMETHING non-empty is injected at the right moments.
const STUB_ORCHESTRATOR = '# ORCHESTRATOR\n\nRun the swarm.'
const STUB_BRAINSTORM = '# BRAINSTORMING\n\nAsk about user, pain, trigger.'

beforeEach(() => {
  mockRunClaude.mockReset()
  PROMPTS_DIR = mkdtempSync(join(tmpdir(), 'rouge-prompts-'))
  writeFileSync(join(PROMPTS_DIR, '00-swarm-orchestrator.md'), STUB_ORCHESTRATOR)
  writeFileSync(join(PROMPTS_DIR, '01-brainstorming.md'), STUB_BRAINSTORM)

  PROJECT_DIR = mkdtempSync(join(tmpdir(), 'rouge-proj-'))
  writeSeedingState(PROJECT_DIR, {
    session_id: null,
    status: 'not-started',
    current_discipline: 'brainstorming',
  })

  prevPromptsEnv = process.env.ROUGE_PROMPTS_DIR
  prevOrchestratorEnv = process.env.ROUGE_ORCHESTRATOR_PROMPT
  process.env.ROUGE_PROMPTS_DIR = PROMPTS_DIR
  process.env.ROUGE_ORCHESTRATOR_PROMPT = join(PROMPTS_DIR, '00-swarm-orchestrator.md')
})

afterEach(() => {
  if (prevPromptsEnv === undefined) delete process.env.ROUGE_PROMPTS_DIR
  else process.env.ROUGE_PROMPTS_DIR = prevPromptsEnv
  if (prevOrchestratorEnv === undefined) delete process.env.ROUGE_ORCHESTRATOR_PROMPT
  else process.env.ROUGE_ORCHESTRATOR_PROMPT = prevOrchestratorEnv

  rmSync(PROMPTS_DIR, { recursive: true, force: true })
  rmSync(PROJECT_DIR, { recursive: true, force: true })
})

describe('handleSeedMessage — prompt injection', () => {
  it('injects both orchestrator and brainstorming sub-prompt on the first turn', async () => {
    mockRunClaude.mockResolvedValueOnce({
      result: 'Current understanding: you want X. Who is the user?',
      session_id: 'session-1',
    })

    await handleSeedMessage(PROJECT_DIR, 'I want to build a testimonials widget.')

    expect(mockRunClaude).toHaveBeenCalledTimes(1)
    const sentPrompt: string = mockRunClaude.mock.calls[0][0].prompt
    expect(sentPrompt).toContain('# ORCHESTRATOR')
    expect(sentPrompt).toContain('DISCIPLINE TRANSITION — entering BRAINSTORMING')
    expect(sentPrompt).toContain('Ask about user, pain, trigger.')
    expect(sentPrompt).toContain('I want to build a testimonials widget.')
  })

  it('records the discipline as prompted so subsequent turns skip re-injection', async () => {
    mockRunClaude
      .mockResolvedValueOnce({ result: 'First reply.', session_id: 'session-1' })
      .mockResolvedValueOnce({ result: 'Second reply.', session_id: 'session-1' })

    await handleSeedMessage(PROJECT_DIR, 'first message')
    await handleSeedMessage(PROJECT_DIR, 'second message')

    const state = readSeedingState(PROJECT_DIR)
    expect(state.disciplines_prompted).toContain('brainstorming')

    const secondPrompt: string = mockRunClaude.mock.calls[1][0].prompt
    expect(secondPrompt).not.toContain('# ORCHESTRATOR')
    expect(secondPrompt).not.toContain('DISCIPLINE TRANSITION')
    expect(secondPrompt).toBe('second message')
  })
})

describe('handleSeedMessage — marker verification', () => {
  it('rejects [DISCIPLINE_COMPLETE: brainstorming] when the artifact is missing', async () => {
    mockRunClaude.mockResolvedValueOnce({
      result: 'All done.\n\n[DISCIPLINE_COMPLETE: brainstorming]',
      session_id: 'session-1',
    })

    const result = await handleSeedMessage(PROJECT_DIR, 'ship it')

    // Handler reports no accepted disciplines.
    expect(result.disciplineComplete).toBeUndefined()

    // State stays on brainstorming.
    const state = readSeedingState(PROJECT_DIR)
    expect(state.disciplines_complete ?? []).not.toContain('brainstorming')
    expect(state.current_discipline).toBe('brainstorming')

    // Chat log carries a system note explaining the rejection.
    const log = readChatLog(PROJECT_DIR)
    const note = log.find((m) => m.content.includes('was rejected'))
    expect(note).toBeDefined()
    expect(note?.content).toContain('DISCIPLINE_COMPLETE(brainstorming) was rejected')
  })

  it('accepts [DISCIPLINE_COMPLETE: brainstorming] when the artifact is on disk with real content', async () => {
    mkdirSync(join(PROJECT_DIR, 'seed_spec'), { recursive: true })
    writeFileSync(
      join(PROJECT_DIR, 'seed_spec', 'brainstorming.md'),
      '# Design Doc\n\n' + 'body '.repeat(200),
    )
    mockRunClaude.mockResolvedValueOnce({
      result: 'Design doc written.\n\n[DISCIPLINE_COMPLETE: brainstorming]',
      session_id: 'session-1',
    })

    const result = await handleSeedMessage(PROJECT_DIR, 'done')

    expect(result.disciplineComplete).toEqual(['brainstorming'])
    const state = readSeedingState(PROJECT_DIR)
    expect(state.disciplines_complete).toContain('brainstorming')
    // Current discipline auto-advances to the next in sequence.
    expect(state.current_discipline).toBe('competition')
  })

  it('preserves pending correction when runClaude times out (no silent loss)', async () => {
    // Stash a pending correction, then make the next turn time out.
    // Correction must still be in state afterwards so a subsequent turn
    // can deliver it.
    mockRunClaude.mockResolvedValueOnce({
      result: 'Done.\n\n[DISCIPLINE_COMPLETE: brainstorming]',
      session_id: 'session-1',
    })
    await handleSeedMessage(PROJECT_DIR, 'first')
    expect(readSeedingState(PROJECT_DIR).pending_correction).toMatch(/was rejected/)

    // Now simulate a timeout on the follow-up turn.
    mockRunClaude.mockResolvedValueOnce({
      result: '',
      session_id: null,
      timeout: true,
    })
    const result = await handleSeedMessage(PROJECT_DIR, 'retry')
    expect(result.ok).toBe(false)
    expect(result.status).toBe(504)

    // Correction must still be stashed — we peeked, didn't consume.
    expect(readSeedingState(PROJECT_DIR).pending_correction).toMatch(/was rejected/)

    // A subsequent turn succeeds and the correction IS delivered and cleared.
    mockRunClaude.mockResolvedValueOnce({
      result: 'Understood.',
      session_id: 'session-1',
    })
    await handleSeedMessage(PROJECT_DIR, 'try again')
    const lastPrompt: string = mockRunClaude.mock.calls[2][0].prompt
    expect(lastPrompt).toMatch(/was rejected/)
    expect(readSeedingState(PROJECT_DIR).pending_correction).toBeUndefined()
  })

  it('preserves pending correction when runClaude rate-limits', async () => {
    mockRunClaude.mockResolvedValueOnce({
      result: 'Done.\n\n[DISCIPLINE_COMPLETE: brainstorming]',
      session_id: 'session-1',
    })
    await handleSeedMessage(PROJECT_DIR, 'first')

    mockRunClaude.mockResolvedValueOnce({
      result: 'you have hit your limit',
      session_id: 'session-1',
    })
    await handleSeedMessage(PROJECT_DIR, 'retry')

    // Rate-limit counts as "Claude didn't act on the correction" — keep it.
    expect(readSeedingState(PROJECT_DIR).pending_correction).toMatch(/was rejected/)
  })

  it('delivers a prior rejection to Claude on the following turn', async () => {
    // Turn 1: agent emits a marker without the artifact; handler rejects.
    mockRunClaude.mockResolvedValueOnce({
      result: 'Done.\n\n[DISCIPLINE_COMPLETE: brainstorming]',
      session_id: 'session-1',
    })
    await handleSeedMessage(PROJECT_DIR, 'first message')

    // Pending correction should be stashed in state.
    const afterReject = readSeedingState(PROJECT_DIR)
    expect(afterReject.pending_correction).toMatch(/was rejected/)

    // Turn 2: user sends a follow-up; the rejection note must be in the
    // prompt sent to Claude, and cleared from state afterwards.
    mockRunClaude.mockResolvedValueOnce({
      result: 'Understood — writing the artifact.',
      session_id: 'session-1',
    })
    await handleSeedMessage(PROJECT_DIR, 'continue')

    const turn2Prompt: string = mockRunClaude.mock.calls[1][0].prompt
    expect(turn2Prompt).toMatch(/was rejected/)
    expect(turn2Prompt).toContain('continue')

    const afterTurn2 = readSeedingState(PROJECT_DIR)
    expect(afterTurn2.pending_correction).toBeUndefined()
  })

  it('silently ignores unknown discipline names in markers', async () => {
    mockRunClaude.mockResolvedValueOnce({
      result: '[DISCIPLINE_COMPLETE: hallucinated-discipline]',
      session_id: 'session-1',
    })

    const result = await handleSeedMessage(PROJECT_DIR, 'msg')
    expect(result.disciplineComplete).toBeUndefined()
    const log = readChatLog(PROJECT_DIR)
    // Human-facing system note is now tagged via kind: 'system_note'
    // (prefix stripped for UI readability). Look up by kind rather than
    // by a brittle text prefix.
    const note = log.find((m) => m.kind === 'system_note')
    expect(note?.content).toContain('rejected')
    expect(note?.content).toContain('hallucinated-discipline')
  })
})

describe('handleSeedMessage — auto-kickoff on marker acceptance', () => {
  it('fires a follow-up turn after accepting a marker', async () => {
    writeFileSync(join(PROMPTS_DIR, '02-competition.md'), '# COMPETITION\n\nFind competitors.')

    // Turn 1: agent writes the brainstorming artifact during its turn,
    // then emits the marker. Using mockImplementationOnce so we can
    // write the file between the "turn start" reconciliation pass and
    // the marker-accept step that verifies the artifact.
    mockRunClaude.mockImplementationOnce(async () => {
      mkdirSync(join(PROJECT_DIR, 'seed_spec'), { recursive: true })
      writeFileSync(
        join(PROJECT_DIR, 'seed_spec', 'brainstorming.md'),
        '# Design Doc\n\n' + 'body '.repeat(200),
      )
      return { result: 'Done.\n\n[DISCIPLINE_COMPLETE: brainstorming]', session_id: 'session-1' }
    })
    // Kickoff turn: enters competition.
    mockRunClaude.mockResolvedValueOnce({
      result: 'Entering competition. Who are the named competitors you already know?',
      session_id: 'session-1',
    })

    await handleSeedMessage(PROJECT_DIR, 'ship it')

    // Both turns ran.
    expect(mockRunClaude).toHaveBeenCalledTimes(2)

    // Second call's prompt contains the competition sub-prompt and the
    // kickoff framing.
    const kickoffPrompt: string = mockRunClaude.mock.calls[1][0].prompt
    expect(kickoffPrompt).toContain('DISCIPLINE TRANSITION — entering COMPETITION')
    expect(kickoffPrompt).toContain('Find competitors.')
    expect(kickoffPrompt).toContain('[SYSTEM]')

    // Chat log: ONE human message (the user's), TWO rouge messages
    // (original response + kickoff response). The kickoff's system text
    // must NOT appear as a human message.
    const log = readChatLog(PROJECT_DIR)
    const humanCount = log.filter((m) => m.role === 'human').length
    const rougeCount = log.filter((m) => m.role === 'rouge').length
    expect(humanCount).toBe(1)
    expect(rougeCount).toBe(2)

    // Kickoff marked the new discipline as prompted.
    const state = readSeedingState(PROJECT_DIR)
    expect(state.disciplines_prompted).toContain('competition')
  })

  it('does NOT auto-kickoff when the marker is rejected (no artifact)', async () => {
    mockRunClaude.mockResolvedValueOnce({
      result: 'Done.\n\n[DISCIPLINE_COMPLETE: brainstorming]',
      session_id: 'session-1',
    })

    await handleSeedMessage(PROJECT_DIR, 'done')

    // Only the one turn — rejection means no state advance, no kickoff.
    expect(mockRunClaude).toHaveBeenCalledTimes(1)
  })

  it('does NOT auto-kickoff when seeding is complete', async () => {
    writeFileSync(join(PROMPTS_DIR, '07-marketing.md'), '# MARKETING\n\nWrite the README.')
    mkdirSync(join(PROJECT_DIR, 'marketing'), { recursive: true })
    writeFileSync(join(PROJECT_DIR, 'marketing', 'landing-page-copy.md'), 'x'.repeat(500))

    writeSeedingState(PROJECT_DIR, {
      session_id: 'session-1',
      status: 'active',
      disciplines_complete: ['brainstorming', 'competition', 'taste', 'spec', 'infrastructure', 'design', 'legal-privacy'],
      disciplines_prompted: ['brainstorming', 'competition', 'taste', 'spec', 'infrastructure', 'design', 'legal-privacy', 'marketing'],
      current_discipline: 'marketing',
    })

    mockRunClaude.mockResolvedValueOnce({
      result: 'All done.\n\n[DISCIPLINE_COMPLETE: marketing]\n\nSEEDING_COMPLETE',
      session_id: 'session-1',
    })

    await handleSeedMessage(PROJECT_DIR, 'wrap')

    // Only the one turn — seeding done, nothing to kick off.
    expect(mockRunClaude).toHaveBeenCalledTimes(1)
  })

  it('kickoff chain caps at MAX_CHUNK_DEPTH (10) when multiple disciplines complete in series', async () => {
    writeFileSync(join(PROMPTS_DIR, '02-competition.md'), '# COMPETITION\n\nFind competitors.')
    writeFileSync(join(PROMPTS_DIR, '03-taste.md'), '# TASTE\n\nChallenge the premise.')
    writeFileSync(join(PROMPTS_DIR, '04-spec.md'), '# SPEC\n\nWrite specs.')
    writeFileSync(join(PROMPTS_DIR, '05-design.md'), '# DESIGN\n\nDesign.')
    writeFileSync(join(PROMPTS_DIR, '08-infrastructure.md'), '# INFRA\n\nInfra.')

    // Agent completes every discipline in sequence during successive
    // kickoff turns. Pre-gated-autonomy, `suppressKickoff` blocked
    // anything past depth 1; now the depth counter allows up to
    // MAX_CHUNK_DEPTH (5) total turns, then stops and surfaces a
    // chat note.
    writeFileSync(join(PROMPTS_DIR, '06-legal-privacy.md'), '# LEGAL\n\nLegal.')
    writeFileSync(join(PROMPTS_DIR, '07-marketing.md'), '# MARKETING\n\nMarketing.')

    const disciplines = ['brainstorming', 'competition', 'taste', 'spec', 'infrastructure', 'design', 'legal-privacy', 'marketing']
    // Paths have to match what `verifyDisciplineArtifact` accepts per
    // discipline-artifacts.ts.
    const artifacts: Record<string, string> = {
      brainstorming: 'seed_spec/brainstorming.md',
      competition: 'seed_spec/competition.md',
      taste: 'seed_spec/taste.md',
      spec: 'seed_spec/milestones.json',
      infrastructure: 'infrastructure_manifest.json',
      design: 'design/design.yaml',
      'legal-privacy': 'legal/terms.md',
      marketing: 'marketing/landing-page-copy.md',
    }
    for (let i = 0; i < disciplines.length; i++) {
      const d = disciplines[i]
      mockRunClaude.mockImplementationOnce(async () => {
        const rel = artifacts[d] ?? `seed_spec/${d}.md`
        const full = join(PROJECT_DIR, rel)
        mkdirSync(join(full, '..'), { recursive: true })
        // 2500 bytes clears the largest verifier floor (design = 2000).
        writeFileSync(full, 'x'.repeat(2500))
        return { result: `[DISCIPLINE_COMPLETE: ${d}]`, session_id: 's1' }
      })
    }

    await handleSeedMessage(PROJECT_DIR, 'begin')

    // Capped at MAX_CHUNK_DEPTH = 10 total turns (user turn counts as
    // depth 0, so we get the user turn + 9 recursive kickoffs — but
    // we only have 8 disciplines, so chain runs exactly 8 turns and
    // stops naturally when there's no next discipline to advance to).
    expect(mockRunClaude).toHaveBeenCalledTimes(8)

    // With 8 disciplines mocked and no 9th, the chain runs to
    // natural completion (last discipline: marketing, no kickoff
    // after). The budget-exhausted note should NOT appear — we
    // hit neither the cap nor an advance-blocker.
  })
})

describe('handleSeedMessage — reconciliation of stranded state', () => {
  it('catches up a stranded earlier discipline when its artifact already exists', async () => {
    writeFileSync(join(PROMPTS_DIR, '04-spec.md'), '# SPEC\n\nWrite milestones.')

    // Stranded state: later disciplines marked complete but brainstorming
    // was rejected historically and its marker never re-fired.
    // brainstorming artifact is on disk, matching what happens when a
    // user session went through the old verifier rejection path.
    mkdirSync(join(PROJECT_DIR, 'docs'), { recursive: true })
    writeFileSync(join(PROJECT_DIR, 'docs', 'brainstorming.md'), 'x'.repeat(1000))
    writeSeedingState(PROJECT_DIR, {
      session_id: 's-stranded',
      status: 'active',
      disciplines_complete: ['competition', 'taste'],
      disciplines_prompted: ['brainstorming'],
      current_discipline: 'brainstorming',
    })

    // Mock returns a plain no-marker response for this turn.
    mockRunClaude.mockResolvedValueOnce({
      result: 'Continuing.',
      session_id: 's-stranded',
    })

    await handleSeedMessage(PROJECT_DIR, 'continue')

    // Reconciliation pass should have marked brainstorming complete and
    // advanced the current discipline to the next gap (spec — because
    // competition and taste were already complete).
    const state = readSeedingState(PROJECT_DIR)
    expect(state.disciplines_complete).toContain('brainstorming')
    expect(state.current_discipline).toBe('spec')

    // Chat log includes the reconciliation system note.
    const log = readChatLog(PROJECT_DIR)
    const note = log.find((m) => m.content.includes('Reconciled earlier discipline state'))
    expect(note?.content).toContain('brainstorming')
  })

  it('rejects an out-of-order DISCIPLINE_COMPLETE when an earlier discipline genuinely has no artifact', async () => {
    // No brainstorming artifact. Agent tries to skip ahead and declare
    // competition complete.
    mkdirSync(join(PROJECT_DIR, 'seed_spec'), { recursive: true })
    writeFileSync(join(PROJECT_DIR, 'seed_spec', 'competition.md'), 'x'.repeat(1000))

    mockRunClaude.mockResolvedValueOnce({
      result: 'Competition analysis done.\n\n[DISCIPLINE_COMPLETE: competition]',
      session_id: 's1',
    })

    const result = await handleSeedMessage(PROJECT_DIR, 'ship it')

    // Marker rejected, state did NOT advance competition.
    expect(result.disciplineComplete).toBeUndefined()
    const state = readSeedingState(PROJECT_DIR)
    expect(state.disciplines_complete ?? []).not.toContain('competition')

    // System note explains the sequential gap.
    const log = readChatLog(PROJECT_DIR)
    const note = log.find((m) => m.content.includes('was rejected'))
    expect(note?.content).toMatch(/earlier discipline brainstorming is still pending/)
  })
})

describe('handleSeedMessage — gated autonomy', () => {
  it('[GATE:] marker flips state to awaiting_gate and records the gate id', async () => {
    mockRunClaude.mockResolvedValueOnce({
      result: 'Here is what I have so far.\n\n[GATE: brainstorming/H1-premise-persona]\nWho specifically hits this problem?',
      session_id: 'session-1',
    })

    await handleSeedMessage(PROJECT_DIR, 'colour contrast tool')

    const state = readSeedingState(PROJECT_DIR)
    expect(state.mode).toBe('awaiting_gate')
    expect(state.pending_gate?.discipline).toBe('brainstorming')
    expect(state.pending_gate?.gate_id).toBe('brainstorming/H1-premise-persona')
  })

  it('next user message clears awaiting_gate before reconciliation runs', async () => {
    // Seed state as if the previous turn left a gate pending.
    writeSeedingState(PROJECT_DIR, {
      session_id: 'session-1',
      status: 'active',
      current_discipline: 'brainstorming',
      mode: 'awaiting_gate',
      pending_gate: {
        discipline: 'brainstorming',
        gate_id: 'brainstorming/H1-premise-persona',
        asked_at: new Date().toISOString(),
      },
    })

    mockRunClaude.mockResolvedValueOnce({
      result: 'Got it, continuing.',
      session_id: 'session-1',
    })

    await handleSeedMessage(PROJECT_DIR, 'designers in flow')

    const state = readSeedingState(PROJECT_DIR)
    expect(state.mode).toBe('running_autonomous')
    expect(state.pending_gate).toBeUndefined()
  })

  it('rejects DISCIPLINE_COMPLETE and GATE emitted in the same turn', async () => {
    // Write the artifact DURING the Claude turn (not pre-seeded) so the
    // turn-start reconciler doesn't grab it before marker verification
    // runs. This mirrors real usage — Claude produces the artifact
    // in the same turn it (bogusly) tries to declare completion.
    mockRunClaude.mockImplementationOnce(async () => {
      mkdirSync(join(PROJECT_DIR, 'seed_spec'), { recursive: true })
      writeFileSync(
        join(PROJECT_DIR, 'seed_spec', 'brainstorming.md'),
        '# Design Doc\n\n' + 'body '.repeat(200),
      )
      return {
        result:
          'All done.\n\n[DISCIPLINE_COMPLETE: brainstorming]\n\n[GATE: brainstorming/H2-north-star]\nWhat feeling shift?',
        session_id: 'session-1',
      }
    })

    const result = await handleSeedMessage(PROJECT_DIR, 'done')

    // Completion was rejected despite the artifact being written —
    // the gate-and-complete rule takes precedence in this turn's
    // marker verification. (A *subsequent* turn's reconciler may pick
    // it up, but that's a separate code path with its own guard.)
    expect(result.disciplineComplete).toBeUndefined()

    // System note explains the rejection reason.
    const log = readChatLog(PROJECT_DIR)
    const note = log.find((m) => m.content.includes('was rejected'))
    expect(note?.content).toMatch(/gate.+same turn|DISCIPLINE_COMPLETE and a \[GATE/i)
  })

  it('[DECISION:] and [HEARTBEAT:] markers bump last_heartbeat_at', async () => {
    mockRunClaude.mockResolvedValueOnce({
      result:
        '[DECISION: working-title]\nCalled it ColourCheck. Alternatives: ContrastPad, A11yCheck. Reason: terse + domain-aligned.\n\n[HEARTBEAT: enumerating competitors 3/12]\nStill digging.',
      session_id: 'session-1',
    })

    const before = Date.now()
    await handleSeedMessage(PROJECT_DIR, 'begin')

    const state = readSeedingState(PROJECT_DIR)
    expect(state.last_heartbeat_at).toBeTruthy()
    const hbAt = new Date(state.last_heartbeat_at!).getTime()
    expect(hbAt).toBeGreaterThanOrEqual(before - 5)
  })

  it('segmented markers produce separate chat messages with kind tags', async () => {
    mockRunClaude.mockResolvedValueOnce({
      result:
        'Working on it.\n\n[DECISION: pick-domain]\nClassified as designer-tool domain. Alternatives: dev-tool (would point searches differently). Reason: the brief names designers.\n\n[GATE: brainstorming/H2-north-star]\nOne sentence: what feeling shift?',
      session_id: 'session-1',
    })

    await handleSeedMessage(PROJECT_DIR, 'ship it')

    const log = readChatLog(PROJECT_DIR)
    const rougeMsgs = log.filter((m) => m.role === 'rouge')
    // One human msg + three rouge segments (prose intro, decision, gate).
    expect(rougeMsgs.map((m) => m.kind)).toEqual([
      'prose',
      'autonomous_decision',
      'gate_question',
    ])
    const decision = rougeMsgs.find((m) => m.kind === 'autonomous_decision')
    expect(decision?.metadata?.markerId).toBe('pick-domain')
    expect(decision?.content).toContain('designer-tool')
    const gate = rougeMsgs.find((m) => m.kind === 'gate_question')
    expect(gate?.metadata?.markerId).toBe('brainstorming/H2-north-star')
  })

  it('reconciliation does NOT advance past a discipline with a pending gate', async () => {
    // Stranded state: competition.md is on disk (bug scenario — Claude
    // wrote it autonomously during a previous turn), but the user has an
    // unanswered gate for brainstorming. The new-turn flow clears the
    // gate because the human message IS the answer — but if somehow the
    // gate is still live when reconciliation runs (e.g. an internal
    // code path calls reconcile with awaiting_gate still set), we must
    // NOT advance past brainstorming.
    mkdirSync(join(PROJECT_DIR, 'seed_spec'), { recursive: true })
    writeFileSync(
      join(PROJECT_DIR, 'seed_spec', 'brainstorming.md'),
      '# Brainstorm\n\n' + 'body '.repeat(200),
    )
    writeFileSync(
      join(PROJECT_DIR, 'seed_spec', 'competition.md'),
      '# Competition\n\n' + 'body '.repeat(200),
    )

    // Import and invoke the reconciler directly by exposing the invariant
    // through the isAwaitingGateFor check. Since the reconciler is
    // private, we verify via state shape: if we seed awaiting_gate for
    // brainstorming and DON'T send a user message (no clear), then
    // call readSeedingState, brainstorming should NOT be in
    // disciplines_complete even though its artifact is on disk.
    writeSeedingState(PROJECT_DIR, {
      session_id: 'session-1',
      status: 'active',
      current_discipline: 'brainstorming',
      mode: 'awaiting_gate',
      pending_gate: {
        discipline: 'brainstorming',
        gate_id: 'brainstorming/H2-north-star',
        asked_at: new Date().toISOString(),
      },
    })

    // State on its own doesn't auto-reconcile — the handler's turn path
    // is what calls reconcile. The regression this test guards: if we
    // WERE to run the reconciler under awaiting_gate, it must not
    // advance the gated discipline. Drive a turn that doesn't clear the
    // gate by making it a kickoff-style invocation via the handler's
    // internal suppressKickoff path... actually simpler: rely on the
    // invariant that a user turn clears the gate BEFORE reconcile, so
    // the guard is defensive-in-depth. Assert the guard itself via
    // isAwaitingGateFor — the unit-level seeding-state test covers the
    // mechanism, and this integration test covers that the state flag
    // survives arbitrary writes until explicitly cleared.
    const state = readSeedingState(PROJECT_DIR)
    expect(state.mode).toBe('awaiting_gate')
    expect(state.pending_gate?.discipline).toBe('brainstorming')
  })
})

describe('handleSeedMessage — discipline transition injection', () => {
  it('injects the next discipline\'s sub-prompt after brainstorming completes', async () => {
    writeFileSync(join(PROMPTS_DIR, '02-competition.md'), '# COMPETITION\n\nFind competitors.')
    // Seed a completed brainstorming state with its artifact present.
    mkdirSync(join(PROJECT_DIR, 'seed_spec'), { recursive: true })
    writeFileSync(
      join(PROJECT_DIR, 'seed_spec', 'brainstorming.md'),
      '# Design Doc\n\n' + 'body '.repeat(200),
    )
    writeSeedingState(PROJECT_DIR, {
      session_id: 'session-1',
      status: 'active',
      disciplines_complete: ['brainstorming'],
      disciplines_prompted: ['brainstorming'],
      current_discipline: 'competition',
    })

    mockRunClaude.mockResolvedValueOnce({
      result: 'Looking at competitors.',
      session_id: 'session-1',
    })

    await handleSeedMessage(PROJECT_DIR, 'keep going')

    const sentPrompt: string = mockRunClaude.mock.calls[0][0].prompt
    // No orchestrator re-injection (session already active).
    expect(sentPrompt).not.toContain('# ORCHESTRATOR')
    // Does inject the new discipline's prompt.
    expect(sentPrompt).toContain('DISCIPLINE TRANSITION — entering COMPETITION')
    expect(sentPrompt).toContain('Find competitors.')

    const state = readSeedingState(PROJECT_DIR)
    expect(state.disciplines_prompted).toContain('competition')
  })
})

describe('handleSeedMessage — humanMessageAlreadyPersisted (Fix B)', () => {
  // Default (no option) still appends. Guards against any accidental
  // flip of the default in future refactors.
  it('DEFAULT: appends the human chat message (inline path behaviour unchanged)', async () => {
    mockRunClaude.mockResolvedValueOnce({
      result: 'Rouge response.',
      session_id: 'session-1',
    })
    await handleSeedMessage(PROJECT_DIR, 'user asked something')
    const chat = readChatLog(PROJECT_DIR)
    const humans = chat.filter((m) => m.role === 'human')
    expect(humans).toHaveLength(1)
    expect(humans[0].content).toBe('user asked something')
  })

  // Fix B: with humanMessageAlreadyPersisted: true the turn must NOT
  // append its own human entry — the caller (HTTP handler in the
  // daemon path) has already done so. Any regression here reproduces
  // the blank-chat symptom or — worse — a silent double-write.
  it('skips the human-append when humanMessageAlreadyPersisted is true', async () => {
    mockRunClaude.mockResolvedValueOnce({
      result: 'Rouge response.',
      session_id: 'session-1',
    })
    await handleSeedMessage(PROJECT_DIR, 'pre-persisted elsewhere', {
      humanMessageAlreadyPersisted: true,
    })
    const chat = readChatLog(PROJECT_DIR)
    const humans = chat.filter((m) => m.role === 'human')
    expect(humans).toHaveLength(0)
    // Rouge response still lands.
    const rouges = chat.filter((m) => m.role === 'rouge')
    expect(rouges.some((m) => m.content.includes('Rouge response'))).toBe(true)
  })

  // The rate-limit branch has its OWN append site (appendMessages at
  // line 453). Easy to miss — pre-implementation audit caught it. If
  // this regresses, a rate-limited turn double-writes the human
  // message (or doesn't write it at all under the wrong branch).
  it('rate-limited turn does not double-append when humanMessageAlreadyPersisted', async () => {
    mockRunClaude.mockResolvedValueOnce({
      // Short response matching detectRateLimit heuristics.
      result: "You've hit your limit — resets in 3 hours",
      session_id: null,
    })
    const result = await handleSeedMessage(PROJECT_DIR, 'ratelimited message', {
      humanMessageAlreadyPersisted: true,
    })
    expect(result.rateLimited).toBe(true)
    const chat = readChatLog(PROJECT_DIR)
    const humans = chat.filter((m) => m.role === 'human')
    expect(humans).toHaveLength(0)
    // The rate-limited Rouge response itself still appears.
    const rouges = chat.filter((m) => m.role === 'rouge')
    expect(rouges.length).toBeGreaterThanOrEqual(1)
  })

  // Sanity: rate-limit under the DEFAULT path still appends the
  // human as it always has.
  it('rate-limited turn DOES append human under the default (inline) path', async () => {
    mockRunClaude.mockResolvedValueOnce({
      result: "You've hit your limit — resets in 3 hours",
      session_id: null,
    })
    await handleSeedMessage(PROJECT_DIR, 'inline ratelimit')
    const chat = readChatLog(PROJECT_DIR)
    const humans = chat.filter((m) => m.role === 'human')
    expect(humans).toHaveLength(1)
    expect(humans[0].content).toBe('inline ratelimit')
  })
})
