/**
 * Seeding discipline registry (P1.5R PR 4).
 *
 * Authoritative map of each seeding discipline to its prompt file and its
 * applicable_at tier (the minimum project_size at which the discipline
 * should run). The orchestrator reads this to decide which disciplines to
 * skip on XS/S projects — a calculator doesn't need COMPETITION or
 * MARKETING; a todo app might not need COMPETITION either.
 *
 * See docs/design/adaptive-depth-dial.md §Dial values for the reasoning
 * behind each tier assignment.
 */

'use strict';

const { TIERS } = require('./project-sizer.js');

const TIER_INDEX = Object.fromEntries(TIERS.map((t, i) => [t, i]));

/**
 * The registry. Order is the canonical run sequence (matches the
 * orchestrator prompt's list + SEEDING_DISCIPLINES arrays).
 *
 * Tier assignments (see design doc §Dial values):
 *   - brainstorming, taste, sizing, spec — always run (XS+). Core of every
 *     project, regardless of size.
 *   - infrastructure, design, legal-privacy — S+. XS projects are trivial
 *     enough that infra is implicit, design is implied by spec, and there
 *     is no user data to legally consider. Anything bigger needs all three.
 *   - competition, marketing — M+. GTM-only disciplines. XS/S projects
 *     are utilities or small apps; no GTM motion, no funnel. Owner can
 *     manually run these for S-tier projects that do have GTM intent by
 *     overriding project_size to M.
 */
const REGISTRY = Object.freeze({
  brainstorming:   { applicable_at: 'XS', file: '01-brainstorming.md' },
  competition:     { applicable_at: 'M',  file: '02-competition.md' },
  taste:           { applicable_at: 'XS', file: '03-taste.md' },
  sizing:          { applicable_at: 'XS', file: '03b-sizing.md' },
  spec:            { applicable_at: 'XS', file: '04-spec.md' },
  infrastructure:  { applicable_at: 'S',  file: '08-infrastructure.md' },
  design:          { applicable_at: 'S',  file: '05-design.md' },
  'legal-privacy': { applicable_at: 'S',  file: '06-legal-privacy.md' },
  marketing:       { applicable_at: 'M',  file: '07-marketing.md' },
});

const DISCIPLINE_NAMES = Object.freeze(Object.keys(REGISTRY));

/**
 * Is `projectSize` at or above `applicableAt`?
 *
 * @param {'XS'|'S'|'M'|'L'|'XL'} projectSize
 * @param {'XS'|'S'|'M'|'L'|'XL'} applicableAt
 */
function tierAtOrAbove(projectSize, applicableAt) {
  if (TIER_INDEX[projectSize] === undefined) {
    throw new Error(`unknown projectSize: ${projectSize}`);
  }
  if (TIER_INDEX[applicableAt] === undefined) {
    throw new Error(`unknown applicable_at: ${applicableAt}`);
  }
  return TIER_INDEX[projectSize] >= TIER_INDEX[applicableAt];
}

/**
 * Should a specific discipline run at a given project_size?
 */
function shouldRun(disciplineName, projectSize) {
  const entry = REGISTRY[disciplineName];
  if (!entry) throw new Error(`unknown discipline: ${disciplineName}`);
  return tierAtOrAbove(projectSize, entry.applicable_at);
}

/**
 * Reason string for why a discipline would be skipped. Useful for
 * [DISCIPLINE_SKIPPED] marker text.
 */
function skipReason(disciplineName, projectSize) {
  const entry = REGISTRY[disciplineName];
  if (!entry) throw new Error(`unknown discipline: ${disciplineName}`);
  return `applicable_at=${entry.applicable_at}; project_size=${projectSize} is below threshold`;
}

/**
 * List the disciplines that SHOULD run at a given size, in canonical order.
 */
function listApplicable(projectSize) {
  return DISCIPLINE_NAMES.filter((n) => shouldRun(n, projectSize));
}

/**
 * List the disciplines that would be SKIPPED at a given size.
 */
function listSkipped(projectSize) {
  return DISCIPLINE_NAMES.filter((n) => !shouldRun(n, projectSize));
}

module.exports = {
  REGISTRY,
  DISCIPLINE_NAMES,
  tierAtOrAbove,
  shouldRun,
  skipReason,
  listApplicable,
  listSkipped,
};
