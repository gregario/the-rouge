import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, renameSync } from 'fs'
import { join } from 'path'
import { statePath as resolveStatePath, writeStateJson } from './state-path'
import { withStateLock } from './state-lock'
import { validateTierCompletion } from './tier-registry'
import {
  validateVision,
  validateTaskLedger,
  validateProductStandard,
  type SchemaError,
} from './artifact-schemas'

export interface FinalizeResult {
  ok: boolean
  missingArtifacts?: string[]
  schemaErrors?: Array<{ artifact: string; errors: SchemaError[] }>
}

// ─── Foundation story types ─────────────────────────────────────────

interface FoundationStory {
  id: string
  name: string
  status: 'pending'
  foundation: true
  acceptance_criteria: string[]
  depends_on: string[]
  description: string
  feature_area: string
  affected_entities: string[]
  affected_screens: string[]
  po_checks: string[]
  env_limitations: string[]
}

interface InfraManifest {
  stub?: boolean
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

  function story(
    partial: Pick<FoundationStory, 'id' | 'name' | 'acceptance_criteria' | 'depends_on'>,
  ): FoundationStory {
    return {
      ...partial,
      status: 'pending',
      foundation: true,
      description: partial.name,
      feature_area: 'foundation',
      affected_entities: [],
      affected_screens: [],
      po_checks: partial.acceptance_criteria,
      env_limitations: [],
    }
  }

  // Always: scaffold
  stories.push(story({
    id: 'f-scaffold',
    name: 'Project scaffold',
    acceptance_criteria: [
      'Framework initialized with correct config',
      'All dependencies installed',
      'Dev server starts without errors',
      'Production build succeeds',
    ],
    depends_on: [],
  }))

  // S+: database
  if (['S', 'M', 'L', 'XL'].includes(size) && manifest.database && manifest.database.provider) {
    const entityCount = Array.isArray(vision.entities) ? vision.entities.length : 0
    stories.push(story({
      id: 'f-database',
      name: `Database setup (${manifest.database.provider}, ${entityCount} entities)`,
      acceptance_criteria: [
        'Schema covers all entities from vision (2+ feature area references)',
        'Foreign keys and indexes defined',
        'Migrations run cleanly on fresh database',
        'Seed data realistic and domain-appropriate',
        `Entity count: ${entityCount}`,
      ],
      depends_on: ['f-scaffold'],
    }))
  }

  // S+: auth
  if (['S', 'M', 'L', 'XL'].includes(size) && manifest.auth && manifest.auth.strategy) {
    stories.push(story({
      id: 'f-auth',
      name: `Auth flows (${manifest.auth.strategy})`,
      acceptance_criteria: [
        'Registration creates user and returns session',
        'Login authenticates and returns session',
        'Logout destroys session',
        'Protected routes reject unauthenticated requests',
        'Session persistence works across page refresh',
      ],
      depends_on: ['f-scaffold', ...(manifest.database?.provider ? ['f-database'] : [])],
    }))
  }

  // M+: per-integration stories
  if (['M', 'L', 'XL'].includes(size) && Array.isArray(manifest.integrations)) {
    for (const integration of manifest.integrations) {
      const name = typeof integration === 'string' ? integration : integration.name
      stories.push(story({
        id: `f-integration-${name}`,
        name: `Integration: ${name}`,
        acceptance_criteria: [
          'Client wrapper exists with TypeScript types',
          'Error handling covers timeouts, rate limits, auth failures',
          'Environment variables referenced, never hardcoded',
          'Test stubs exist and pass',
          'Setup documented in README',
        ],
        depends_on: ['f-scaffold'],
      }))
    }
  }

  // S+: UI shell (skip for API-only projects)
  if (['S', 'M', 'L', 'XL'].includes(size) && manifest.deploy?.target !== 'api-only') {
    stories.push(story({
      id: 'f-ui-shell',
      name: 'App shell + navigation',
      acceptance_criteria: [
        'App shell renders without errors',
        'Navigation includes links for all feature areas',
        'Theme tokens applied consistently',
        'Error boundaries catch and display errors',
        'Loading states exist for async operations',
      ],
      depends_on: ['f-scaffold'],
    }))
  }

  // M+: fixtures
  if (['M', 'L', 'XL'].includes(size)) {
    stories.push(story({
      id: 'f-fixtures',
      name: 'Test fixtures + seed data',
      acceptance_criteria: [
        'Seed data for every entity in schema',
        'Data is realistic (domain-appropriate names, values, dates)',
        'Data generators produce consistent output',
        'Fixtures importable by feature tests',
      ],
      depends_on: ['f-database'],
    }))
  }

  // Always: deploy (depends on all previous stories)
  stories.push(story({
    id: 'f-deploy',
    name: `Staging deploy (${manifest.deploy?.target || 'auto'})`,
    acceptance_criteria: [
      'Deploy to staging succeeds',
      'Staging URL accessible',
      'Health check endpoint returns 200 (or index.html exists for static)',
      'Environment variables documented',
    ],
    depends_on: stories.filter(s => s.id !== 'f-deploy').map(s => s.id),
  }))

  // L+: observability, performance, security
  if (['L', 'XL'].includes(size)) {
    stories.push(
      story({
        id: 'f-observability',
        name: 'Logging + monitoring',
        acceptance_criteria: [
          'Structured logging (JSON) on all API routes',
          'Error reporting integration configured',
          'Health dashboard accessible',
        ],
        depends_on: ['f-scaffold', 'f-deploy'],
      }),
      story({
        id: 'f-performance',
        name: 'Performance baselines',
        acceptance_criteria: [
          'Lighthouse scores captured (baseline)',
          'Bundle size tracked',
          'Database query performance benchmarked',
        ],
        depends_on: ['f-deploy'],
      }),
      story({
        id: 'f-security',
        name: 'Security hardening',
        acceptance_criteria: [
          'CORS configured correctly',
          'CSP headers set',
          'Rate limiting on auth endpoints',
          'Input sanitization on user-facing forms',
        ],
        depends_on: ['f-scaffold', ...(manifest.auth?.strategy ? ['f-auth'] : [])],
      }),
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

function validateJsonArtifact(
  filePath: string,
  validator: (data: unknown) => { ok: boolean; errors: SchemaError[] },
): SchemaError[] | null {
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8'))
    const result = validator(data)
    return result.ok ? null : result.errors
  } catch {
    return [{ field: '(root)', expected: 'valid JSON', actual: 'parse error' }]
  }
}

/**
 * Generate product_standard.json from library defaults if it doesn't exist.
 * This file captures quality heuristics the Factory uses during evaluation.
 * No discipline prompt writes it — it's a mechanical merge of global
 * heuristics from `library/global/`.
 */
function ensureProductStandard(projectDir: string): void {
  const standardPath = join(projectDir, 'product_standard.json')
  if (existsSync(standardPath)) return

  const libraryPaths = [
    join(process.cwd(), 'library/global'),
    join(process.cwd(), '../library/global'),
  ]
  let libraryDir: string | null = null
  for (const p of libraryPaths) {
    if (existsSync(p)) { libraryDir = p; break }
  }
  if (!libraryDir) return

  const heuristics: unknown[] = []
  for (const file of readdirSync(libraryDir).filter(f => f.endsWith('.json'))) {
    try {
      heuristics.push(JSON.parse(readFileSync(join(libraryDir, file), 'utf-8')))
    } catch { /* skip malformed */ }
  }

  if (heuristics.length === 0) return

  writeJsonAtomic(standardPath, {
    schema_version: 'product-standard-v1',
    generated: true,
    generated_at: new Date().toISOString(),
    source: 'library/global',
    heuristics,
  })
}

/**
 * Generate vision.json from existing discipline artifacts if it doesn't exist.
 * Assembles from brainstorming (product name, persona, problem), taste
 * (scope), sizing (project_size), and infrastructure manifest (deploy target).
 */
function ensureVision(projectDir: string): void {
  const visionPath = join(projectDir, 'vision.json')
  if (existsSync(visionPath) && statSync(visionPath).size >= 200) return

  // Read brainstorming artifact for product identity
  let productName = 'Untitled'
  let oneLiner = ''
  let persona = ''
  let problem = ''
  for (const candidate of ['seed_spec/brainstorming.md', 'seed_spec/brainstorming-design-doc.md', 'docs/brainstorming.md']) {
    const p = join(projectDir, candidate)
    if (!existsSync(p)) continue
    try {
      const text = readFileSync(p, 'utf-8')
      // Extract product name from first H1: "# Product Name — subtitle"
      const h1 = text.match(/^#\s+(.+)/m)
      if (h1) {
        const parts = h1[1].split(/\s*[—–-]\s*/)
        productName = parts[0].trim()
        if (parts[1]) oneLiner = parts[1].trim()
      }
      // Extract persona from "## The User" or "**Persona:**" sections
      const personaMatch = text.match(/(?:##\s*The User|Persona)[:\s]*\n+\*\*(.+?)\*\*/)
        ?? text.match(/Persona[:\s]+(.+?)(?:\n|$)/i)
      if (personaMatch) persona = personaMatch[1].trim()
      // Extract problem from "## The Problem" section
      const problemMatch = text.match(/##\s*The Problem\s*\n+([\s\S]*?)(?=\n##|\n$)/i)
      if (problemMatch) problem = problemMatch[1].trim().split('\n')[0]
      break
    } catch { /* try next */ }
  }

  // Read taste for scope
  let scope: { in: string[]; out: string[]; deferred: string[] } | undefined
  for (const candidate of ['seed_spec/taste.md', 'seed_spec/taste_verdict.md']) {
    const p = join(projectDir, candidate)
    if (!existsSync(p)) continue
    try {
      const text = readFileSync(p, 'utf-8')
      const jsonMatch = text.match(/```json\s*([\s\S]*?)```/)
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[1])
        const brief = data.sharpened_brief
        if (brief) {
          scope = {
            in: Array.isArray(brief.scope_in) ? brief.scope_in : [],
            out: Array.isArray(brief.scope_out) ? brief.scope_out : [],
            deferred: Array.isArray(brief.scope_deferred) ? brief.scope_deferred : [],
          }
          if (brief.one_liner) oneLiner = brief.one_liner
          if (brief.persona) persona = brief.persona
          if (brief.problem) problem = brief.problem
        }
      }
      break
    } catch { /* try next */ }
  }

  // Read sizing for project_size
  let projectSize: string | undefined
  try {
    const sizing = JSON.parse(readFileSync(join(projectDir, 'seed_spec/sizing.json'), 'utf-8'))
    projectSize = sizing.project_size
  } catch { /* no sizing */ }

  // Read infrastructure manifest
  let infrastructure: Record<string, unknown> = {}
  try {
    const manifest = JSON.parse(readFileSync(join(projectDir, 'infrastructure_manifest.json'), 'utf-8'))
    infrastructure = {
      deployment_target: manifest.deploy?.target,
      needs_database: !!(manifest.database?.provider && manifest.database.provider !== 'none'),
      needs_auth: !!(manifest.auth?.strategy && manifest.auth.strategy !== 'none'),
    }
  } catch { /* no manifest */ }

  const vision: Record<string, unknown> = {
    product_name: productName,
    one_liner: oneLiner || `${productName} — a ${projectSize ?? 'small'} project`,
    persona: persona || 'users',
    problem: problem || '',
    infrastructure,
    generated: true,
    generated_at: new Date().toISOString(),
  }
  if (scope) vision.scope = scope
  if (projectSize) {
    vision.complexity_profile = {
      primary: projectSize === 'XS' ? 'single-page' : 'multi-route',
    }
  }

  writeJsonAtomic(visionPath, vision)
}

/**
 * Generate task_ledger.json from seed_spec/milestones.json if it doesn't exist.
 * The milestones file is schema-validated by the spec discipline's artifact
 * check, so by the time finalization runs it's guaranteed to be well-formed.
 */
function ensureTaskLedger(projectDir: string): void {
  const ledgerPath = join(projectDir, 'task_ledger.json')
  if (existsSync(ledgerPath)) return

  // Read milestones.json — the source of truth for story structure
  const milestonesPath = join(projectDir, 'seed_spec/milestones.json')
  if (!existsSync(milestonesPath)) return
  let milestones: unknown[]
  try {
    const data = JSON.parse(readFileSync(milestonesPath, 'utf-8'))
    milestones = Array.isArray(data.milestones) ? data.milestones : []
  } catch {
    return
  }
  if (milestones.length === 0) return

  // Read project name from brainstorming
  let projectName = 'untitled'
  for (const candidate of ['seed_spec/brainstorming.md', 'seed_spec/brainstorming-design-doc.md']) {
    const p = join(projectDir, candidate)
    if (!existsSync(p)) continue
    try {
      const h1 = readFileSync(p, 'utf-8').match(/^#\s+(.+)/m)
      if (h1) {
        projectName = h1[1].split(/\s*[—–-]\s*/)[0].trim()
      }
      break
    } catch { /* try next */ }
  }

  writeJsonAtomic(ledgerPath, {
    project: projectName,
    seeded_at: new Date().toISOString(),
    seeded_by: 'bridge',
    milestones,
  })
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
 * The manifest is the canonical source for these fields. This mirror
 * OVERWRITES vision/ctx values so they always match the manifest.
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

  const needsDatabase = !!(manifest.database && manifest.database.provider && manifest.database.provider !== 'none')
  const needsAuth = !!(manifest.auth && manifest.auth.strategy && manifest.auth.strategy !== 'none')

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
      const prev = { ...infra }
      infra.deployment_target = target
      infra.needs_database = needsDatabase
      infra.needs_auth = needsAuth
      if (infra.deployment_target !== prev.deployment_target ||
          infra.needs_database !== prev.needs_database ||
          infra.needs_auth !== prev.needs_auth) {
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
      const prev = { ...infra }
      infra.deployment_target = target
      infra.needs_database = needsDatabase
      infra.needs_auth = needsAuth
      if (infra.deployment_target !== prev.deployment_target ||
          infra.needs_database !== prev.needs_database ||
          infra.needs_auth !== prev.needs_auth) {
        ctx.vision.infrastructure = infra
        writeJsonAtomic(ctxPath, ctx)
      }
    } catch {
      // malformed cycle_context.json — skip; rouge-loop has its own repair.
    }
  }
}

export async function finalizeSeeding(projectDir: string): Promise<FinalizeResult> {
  // Generate missing artifacts from existing discipline outputs.
  // These run before the artifact check so the check validates them.
  ensureVision(projectDir)
  ensureTaskLedger(projectDir)
  ensureProductStandard(projectDir)

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

  // ── Schema validation: all required files exist, now check structure ──
  const schemaErrors: Array<{ artifact: string; errors: SchemaError[] }> = []

  const visionCheck = validateJsonArtifact(join(projectDir, 'vision.json'), validateVision)
  if (visionCheck) schemaErrors.push({ artifact: 'vision.json', errors: visionCheck })

  const ledgerCheck = validateJsonArtifact(join(projectDir, 'task_ledger.json'), validateTaskLedger)
  if (ledgerCheck) schemaErrors.push({ artifact: 'task_ledger.json', errors: ledgerCheck })

  const stdCheck = validateJsonArtifact(join(projectDir, 'product_standard.json'), validateProductStandard)
  if (stdCheck) schemaErrors.push({ artifact: 'product_standard.json', errors: stdCheck })

  if (schemaErrors.length > 0) {
    const summaries = schemaErrors.map((e) =>
      `${e.artifact}: ${e.errors.map((x) => `${x.field} expected ${x.expected}, got ${x.actual}`).join('; ')}`,
    )
    return { ok: false, missingArtifacts: summaries, schemaErrors }
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

      // Copy milestones from task_ledger.json into state.json. The build
      // loop reads task_ledger.json, but the dashboard reads state.json
      // for the milestone timeline UI. Without this, state.milestones
      // stays empty and the build escalates with "no milestones in state."
      if (!state.milestones || state.milestones.length === 0) {
        const lp = join(projectDir, 'task_ledger.json')
        if (existsSync(lp)) {
          try {
            const ledger = JSON.parse(readFileSync(lp, 'utf-8'))
            if (Array.isArray(ledger.milestones) && ledger.milestones.length > 0) {
              state.milestones = ledger.milestones.map((m: { name: string; status?: string; stories?: unknown[] }) => ({
                name: m.name,
                status: m.status ?? 'pending',
                stories: Array.isArray(m.stories) ? m.stories : [],
              }))
            }
          } catch { /* malformed ledger — milestones stay empty, build will escalate */ }
        }
      }

      // Initialize the foundation field.
      if (!state.foundation) {
        state.foundation = { status: 'pending' }
      }
      await writeStateJson(projectDir, state)
    })
  }

  // Commit all state files to the project's git repo so they survive
  // git clean / git checkout operations by the build loop. Without this,
  // the build loop's foundation scaffold can wipe untracked files.
  try {
    const { execSync } = require('child_process')
    const gitOpts = { cwd: projectDir, stdio: 'pipe', timeout: 15000 }
    // Init git if not already a repo
    if (!existsSync(join(projectDir, '.git'))) {
      execSync('git init', gitOpts)
    }
    // Add all state/seeding artifacts
    const filesToTrack = [
      '.rouge/state.json',
      'vision.json',
      'task_ledger.json',
      'product_standard.json',
      'seeding-state.json',
      'seed_spec/',
      'infrastructure_manifest.json',
    ]
    for (const f of filesToTrack) {
      if (existsSync(join(projectDir, f))) {
        execSync(`git add "${f}"`, gitOpts)
      }
    }
    execSync('git commit -m "rouge: seeding complete — state artifacts committed" --allow-empty', gitOpts)
  } catch {
    // Non-fatal — state files might already be tracked, or git might
    // not be available. The project still works without this commit.
  }

  return { ok: true }
}
