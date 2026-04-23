/**
 * governance.js
 *
 * Append-only governance event writer. Records high-signal decisions to a
 * JSONL log for audit, trend analysis, and compliance-style queries.
 *
 * Borrowed from everything-claude-code's governance-capture pattern. Rouge
 * already has checkpoints.jsonl (immutable cycle history) and tools.jsonl
 * (every tool call); governance.jsonl is the sparser, higher-signal layer
 * for decisions-that-mattered.
 *
 * Schema: schemas/governance-event.json
 *
 * Not yet wired into phases/launcher — additive-only in Phase 6. Follow-up
 * PR wires calls from:
 *   - Self-improve pipeline (propose + promote events)
 *   - Amendify (amendment-promotion events)
 *   - Safety-check overrides (safety-override events)
 *   - Ship-promote (milestone-promotion + deploy-override events)
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VALID_CATEGORIES = new Set([
  'approval',
  'safety-override',
  'self-improve-proposal',
  'self-improve-promotion',
  'amendment-promotion',
  'factory-divergence',
  'policy-exception',
  'secret-exposure',
  'milestone-promotion',
  'deploy-override',
  'escalation-resolved',
]);

const VALID_SEVERITIES = new Set(['info', 'notice', 'warning', 'critical']);

function makeEventId(timestamp) {
  const ts = timestamp || new Date().toISOString();
  const datePart = ts.slice(0, 10).replace(/-/g, '');
  const randPart = crypto.randomBytes(2).toString('hex');
  return `gov-${datePart}-${randPart}`;
}

/**
 * Create a governance event object without persisting.
 *
 * @param {object} args
 * @returns {object} event ready to append
 */
function createEvent(args) {
  const {
    category,
    summary,
    project,
    cycle,
    phase,
    actor,
    evidence_refs,
    severity = 'info',
    detail,
    timestamp,
    event_id,
  } = args;

  if (!category) throw new Error('governance.createEvent: category required');
  if (!VALID_CATEGORIES.has(category)) {
    throw new Error(`governance.createEvent: invalid category '${category}'`);
  }
  if (!summary || typeof summary !== 'string' || summary.length < 5) {
    throw new Error('governance.createEvent: summary required (min 5 chars)');
  }
  if (!VALID_SEVERITIES.has(severity)) {
    throw new Error(`governance.createEvent: invalid severity '${severity}'`);
  }

  const ts = timestamp || new Date().toISOString();
  const event = {
    event_id: event_id || makeEventId(ts),
    timestamp: ts,
    category,
    summary,
    severity,
  };
  if (project) event.project = project;
  if (typeof cycle === 'number') event.cycle = cycle;
  if (phase) event.phase = phase;
  if (actor) event.actor = actor;
  if (Array.isArray(evidence_refs) && evidence_refs.length) event.evidence_refs = evidence_refs;
  if (detail && typeof detail === 'object') event.detail = detail;
  return event;
}

/**
 * Append an event to the governance log (JSONL). Creates file/dir if needed.
 */
function appendEvent(logPath, event) {
  const dir = path.dirname(logPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(logPath, JSON.stringify(event) + '\n');
  return event;
}

/**
 * Convenience: create + append in one call.
 */
function write(logPath, args) {
  const event = createEvent(args);
  appendEvent(logPath, event);
  return event;
}

/**
 * Read all events from a JSONL log. Returns empty array if missing.
 * Skips malformed lines with a warning on stderr.
 */
function readEvents(logPath, opts = {}) {
  if (!fs.existsSync(logPath)) return [];
  const text = fs.readFileSync(logPath, 'utf8');
  const events = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch (e) {
      if (!opts.silent) console.warn(`[governance] skipped malformed line: ${line.slice(0, 80)}`);
    }
  }
  return events;
}

/**
 * Filter events by category + time window + project.
 */
function query(logPath, filter = {}) {
  const events = readEvents(logPath, { silent: true });
  return events.filter((e) => {
    if (filter.category && e.category !== filter.category) return false;
    if (filter.project && e.project !== filter.project) return false;
    if (filter.severity && e.severity !== filter.severity) return false;
    if (filter.since && new Date(e.timestamp) < new Date(filter.since)) return false;
    if (filter.until && new Date(e.timestamp) > new Date(filter.until)) return false;
    return true;
  });
}

module.exports = {
  VALID_CATEGORIES,
  VALID_SEVERITIES,
  makeEventId,
  createEvent,
  appendEvent,
  write,
  readEvents,
  query,
};
