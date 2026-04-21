import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

/**
 * Tests the routing logic in handleSeedMessageRouted — does the
 * feature flag correctly switch between the inline and daemon paths,
 * and does the daemon path enqueue + spawn without running the 10-minute
 * subprocess chain?
 *
 * We mock out the module imports dynamically loaded inside
 * handleSeedMessageViaDaemon so we don't actually spawn claude or
 * tsx during the test.
 */

const testDir = join(tmpdir(), 'seed-handler-routed-' + Date.now())

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true })
  delete process.env.ROUGE_USE_SEED_DAEMON
  vi.resetModules()
  vi.unstubAllEnvs()
})

beforeEach(() => {
  mkdirSync(testDir, { recursive: true })
})

describe('handleSeedMessageRouted — flag OFF (inline path)', () => {
  it('calls the inline runSeedingTurn path when flag is not set', async () => {
    // With the flag absent, the routed function should go to the
    // original inline path. We verify by checking that NO queue file
    // is created (the daemon path creates seed-queue.jsonl).
    vi.resetModules()

    // Mock the inline path so we don't actually run claude.
    vi.doMock('../claude-runner', () => ({
      runClaude: vi.fn().mockResolvedValue({
        result: 'mocked response',
        session_id: 'mock-session',
      }),
      detectRateLimit: () => false,
      extractMarkers: () => ({ disciplinesComplete: [], seedingComplete: false }),
      segmentMarkers: () => [],
    }))

    // Minimum seeding state so runSeedingTurn has something valid.
    const { writeSeedingState } = await import('../seeding-state')
    writeSeedingState(testDir, { session_id: null, status: 'not-started' })

    const { handleSeedMessageRouted } = await import('../seed-handler')

    // Assert flag is not set.
    expect(process.env.ROUGE_USE_SEED_DAEMON).toBeUndefined()

    await handleSeedMessageRouted(testDir, 'hi')

    // Daemon path would create seed-queue.jsonl. Inline path does not.
    expect(existsSync(join(testDir, 'seed-queue.jsonl'))).toBe(false)
  })
})

describe('handleSeedMessageRouted — flag ON (daemon path)', () => {
  it('enqueues the message and spawns daemon (mocked), returns 202 immediately', async () => {
    vi.resetModules()
    vi.stubEnv('ROUGE_USE_SEED_DAEMON', '1')

    // Mock ensureSeedDaemon so we don't actually spawn tsx.
    vi.doMock('../seed-daemon-spawn', () => ({
      ensureSeedDaemon: vi.fn().mockReturnValue({ ok: true, pid: 99999, alreadyRunning: false }),
    }))

    const { handleSeedMessageRouted } = await import('../seed-handler')
    const result = await handleSeedMessageRouted(testDir, 'hello from test')

    // Daemon path returns 202 immediately.
    expect(result.ok).toBe(true)
    expect(result.status).toBe(202)

    // Message is on disk in the queue.
    const queueFile = join(testDir, 'seed-queue.jsonl')
    expect(existsSync(queueFile)).toBe(true)
    const content = readFileSync(queueFile, 'utf-8')
    expect(content).toContain('hello from test')
  })

  // Fix B: the HTTP handler pre-persists the human chat message
  // synchronously so the client's refetch-after-POST never sees an
  // empty chat log during the daemon's runClaude window. These tests
  // lock in that contract.
  it('pre-persists the human chat message to seeding-chat.jsonl before returning 202', async () => {
    vi.resetModules()
    vi.stubEnv('ROUGE_USE_SEED_DAEMON', '1')
    vi.doMock('../seed-daemon-spawn', () => ({
      ensureSeedDaemon: vi.fn().mockReturnValue({ ok: true, pid: 99999 }),
    }))

    const { handleSeedMessageRouted } = await import('../seed-handler')
    const { readChatLog } = await import('../chat-reader')
    const result = await handleSeedMessageRouted(testDir, 'pre-persist me')

    expect(result.status).toBe(202)
    const chat = readChatLog(testDir)
    const humans = chat.filter((m) => m.role === 'human')
    expect(humans).toHaveLength(1)
    expect(humans[0].content).toBe('pre-persist me')
  })

  it('queue entry carries humanAlreadyPersisted: true so the daemon skips re-append', async () => {
    vi.resetModules()
    vi.stubEnv('ROUGE_USE_SEED_DAEMON', '1')
    vi.doMock('../seed-daemon-spawn', () => ({
      ensureSeedDaemon: vi.fn().mockReturnValue({ ok: true, pid: 99999 }),
    }))

    const { handleSeedMessageRouted } = await import('../seed-handler')
    const { drainQueue } = await import('../seed-queue')
    await handleSeedMessageRouted(testDir, 'carry the flag')
    const batch = drainQueue(testDir)
    expect(batch).toHaveLength(1)
    expect(batch[0].humanAlreadyPersisted).toBe(true)
  })

  it('returns 500 with clear error when daemon spawn fails', async () => {
    vi.resetModules()
    vi.stubEnv('ROUGE_USE_SEED_DAEMON', '1')

    vi.doMock('../seed-daemon-spawn', () => ({
      ensureSeedDaemon: vi.fn().mockReturnValue({ ok: false, error: 'tsx binary not found' }),
    }))

    const { handleSeedMessageRouted } = await import('../seed-handler')
    const result = await handleSeedMessageRouted(testDir, 'should fail spawn')

    expect(result.ok).toBe(false)
    expect(result.status).toBe(500)
    expect(result.error).toContain('tsx binary not found')
    // Message was still queued — so the user can retry without
    // double-queueing if they want. Assert the queue file exists and
    // contains the message.
    expect(existsSync(join(testDir, 'seed-queue.jsonl'))).toBe(true)
  })

  it('spawn failure still leaves the human chat message visible to the user', async () => {
    // Key UX improvement of Fix B: even when the daemon fails to
    // spawn, the user sees their message in the chat rather than it
    // vanishing into the void.
    vi.resetModules()
    vi.stubEnv('ROUGE_USE_SEED_DAEMON', '1')
    vi.doMock('../seed-daemon-spawn', () => ({
      ensureSeedDaemon: vi.fn().mockReturnValue({ ok: false, error: 'no tsx' }),
    }))

    const { handleSeedMessageRouted } = await import('../seed-handler')
    const { readChatLog } = await import('../chat-reader')
    await handleSeedMessageRouted(testDir, 'visible despite spawn fail')
    const chat = readChatLog(testDir)
    const human = chat.find((m) => m.role === 'human' && m.content === 'visible despite spawn fail')
    expect(human).toBeDefined()
  })

  it('multiple messages all land in the queue in order', async () => {
    vi.resetModules()
    vi.stubEnv('ROUGE_USE_SEED_DAEMON', '1')
    vi.doMock('../seed-daemon-spawn', () => ({
      ensureSeedDaemon: vi.fn().mockReturnValue({ ok: true, pid: 99999 }),
    }))

    const { handleSeedMessageRouted } = await import('../seed-handler')
    await handleSeedMessageRouted(testDir, 'first')
    await handleSeedMessageRouted(testDir, 'second')
    await handleSeedMessageRouted(testDir, 'third')

    const { drainQueue } = await import('../seed-queue')
    const batch = drainQueue(testDir)
    expect(batch.map((e) => e.text)).toEqual(['first', 'second', 'third'])
  })

  it('all three pre-persisted messages appear in chat before the daemon ever runs', async () => {
    vi.resetModules()
    vi.stubEnv('ROUGE_USE_SEED_DAEMON', '1')
    vi.doMock('../seed-daemon-spawn', () => ({
      ensureSeedDaemon: vi.fn().mockReturnValue({ ok: true, pid: 99999 }),
    }))

    const { handleSeedMessageRouted } = await import('../seed-handler')
    const { readChatLog } = await import('../chat-reader')
    await handleSeedMessageRouted(testDir, 'one')
    await handleSeedMessageRouted(testDir, 'two')
    await handleSeedMessageRouted(testDir, 'three')

    // All three human messages should be on disk BEFORE any daemon
    // tick — the HTTP handler persists each one synchronously.
    const chat = readChatLog(testDir)
    const humanContents = chat.filter((m) => m.role === 'human').map((m) => m.content)
    expect(humanContents).toEqual(['one', 'two', 'three'])
  })
})
