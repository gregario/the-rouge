/**
 * Phase events writer.
 *
 * Parses `claude -p --output-format stream-json --verbose` stdout into
 * compact events and appends them to `<projectDir>/phase_events.jsonl`.
 * The dashboard tails this file to render a live tool-call feed —
 * closing the visibility gap that existed when `claude -p` ran in the
 * default text mode and emitted nothing during tool use.
 *
 * Event shapes (one per JSONL line):
 *   {ts,type:"phase_start",phase,pid,model}
 *   {ts,type:"text",text}                 // assistant narration
 *   {ts,type:"tool_use",id,name,summary}  // Edit/Write/Bash/Read/...
 *   {ts,type:"tool_result",id,status,summary}
 *   {ts,type:"phase_end",phase,exit_code,duration_ms}
 *
 * Keep summaries short — this file is read tail-N by the dashboard and
 * we don't want to blow the payload with full tool inputs/outputs.
 */

const fs = require('fs');
const path = require('path');

const EVENTS_FILENAME = 'phase_events.jsonl';
const TEXT_SUMMARY_LIMIT = 400; // bytes of text per event
const TOOL_SUMMARY_LIMIT = 200;
const TOOL_RESULT_LIMIT = 200;

/**
 * Pull a human-readable summary out of a tool_use input based on the
 * tool name. Falls back to a JSON stringify capped at TOOL_SUMMARY_LIMIT.
 */
function summarizeToolUse(name, input) {
  if (!input || typeof input !== 'object') return '';
  switch (name) {
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return String(input.file_path || input.path || '').slice(0, TOOL_SUMMARY_LIMIT);
    case 'Bash':
      return String(input.command || '').slice(0, TOOL_SUMMARY_LIMIT);
    case 'Grep':
      return String(input.pattern || '').slice(0, TOOL_SUMMARY_LIMIT);
    case 'Glob':
      return String(input.pattern || '').slice(0, TOOL_SUMMARY_LIMIT);
    case 'Task':
    case 'Agent':
      return String(input.description || input.prompt || '').slice(0, TOOL_SUMMARY_LIMIT);
    case 'WebFetch':
    case 'WebSearch':
      return String(input.url || input.query || '').slice(0, TOOL_SUMMARY_LIMIT);
    default:
      try {
        return JSON.stringify(input).slice(0, TOOL_SUMMARY_LIMIT);
      } catch {
        return '';
      }
  }
}

function summarizeToolResult(content) {
  if (typeof content === 'string') return content.slice(0, TOOL_RESULT_LIMIT);
  if (Array.isArray(content)) {
    const text = content
      .map((c) => (c && typeof c === 'object' && typeof c.text === 'string' ? c.text : ''))
      .join(' ')
      .trim();
    return text.slice(0, TOOL_RESULT_LIMIT);
  }
  if (content && typeof content === 'object') {
    try { return JSON.stringify(content).slice(0, TOOL_RESULT_LIMIT); } catch { return ''; }
  }
  return '';
}

/**
 * Extract one or more events from a single parsed stream-json record.
 * Returns an array because a single assistant message can contain
 * multiple content blocks (text + tool_use interleaved).
 */
function extractEventsFromRecord(record) {
  if (!record || typeof record !== 'object') return [];
  const events = [];
  const ts = new Date().toISOString();

  if (record.type === 'assistant' && record.message && Array.isArray(record.message.content)) {
    for (const block of record.message.content) {
      if (!block || typeof block !== 'object') continue;
      if (block.type === 'text' && typeof block.text === 'string') {
        const text = block.text.trim();
        if (text) events.push({ ts, type: 'text', text: text.slice(0, TEXT_SUMMARY_LIMIT) });
      } else if (block.type === 'tool_use') {
        events.push({
          ts,
          type: 'tool_use',
          id: block.id,
          name: block.name,
          summary: summarizeToolUse(block.name, block.input),
        });
      }
    }
  } else if (record.type === 'user' && record.message && Array.isArray(record.message.content)) {
    for (const block of record.message.content) {
      if (!block || typeof block !== 'object') continue;
      if (block.type === 'tool_result') {
        events.push({
          ts,
          type: 'tool_result',
          id: block.tool_use_id,
          status: block.is_error ? 'error' : 'ok',
          summary: summarizeToolResult(block.content),
        });
      }
    }
  }
  // system init + result events are informational — skipped to keep the
  // feed focused on what the agent is actively doing.
  return events;
}

/**
 * Creates a writer that consumes claude's stdout as a byte stream,
 * splits it into lines, JSON.parses each, extracts events, and appends
 * one JSONL row per event to `<projectDir>/phase_events.jsonl`.
 *
 * Returns { onChunk, onEnd } — rouge-loop wires onChunk into the
 * child.stdout 'data' handler and onEnd into the child 'exit' handler.
 *
 * Non-JSON lines (e.g., claude's early stderr or a non-stream-json
 * invocation) are passed through to `onRawLine` if supplied, so the
 * caller can still tee them to the phase log.
 */
function createPhaseEventWriter({ projectDir, phase, pid, model, storyId, milestoneName, onRawLine }) {
  const eventsPath = path.join(projectDir, EVENTS_FILENAME);
  const phaseStartedAt = Date.now();
  let buffer = '';

  // Stamp every event with the story / milestone context active at
  // writer creation time. The dashboard filters by these to scope a
  // per-story feed inside each story card, so the "what's happening"
  // signal lives at the level the user cares about (the plan), not
  // just the project-wide level. Claude runs one phase per writer
  // lifetime, so the story context is stable for all its events.
  const context = {};
  if (storyId) context.story_id = storyId;
  if (milestoneName) context.milestone_name = milestoneName;

  function writeEvent(ev) {
    // Synchronous append keeps the dashboard's tail consistent with
    // what's on disk and avoids stream-buffering races in tests. Each
    // event is a few hundred bytes of text so sync I/O is fine here.
    try { fs.appendFileSync(eventsPath, JSON.stringify({ ...context, ...ev }) + '\n'); } catch { /* best effort */ }
  }

  // phase_start marker lets the dashboard zero its elapsed timer from
  // the same moment rouge-loop's watchdog uses.
  writeEvent({
    ts: new Date().toISOString(),
    type: 'phase_start',
    phase,
    pid,
    model,
  });

  function consumeLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return;
    let record;
    try {
      record = JSON.parse(trimmed);
    } catch {
      if (onRawLine) onRawLine(line);
      return;
    }
    const events = extractEventsFromRecord(record);
    for (const ev of events) writeEvent(ev);
  }

  function onChunk(chunk) {
    buffer += chunk.toString('utf8');
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      consumeLine(line);
      newlineIndex = buffer.indexOf('\n');
    }
  }

  function onEnd(exitCode) {
    if (buffer.length > 0) {
      consumeLine(buffer);
      buffer = '';
    }
    writeEvent({
      ts: new Date().toISOString(),
      type: 'phase_end',
      phase,
      exit_code: exitCode,
      duration_ms: Date.now() - phaseStartedAt,
    });
  }

  return { onChunk, onEnd, eventsPath };
}

module.exports = {
  createPhaseEventWriter,
  extractEventsFromRecord,
  summarizeToolUse,
  summarizeToolResult,
  EVENTS_FILENAME,
};
