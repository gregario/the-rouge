/**
 * Tier-based default budgets (P1.5R PR 6).
 *
 * Lookup table mapping project_size (XS/S/M/L/XL) to its default
 * budget_cap_usd + suggested cycle count. The sizer stamps these onto
 * seed_spec/sizing.json at classification time so every consumer (rouge-
 * loop, dashboard, reporting) reads one file.
 *
 * See docs/design/adaptive-depth-dial.md §Dial values for the reasoning
 * behind each number. v1 values are starting points; the design doc
 * commits to logging (tier, actual-spend) pairs to governance for later
 * empirical recalibration.
 *
 * Resolution order for budget_cap_usd in the live loop:
 *   1. state.budget_cap_usd (per-project override, human-set)
 *   2. sizing.json → defaults.budget_cap_usd (tier default)
 *   3. config.budget_cap_usd (global default from rouge.config.json)
 *
 * The per-project override always wins. Tier defaults only apply when a
 * project has been classified by SIZING but no human override is in
 * place.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Budget caps doubled on 2026-04-24 per owner feedback that the original
// values were too tight. suggested_cycles unchanged (cycle counts are
// advisory and not the gating mechanism today).
const TIER_DEFAULTS = Object.freeze({
  XS: { budget_cap_usd: 30,  suggested_cycles: 2 },
  S:  { budget_cap_usd: 60,  suggested_cycles: 3 },
  M:  { budget_cap_usd: 100, suggested_cycles: 5 },
  L:  { budget_cap_usd: 200, suggested_cycles: 8 },
  XL: { budget_cap_usd: 500, suggested_cycles: 12 },
});

function getDefaults(tier) {
  const entry = TIER_DEFAULTS[tier];
  if (!entry) throw new Error(`unknown tier: ${tier}`);
  return { ...entry };
}

/**
 * Read defaults from a project's sizing.json artifact.
 *
 * Resolution:
 *   - If the file exists and is well-formed, read defaults off it.
 *     Prefer the artifact's stamped defaults (so upgrades to this
 *     lookup table don't silently re-price existing projects).
 *   - If the artifact has a project_size but no defaults block (older
 *     artifact from before PR 6), derive from getDefaults(tier).
 *   - If the file is missing / malformed / no tier, return null so
 *     callers fall through to the global default.
 *
 * @param {string} projectDir — project root containing seed_spec/.
 * @returns {{budget_cap_usd: number, suggested_cycles: number}|null}
 */
function readDefaultsFromSizing(projectDir) {
  if (!projectDir) return null;
  const sizingPath = path.join(projectDir, 'seed_spec', 'sizing.json');
  if (!fs.existsSync(sizingPath)) return null;

  let artifact;
  try {
    artifact = JSON.parse(fs.readFileSync(sizingPath, 'utf8'));
  } catch {
    return null;
  }
  if (!artifact || typeof artifact !== 'object') return null;
  if (artifact.defaults && typeof artifact.defaults === 'object') {
    const { budget_cap_usd, suggested_cycles } = artifact.defaults;
    if (typeof budget_cap_usd === 'number' && typeof suggested_cycles === 'number') {
      return { budget_cap_usd, suggested_cycles };
    }
  }
  if (artifact.project_size && TIER_DEFAULTS[artifact.project_size]) {
    return getDefaults(artifact.project_size);
  }
  return null;
}

/**
 * Convenience helper that just returns the budget cap, or null if no
 * sizing information is available. rouge-loop.js uses this in its
 * effective-cap resolution chain.
 */
function readBudgetCapFromSizing(projectDir) {
  const defaults = readDefaultsFromSizing(projectDir);
  return defaults ? defaults.budget_cap_usd : null;
}

module.exports = {
  TIER_DEFAULTS,
  getDefaults,
  readDefaultsFromSizing,
  readBudgetCapFromSizing,
};
