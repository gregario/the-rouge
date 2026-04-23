/**
 * amendify.js (skeleton)
 *
 * Given a library entry + proposed change, produces an amendment candidate:
 * a new 'shadow' variant on the entry. Does NOT persist to disk; caller decides
 * when and where to write.
 *
 * Future phases: wire this into the retrospective phase so recurring-pattern
 * observations auto-draft shadow variants, run N cycles to gather evidence,
 * then auto-draft PRs via recommendation().
 *
 * Pure, no I/O, no external deps.
 */

'use strict';

const { normalizeEntry, getVariant } = require('./variant-tracker.js');

/**
 * Generate an amendment id of shape:
 *   amendment-YYYY-MM-DD-<entry_id>-<short>
 */
function makeAmendmentId(entryId, shortLabel, dateStr) {
  const date = (dateStr || new Date().toISOString().slice(0, 10));
  const short = (shortLabel || 'change')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `amendment-${date}-${entryId}-${short}`;
}

/**
 * Propose an amendment as a new shadow variant on the entry.
 *
 * @param {object} entry
 * @param {object} change - fields to override in the new variant (threshold, config, etc.)
 * @param {string} rationale - why this change is being proposed
 * @param {object} opts - { shortLabel, proposedBy, proposalLink, dateStr }
 * @returns {object} new entry with shadow variant appended
 */
function proposeAmendment(entry, change, rationale, opts = {}) {
  if (!change || typeof change !== 'object') {
    throw new TypeError('proposeAmendment: change must be an object');
  }
  if (!rationale || typeof rationale !== 'string') {
    throw new TypeError('proposeAmendment: rationale must be a non-empty string');
  }
  const e = normalizeEntry(entry);
  const amendmentId = makeAmendmentId(e.id, opts.shortLabel, opts.dateStr);
  // Avoid duplicate IDs if called twice in a row with no short label
  if (e.variants.some((v) => v.variant_id === amendmentId)) {
    throw new Error(`amendment id collision: ${amendmentId} already exists on entry ${e.id}`);
  }
  const newVariant = {
    variant_id: amendmentId,
    status: 'shadow',
    created_at: (opts.dateStr || new Date().toISOString().slice(0, 10)),
    rationale,
    proposed_by: opts.proposedBy || 'rouge-retrospective',
    stats: { runs: 0, passes: 0, fails: 0, env_limited: 0 },
    ...change,
  };
  if (opts.proposalLink) newVariant.proposal_link = opts.proposalLink;
  if (opts.amendmentId) newVariant.amendment_id = opts.amendmentId;
  return { ...e, variants: [...e.variants, newVariant] };
}

/**
 * Promote a shadow variant to active. Retires the prior active to 'retired'.
 */
function promoteAmendment(entry, variantId) {
  const e = normalizeEntry(entry);
  const target = getVariant(e, variantId);
  if (!target) throw new Error(`promoteAmendment: unknown variant '${variantId}'`);
  if (target.status === 'active') {
    return e; // no-op
  }
  const newVariants = e.variants.map((v) => {
    if (v.variant_id === variantId) return { ...v, status: 'active' };
    if (v.status === 'active') return { ...v, status: 'retired' };
    return v;
  });
  return { ...e, variants: newVariants };
}

/**
 * Retire a variant (shadow or otherwise) without promoting another.
 */
function retireVariant(entry, variantId) {
  const e = normalizeEntry(entry);
  const target = getVariant(e, variantId);
  if (!target) throw new Error(`retireVariant: unknown variant '${variantId}'`);
  const newVariants = e.variants.map((v) =>
    v.variant_id === variantId ? { ...v, status: 'retired' } : v
  );
  return { ...e, variants: newVariants };
}

/**
 * Draft a human-readable PR body for promoting a shadow variant.
 * Returns a markdown string. Caller decides whether to `gh pr create` it.
 */
function draftPR(entry, variantId, opts = {}) {
  const e = normalizeEntry(entry);
  const variant = getVariant(e, variantId);
  if (!variant) throw new Error(`draftPR: unknown variant '${variantId}'`);
  const active = e.variants.find((v) => v.status === 'active');
  const lines = [];
  lines.push(`# Promote ${variantId} for heuristic \`${e.id}\``);
  lines.push('');
  lines.push(`**Proposed change:** ${variant.rationale || '(no rationale recorded)'}`);
  lines.push('');
  if (active) {
    lines.push(`**Current active variant:** \`${active.variant_id}\``);
    if (active.threshold !== undefined) lines.push(`- Threshold: ${JSON.stringify(active.threshold)}`);
    if (active.stats) {
      lines.push(`- Stats: ${active.stats.runs || 0} runs, ${active.stats.passes || 0} pass, ${active.stats.fails || 0} fail`);
    }
    lines.push('');
  }
  lines.push(`**Amendment variant:** \`${variant.variant_id}\``);
  if (variant.threshold !== undefined) lines.push(`- Threshold: ${JSON.stringify(variant.threshold)}`);
  if (variant.stats) {
    lines.push(`- Stats: ${variant.stats.runs || 0} runs, ${variant.stats.passes || 0} pass, ${variant.stats.fails || 0} fail`);
  }
  lines.push('');
  if (opts.evidence) {
    lines.push('## Evidence');
    lines.push('');
    lines.push(opts.evidence);
    lines.push('');
  }
  lines.push('## Promotion rationale');
  lines.push('');
  if (opts.recommendation) {
    lines.push(`- Action: \`${opts.recommendation.action}\``);
    lines.push(`- Reason: ${opts.recommendation.reason}`);
    if (opts.recommendation.delta !== undefined) {
      lines.push(`- Delta: ${opts.recommendation.delta.toFixed(3)}`);
    }
  }
  lines.push('');
  lines.push('---');
  lines.push('_Generated by Rouge amendify.js_');
  return lines.join('\n');
}

module.exports = {
  makeAmendmentId,
  proposeAmendment,
  promoteAmendment,
  retireVariant,
  draftPR,
};
