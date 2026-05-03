/**
 * Auto-classifier — deterministic project sizing from brainstorming output.
 *
 * Runs AFTER brainstorming completes. Reads the brainstorming artifact,
 * counts complexity signals, and writes `seed_spec/sizing.json`. The LLM
 * never decides project size — this module does.
 *
 * Classification logic mirrors `src/launcher/project-sizer.js` (the
 * canonical CommonJS classifier). We duplicate the boundaries here because
 * the dashboard is TypeScript/ESM and the launcher is CommonJS — no clean
 * cross-build import path exists. Keep these in sync manually; a future
 * shared package can unify them.
 *
 * Signal extraction:
 *   1. Look for a `## Classifier Signals` section in brainstorming.md
 *      with explicit `entity_count: N` lines. This is the preferred path
 *      — the brainstorming prompt asks the LLM to emit this section.
 *   2. If the section is missing or incomplete, fall back to counting
 *      keyword mentions in the full text. This is deliberately coarse
 *      (a mention of "database" counts as one entity, not zero) so the
 *      classifier biases toward higher tiers when signal data is poor —
 *      under-specking a complex project is the failure mode we guard
 *      against (see project-sizer.js header comment).
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { TIER_ORDER, type ProjectSize } from './tier-registry'

// ─── Classifier boundaries ───────────────────────────────────────────
// Mirrors src/launcher/project-sizer.js BOUNDARIES exactly.

const BOUNDARIES: Record<string, number[]> = {
  entity_count:      [1, 3, 6, 12],   // XS 0-1, S 2-3, M 4-6, L 7-12, XL 13+
  integration_count: [0, 2, 5, 10],   // XS 0,   S 1-2, M 3-5, L 6-10, XL 11+
  role_count:        [1, 2, 3, 5],    // XS 0-1, S 2,   M 3,   L 4-5,  XL 6+
  journey_count:     [2, 3, 6, 10],   // XS 0-2, S 3,   M 4-6, L 7-10, XL 11+
  screen_count:      [2, 4, 10, 20],  // XS 0-2, S 3-4, M 5-10, L 11-20, XL 21+
}

const SIGNAL_NAMES = Object.keys(BOUNDARIES)

export interface ClassifierResult {
  ok: true
  projectSize: ProjectSize
  signals: Record<string, number>
  reasoning: string
  signalSource: 'explicit-section' | 'keyword-fallback'
}

export interface ClassifierError {
  ok: false
  reason: string
}

// ─── Tier computation ────────────────────────────────────────────────

function tierForSignal(signalName: string, value: number): ProjectSize {
  const bounds = BOUNDARIES[signalName]
  if (!bounds) return 'XS'
  for (let i = 0; i < bounds.length; i++) {
    if (value <= bounds[i]) return TIER_ORDER[i]
  }
  return 'XL'
}

function maxTier(a: ProjectSize, b: ProjectSize): ProjectSize {
  return TIER_ORDER.indexOf(a) >= TIER_ORDER.indexOf(b) ? a : b
}

function classify(signals: Record<string, number>): { projectSize: ProjectSize; reasoning: string } {
  let picked: ProjectSize = 'XS'
  const perSignal: Record<string, ProjectSize> = {}

  for (const name of SIGNAL_NAMES) {
    const tier = tierForSignal(name, signals[name] ?? 0)
    perSignal[name] = tier
    picked = maxTier(picked, tier)
  }

  const drivers = SIGNAL_NAMES.filter((n) => perSignal[n] === picked)
  const lower = SIGNAL_NAMES.filter((n) => perSignal[n] !== picked)

  const driverText = drivers.map((n) => `${n}=${signals[n]} (${perSignal[n]})`).join(', ')
  const lowerText =
    lower.length === 0
      ? 'all signals align at this tier.'
      : `lower signals: ${lower.map((n) => `${n}=${signals[n]} (${perSignal[n]})`).join(', ')}.`

  return {
    projectSize: picked,
    reasoning: `Classified ${picked}: driven by ${driverText}. ${lowerText}`,
  }
}

// ─── Signal extraction ───────────────────────────────────────────────

/**
 * Parse the `## Classifier Signals` section from brainstorming markdown.
 * Mirrors `parseClassifierSignals` in `src/launcher/project-sizer.js`.
 */
function parseExplicitSignals(
  markdown: string,
): { signals: Record<string, number>; complete: boolean } | null {
  const headerRe = /^##+\s*Classifier Signals\s*$/im
  const headerMatch = headerRe.exec(markdown)
  if (!headerMatch) return null

  const after = markdown.slice(headerMatch.index + headerMatch[0].length)
  const endRe = /^##\s/m
  const endMatch = endRe.exec(after)
  const block = endMatch ? after.slice(0, endMatch.index) : after

  const signals: Record<string, number> = {}
  const lineRe = /^[\s\-*]*([a-z_]+)\s*:\s*(\d+)\s*$/gim
  let m: RegExpExecArray | null
  while ((m = lineRe.exec(block)) !== null) {
    const key = m[1]
    const value = parseInt(m[2], 10)
    if (SIGNAL_NAMES.includes(key)) {
      signals[key] = value
    }
  }

  const missing = SIGNAL_NAMES.filter((s) => !(s in signals))
  return { signals, complete: missing.length === 0 }
}

/**
 * Fallback: count keyword mentions in the full brainstorming text to
 * estimate complexity signals. Deliberately conservative (biases high).
 */
function countKeywordSignals(text: string): Record<string, number> {
  const lower = text.toLowerCase()

  // Entity signals: count unique "model-like" nouns near database/schema context
  const entityKeywords = [
    'database', 'table', 'schema', 'model', 'entity', 'record',
    'collection', 'document', 'object type',
  ]
  const entityCount = Math.max(
    1,
    entityKeywords.reduce((n, kw) => n + countOccurrences(lower, kw), 0),
  )

  // Integration signals
  const integrationKeywords = [
    'api', 'integration', 'third-party', 'third party', 'webhook',
    'oauth', 'stripe', 'twilio', 'sendgrid', 'aws', 'firebase',
    'supabase', 'auth0', 'clerk', 'openai', 'anthropic',
  ]
  const integrationCount = integrationKeywords.reduce(
    (n, kw) => n + (lower.includes(kw) ? 1 : 0),
    0,
  )

  // Role signals
  const roleKeywords = [
    'admin', 'user', 'role', 'moderator', 'owner', 'viewer',
    'editor', 'contributor', 'manager', 'member',
  ]
  const roleCount = Math.max(
    1,
    roleKeywords.reduce((n, kw) => n + (lower.includes(kw) ? 1 : 0), 0),
  )

  // Journey signals
  const journeyKeywords = [
    'flow', 'journey', 'workflow', 'process', 'onboarding',
    'signup', 'sign up', 'checkout', 'purchase', 'invite',
  ]
  const journeyCount = Math.max(
    1,
    journeyKeywords.reduce((n, kw) => n + (lower.includes(kw) ? 1 : 0), 0),
  )

  // Screen signals
  const screenKeywords = [
    'page', 'screen', 'view', 'dashboard', 'settings', 'profile',
    'landing', 'homepage', 'modal', 'dialog', 'form',
  ]
  const screenCount = Math.max(
    1,
    screenKeywords.reduce((n, kw) => n + (lower.includes(kw) ? 1 : 0), 0),
  )

  return {
    entity_count: entityCount,
    integration_count: integrationCount,
    role_count: roleCount,
    journey_count: journeyCount,
    screen_count: screenCount,
  }
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0
  let pos = 0
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++
    pos += needle.length
  }
  return count
}

// ─── Main entry point ────────────────────────────────────────────────

/**
 * Run the auto-classifier against a project's brainstorming artifact.
 * On success, writes `seed_spec/sizing.json` and returns the project size.
 * On failure, returns a reason string for the correction note.
 */
export function runAutoClassifier(
  projectDir: string,
): ClassifierResult | ClassifierError {
  // Find the brainstorming artifact. Check canonical and fallback paths.
  const candidates = [
    'seed_spec/brainstorming.md',
    'seed_spec/brainstorming-design-doc.md',
    'docs/brainstorming.md',
  ]
  let brainstormingText: string | null = null
  for (const rel of candidates) {
    const full = join(projectDir, rel)
    if (existsSync(full)) {
      try {
        brainstormingText = readFileSync(full, 'utf-8')
        break
      } catch { /* try next */ }
    }
  }

  if (!brainstormingText || brainstormingText.length < 100) {
    return {
      ok: false,
      reason:
        'Brainstorming artifact not found or too short to classify. ' +
        'Expected seed_spec/brainstorming.md with substantial content.',
    }
  }

  // Extract signals — prefer explicit section, fall back to keyword counting
  let signals: Record<string, number>
  let signalSource: ClassifierResult['signalSource']

  const explicit = parseExplicitSignals(brainstormingText)
  if (explicit && explicit.complete) {
    signals = explicit.signals
    signalSource = 'explicit-section'
  } else {
    signals = countKeywordSignals(brainstormingText)
    signalSource = 'keyword-fallback'
  }

  // Classify
  const { projectSize, reasoning } = classify(signals)

  // Write sizing.json
  const sizingDir = join(projectDir, 'seed_spec')
  if (!existsSync(sizingDir)) {
    mkdirSync(sizingDir, { recursive: true })
  }

  const artifact = {
    schema_version: 'sizing-v1',
    project_size: projectSize,
    signals,
    reasoning,
    signal_source: signalSource,
    classifier_version: 'bridge-v1',
    classified_at: new Date().toISOString(),
    decided_by: 'auto-classifier',
    human_override: null,
  }

  const sizingPath = join(sizingDir, 'sizing.json')
  const tmpPath = sizingPath + '.tmp'
  writeFileSync(tmpPath, JSON.stringify(artifact, null, 2) + '\n')
  renameSync(tmpPath, sizingPath)

  return {
    ok: true,
    projectSize,
    signals,
    reasoning,
    signalSource,
  }
}
