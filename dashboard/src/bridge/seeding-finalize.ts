import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, renameSync } from 'fs'
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

function writeJsonAtomic(path: string, data: unknown): void {
  const tmp = path + '.tmp'
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n')
  renameSync(tmp, path)
}

/**
 * Mirror infrastructure decisions from `infrastructure_manifest.json` into
 * `vision.json.infrastructure` (and `cycle_context.json.vision.infrastructure`),
 * where the launcher's provisioner actually looks them up.
 *
 * Background: the INFRASTRUCTURE discipline writes the chosen deploy target
 * to `infrastructure_manifest.json.deploy.target`. The provisioner
 * (src/launcher/provision-infrastructure.js:328) reads
 * `cycle_context.vision.infrastructure.deployment_target`. Nothing was
 * copying the value across, so a fresh project would always hit the
 * "No deployment_target in vision.json.infrastructure" warning and stall.
 * Testimonial reproduced this: manifest.deploy.target="docker-compose" but
 * vision.json.infrastructure={}.
 *
 * This mirror is intentionally non-destructive: it only fills fields that
 * are missing on the target, so explicit spec/vision overrides win.
 */
function propagateInfrastructureFromManifest(projectDir: string): void {
  const manifestPath = join(projectDir, 'infrastructure_manifest.json')
  if (!existsSync(manifestPath)) return
  let manifest: {
    deploy?: { target?: string; staging_env?: string; production_env?: string }
    database?: { provider?: string | null } | null
    auth?: { strategy?: string | null; provider?: string | null } | null
  }
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  } catch {
    return
  }
  const target = manifest.deploy?.target
  if (!target || typeof target !== 'string') return

  const needsDatabase = !!(manifest.database && manifest.database.provider)
  const needsAuth = !!(manifest.auth && (manifest.auth.strategy || manifest.auth.provider))

  const visionPath = join(projectDir, 'vision.json')
  if (existsSync(visionPath)) {
    try {
      const vision = JSON.parse(readFileSync(visionPath, 'utf-8')) as {
        infrastructure?: {
          deployment_target?: string
          needs_database?: boolean
          needs_auth?: boolean
        }
      }
      const infra = vision.infrastructure ?? {}
      let changed = false
      if (!infra.deployment_target) { infra.deployment_target = target; changed = true }
      if (infra.needs_database === undefined) { infra.needs_database = needsDatabase; changed = true }
      if (infra.needs_auth === undefined) { infra.needs_auth = needsAuth; changed = true }
      if (changed) {
        vision.infrastructure = infra
        writeJsonAtomic(visionPath, vision)
      }
    } catch {
      // malformed vision.json — leave alone; missing-artifacts check will
      // flag it if it's below the byte floor.
    }
  }

  const ctxPath = join(projectDir, 'cycle_context.json')
  if (existsSync(ctxPath)) {
    try {
      const ctx = JSON.parse(readFileSync(ctxPath, 'utf-8')) as {
        vision?: { infrastructure?: Record<string, unknown> }
      }
      ctx.vision = ctx.vision ?? {}
      const infra = ctx.vision.infrastructure ?? {}
      let changed = false
      if (!infra.deployment_target) { infra.deployment_target = target; changed = true }
      if (infra.needs_database === undefined) { infra.needs_database = needsDatabase; changed = true }
      if (infra.needs_auth === undefined) { infra.needs_auth = needsAuth; changed = true }
      if (changed) {
        ctx.vision.infrastructure = infra
        writeJsonAtomic(ctxPath, ctx)
      }
    } catch {
      // malformed cycle_context.json — skip; rouge-loop has its own repair.
    }
  }
}

export async function finalizeSeeding(projectDir: string): Promise<FinalizeResult> {
  // Propagate deployment_target and needs_* from the infrastructure
  // manifest into vision.json + cycle_context.json before the artifact
  // check runs — that way a project that had a valid manifest but an
  // empty vision.infrastructure still passes the byte-floor check and
  // the provisioner finds the target when the build loop boots.
  propagateInfrastructureFromManifest(projectDir)

  const missing: string[] = []

  // Task ledger — V3 story/milestone tracking the launcher consumes.
  //
  // Two historical footguns:
  //
  // 1. The state-migration step writes `{"milestones": []}` at project
  //    init, so a bare existence check passes even when SPEC never
  //    wrote its decomposition.
  //
  // 2. CLAUDE.md restricts task_ledger writes to `generating-change-spec`,
  //    so SPEC writes `seed_spec/milestones.json` and relies on the
  //    launcher to copy milestones across. If finalize ran before that
  //    copy, foundation kicked off with an empty ledger and the build
  //    escalated with "no milestones".
  //
  // We fix both here: if the ledger is empty but `seed_spec/milestones.json`
  // exists, copy its milestones into the ledger. Then assert milestones
  // is non-empty — so finalize cannot succeed against an undecomposed
  // spec.
  const ledgerPath = join(projectDir, 'task_ledger.json')
  if (!existsSync(ledgerPath)) {
    missing.push('task_ledger.json')
  } else {
    try {
      const ledger = JSON.parse(readFileSync(ledgerPath, 'utf-8')) as {
        milestones?: unknown[]
      }
      if (!Array.isArray(ledger.milestones) || ledger.milestones.length === 0) {
        const milestonesJsonPath = join(projectDir, 'seed_spec', 'milestones.json')
        if (existsSync(milestonesJsonPath)) {
          try {
            const decomposition = JSON.parse(
              readFileSync(milestonesJsonPath, 'utf-8'),
            ) as { milestones?: unknown[] }
            if (Array.isArray(decomposition.milestones) && decomposition.milestones.length > 0) {
              writeJsonAtomic(ledgerPath, { ...ledger, milestones: decomposition.milestones })
            }
          } catch {
            // malformed milestones.json — fall through to the missing-check.
          }
        }
        // Re-read after the possible repopulate.
        const after = JSON.parse(readFileSync(ledgerPath, 'utf-8')) as {
          milestones?: unknown[]
        }
        if (!Array.isArray(after.milestones) || after.milestones.length === 0) {
          missing.push('task_ledger.json (empty milestones — seed_spec/milestones.json missing or malformed)')
        }
      }
    } catch {
      missing.push('task_ledger.json (unreadable)')
    }
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
