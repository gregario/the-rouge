/**
 * post-retrospective-hook.js
 *
 * Called by the launcher after the cycle-retrospective phase completes.
 * Reads amendment proposals that the retrospective produced (drafted shadow
 * variants, prompt-amendment suggestions) and:
 *   1. Writes a governance event for each amendment
 *   2. Appends each to the project's `.rouge/amendments-proposed.jsonl`
 *      as a queue the human or a future aggregator can review
 *   3. Emits structured_retro summary as a governance event if it contains
 *      high-signal content (amendments or recurring failed areas)
 *
 * Scope discipline (P0.10): this module does NOT promote amendments to
 * active. Auto-promotion is P2.2 and requires variant-evidence aggregation
 * across projects + human-reviewable PR creation.
 *
 * Schema expected in cycle_context.amendments_proposed[]:
 *   {
 *     target: string                (required — file or heuristic id the amendment targets)
 *     type: "heuristic-variant" | "prompt-amendment" | string
 *     amendment_id: string
 *     rationale: string             (required — why this amendment)
 *     evidence_refs: string[]       (optional — pointers to heuristic-runs entries, cycles)
 *     proposed_variant?: object     (heuristic-variant type only — the shadow to add)
 *     proposed_edit?: string        (prompt-amendment type only — described diff)
 *   }
 *
 * Never throws. Returns a summary; errors reported in summary.errors[].
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const governance = require('./governance.js');
const { recommendAudit } = require('./audit-recommender.js');

function amendmentsLogPath(projectDir) {
  return path.join(projectDir, '.rouge', 'amendments-proposed.jsonl');
}

function governanceLogPath(projectDir) {
  return path.join(projectDir, '.rouge', 'governance.jsonl');
}

function hasHighSignalRetro(structuredRetro) {
  if (!structuredRetro || typeof structuredRetro !== 'object') return false;
  const amendments = Array.isArray(structuredRetro.amendments_proposed) ? structuredRetro.amendments_proposed : [];
  const failed = Array.isArray(structuredRetro.failed) ? structuredRetro.failed : [];
  return amendments.length > 0 || failed.length >= 3;
}

function validateAmendment(a) {
  if (!a || typeof a !== 'object') return { ok: false, reason: 'not an object' };
  if (!a.target || typeof a.target !== 'string') return { ok: false, reason: 'missing target' };
  if (!a.rationale || typeof a.rationale !== 'string' || a.rationale.length < 5) {
    return { ok: false, reason: 'rationale required (min 5 chars)' };
  }
  return { ok: true };
}

/**
 * Read journey entries from journey.json, falling back to previous_cycles
 * in cycle_context. Returns most-recent-last.
 */
function readRecentCycles(projectDir, cycleContext, limit = 10) {
  const journeyPath = path.join(projectDir, 'journey.json');
  let entries = [];
  if (fs.existsSync(journeyPath)) {
    try {
      const journey = JSON.parse(fs.readFileSync(journeyPath, 'utf8'));
      if (Array.isArray(journey)) entries = journey;
      else if (Array.isArray(journey.entries)) entries = journey.entries;
      else if (Array.isArray(journey.cycles)) entries = journey.cycles;
    } catch {
      // fall through
    }
  }
  if (entries.length === 0 && cycleContext && Array.isArray(cycleContext.previous_cycles)) {
    entries = cycleContext.previous_cycles;
  }
  // Include the current cycle if journey_entry is present (retrospective
  // just wrote it, launcher's journey append may run right after this)
  if (cycleContext && cycleContext.journey_entry) {
    entries = [...entries, cycleContext.journey_entry];
  }
  return entries.slice(-limit);
}

/**
 * @param {string} projectDir
 * @param {object} cycleContext
 * @param {object} state
 * @returns {{ amendments_queued: number, governance_events: number, skipped: number, audit_recommended: boolean, errors: string[] }}
 */
function runPostRetrospective(projectDir, cycleContext, state) {
  const summary = {
    amendments_queued: 0,
    governance_events: 0,
    skipped: 0,
    audit_recommended: false,
    errors: [],
  };
  if (!projectDir) {
    summary.errors.push('projectDir required');
    return summary;
  }
  const ctx = cycleContext || {};
  const cycleNum = (state && typeof state.cycle_number === 'number') ? state.cycle_number : null;
  const projectName = (state && state.project_name) || path.basename(projectDir);

  const amendments = Array.isArray(ctx.amendments_proposed)
    ? ctx.amendments_proposed
    : (ctx.structured_retro && Array.isArray(ctx.structured_retro.amendments_proposed)
        ? ctx.structured_retro.amendments_proposed
        : []);

  // Queue amendments — append to amendments log, governance event per
  const logPath = amendmentsLogPath(projectDir);
  const govPath = governanceLogPath(projectDir);

  for (const raw of amendments) {
    const v = validateAmendment(raw);
    if (!v.ok) {
      summary.skipped += 1;
      summary.errors.push(`skipped amendment: ${v.reason}`);
      continue;
    }
    // Append to amendments-proposed log
    try {
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      const entry = {
        ...raw,
        project: projectName,
        cycle_number: cycleNum,
        queued_at: new Date().toISOString(),
      };
      fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
      summary.amendments_queued += 1;
    } catch (e) {
      summary.errors.push(`amendments append failed: ${e.message}`);
      continue;
    }

    // Write governance event
    try {
      const category = raw.type === 'prompt-amendment'
        ? 'self-improve-proposal'
        : 'amendment-promotion';
      governance.write(govPath, {
        category,
        summary: `Amendment proposed: ${raw.target} — ${raw.rationale.slice(0, 100)}`,
        project: projectName,
        cycle: cycleNum,
        phase: 'cycle-retrospective',
        actor: 'rouge-retrospective',
        severity: 'notice',
        evidence_refs: Array.isArray(raw.evidence_refs) ? raw.evidence_refs : [],
        detail: {
          target: raw.target,
          amendment_id: raw.amendment_id,
          type: raw.type,
        },
      });
      summary.governance_events += 1;
    } catch (e) {
      summary.errors.push(`governance write failed for ${raw.target}: ${e.message}`);
    }
  }

  // P1.13: research-before-solving detector — check if we've entered
  // "whack-a-mole fix mode" across the last N cycles. If so, write an
  // audit-recommendation governance event. The analyzer phase can read
  // this via governance.query() next cycle and factor it into routing.
  try {
    const recentCycles = readRecentCycles(projectDir, ctx);
    const audit = recommendAudit(recentCycles);
    if (audit.recommended) {
      summary.audit_recommended = true;
      governance.write(govPath, {
        category: 'self-improve-proposal',
        summary: `Audit recommended: ${audit.signals.length} signal(s) — ${audit.signals[0].slice(0, 80)}`,
        project: projectName,
        cycle: cycleNum,
        phase: 'cycle-retrospective',
        actor: 'rouge-audit-recommender',
        severity: 'warning',
        detail: {
          type: 'audit-recommended',
          reason: audit.reason,
          signals: audit.signals,
          evidence: audit.evidence,
        },
      });
      summary.governance_events += 1;
    }
  } catch (e) {
    summary.errors.push(`audit recommender failed: ${e.message}`);
  }

  // Also emit a governance event summarizing the retro if it's high-signal
  if (hasHighSignalRetro(ctx.structured_retro)) {
    try {
      const retro = ctx.structured_retro;
      governance.write(govPath, {
        category: 'escalation-resolved',  // best-fit for "retro captured a pattern"
        summary: `Retro cycle ${cycleNum}: ${(retro.worked || []).length} worked, ${(retro.failed || []).length} failed, ${(retro.untried || []).length} untried, ${(retro.amendments_proposed || []).length} amendment(s)`,
        project: projectName,
        cycle: cycleNum,
        phase: 'cycle-retrospective',
        actor: 'rouge-retrospective',
        severity: 'info',
        detail: {
          worked_count: (retro.worked || []).length,
          failed_count: (retro.failed || []).length,
          untried_count: (retro.untried || []).length,
          amendments_count: (retro.amendments_proposed || []).length,
        },
      });
      summary.governance_events += 1;
    } catch (e) {
      summary.errors.push(`retro summary event failed: ${e.message}`);
    }
  }

  return summary;
}

module.exports = {
  runPostRetrospective,
  readRecentCycles,
  amendmentsLogPath,
  governanceLogPath,
  validateAmendment,
  hasHighSignalRetro,
};
