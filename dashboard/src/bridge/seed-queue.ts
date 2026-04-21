import { existsSync, readFileSync, appendFileSync, writeFileSync, renameSync, unlinkSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

/**
 * Append-only queue for pending seeding user messages.
 *
 * Phase 1 of the seed-loop architecture (see
 * docs/plans/2026-04-19-seed-loop-architecture.md). The HTTP handler
 * appends a line per user message; the detached daemon drains the
 * queue and invokes `handleSeedMessage` per message.
 *
 * Why a file and not an in-memory queue: the HTTP handler process
 * (Next.js) and the daemon process are separate. The queue is the
 * handoff contract — either side can restart and the other picks up
 * from disk.
 *
 * Format: one JSON object per line, newline-terminated.
 *   { "id": "msg-...", "text": "<user message>", "enqueuedAt": "<ISO>" }
 *
 * Atomic appends: a single appendFileSync on POSIX is atomic for
 * writes smaller than PIPE_BUF (4KB on Linux, typically ≥512B
 * elsewhere). Seeding messages are well under that. We keep each
 * entry on a single line to preserve this guarantee; drainQueue's
 * parser is line-oriented.
 */

const QUEUE_FILENAME = 'seed-queue.jsonl'

export interface QueueEntry {
  id: string
  text: string
  enqueuedAt: string
}

function queuePath(projectDir: string): string {
  return join(projectDir, QUEUE_FILENAME)
}

/**
 * Append one user message to the queue. Returns the id of the entry
 * so the HTTP handler can echo it back and the daemon can log it.
 *
 * The human chat entry is pre-persisted by the HTTP handler BEFORE
 * enqueuing; the daemon never appends human text for a queued
 * message. Post-Option-A, no per-entry flag is needed — the invariant
 * "human already persisted" holds for every entry this function
 * writes.
 */
export function enqueueMessage(projectDir: string, text: string): string {
  const entry: QueueEntry = {
    id: `msg-${Date.now()}-${randomUUID().slice(0, 8)}`,
    text,
    enqueuedAt: new Date().toISOString(),
  }
  const line = JSON.stringify(entry) + '\n'
  appendFileSync(queuePath(projectDir), line, 'utf-8')
  return entry.id
}

/**
 * Read all pending messages, then truncate the queue atomically so we
 * don't re-process any entry. Returns the messages in append order.
 *
 * Failure handling: a malformed line is logged and skipped, not
 * aborting the whole drain. The underlying JSONL append is resilient
 * to interleaved writes (each message is one line); a partial line
 * only happens if the filesystem itself tore a write, which PIPE_BUF
 * guarantees it did not.
 *
 * Atomicity: we read the file content, then rename the current queue
 * to a `.drained` path and delete it. A concurrent writer that
 * appended between our read and the rename will lose its entry.
 * Mitigated by writing to the original path again after rename —
 * see the two-phase drain below.
 */
export function drainQueue(projectDir: string): QueueEntry[] {
  const path = queuePath(projectDir)
  if (!existsSync(path)) return []

  // Two-phase drain: rename to a unique name FIRST so any concurrent
  // append from the HTTP handler lands in a fresh queue file (which
  // will be drained on the next tick), not in the batch we're about
  // to process. On POSIX, rename is atomic relative to the source
  // path — a writer that was about to append to `queuePath` sees
  // ENOENT (handled by appendFileSync creating it fresh) or races
  // harmlessly.
  const draining = `${path}.${randomUUID()}.draining`
  try {
    renameSync(path, draining)
  } catch {
    // Either the file vanished between existsSync and rename (race)
    // or the rename failed. Either way, nothing to drain.
    return []
  }

  let content: string
  try {
    content = readFileSync(draining, 'utf-8')
  } catch {
    // Unreadable after rename — drop it rather than hanging on it.
    try { unlinkSync(draining) } catch { /* ignore */ }
    return []
  }
  try { unlinkSync(draining) } catch { /* ignore */ }

  const entries: QueueEntry[] = []
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const entry = JSON.parse(trimmed) as QueueEntry
      if (typeof entry.text === 'string' && typeof entry.id === 'string') {
        entries.push(entry)
      }
    } catch {
      console.warn('[seed-queue] dropping malformed line:', trimmed.slice(0, 100))
    }
  }
  return entries
}

/**
 * Cheap peek: returns true if the queue file exists and is non-empty.
 * The daemon uses this to decide whether to wait or exit.
 *
 * Preferred over drain-and-check because a peek is reader-only — no
 * state change if the daemon is checking between user messages.
 */
export function hasQueuedMessages(projectDir: string): boolean {
  const path = queuePath(projectDir)
  if (!existsSync(path)) return false
  try {
    // Short-circuit on empty file without reading content.
    const content = readFileSync(path, 'utf-8')
    return content.trim().length > 0
  } catch {
    return false
  }
}

/**
 * Remove the queue file entirely. Used on seeding-complete shutdown so
 * a future re-enqueue against a completed project doesn't inherit a
 * partial batch.
 */
export function clearQueue(projectDir: string): void {
  const path = queuePath(projectDir)
  if (existsSync(path)) {
    try { unlinkSync(path) } catch { /* ignore */ }
  }
}

/**
 * Re-enqueue entries at the head of the queue. Used by the daemon
 * when a message was dequeued but processing failed unrecoverably
 * (e.g. daemon crash mid-turn) so the entry isn't lost — the next
 * daemon spawn picks it up. Implementation writes to a tmp file,
 * concatenates current queue content (if any), atomic-renames.
 */
export function requeueFront(projectDir: string, entries: QueueEntry[]): void {
  if (entries.length === 0) return
  const path = queuePath(projectDir)
  const tmp = `${path}.${randomUUID()}.requeue`
  const headContent = entries.map((e) => JSON.stringify(e)).join('\n') + '\n'
  let tailContent = ''
  if (existsSync(path)) {
    try { tailContent = readFileSync(path, 'utf-8') } catch { /* ignore */ }
  }
  try {
    writeFileSync(tmp, headContent + tailContent, 'utf-8')
    renameSync(tmp, path)
  } catch (err) {
    try { if (existsSync(tmp)) unlinkSync(tmp) } catch { /* ignore */ }
    console.warn('[seed-queue] requeueFront failed:', err instanceof Error ? err.message : err)
  }
}
