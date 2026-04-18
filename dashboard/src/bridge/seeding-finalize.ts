import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { statePath as resolveStatePath, writeStateJson } from './state-path'
import { withStateLock } from './state-lock'

export interface FinalizeResult {
  ok: boolean
  missingArtifacts?: string[]
}

/** Minimum byte floor for "looks like real content, not a stub". */
const MIN_FILE_BYTES = 200

function fileLooksReal(path: string): boolean {
  if (!existsSync(path)) return false
  try {
    return statSync(path).size >= MIN_FILE_BYTES
  } catch {
    return false
  }
}

export async function finalizeSeeding(projectDir: string): Promise<FinalizeResult> {
  const missing: string[] = []

  // Task ledger — V3 story/milestone tracking the launcher consumes.
  if (!existsSync(join(projectDir, 'task_ledger.json'))) {
    missing.push('task_ledger.json')
  }

  // Seed spec directory — per-feature spec files.
  const seedSpecDir = join(projectDir, 'seed_spec')
  if (!existsSync(seedSpecDir)) {
    missing.push('seed_spec/')
  } else {
    const files = readdirSync(seedSpecDir).filter(f => !f.startsWith('.'))
    if (files.length === 0) {
      missing.push('seed_spec/')
    }
  }

  // vision.json — machine-readable product vision the orchestrator
  // (line 147) and complexity-profile step (line 479) both require.
  // The V2 schema finalization writes infrastructure.services into
  // this file too.
  if (!fileLooksReal(join(projectDir, 'vision.json'))) {
    missing.push('vision.json')
  }

  // product_standard.json — inherited global + domain + project
  // overrides (orchestrator line 148). Drives what the Factory holds
  // the build to during loop evaluation.
  if (!fileLooksReal(join(projectDir, 'product_standard.json'))) {
    missing.push('product_standard.json')
  }

  if (missing.length > 0) {
    return { ok: false, missingArtifacts: missing }
  }

  // All artifacts present — promote state to ready so the build loop
  // can pick it up when the human triggers it. Locked because
  // build-runner's transition can hit this file concurrently.
  const statePath = resolveStatePath(projectDir)
  if (existsSync(statePath)) {
    await withStateLock(projectDir, () => {
      const state = JSON.parse(readFileSync(statePath, 'utf-8'))

      // Idempotency: already-finalized project → no-op. Without this,
      // a duplicate SEEDING_COMPLETE emission (retry, late reconcile)
      // would overwrite state repeatedly with the same values, churning
      // the state.json mtime and firing spurious bridge events.
      if (state.current_state === 'ready' && state.foundation) {
        return
      }

      state.current_state = 'ready'
      // Initialize the foundation field. Previously the orchestrator
      // prompt was supposed to do this on human approval, but the bridge
      // finalize path runs independently and left `foundation: null`
      // behind — testimonial reached state=foundation with a null
      // foundation field and rouge-loop crashed when it tried to read
      // `state.foundation.status`. Setting `{ status: 'pending' }` here
      // guarantees the shape is sound whenever state advances to 'ready'.
      //
      // If the caller (orchestrator) has already set foundation to
      // something more specific (e.g., `{ status: 'complete' }` when the
      // complexity profile waives foundation), preserve it.
      if (!state.foundation) {
        state.foundation = { status: 'pending' }
      }
      writeStateJson(projectDir, state)
    })
  }

  return { ok: true }
}
