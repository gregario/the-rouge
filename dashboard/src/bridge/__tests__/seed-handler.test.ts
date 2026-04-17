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

  it('silently ignores unknown discipline names in markers', async () => {
    mockRunClaude.mockResolvedValueOnce({
      result: '[DISCIPLINE_COMPLETE: hallucinated-discipline]',
      session_id: 'session-1',
    })

    const result = await handleSeedMessage(PROJECT_DIR, 'msg')
    expect(result.disciplineComplete).toBeUndefined()
    const log = readChatLog(PROJECT_DIR)
    const note = log.find((m) => m.content.startsWith('[SYSTEM NOTE]'))
    expect(note?.content).toContain('rejected')
    expect(note?.content).toContain('hallucinated-discipline')
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
