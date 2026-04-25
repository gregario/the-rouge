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
  const shape2Fixed = await withStateLock(projectDir, async () => {
    try {
      const current = JSON.parse(readFileSync(sp, 'utf-8')) as Record<string, unknown>
      if (current.current_state === 'foundation' && !current.foundation) {
        current.foundation = { status: 'pending' }
        await writeStateJson(projectDir, current)
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
  const shape3Fixed = await withStateLock(projectDir, async () => {
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
          await writeStateJson(projectDir, current)
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
  // before processing them). Plus we push a first-class Escalation
  // so operators scanning the project list see the crash without
  // needing to open the specific project's seeding chat.
  //
  // Phase 5 of the seed-loop architecture plan: make silent failures
  // visible. A crashed daemon with queued work is exactly the kind of
  // state the UI should surface rather than hide.
  const priorPid = readSeedPid(projectDir) // side-effect: cleans stale file
  const pidExistsOnDisk = existsSync(join(projectDir, '.seed-pid'))
  const queueHasWork = hasQueuedMessages(projectDir)
  const daemonDown = priorPid === null && !pidExistsOnDisk

  // Sweep any `seed-daemon-crash` escalations that no longer apply
  // (daemon is alive OR queue has drained). Lives OUTSIDE the
  // "add escalation" path so it runs every repair pass — otherwise
  // a crash-escalation persists forever after recovery.
  const crashResolveFixed = await withStateLock(projectDir, async () => {
    try {
      const current = JSON.parse(readFileSync(sp, 'utf-8')) as {
        escalations?: Array<Record<string, unknown>>
      } & Record<string, unknown>
      const escalations = current.escalations ?? []
      let mutated = false
      for (const e of escalations) {
        if (
          e.classification === 'seed-daemon-crash' &&
          e.status === 'pending' &&
          // Resolve if daemon is back OR queue drained.
          (!daemonDown || !queueHasWork)
        ) {
          e.status = 'resolved'
          e.resolved_at = new Date().toISOString()
          e.resolution = 'Daemon recovered or queue drained.'
          mutated = true
        }
      }
      if (mutated) {
        await writeStateJson(projectDir, current)
        return true
      }
    } catch {
      // swallow
    }
    return false
  })
  if (crashResolveFixed) {
    fixes.push('seed-daemon-crash-stale: resolved prior crash escalation — daemon recovered')
  }

  if (daemonDown && queueHasWork) {
    // Stranded entries with no daemon. Two visible surfaces:
    //   1. A chat system_note in this project's seeding-chat.jsonl
    //      (tells the user what happened inline with the conversation).
    //   2. A first-class Escalation in state.json.escalations[]
    //      (surfaces on the project card + anywhere escalations are
    //      rendered, so the user sees it without opening the project).
    //
    // Only create a new escalation if one isn't already pending —
    // the repair pass runs on every scan + every detail fetch, and
    // re-creating would spam escalations.
    const alreadyEscalated = await withStateLock(projectDir, async () => {
      try {
        const current = JSON.parse(readFileSync(sp, 'utf-8')) as {
          escalations?: Array<Record<string, unknown>>
        } & Record<string, unknown>
        const existingPendingCrash = (current.escalations ?? []).some(
          (e) => e.classification === 'seed-daemon-crash' && e.status === 'pending',
        )
        if (existingPendingCrash) return true
        if (!Array.isArray(current.escalations)) current.escalations = []
        current.escalations.push({
          id: `esc-seed-daemon-crash-${Date.now()}`,
          tier: 1,
          classification: 'seed-daemon-crash',
          summary:
            'The seeding daemon crashed with queued messages pending. ' +
            'Send any message (or click Continue) to respawn — queued work drains first.',
          story_id: null,
          status: 'pending',
          created_at: new Date().toISOString(),
        })
        await writeStateJson(projectDir, current)
        return false
      } catch {
        return false
      }
    })
    if (!alreadyEscalated) {
      fixes.push('seed-daemon-crash: added pending escalation for visibility')
    }

    // Inline chat system_note — written once per call. Dedupe on
    // content is tolerable; consecutive repair passes might write
    // duplicates, but the escalation itself is guarded against that
    // above and is the authoritative signal.
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
