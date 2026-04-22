/**
 * Cross-project health report.
 *
 * Aggregates the signals the self-heal + triage subsystem emits into
 * a single view so the user can answer "is anything stuck?" without
 * clicking into each project. Powers `rouge health` and (when we
 * wire it) the dashboard's self-heal-activity page.
 *
 * Signals per project:
 *   - current_state + budget usage
 *   - phase fingerprint repeat counts (early-warning on semantic spin)
 *   - pending / resolved escalations with their classifications
 *   - pending self-heal branches / drafts
 *
 * Aggregates across all projects:
 *   - escalation-category histogram
 *   - self-heal attempt count + success rate
 *   - fleet-wide budget totals (real vs estimated)
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_PROJECTS_DIR = path.join(process.env.HOME || '/tmp', '.rouge', 'projects');

function listProjects(projectsDir) {
  const dir = projectsDir || DEFAULT_PROJECTS_DIR;
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name);
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function readStateFor(projectsDir, name) {
  const newLoc = path.join(projectsDir, name, '.rouge', 'state.json');
  if (fs.existsSync(newLoc)) return readJson(newLoc);
  const legacy = path.join(projectsDir, name, 'state.json');
  if (fs.existsSync(legacy)) return readJson(legacy);
  return null;
}

/**
 * Per-phase fingerprint repeat counts. Gives the spin-detector's early-
 * warning view: how close is each phase to tripping the 3-identical
 * threshold?
 */
function fingerprintRepeats(projectsDir, name) {
  const fpPath = path.join(projectsDir, name, 'phase-fingerprints.jsonl');
  if (!fs.existsSync(fpPath)) return {};
  let raw;
  try { raw = fs.readFileSync(fpPath, 'utf8'); } catch { return {}; }
  const entries = raw.trim().split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
  // Group tail per phase.
  const byPhase = new Map();
  for (const e of entries) {
    if (!byPhase.has(e.phase)) byPhase.set(e.phase, []);
    byPhase.get(e.phase).push(e);
  }
  const out = {};
  for (const [phase, list] of byPhase) {
    // Count trailing identical fingerprints.
    if (list.length === 0) { out[phase] = { repeats: 0, last_verdict: null }; continue; }
    const last = list[list.length - 1];
    let repeats = 1;
    for (let i = list.length - 2; i >= 0; i--) {
      if (list[i].fingerprint && list[i].fingerprint === last.fingerprint) repeats++;
      else break;
    }
    out[phase] = { repeats, last_verdict: last.verdict };
  }
  return out;
}

/**
 * Count self-heal events by kind from the audit log. Returns
 * { applied, drafted, refused, reverted, total }.
 */
function selfHealStats() {
  const auditPath = path.join(process.env.HOME || '/tmp', '.rouge', 'audit-log.jsonl');
  const stats = { applied: 0, drafted: 0, refused: 0, reverted: 0, total: 0 };
  if (!fs.existsSync(auditPath)) return stats;
  let raw;
  try { raw = fs.readFileSync(auditPath, 'utf8'); } catch { return stats; }
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (typeof e.kind !== 'string' || !e.kind.startsWith('self-heal-')) continue;
    stats.total++;
    if (e.kind === 'self-heal-applied') stats.applied++;
    else if (e.kind === 'self-heal-draft') stats.drafted++;
    else if (e.kind === 'self-heal-revert') stats.reverted++;
    else if (e.kind === 'self-heal-skipped' || e.kind === 'self-heal-zone') {
      if (e.zone === 'red') stats.refused++;
    }
  }
  return stats;
}

function summariseEscalations(state) {
  const byClass = {};
  const pending = [];
  for (const e of state?.escalations || []) {
    const cls = e.classification || 'unclassified';
    byClass[cls] = (byClass[cls] || 0) + 1;
    if (e.status === 'pending') pending.push({ id: e.id, classification: cls, summary: e.summary });
  }
  return { byClass, pending, total: (state?.escalations || []).length };
}

/**
 * Build a full health report. Pure function of filesystem state.
 *
 * @param {object} [opts] — { projectsDir: string, spinWarnThreshold: number }
 * @returns {object}
 */
function buildReport(opts) {
  const projectsDir = (opts && opts.projectsDir) || DEFAULT_PROJECTS_DIR;
  const warnThreshold = (opts && opts.spinWarnThreshold) || 2;
  const projects = listProjects(projectsDir);
  const perProject = [];
  const fleetClassHistogram = {};
  let fleetRealSpend = 0;
  let fleetEstimatedSpend = 0;
  const stuckProjects = [];

  for (const name of projects) {
    const state = readStateFor(projectsDir, name);
    if (!state) continue;
    const fp = fingerprintRepeats(projectsDir, name);
    const esc = summariseEscalations(state);
    const cost = state.costs || {};
    const real = cost.cumulative_cost_usd_real || 0;
    const est = cost.cumulative_cost_usd_estimated || 0;
    fleetRealSpend += real;
    fleetEstimatedSpend += est;
    for (const [k, v] of Object.entries(esc.byClass)) {
      fleetClassHistogram[k] = (fleetClassHistogram[k] || 0) + v;
    }
    const earlyWarnings = Object.entries(fp)
      .filter(([, v]) => v.repeats >= warnThreshold)
      .map(([phase, v]) => ({ phase, ...v }));
    if (earlyWarnings.length > 0) stuckProjects.push(name);
    perProject.push({
      name,
      state: state.current_state,
      budget_cap_usd: state.budget_cap_usd,
      cumulative_cost_usd: cost.cumulative_cost_usd || 0,
      cumulative_cost_usd_real: real,
      cumulative_cost_usd_estimated: est,
      escalations: esc,
      fingerprint_repeats: fp,
      early_warnings: earlyWarnings,
    });
  }

  return {
    generated_at: new Date().toISOString(),
    projects_dir: projectsDir,
    projects: perProject,
    fleet: {
      project_count: perProject.length,
      stuck_project_count: stuckProjects.length,
      stuck_projects: stuckProjects,
      escalation_histogram: fleetClassHistogram,
      cumulative_cost_usd_real: fleetRealSpend,
      cumulative_cost_usd_estimated: fleetEstimatedSpend,
      self_heal: selfHealStats(),
    },
  };
}

function formatReport(report) {
  const lines = [];
  lines.push('');
  lines.push('  Rouge Health');
  lines.push(`  ${'─'.repeat(40)}`);
  lines.push(`  Projects scanned: ${report.fleet.project_count}`);
  lines.push(`  Stuck projects (spin ≥ 2): ${report.fleet.stuck_project_count}${report.fleet.stuck_projects.length > 0 ? ' — ' + report.fleet.stuck_projects.join(', ') : ''}`);
  lines.push(`  Fleet spend: $${report.fleet.cumulative_cost_usd_real.toFixed(2)} real / $${report.fleet.cumulative_cost_usd_estimated.toFixed(2)} estimated`);
  const sh = report.fleet.self_heal;
  lines.push(`  Self-heal lifetime: ${sh.applied} applied, ${sh.drafted} drafted, ${sh.refused} refused, ${sh.reverted} reverted`);
  if (Object.keys(report.fleet.escalation_histogram).length > 0) {
    lines.push('  Escalation histogram:');
    const sorted = Object.entries(report.fleet.escalation_histogram).sort((a, b) => b[1] - a[1]);
    for (const [cls, n] of sorted) lines.push(`     ${n.toString().padStart(4)} ${cls}`);
  }
  lines.push('');
  lines.push('  Per project:');
  lines.push(`  ${'─'.repeat(40)}`);
  for (const p of report.projects) {
    const cap = p.budget_cap_usd ? `/$${p.budget_cap_usd}` : '';
    lines.push(`  ${p.name} — ${p.state} — $${p.cumulative_cost_usd_real.toFixed(2)} real${cap}`);
    if (p.early_warnings.length > 0) {
      for (const w of p.early_warnings) {
        const icon = w.repeats >= 3 ? '\u{1F6A8}' : '\u26A0\uFE0F ';
        lines.push(`    ${icon} ${w.phase}: ${w.repeats} identical cycle${w.repeats > 1 ? 's' : ''}${w.last_verdict ? ` (last verdict: ${w.last_verdict})` : ''}`);
      }
    }
    if (p.escalations.pending.length > 0) {
      lines.push(`    ${p.escalations.pending.length} pending escalation${p.escalations.pending.length > 1 ? 's' : ''}:`);
      for (const e of p.escalations.pending) lines.push(`      - ${e.classification}: ${(e.summary || '').slice(0, 100)}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

module.exports = {
  buildReport,
  formatReport,
  listProjects,
  fingerprintRepeats,
  summariseEscalations,
  selfHealStats,
};
