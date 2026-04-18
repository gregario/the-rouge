/**
 * Journey log helper.
 *
 * `journey.json` is the immutable per-cycle historical record. Per the
 * CLAUDE.md contract, loop-phase prompts only write to
 * `cycle_context.json` — the launcher is responsible for persisting
 * other files. `09-cycle-retrospective.md` composes its journey entry
 * into `cycle_context.json.journey_entry`; this helper reads that and
 * appends to `journey.json`.
 *
 * Callers: expected to be invoked from rouge-loop.js immediately after
 * the retrospective phase completes, before the loop commits. Safe to
 * call multiple times per cycle — idempotent on a cycle_number match
 * (won't duplicate the same cycle's entry).
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath, data) {
  const tmp = `${filePath}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
    fs.renameSync(tmp, filePath);
  } catch (err) {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
    throw err;
  }
}

/**
 * Append the current cycle's journey entry from cycle_context.json to
 * journey.json. Returns { appended: boolean, reason?: string }.
 *
 * Idempotent: if a journey entry for the same cycle number already
 * exists, returns { appended: false, reason: 'duplicate-cycle' }.
 */
function appendJourneyEntry(projectDir) {
  const ctxPath = path.join(projectDir, 'cycle_context.json');
  const ctx = readJsonSafe(ctxPath);
  if (!ctx) return { appended: false, reason: 'no-cycle-context' };

  const entry = ctx.journey_entry;
  if (!entry || typeof entry !== 'object') {
    return { appended: false, reason: 'no-journey-entry' };
  }

  const journeyPath = path.join(projectDir, 'journey.json');
  const journey = readJsonSafe(journeyPath) || { entries: [] };
  if (!Array.isArray(journey.entries)) journey.entries = [];

  // Idempotency: skip if this cycle number is already recorded.
  const cycle = entry.cycle ?? ctx._cycle_number;
  if (cycle !== undefined) {
    const already = journey.entries.some((e) => e && e.cycle === cycle);
    if (already) return { appended: false, reason: 'duplicate-cycle' };
  }

  journey.entries.push({
    ...entry,
    appended_at: new Date().toISOString(),
  });
  writeJsonAtomic(journeyPath, journey);
  return { appended: true };
}

module.exports = { appendJourneyEntry };
