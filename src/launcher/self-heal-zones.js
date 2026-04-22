/**
 * Self-heal zone enforcer.
 *
 * Classifies a proposed fix plan into green / yellow / red and
 * determines whether the applier is permitted to execute it.
 *
 * Contract (see docs/plans/2026-04-22-self-heal-and-triage.md):
 *
 *   Green — auto-apply permitted (test-gated, git-revertable):
 *     - file paths matching src/launcher/*.js (non-safety modules)
 *     - additive schema extensions (new enum values)
 *     - single-file change ≤ MAX_GREEN_LINES
 *
 *   Yellow — draft PR only, never auto-apply:
 *     - anything in src/prompts/**
 *     - schema contract changes (shape, removals, required fields)
 *     - new launcher modules or refactors > MAX_GREEN_LINES
 *
 *   Red — never self-heal, always human:
 *     - safety.js, deploy-blocking.js, self-improve-safety.js,
 *       audit-trail.js (safety mechanism logic)
 *     - phase-prompt content
 *     - agentic actions outside the Rouge repo (account signups, etc.)
 *
 * The enforcer is deliberately conservative. When in doubt, yellow
 * or red — never green. The guardrail is the single most important
 * property of the self-heal subsystem; getting it wrong means
 * Rouge can edit its own safety mechanisms or deploy agentic
 * side-effects the user didn't sanction.
 */

const path = require('path');

const MAX_GREEN_LINES = 30;

// Files that are always red — self-heal can NEVER modify these.
const RED_FILES = new Set([
  'src/launcher/safety.js',
  'src/launcher/deploy-blocking.js',
  'src/launcher/self-improve-safety.js',
  'src/launcher/self-heal-zones.js', // the zone enforcer cannot self-heal itself
  'src/launcher/audit-trail.js',
  'src/launcher/rouge-safety-check.sh',
  'rouge.config.json',
]);

// Path prefixes (directories) that are always red.
const RED_PREFIXES = [
  'src/prompts/',
  '.github/workflows/', // CI is safety-adjacent — human review required
];

// Path prefixes that are yellow (draft-PR, not auto-apply).
const YELLOW_PREFIXES = [
  'schemas/',              // contract-level changes need review
  'library/integrations/', // catalog entries affect future products
  'library/global/',
  'library/domain/',
  'library/templates/',
  'dashboard/',            // dashboard changes need UX review
];

function normalisePath(repoRelative) {
  // Strip leading ./ and any accidental leading /
  return String(repoRelative || '').replace(/^\.\//, '').replace(/^\/+/, '');
}

/**
 * Classify a fix plan into a zone.
 *
 * @param {object} plan — { kind, files: [{ path, added_lines, removed_lines }] }
 *   where path is repo-relative.
 * @returns {{ zone: 'green'|'yellow'|'red', reason: string, files: string[] }}
 */
function classifyPlan(plan) {
  if (!plan || !Array.isArray(plan.files) || plan.files.length === 0) {
    return { zone: 'red', reason: 'empty plan has no files — refuse', files: [] };
  }
  const paths = plan.files.map((f) => normalisePath(f.path));

  // Red: any file in the red set or under a red prefix blocks the
  // whole plan. A plan that touches one red file is red.
  const redHits = paths.filter(
    (p) => RED_FILES.has(p) || RED_PREFIXES.some((prefix) => p.startsWith(prefix)),
  );
  if (redHits.length > 0) {
    return {
      zone: 'red',
      reason: `red-zone files present: ${redHits.join(', ')}`,
      files: paths,
    };
  }

  // Yellow: any file under a yellow prefix forces yellow (draft-PR).
  const yellowHits = paths.filter(
    (p) => YELLOW_PREFIXES.some((prefix) => p.startsWith(prefix)),
  );
  if (yellowHits.length > 0) {
    return {
      zone: 'yellow',
      reason: `touches review-required paths: ${yellowHits.join(', ')}`,
      files: paths,
    };
  }

  // Multi-file plans are yellow by default — we don't have tests for
  // multi-file green applies yet, and a larger change deserves review.
  if (paths.length > 1) {
    return {
      zone: 'yellow',
      reason: `multi-file plan (${paths.length} files) — needs review`,
      files: paths,
    };
  }

  // Single-file plan. Check size.
  const file = plan.files[0];
  const totalLines = (file.added_lines || 0) + (file.removed_lines || 0);
  if (totalLines > MAX_GREEN_LINES) {
    return {
      zone: 'yellow',
      reason: `change size ${totalLines} lines > green cap ${MAX_GREEN_LINES}`,
      files: paths,
    };
  }

  // Single-file in src/launcher/*.js and small enough → green.
  const onlyFile = paths[0];
  if (!onlyFile.startsWith('src/launcher/') || !onlyFile.endsWith('.js')) {
    return {
      zone: 'yellow',
      reason: `green zone is src/launcher/*.js only; got ${onlyFile}`,
      files: paths,
    };
  }

  return {
    zone: 'green',
    reason: `single-file, ${totalLines} lines, in src/launcher/ and not a safety module`,
    files: paths,
  };
}

/**
 * True iff the plan is permitted for auto-apply.
 */
function canAutoApply(plan) {
  return classifyPlan(plan).zone === 'green';
}

module.exports = {
  classifyPlan,
  canAutoApply,
  MAX_GREEN_LINES,
  RED_FILES,
  RED_PREFIXES,
  YELLOW_PREFIXES,
};
