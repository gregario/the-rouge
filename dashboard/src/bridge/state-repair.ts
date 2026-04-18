import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { statePath, writeStateJson } from './state-path'
import { finalizeSeeding } from './seeding-finalize'
import { markSeedingComplete, readSeedingState } from './seeding-state'
import { DISCIPLINE_SEQUENCE } from './types'

export interface RepairReport {
  slug: string
  fixes: string[]
}

/**
 * Idempotent state-repair pass for a single project. Detects and
 * repairs two known corruption shapes that have bitten us in the wild:
 *
 *   1. "Stuck seeding" — `current_state: "seeding"` with all 8
 *      disciplines marked complete in seeding-state.json but
 *      `seeding_complete: null`. Happens when Claude completes the
 *      last discipline on disk but never emits SEEDING_COMPLETE (the
 *      colour-contrast symptom). Fix: run finalizeSeeding, which
 *      advances state.json to "ready" and initialises the foundation
 *      field.
 *
 *   2. "Null foundation" — `current_state: "foundation"` with
 *      `foundation: null`. Happens when a prior code path advanced
 *      state to "foundation" without initialising the foundation
 *      object (the testimonial symptom — rouge-loop crashed reading
 *      `state.foundation.status`). Fix: set `foundation: { status:
 *      "pending" }`.
 *
 * Called from the scanner so every project that shows up in the
 * dashboard gets a pass through the healer. Idempotent — healthy
 * projects are a no-op.
 *
 * Returns a report describing what was fixed (if anything). Empty
 * `fixes` array means the project was already healthy.
 */
export function repairProjectState(projectDir: string): RepairReport {
  const slug = projectDir.split('/').pop() ?? '<unknown>'
  const fixes: string[] = []
  const sp = statePath(projectDir)
  if (!existsSync(sp)) return { slug, fixes }

  let state: Record<string, unknown>
  try {
    state = JSON.parse(readFileSync(sp, 'utf-8'))
  } catch {
    // Malformed state.json — leave it alone. The UI will flag it.
    return { slug, fixes }
  }

  // Shape 1: stuck in seeding with all disciplines complete.
  if (state.current_state === 'seeding') {
    const seeding = readSeedingState(projectDir)
    const allDone = (seeding.disciplines_complete?.length ?? 0) >= DISCIPLINE_SEQUENCE.length
    if (allDone && !seeding.seeding_complete) {
      const result = finalizeSeeding(projectDir)
      if (result.ok) {
        markSeedingComplete(projectDir)
        fixes.push('stuck-seeding: all 8 disciplines complete but seeding_complete was null → finalized')
      }
      // If finalize returned missing artifacts, don't claim a fix —
      // the state really is incomplete.
    }
  }

  // Re-read state in case the seeding finalize above mutated it.
  let current: Record<string, unknown>
  try {
    current = JSON.parse(readFileSync(sp, 'utf-8'))
  } catch {
    return { slug, fixes }
  }

  // Shape 2: in foundation but foundation object is null/undefined.
  if (current.current_state === 'foundation' && !current.foundation) {
    current.foundation = { status: 'pending' }
    writeStateJson(projectDir, current)
    fixes.push('null-foundation: current_state=foundation with null foundation → set { status: "pending" }')
  }

  // Shape 3: similar for story-building with no milestones — we can't
  // synthesise milestones, so just log. Left as an observation for
  // future work; no auto-fix.

  return { slug, fixes }
}

/**
 * Repair every project in the projects root. Used by the scanner at
 * startup so existing stuck projects heal the first time the dashboard
 * comes up with the new code.
 */
export function repairAllProjects(projectsRoot: string, slugs: string[]): RepairReport[] {
  const reports: RepairReport[] = []
  for (const slug of slugs) {
    const dir = join(projectsRoot, slug)
    try {
      const report = repairProjectState(dir)
      if (report.fixes.length > 0) {
        console.log(`[state-repair] ${slug}: ${report.fixes.join('; ')}`)
      }
      reports.push(report)
    } catch (err) {
      console.warn(`[state-repair] ${slug} failed:`, err instanceof Error ? err.message : err)
    }
  }
  return reports
}
