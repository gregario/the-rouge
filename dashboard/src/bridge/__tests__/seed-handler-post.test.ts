import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

/**
 * Tests for `postSeedMessage` — the HTTP entry point that replaced
 * `handleSeedMessageRouted` when the flag-gated inline path was
 * removed in Option A. Every seeding message now flows through the
 * detached daemon; these tests lock in the contract:
 *   - append human chat entry synchronously
 *   - enqueue for the daemon
 *   - ensure daemon alive (spawn if absent)
 *   - return 202 immediately
 *   - on failure, surface clearly and preserve the chat entry so
 *     the user can see what happened
 */

const testDir = join(tmpdir(), 'seed-handler-post-' + Date.now())

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true })
  vi.resetModules()
  vi.unstubAllEnvs()
})

beforeEach(() => {
  mkdirSync(testDir, { recursive: true })
})

describe('postSeedMessage', () => {
  it('returns 202 with the human message pre-persisted on disk', async () => {
    vi.doMock('../seed-daemon-spawn', () => ({
      ensureSeedDaemon: vi.fn().mockReturnValue({ ok: true, pid: 99999 }),
    }))

    const { postSeedMessage } = await import('../seed-handler')
    const { readChatLog } = await import('../chat-reader')
    const result = await postSeedMessage(testDir, 'pre-persist me')

    expect(result.ok).toBe(true)
    expect(result.status).toBe(202)
    const chat = readChatLog(testDir)
    const humans = chat.filter((m) => m.role === 'human')
    expect(humans).toHaveLength(1)
    expect(humans[0].content).toBe('pre-persist me')
  })

  it('queue entry contains the message text and no legacy flag', async () => {
    // Post-Option-A the queue entry shape is just {id, text,
    // enqueuedAt}. `humanAlreadyPersisted` is gone — the invariant
    // holds by construction.
    vi.doMock('../seed-daemon-spawn', () => ({
      ensureSeedDaemon: vi.fn().mockReturnValue({ ok: true, pid: 99999 }),
    }))

    const { postSeedMessage } = await import('../seed-handler')
    const { drainQueue } = await import('../seed-queue')
    await postSeedMessage(testDir, 'carry through')
    const batch = drainQueue(testDir)
    expect(batch).toHaveLength(1)
    expect(batch[0].text).toBe('carry through')
    expect((batch[0] as unknown as Record<string, unknown>).humanAlreadyPersisted).toBeUndefined()
  })

  it('returns 500 with clear error when daemon spawn fails', async () => {
    vi.doMock('../seed-daemon-spawn', () => ({
      ensureSeedDaemon: vi.fn().mockReturnValue({ ok: false, error: 'tsx binary not found' }),
    }))

    const { postSeedMessage } = await import('../seed-handler')
    const result = await postSeedMessage(testDir, 'should fail spawn')

    expect(result.ok).toBe(false)
    expect(result.status).toBe(500)
    expect(result.error).toContain('tsx binary not found')
    // Message was queued so a later spawn attempt drains it.
    expect(existsSync(join(testDir, 'seed-queue.jsonl'))).toBe(true)
  })

  it('spawn failure still leaves the human chat message visible to the user', async () => {
    // Key UX: even when the daemon fails to spawn, the user sees
    // their message in the chat rather than it vanishing.
    vi.doMock('../seed-daemon-spawn', () => ({
      ensureSeedDaemon: vi.fn().mockReturnValue({ ok: false, error: 'no tsx' }),
    }))

    const { postSeedMessage } = await import('../seed-handler')
    const { readChatLog } = await import('../chat-reader')
    await postSeedMessage(testDir, 'visible despite spawn fail')
    const chat = readChatLog(testDir)
    const human = chat.find(
      (m) => m.role === 'human' && m.content === 'visible despite spawn fail',
    )
    expect(human).toBeDefined()
  })

  it('multiple messages all land in the queue in order with their chat entries', async () => {
    vi.doMock('../seed-daemon-spawn', () => ({
      ensureSeedDaemon: vi.fn().mockReturnValue({ ok: true, pid: 99999 }),
    }))

    const { postSeedMessage } = await import('../seed-handler')
    const { drainQueue } = await import('../seed-queue')
    const { readChatLog } = await import('../chat-reader')
    await postSeedMessage(testDir, 'first')
    await postSeedMessage(testDir, 'second')
    await postSeedMessage(testDir, 'third')

    expect(drainQueue(testDir).map((e) => e.text)).toEqual(['first', 'second', 'third'])
    expect(readChatLog(testDir).filter((m) => m.role === 'human').map((m) => m.content)).toEqual([
      'first',
      'second',
      'third',
    ])
  })

  it('flag-off path is gone — no env var changes handler behavior', async () => {
    // Regression guard: the former ROUGE_USE_SEED_DAEMON env var had
    // no effect post-Option-A because there IS no other path. The
    // handler always routes through the daemon.
    vi.stubEnv('ROUGE_USE_SEED_DAEMON', '0') // explicitly "off"
    vi.doMock('../seed-daemon-spawn', () => ({
      ensureSeedDaemon: vi.fn().mockReturnValue({ ok: true, pid: 99999 }),
    }))
    const { postSeedMessage } = await import('../seed-handler')
    const result = await postSeedMessage(testDir, 'flag should be ignored')
    expect(result.status).toBe(202)
    expect(existsSync(join(testDir, 'seed-queue.jsonl'))).toBe(true)
  })
})
