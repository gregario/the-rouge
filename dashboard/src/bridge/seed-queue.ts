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
  /**
   * Set by the HTTP handler under Fix B — the human chat message for
   * this text has already been appended to seeding-chat.jsonl at
   * enqueue time, so the daemon's call to handleSeedMessage MUST NOT
   * re-append. Without this flag we'd double-write the user's message
   * on every turn.
   *
   * Absent on legacy pre-Fix-B entries — in that case the daemon
   * falls back to appending (matching pre-Fix-B behaviour) to avoid
   * silently losing the message.
   *
   * See docs/plans/2026-04-19-seed-loop-architecture.md and the
   * Fix B audit for why this lives on the queue entry rather than
   * being inferred from an env flag in the daemon.
   */
  humanAlreadyPersisted?: boolean
}

function queuePath(projectDir: string): string {
  return join(projectDir, QUEUE_FILENAME)
}

/**
 * Append one user message to the queue. Returns the id of the entry so
 * the HTTP handler can echo it back and the daemon can log it.
 *
 * `opts.humanAlreadyPersisted` signals that the HTTP handler has
 * already written this message's human chat entry to
 * seeding-chat.jsonl — the daemon should suppress its own human
 * append when processing this queue entry. Fix B contract: under the
 * daemon path, the HTTP handler pre-persists synchronously so the
 * client's refetch-after-POST immediately sees the user message
 * rather than blanking until runClaude returns.
 */
export function enqueueMessage(
  projectDir: string,
  text: string,
  opts: { humanAlreadyPersisted?: boolean } = {},
): string {
  const entry: QueueEntry = {
    id: `msg-${Date.now()}-${randomUUID().slice(0, 8)}`,
    text,
    enqueuedAt: new Date().toISOString(),
    ...(opts.humanAlreadyPersisted ? { humanAlreadyPersisted: true } : {}),
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
 * P0-009 FIX: Acquire exclusive lock before drain to prevent concurrent
 * enqueue from racing with our rename operation. The prior two-phase
 * rename strategy still had a window where a concurrent appendFileSync
 * could create a new queue file after our rename but before our unlink,
 * and that new file would be lost if we immediately drained again.
 *
 * With the lock held:
 *   1. No concurrent enqueue can append during drain window
 *   2. Rename is atomic relative to source path (POSIX guarantee)
 *   3. We process the drained batch, then release lock
 *   4. Next enqueue creates a fresh queue file safely
 *
 * NOTE: This makes drainQueue async. Caller (seed-daemon.ts) must await.
 */
export async function drainQueue(projectDir: string): Promise<QueueEntry[]> {
  // Import here to avoid circular dependency at module load time.
  // state-lock.ts imports facade which might transitively import this module.
  // Dynamic import is safe because drainQueue is only called from daemon
  // context (seed-daemon.ts), never from HTTP handlers (which only enqueue).
  const { withStateLock } = await import('./state-lock')

  const path = queuePath(projectDir)
  if (!existsSync(path)) {
    // No queue file — nothing to drain. Return early without acquiring lock.
    return []
  }

  // P0-009: Hold lock across entire drain operation
  const result = await withStateLock(projectDir, () => {
    // Re-check existence after acquiring lock (file might have been
    // drained by a concurrent daemon tick, though seed-daemon.ts
    // should prevent this via single-process architecture).
    if (!existsSync(path)) return { entries: [], parseErrors: [] }

    // Rename to unique temp path so any post-lock-release enqueue
    // creates a fresh queue file instead of appending to the batch
    // we're about to process.
    const draining = `${path}.${randomUUID()}.draining`
    try {
      renameSync(path, draining)
    } catch {
      // Either the file vanished between existsSync and rename (race)
      // or the rename failed. Either way, nothing to drain.
      return { entries: [], parseErrors: [] }
    }

    let content: string
    try {
      content = readFileSync(draining, 'utf-8')
    } catch {
      // Unreadable after rename — drop it rather than hanging on it.
      try { unlinkSync(draining) } catch { /* ignore */ }
      return { entries: [], parseErrors: [] }
    }
    try { unlinkSync(draining) } catch { /* ignore */ }

    const entries: QueueEntry[] = []
    const parseErrors: string[] = []
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const entry = JSON.parse(trimmed) as QueueEntry
        if (typeof entry.text === 'string' && typeof entry.id === 'string') {
          entries.push(entry)
        } else {
          const errorMsg = `Queue entry missing required fields (text or id): ${trimmed.slice(0, 100)}`
          console.error('[seed-queue]', errorMsg)
          parseErrors.push(errorMsg)
        }
      } catch (parseErr) {
        const errorMsg = `JSONL parse failed for line: ${trimmed.slice(0, 100)}`
        console.error('[seed-queue]', errorMsg, parseErr)
        parseErrors.push(errorMsg)
      }
    }

    return { entries, parseErrors }
  })

  // P2-004 fix: Append user-visible error if any lines failed to parse.
  // This prevents silent message loss — the human sees the error in
  // chat and can retry. We do this AFTER releasing the lock so the
  // chat append (which also acquires a lock) doesn't deadlock.
  if (result.parseErrors.length > 0) {
    try {
      const { appendChatMessage } = await import('./chat-reader')
      appendChatMessage(projectDir, {
        id: `parse-error-${Date.now()}`,
        role: 'rouge',
        content: `Queue parse error: ${result.parseErrors.length} message(s) couldn't be read from the queue file. Please retry your last message.`,
        timestamp: new Date().toISOString(),
        kind: 'system_note',
      })
    } catch (innerErr) {
      console.error('[seed-queue] failed to append parse error note:', innerErr)
    }
  }

  // withStateLock returns the object { entries, parseErrors } from the
  // callback. Extract just the entries array for backwards compatibility.
  return result.entries
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
