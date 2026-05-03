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

  // P1-SEEDING-003 FIX: Validate that all applicable disciplines for the
  // project tier actually completed. Prevents orchestrator from hallucinating
  // completion when only 1/7 disciplines ran.
  const sizingPath = join(projectDir, 'seed_spec/sizing.json')
  if (existsSync(sizingPath)) {
    try {
      const sizing = JSON.parse(readFileSync(sizingPath, 'utf-8'))
      const projectSize = sizing.project_size
      if (projectSize && ['XS', 'S', 'M', 'L', 'XL'].includes(projectSize)) {
        const seedingStatePath = join(projectDir, 'seeding-state.json')
        if (existsSync(seedingStatePath)) {
          const seedingState = JSON.parse(readFileSync(seedingStatePath, 'utf-8'))
          const completed = new Set(seedingState.disciplines_complete || [])

          // Inline tier mapping (can't import from src/launcher in dashboard)
          const DISCIPLINE_TIERS: Record<string, string> = {
            brainstorming: 'XS',
            competition: 'M',
            taste: 'XS',
            sizing: 'XS',
            spec: 'XS',
            infrastructure: 'S',
            design: 'S',
            'legal-privacy': 'S',
            marketing: 'M',
          }
          const TIER_ORDER = ['XS', 'S', 'M', 'L', 'XL']
          const sizeIndex = TIER_ORDER.indexOf(projectSize)

          if (sizeIndex !== -1) {
            const applicable = Object.entries(DISCIPLINE_TIERS)
              .filter(([_, tier]) => TIER_ORDER.indexOf(tier) <= sizeIndex)
              .map(([discipline]) => discipline)

            const missingDisciplines = applicable.filter(d => !completed.has(d))
            if (missingDisciplines.length > 0) {
              missing.push(
                `disciplines: ${missingDisciplines.join(', ')} ` +
                `(required for ${projectSize}-tier, only ${[...completed].join(', ')} completed)`
              )
            }
          }
        }
      }
    } catch (err) {
      // sizing.json malformed — artifact check already caught it
    }
  }

  if (missing.length > 0) {
    return { ok: false, missingArtifacts: missing }
  }

  // All artifacts present — promote state to ready so the build loop
  // can pick it up when the human triggers it. Locked because
  // build-runner's transition can hit this file concurrently.
  const statePath = resolveStatePath(projectDir)
  if (existsSync(statePath)) {
    await withStateLock(projectDir, async () => {
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
      await writeStateJson(projectDir, state)
    })
  }

  return { ok: true }
}
