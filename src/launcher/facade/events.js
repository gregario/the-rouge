/**
 * Append-only event log + tail subscriber for facade operations.
 *
 * Phase 3 of the grand unified reconciliation. Per
 * docs/design/entry-vs-core.md, every facade write publishes a
 * structured event to `<projectDir>/.rouge/events.jsonl`. Dashboard,
 * Slack, and tests subscribe to the tail instead of polling state
 * files.
 *
 * Critical property: direct file writes don't generate events. Any
 * GC.4 boundary violation (someone writing state outside the facade)
 * surfaces operationally as a missing UI update during dogfood — caught
 * in days, not months.
 *
 * Format: each line is a JSON object with a stable shape:
 *
 *   {
 *     "ts": "2026-04-25T17:45:32.123Z",
 *     "source": "loop" | "cli" | "dashboard" | "slack" | "self-improve",
 *     "event": "state.write" | "phase.start" | "phase.progress" | "phase.end" | "lock.contended" | ...,
 *     "project": "my-project",
 *     "detail": { ... }   // event-specific payload
 *   }
 *
 * The events file is append-only. There is no rotation in this PoC
 * — operationally it stays small (one line per state mutation, ~200
 * bytes). If a project exceeds 50MB of events, that's a different
 * problem and a Phase 11 follow-up.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const EVENTS_FILENAME = 'events.jsonl';

function eventsPath(projectDir) {
  return path.join(projectDir, '.rouge', EVENTS_FILENAME);
}

function ensureEventsDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

/**
 * Emit one event to the project's event log.
 *
 * Atomic at the byte level (single write call). The file is opened in
 * append mode so concurrent emitters from different processes
 * interleave without overwriting each other (POSIX guarantees writes
 * <= PIPE_BUF / 4096 bytes are atomic in append mode on local fs).
 * Event payloads stay well under that.
 *
 * @param {object} opts
 *   - projectDir: required
 *   - source: 'loop' | 'cli' | 'dashboard' | 'slack' | 'self-improve' | 'test'
 *   - event: short stable name like 'state.write', 'phase.start'
 *   - detail: free-form object (must JSON-serialize)
 */
function emit(opts) {
  const { projectDir, source, event, detail } = opts || {};
  if (!projectDir) throw new Error('events.emit: projectDir required');
  if (!source) throw new Error('events.emit: source required');
  if (!event) throw new Error('events.emit: event required');

  const file = eventsPath(projectDir);
  ensureEventsDir(file);

  const entry = {
    ts: new Date().toISOString(),
    source,
    event,
    project: path.basename(projectDir),
    detail: detail || {},
  };
  const line = JSON.stringify(entry) + '\n';
  fs.appendFileSync(file, line, { encoding: 'utf8' });
  return entry;
}

/**
 * Read the events file from a given byte offset onward.
 *
 * Returns { entries, nextOffset }. `nextOffset` is the byte position
 * after the last fully-read entry — pass it back on the next call to
 * avoid re-reading.
 *
 * Partial trailing line (writer in flight) is not returned in
 * `entries`; the caller will pick it up on the next poll.
 */
function readEvents(projectDir, fromOffset = 0) {
  const file = eventsPath(projectDir);
  if (!fs.existsSync(file)) return { entries: [], nextOffset: 0 };
  const stat = fs.statSync(file);
  if (fromOffset >= stat.size) return { entries: [], nextOffset: stat.size };

  const fd = fs.openSync(file, 'r');
  try {
    const len = stat.size - fromOffset;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, fromOffset);
    const text = buf.toString('utf8');
    const lines = text.split('\n');
    const lastNewline = text.lastIndexOf('\n');
    // If the file doesn't end with \n, the trailing line is partial —
    // exclude it and rewind nextOffset to before it.
    const completeLines = text.endsWith('\n')
      ? lines.slice(0, -1) // drop the empty post-newline element
      : lines.slice(0, -1); // drop the partial trailing line
    const consumedBytes = text.endsWith('\n')
      ? len
      : (lastNewline >= 0 ? lastNewline + 1 : 0);

    const entries = [];
    for (const line of completeLines) {
      if (!line) continue;
      try {
        entries.push(JSON.parse(line));
      } catch (_e) {
        // Corrupt line — skip rather than crash subscribers.
      }
    }
    return { entries, nextOffset: fromOffset + consumedBytes };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Async iterator that yields events as they arrive.
 *
 * Polls the file at `intervalMs` (default 250ms). The iterator never
 * terminates on its own — caller breaks out with `return` or by
 * passing an AbortSignal.
 *
 * @param {object} opts
 *   - projectDir: required
 *   - fromOffset: byte offset to start from (default 0)
 *   - intervalMs: poll interval (default 250)
 *   - signal: AbortSignal to terminate the iterator
 */
async function* subscribeEvents(opts) {
  const { projectDir, fromOffset = 0, intervalMs = 250, signal } = opts || {};
  if (!projectDir) throw new Error('events.subscribeEvents: projectDir required');
  let offset = fromOffset;
  while (true) {
    if (signal && signal.aborted) return;
    const { entries, nextOffset } = readEvents(projectDir, offset);
    offset = nextOffset;
    for (const e of entries) yield e;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

module.exports = {
  emit,
  readEvents,
  subscribeEvents,
  eventsPath,
};
