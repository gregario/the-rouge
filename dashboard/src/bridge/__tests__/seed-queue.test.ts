import { describe, it, expect, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  enqueueMessage,
  drainQueue,
  hasQueuedMessages,
  clearQueue,
  requeueFront,
} from '../seed-queue'

describe('seed-queue', () => {
  const testDir = join(tmpdir(), 'seed-queue-test-' + Date.now())

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('enqueue + drain returns the message in order', () => {
    mkdirSync(testDir, { recursive: true })
    enqueueMessage(testDir, 'hello')
    enqueueMessage(testDir, 'world')
    const batch = drainQueue(testDir)
    expect(batch.map((e) => e.text)).toEqual(['hello', 'world'])
  })

  it('drain empties the queue — second drain returns nothing', () => {
    mkdirSync(testDir, { recursive: true })
    enqueueMessage(testDir, 'one')
    drainQueue(testDir)
    const second = drainQueue(testDir)
    expect(second).toEqual([])
  })

  it('drain returns [] when queue file does not exist', () => {
    mkdirSync(testDir, { recursive: true })
    expect(drainQueue(testDir)).toEqual([])
  })

  it('hasQueuedMessages is false on empty, true after enqueue', () => {
    mkdirSync(testDir, { recursive: true })
    expect(hasQueuedMessages(testDir)).toBe(false)
    enqueueMessage(testDir, 'x')
    expect(hasQueuedMessages(testDir)).toBe(true)
    drainQueue(testDir)
    expect(hasQueuedMessages(testDir)).toBe(false)
  })

  it('enqueue returns a unique id per message', () => {
    mkdirSync(testDir, { recursive: true })
    const id1 = enqueueMessage(testDir, 'a')
    const id2 = enqueueMessage(testDir, 'b')
    expect(id1).not.toBe(id2)
    const batch = drainQueue(testDir)
    expect(batch.find((e) => e.id === id1)?.text).toBe('a')
    expect(batch.find((e) => e.id === id2)?.text).toBe('b')
  })

  it('clearQueue removes the queue file', () => {
    mkdirSync(testDir, { recursive: true })
    enqueueMessage(testDir, 'x')
    expect(hasQueuedMessages(testDir)).toBe(true)
    clearQueue(testDir)
    expect(hasQueuedMessages(testDir)).toBe(false)
  })

  it('clearQueue is a no-op when the queue is absent', () => {
    mkdirSync(testDir, { recursive: true })
    // Should not throw.
    clearQueue(testDir)
    expect(hasQueuedMessages(testDir)).toBe(false)
  })

  it('drops malformed lines instead of failing the whole drain', () => {
    mkdirSync(testDir, { recursive: true })
    // Mix valid entry with garbage.
    enqueueMessage(testDir, 'valid1')
    writeFileSync(
      join(testDir, 'seed-queue.jsonl'),
      // Append a garbage line to the existing queue content.
      `{"id":"a","text":"valid1","enqueuedAt":"2026-04-19T00:00:00Z"}\n` +
        `not valid json at all\n` +
        `{"id":"b","text":"valid2","enqueuedAt":"2026-04-19T00:00:01Z"}\n`,
    )
    const batch = drainQueue(testDir)
    const texts = batch.map((e) => e.text)
    expect(texts).toContain('valid1')
    expect(texts).toContain('valid2')
    expect(texts).not.toContain('not valid json at all')
  })

  it('requeueFront puts entries before any new appends', () => {
    mkdirSync(testDir, { recursive: true })
    enqueueMessage(testDir, 'new')
    requeueFront(testDir, [
      { id: 'old', text: 'old-message', enqueuedAt: '2026-04-19T00:00:00Z' },
    ])
    const batch = drainQueue(testDir)
    expect(batch[0].text).toBe('old-message')
    expect(batch[1].text).toBe('new')
  })

  it('requeueFront with an empty array is a no-op', () => {
    mkdirSync(testDir, { recursive: true })
    enqueueMessage(testDir, 'x')
    requeueFront(testDir, [])
    expect(drainQueue(testDir).map((e) => e.text)).toEqual(['x'])
  })

  it('drain phase leaves no stray .draining file behind', () => {
    mkdirSync(testDir, { recursive: true })
    enqueueMessage(testDir, 'x')
    drainQueue(testDir)
    const files = existsSync(testDir)
      ? require('fs').readdirSync(testDir)
      : []
    const stray = (files as string[]).filter((f) => f.includes('.draining'))
    expect(stray).toEqual([])
  })
})
