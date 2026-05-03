import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, renameSync } from 'fs'
import { join } from 'path'
import { statePath as resolveStatePath, writeStateJson } from './state-path'
import { withStateLock } from './state-lock'
import { validateTierCompletion } from './tier-registry'

export interface FinalizeResult {
  ok: boolean
  missingArtifacts?: string[]
}

// ─── Foundation story types ─────────────────────────────────────────

interface FoundationStory {
  id: string
  name: string
  status: 'pending'
  foundation: true
  acceptance_criteria: string[]
  depends_on: string[]
}

interface InfraManifest {
  deploy?: { target?: string }
  database?: { provider?: string | null } | null
  auth?: { strategy?: string | null; provider?: string | null } | null
  integrations?: Array<{ name: string } | string>
}

/**
 * Deterministically generate foundation stories based on project tier
 * and infrastructure decisions from seeding.
 *
 * Tier gates:
 *   XS: 2 stories (scaffold + deploy)
 *   S:  5 stories (+ database, auth, ui-shell)
 *   M:  7+ stories (+ per-integration, fixtures)
 *   L+: 10+ stories (+ observability, performance, security)
 */
export function generateFoundationStories(projectDir: string): FoundationStory[] {
  const manifest: InfraManifest = (() => {
    try { return JSON.parse(readFileSync(join(projectDir, 'infrastructure_manifest.json'), 'utf-8')) } catch { return {} }
  })()
  const vision: { entities?: unknown[] } = (() => {
    try { return JSON.parse(readFileSync(join(projectDir, 'vision.json'), 'utf-8')) } catch { return {} }
  })()
  const sizing: { project_size?: string } = (() => {
    try { return JSON.parse(readFileSync(join(projectDir, 'seed_spec', 'sizing.json'), 'utf-8')) } catch { return {} }
  })()
  const size = sizing.project_size || 'M'

  const stories: FoundationStory[] = []

  // Always: scaffold
  stories.push({
    id: 'f-scaffold',
    name: 'Project scaffold',
    status: 'pending',
    foundation: true,
    acceptance_criteria: [
      'Framework initialized with correct config',
      'All dependencies installed',
      'Dev server starts without errors',
      'Production build succeeds',
    ],
    depends_on: [],
  })

  // S+: database
  if (['S', 'M', 'L', 'XL'].includes(size) && manifest.database && manifest.database.provider) {
    const entityCount = Array.isArray(vision.entities) ? vision.entities.length : 0
    stories.push({
      id: 'f-database',
      name: `Database setup (${manifest.database.provider}, ${entityCount} entities)`,
      status: 'pending',
      foundation: true,
      acceptance_criteria: [
        'Schema covers all entities from vision (2+ feature area references)',
        'Foreign keys and indexes defined',
        'Migrations run cleanly on fresh database',
        'Seed data realistic and domain-appropriate',
        `Entity count: ${entityCount}`,
      ],
      depends_on: ['f-scaffold'],
    })
  }

  // S+: auth
  if (['S', 'M', 'L', 'XL'].includes(size) && manifest.auth && manifest.auth.strategy) {
    stories.push({
      id: 'f-auth',
      name: `Auth flows (${manifest.auth.strategy})`,
      status: 'pending',
      foundation: true,
      acceptance_criteria: [
        'Registration creates user and returns session',
        'Login authenticates and returns session',
        'Logout destroys session',
        'Protected routes reject unauthenticated requests',
        'Session persistence works across page refresh',
      ],
      depends_on: ['f-scaffold', ...(manifest.database?.provider ? ['f-database'] : [])],
    })
  }

  // M+: per-integration stories
  if (['M', 'L', 'XL'].includes(size) && Array.isArray(manifest.integrations)) {
    for (const integration of manifest.integrations) {
      const name = typeof integration === 'string' ? integration : integration.name
      stories.push({
        id: `f-integration-${name}`,
        name: `Integration: ${name}`,
        status: 'pending',
        foundation: true,
        acceptance_criteria: [
          'Client wrapper exists with TypeScript types',
          'Error handling covers timeouts, rate limits, auth failures',
          'Environment variables referenced, never hardcoded',
          'Test stubs exist and pass',
          'Setup documented in README',
        ],
        depends_on: ['f-scaffold'],
      })
    }
  }

  // S+: UI shell (skip for API-only projects)
  if (['S', 'M', 'L', 'XL'].includes(size) && manifest.deploy?.target !== 'api-only') {
    stories.push({
      id: 'f-ui-shell',
      name: 'App shell + navigation',
      status: 'pending',
      foundation: true,
      acceptance_criteria: [
        'App shell renders without errors',
        'Navigation includes links for all feature areas',
        'Theme tokens applied consistently',
        'Error boundaries catch and display errors',
        'Loading states exist for async operations',
      ],
      depends_on: ['f-scaffold'],
    })
  }

  // M+: fixtures
  if (['M', 'L', 'XL'].includes(size)) {
    stories.push({
      id: 'f-fixtures',
      name: 'Test fixtures + seed data',
      status: 'pending',
      foundation: true,
      acceptance_criteria: [
        'Seed data for every entity in schema',
        'Data is realistic (domain-appropriate names, values, dates)',
        'Data generators produce consistent output',
        'Fixtures importable by feature tests',
      ],
      depends_on: ['f-database'],
    })
  }

  // Always: deploy (depends on all previous stories)
  stories.push({
    id: 'f-deploy',
    name: `Staging deploy (${manifest.deploy?.target || 'auto'})`,
    status: 'pending',
    foundation: true,
    acceptance_criteria: [
      'Deploy to staging succeeds',
      'Staging URL accessible',
      'Health check endpoint returns 200 (or index.html exists for static)',
      'Environment variables documented',
    ],
    depends_on: stories.filter(s => s.id !== 'f-deploy').map(s => s.id),
  })

  // L+: observability, performance, security
  if (['L', 'XL'].includes(size)) {
    stories.push(
      {
        id: 'f-observability',
        name: 'Logging + monitoring',
        status: 'pending',
        foundation: true,
        acceptance_criteria: [
          'Structured logging (JSON) on all API routes',
          'Error reporting integration configured',
          'Health dashboard accessible',
        ],
        depends_on: ['f-scaffold', 'f-deploy'],
      },
      {
        id: 'f-performance',
        name: 'Performance baselines',
        status: 'pending',
        foundation: true,
        acceptance_criteria: [
          'Lighthouse scores captured (baseline)',
          'Bundle size tracked',
          'Database query performance benchmarked',
        ],
        depends_on: ['f-deploy'],
      },
      {
        id: 'f-security',
        name: 'Security hardening',
        status: 'pending',
        foundation: true,
        acceptance_criteria: [
          'CORS configured correctly',
          'CSP headers set',
          'Rate limiting on auth endpoints',
          'Input sanitization on user-facing forms',
        ],
        depends_on: ['f-scaffold', ...(manifest.auth?.strategy ? ['f-auth'] : [])],
      },
    )
  }

  return stories
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
  // completion when only 1/7 disciplines ran. Now delegated to the shared
  // tier-registry module — single source of truth for tier mappings.
  const tierCheck = validateTierCompletion(projectDir)
  if (!tierCheck.ok) {
    missing.push(
      `disciplines: ${tierCheck.missing.join(', ')} ` +
      `(required for ${tierCheck.tier}-tier, only ${tierCheck.completed.join(', ') || 'none'} completed)`
    )
  }

  if (missing.length > 0) {
    return { ok: false, missingArtifacts: missing }
  }

  // ── Foundation stories: generate and prepend as milestone[0] ──────
  //
  // Foundation stories turn the previously-unstructured foundation phase
  // into a set of discrete, trackable stories that run through the same
  // story-building loop as feature stories. The Foundation milestone is
  // always milestone[0]; feature milestones from seeding become [1]+.
  //
  // Idempotent: if task_ledger already has a Foundation milestone, skip.
  const ledgerPath = join(projectDir, 'task_ledger.json')
  if (existsSync(ledgerPath)) {
    try {
      const ledger = JSON.parse(readFileSync(ledgerPath, 'utf-8'))
      const milestones: Array<{ name: string; status: string; stories: unknown[] }> =
        Array.isArray(ledger.milestones) ? ledger.milestones : []

      const hasFoundation = milestones.some(m => m.name === 'Foundation')
      if (!hasFoundation) {
        const foundationStories = generateFoundationStories(projectDir)
        if (foundationStories.length > 0) {
          const foundationMilestone = {
            name: 'Foundation',
            status: 'pending',
            stories: foundationStories,
          }
          // Prepend Foundation as milestone[0]
          ledger.milestones = [foundationMilestone, ...milestones]
          writeJsonAtomic(ledgerPath, ledger)
        }
      }
    } catch {
      // If task_ledger is malformed, the artifact check already handles it.
      // Don't let foundation story generation block finalization.
    }
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
