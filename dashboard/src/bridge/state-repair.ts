import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { statePath, writeStateJson } from './state-path'
import { withStateLock } from './state-lock'
import { finalizeSeeding } from './seeding-finalize'
import { markSeedingComplete, readSeedingState } from './seeding-state'
import { DISCIPLINE_SEQUENCE } from './types'
import { readSeedPid, clearSeedPid } from './seed-daemon-pid'
import { hasQueuedMessages } from './seed-queue'
import { appendChatMessage } from './chat-reader'

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
export async function repairProjectState(projectDir: string): Promise<RepairReport> {
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
  // finalizeSeeding / markSeedingComplete take the state-lock internally.
  if (state.current_state === 'seeding') {
    const seeding = readSeedingState(projectDir)
    const allDone = (seeding.disciplines_complete?.length ?? 0) >= DISCIPLINE_SEQUENCE.length
    if (allDone && !seeding.seeding_complete) {
      const result = await finalizeSeeding(projectDir)
      if (result.ok) {
        markSeedingComplete(projectDir)
        fixes.push('stuck-seeding: all 8 disciplines complete but seeding_complete was null → finalized')
      }
      // If finalize returned missing artifacts, don't claim a fix —
      // the state really is incomplete.
    }
  }

  // Shape 2: in foundation but foundation object is null/undefined.
  // Re-read and fix inside the lock so an in-flight build-runner
  // transition can't clobber us.
  const shape2Fixed = await withStateLock(projectDir, () => {
    try {
      const current = JSON.parse(readFileSync(sp, 'utf-8')) as Record<string, unknown>
      if (current.current_state === 'foundation' && !current.foundation) {
        current.foundation = { status: 'pending' }
        writeStateJson(projectDir, current)
        return true
      }
    } catch {
      /* swallow — already reported above */
    }
    return false
  })
  if (shape2Fixed) {
    fixes.push('null-foundation: current_state=foundation with null foundation → set { status: "pending" }')
  }

  // Shape 3: current_state='escalation' but escalations[] has no pending
  // item (the testimonial symptom — foundation-eval transitioned to
  // escalation over a "no staging URL" warning without pushing a
  // matching object, leaving the dashboard's escalation view blank).
  // Synthesise a placeholder so the UI has something to render and the
  // user can Reset or Resume. rouge-loop's dispatcher was also hardened
  // to prevent the broken shape going forward; this handles projects
  // already persisted with it.
  const shape3Fixed = await withStateLock(projectDir, () => {
    try {
      const current = JSON.parse(readFileSync(sp, 'utf-8')) as {
        current_state?: string
        escalations?: Array<Record<string, unknown>>
      } & Record<string, unknown>
      if (current.current_state === 'escalation') {
        const pending = (current.escalations || []).filter(
          (e) => e && e.status === 'pending',
        )
        if (pending.length === 0) {
          if (!Array.isArray(current.escalations)) current.escalations = []
          current.escalations.push({
            id: `esc-repair-${Date.now()}`,
            tier: 1,
            classification: 'unspecified-repair',
            summary:
              "Rouge transitioned into 'escalation' but didn't record a specific reason. " +
              'Check the launcher log or cycle_context.json for context around this time.',
            story_id: null,
            status: 'pending',
            created_at: new Date().toISOString(),
          })
          writeStateJson(projectDir, current)
          return true
        }
      }
    } catch {
      /* swallow — already reported above */
    }
    return false
  })
  if (shape3Fixed) {
    fixes.push('empty-escalation: current_state=escalation with no pending escalation → synthesised placeholder')
  }

  // Shape 4: orphan .seed-pid — the file claims a PID that's dead.
  // `readSeedPid` already cleans up the file and returns null in that
  // case, but we do the explicit call here for the report AND surface
  // stranded queue entries (messages enqueued but the daemon died
  // before processing them). The user sees a system_note telling
  // them exactly that happened — otherwise the stranded messages
  // just sit there until the next user message respawns the daemon.
  //
  // Phase 5 of the seed-loop architecture plan: make silent failures
  // visible. A crashed daemon with queued work is exactly the kind of
  // state the UI should surface rather than hide.
  const priorPid = readSeedPid(projectDir) // side-effect: cleans stale file
  const pidExistsOnDisk = existsSync(join(projectDir, '.seed-pid'))
  // If readSeedPid returned null but the on-disk file existed before
  // that call, it means readSeedPid evicted a stale entry.
  // We can also detect stale indirectly: the file went from present
  // to absent across the call. Simpler: inspect the queue and heartbeat.
  const queueHasWork = hasQueuedMessages(projectDir)
  if (priorPid === null && !pidExistsOnDisk && queueHasWork) {
    // Stranded entries with no daemon and no PID file. The user's
    // next message will respawn a daemon that drains them, but they
    // should know their prior messages are waiting — especially if
    // it's been minutes since the crash.
    try {
      appendChatMessage(projectDir, {
        id: `repair-stranded-${Date.now()}`,
        role: 'rouge',
        content:
          'The seeding daemon appears to have crashed with pending messages still in the queue. ' +
          'Send any message (or click Continue) to respawn the daemon — your queued work will drain first.',
        timestamp: new Date().toISOString(),
        kind: 'system_note',
      })
      fixes.push('orphan-daemon-with-queue: surfaced stranded-queue system note')
    } catch {
      // Chat write failed — not worth escalating the repair itself.
    }
  }

  // Sometimes readSeedPid silently evicts a stale entry without any
  // log surface. Call clearSeedPid again as a no-op belt-and-braces
  // so the file is definitely gone if it was stale.
  if (priorPid === null && pidExistsOnDisk) {
    clearSeedPid(projectDir)
    fixes.push('stale-seed-pid: removed PID file for dead process')
  }

  return { slug, fixes }
}

/**
 * Repair every project in the projects root. Used by the scanner at
 * startup so existing stuck projects heal the first time the dashboard
 * comes up with the new code.
 */
export async function repairAllProjects(projectsRoot: string, slugs: string[]): Promise<RepairReport[]> {
  const reports: RepairReport[] = []
  for (const slug of slugs) {
    const dir = join(projectsRoot, slug)
    try {
      const report = await repairProjectState(dir)
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
