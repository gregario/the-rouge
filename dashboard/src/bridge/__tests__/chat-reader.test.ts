import { describe, it, expect, afterEach } from 'vitest'
import { readChatLog, appendChatMessage } from '../chat-reader'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('chat-reader', () => {
  const testDir = join(tmpdir(), 'chat-test-' + Date.now())

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('returns empty array when log does not exist', () => {
    mkdirSync(testDir, { recursive: true })
    expect(readChatLog(testDir)).toEqual([])
  })

  it('appends and reads a message', () => {
    mkdirSync(testDir, { recursive: true })
    const msg = {
      id: 'msg-1',
      role: 'rouge' as const,
      content: 'Hello',
      timestamp: '2026-04-05T10:00:00Z',
    }
    appendChatMessage(testDir, msg)
    expect(readChatLog(testDir)).toEqual([msg])
  })

  it('appends multiple messages preserving order', () => {
    mkdirSync(testDir, { recursive: true })
    const m1 = { id: 'msg-1', role: 'rouge' as const, content: 'A', timestamp: '2026-04-05T10:00:00Z' }
    const m2 = { id: 'msg-2', role: 'human' as const, content: 'B', timestamp: '2026-04-05T10:01:00Z' }
    appendChatMessage(testDir, m1)
    appendChatMessage(testDir, m2)
    expect(readChatLog(testDir)).toEqual([m1, m2])
  })

  it('skips malformed lines', () => {
    mkdirSync(testDir, { recursive: true })
    writeFileSync(join(testDir, 'seeding-chat.jsonl'),
      '{"id":"msg-1","role":"rouge","content":"A","timestamp":"2026-04-05T10:00:00Z"}\n' +
      'not json\n' +
      '{"id":"msg-2","role":"human","content":"B","timestamp":"2026-04-05T10:01:00Z"}\n'
    )
    const result = readChatLog(testDir)
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('msg-1')
    expect(result[1].id).toBe('msg-2')
  })
})
