/**
 * Shared tier registry — single source of truth for discipline-to-tier
 * mappings, project size ordering, and tier-gating validation.
 *
 * Used by:
 *   - auto-classifier.ts (reads tier order, writes sizing.json)
 *   - seed-handler.ts (auto-skips non-applicable disciplines)
 *   - seeding-finalize.ts (validates all applicable disciplines completed)
 *   - dashboard UI (discipline stepper tier badges)
 *
 * Boundaries and tier assignments must stay in sync with
 * `src/launcher/project-sizer.js`. That module is CommonJS and lives
 * outside the dashboard's TypeScript build, so we duplicate the
 * canonical mapping here rather than importing across build boundaries.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// ─── Tier definitions ────────────────────────────────────────────────

/** Maps each seeding discipline to the minimum project tier that includes it.
 *  Insertion order is the canonical display sequence — stepper and chat panel
 *  both derive their ordering from this map via listApplicableDisciplines(). */
export const DISCIPLINE_TIERS: Record<string, string> = {
  brainstorming: 'XS',
  sizing: 'XS',
  taste: 'XS',
  competition: 'M',
  spec: 'XS',
  infrastructure: 'S',
  design: 'S',
  'legal-privacy': 'S',
  marketing: 'M',
}

export const TIER_ORDER = ['XS', 'S', 'M', 'L', 'XL'] as const
export type ProjectSize = (typeof TIER_ORDER)[number]

// ─── Queries ─────────────────────────────────────────────────────────

/**
 * Return every discipline that applies at the given project size.
 * A discipline applies when its tier is <= the project's tier in
 * TIER_ORDER. Returns discipline names in insertion order of
 * DISCIPLINE_TIERS (which matches DISCIPLINE_SEQUENCE).
 */
export function listApplicableDisciplines(projectSize: ProjectSize): string[] {
  const sizeIndex = TIER_ORDER.indexOf(projectSize)
  if (sizeIndex === -1) return []
  return Object.entries(DISCIPLINE_TIERS)
    .filter(([, tier]) => TIER_ORDER.indexOf(tier as ProjectSize) <= sizeIndex)
    .map(([discipline]) => discipline)
}

// ─── Disk readers ────────────────────────────────────────────────────

/**
 * Read the project size from `seed_spec/sizing.json`. Returns null if
 * the file doesn't exist, is malformed, or contains an unrecognised tier.
 */
export function readProjectSize(projectDir: string): ProjectSize | null {
  const sizingPath = join(projectDir, 'seed_spec/sizing.json')
  if (!existsSync(sizingPath)) return null
  try {
    const data = JSON.parse(readFileSync(sizingPath, 'utf-8'))
    const size = data?.project_size
    if (typeof size === 'string' && (TIER_ORDER as readonly string[]).includes(size)) {
      return size as ProjectSize
    }
    return null
  } catch {
    return null
  }
}

// ─── Validation ──────────────────────────────────────────────────────

export type TierValidationResult =
  | { ok: true }
  | {
      ok: false
      reason: string
      tier: string
      required: string[]
      completed: string[]
      missing: string[]
    }

/**
 * Validate that every discipline required for the project's tier has
 * been completed. Reads sizing.json for the tier and seeding-state.json
 * for the completed set.
 *
 * Returns `{ ok: true }` when:
 *   - All applicable disciplines are in the completed set, OR
 *   - No sizing.json exists (can't validate without a tier — caller
 *     decides how to handle that).
 */
export function validateTierCompletion(projectDir: string): TierValidationResult {
  const sizingPath = join(projectDir, 'seed_spec/sizing.json')
  const sizingExists = existsSync(sizingPath)
  const projectSize = readProjectSize(projectDir)

  if (!projectSize && !sizingExists) {
    // No sizing file at all — legacy project (pre-classifier). Can't
    // validate, treat as OK so old projects still finalize.
    return { ok: true }
  }

  if (!projectSize && sizingExists) {
    // sizing.json exists but is malformed or has an invalid tier value.
    // This is a real problem — don't silently bypass tier validation.
    return {
      ok: false,
      reason: 'sizing.json exists but contains invalid or missing project_size',
      tier: 'unknown',
      required: [],
      completed: [],
      missing: [],
    }
  }

  // After the two null checks above, projectSize is guaranteed non-null.
  const tier = projectSize!

  const seedingStatePath = join(projectDir, 'seeding-state.json')
  if (!existsSync(seedingStatePath)) {
    return {
      ok: false,
      reason: 'seeding-state.json not found',
      tier,
      required: listApplicableDisciplines(tier),
      completed: [],
      missing: listApplicableDisciplines(tier),
    }
  }

  let completedList: string[]
  try {
    const state = JSON.parse(readFileSync(seedingStatePath, 'utf-8'))
    completedList = Array.isArray(state.disciplines_complete) ? state.disciplines_complete : []
  } catch {
    return {
      ok: false,
      reason: 'seeding-state.json is malformed',
      tier,
      required: listApplicableDisciplines(tier),
      completed: [],
      missing: listApplicableDisciplines(tier),
    }
  }

  const completed = new Set(completedList)
  const required = listApplicableDisciplines(tier)
  const missing = required.filter((d) => !completed.has(d))

  if (missing.length > 0) {
    return {
      ok: false,
      reason:
        `${missing.length} discipline(s) required for ${tier}-tier not completed: ` +
        `${missing.join(', ')} (completed: ${completedList.join(', ') || 'none'})`,
      tier,
      required,
      completed: completedList,
      missing,
    }
  }

  return { ok: true }
}
