/**
 * Structural validators for seeding artifacts.
 *
 * Each validator checks that a parsed JSON object has the required keys
 * with correct types. They match what prompts ACTUALLY produce — not
 * aspirational schemas. No external dependencies (no ajv/zod).
 *
 * Used by discipline-artifacts.ts after the byte-count check passes,
 * and by seeding-finalize.ts for the finalization gate artifacts.
 */

// ─── Shared helpers ─────────────────────────────────────────────────

export interface SchemaError {
  field: string
  expected: string
  actual: string
}

export interface ValidationResult {
  ok: boolean
  errors: SchemaError[]
}

function ok(): ValidationResult {
  return { ok: true, errors: [] }
}

function fail(errors: SchemaError[]): ValidationResult {
  return { ok: false, errors }
}

function checkType(
  obj: Record<string, unknown>,
  field: string,
  type: 'string' | 'number' | 'boolean' | 'object' | 'array',
): SchemaError | null {
  const val = obj[field]
  if (val === undefined || val === null) {
    return { field, expected: type, actual: val === null ? 'null' : 'undefined' }
  }
  if (type === 'array') {
    if (!Array.isArray(val)) {
      return { field, expected: 'array', actual: typeof val }
    }
    return null
  }
  if (typeof val !== type) {
    return { field, expected: type, actual: typeof val }
  }
  return null
}

function checkEnum(
  obj: Record<string, unknown>,
  field: string,
  allowed: readonly string[],
): SchemaError | null {
  const val = obj[field]
  if (typeof val !== 'string' || !allowed.includes(val)) {
    return {
      field,
      expected: `one of [${allowed.join(', ')}]`,
      actual: String(val),
    }
  }
  return null
}

// ─── sizing.json ────────────────────────────────────────────────────

const TIER_VALUES = ['XS', 'S', 'M', 'L', 'XL'] as const
const SIGNAL_KEYS = [
  'entity_count', 'integration_count', 'role_count',
  'journey_count', 'screen_count',
] as const

export function validateSizing(data: unknown): ValidationResult {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return fail([{ field: '(root)', expected: 'object', actual: typeof data }])
  }
  const obj = data as Record<string, unknown>
  const errors: SchemaError[] = []

  const e1 = checkEnum(obj, 'project_size', TIER_VALUES)
  if (e1) errors.push(e1)

  const e2 = checkType(obj, 'signals', 'object')
  if (e2) {
    errors.push(e2)
  } else {
    const signals = obj.signals as Record<string, unknown>
    for (const key of SIGNAL_KEYS) {
      const val = signals[key]
      if (typeof val !== 'number' || !Number.isInteger(val) || val < 0) {
        errors.push({
          field: `signals.${key}`,
          expected: 'non-negative integer',
          actual: String(val),
        })
      }
    }
  }

  const e3 = checkType(obj, 'reasoning', 'string')
  if (e3) errors.push(e3)

  return errors.length > 0 ? fail(errors) : ok()
}

// ─── vision.json ────────────────────────────────────────────────────

export function validateVision(data: unknown): ValidationResult {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return fail([{ field: '(root)', expected: 'object', actual: typeof data }])
  }
  const obj = data as Record<string, unknown>
  const errors: SchemaError[] = []

  // product_name is the actual field name (not "name" as the old schema said)
  const e1 = checkType(obj, 'product_name', 'string')
  if (e1) errors.push(e1)

  const e2 = checkType(obj, 'one_liner', 'string')
  if (e2) errors.push(e2)

  // persona can be string or object — both are valid
  if (obj.persona === undefined || obj.persona === null) {
    errors.push({ field: 'persona', expected: 'string or object', actual: 'missing' })
  } else if (typeof obj.persona !== 'string' && typeof obj.persona !== 'object') {
    errors.push({ field: 'persona', expected: 'string or object', actual: typeof obj.persona })
  }

  return errors.length > 0 ? fail(errors) : ok()
}

// ─── infrastructure_manifest.json ───────────────────────────────────

export function validateInfraManifest(data: unknown): ValidationResult {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return fail([{ field: '(root)', expected: 'object', actual: typeof data }])
  }
  const obj = data as Record<string, unknown>

  // Stubs are valid — they're auto-generated for skipped disciplines
  if (obj.stub === true) return ok()

  // Non-stub manifests must have deploy.target
  const errors: SchemaError[] = []
  if (!obj.deploy || typeof obj.deploy !== 'object') {
    errors.push({ field: 'deploy', expected: 'object with target', actual: String(obj.deploy) })
  } else {
    const deploy = obj.deploy as Record<string, unknown>
    if (typeof deploy.target !== 'string' || deploy.target.length === 0) {
      errors.push({ field: 'deploy.target', expected: 'non-empty string', actual: String(deploy.target) })
    }
  }

  return errors.length > 0 ? fail(errors) : ok()
}

// ─── task_ledger.json ───────────────────────────────────────────────

export function validateTaskLedger(data: unknown): ValidationResult {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return fail([{ field: '(root)', expected: 'object', actual: typeof data }])
  }
  const obj = data as Record<string, unknown>
  const errors: SchemaError[] = []

  if (!Array.isArray(obj.milestones)) {
    errors.push({ field: 'milestones', expected: 'array', actual: typeof obj.milestones })
    return fail(errors)
  }

  for (let mi = 0; mi < obj.milestones.length; mi++) {
    const m = obj.milestones[mi] as Record<string, unknown>
    if (!m || typeof m !== 'object') {
      errors.push({ field: `milestones[${mi}]`, expected: 'object', actual: typeof m })
      continue
    }
    if (typeof m.name !== 'string') {
      errors.push({ field: `milestones[${mi}].name`, expected: 'string', actual: typeof m.name })
    }
    if (!Array.isArray(m.stories)) {
      errors.push({ field: `milestones[${mi}].stories`, expected: 'array', actual: typeof m.stories })
      continue
    }
    for (let si = 0; si < m.stories.length; si++) {
      const s = m.stories[si] as Record<string, unknown>
      if (!s || typeof s !== 'object') {
        errors.push({ field: `milestones[${mi}].stories[${si}]`, expected: 'object', actual: typeof s })
        continue
      }
      if (typeof s.id !== 'string') {
        errors.push({ field: `milestones[${mi}].stories[${si}].id`, expected: 'string', actual: typeof s.id })
      }
      if (typeof s.name !== 'string') {
        errors.push({ field: `milestones[${mi}].stories[${si}].name`, expected: 'string', actual: typeof s.name })
      }
      if (typeof s.status !== 'string') {
        errors.push({ field: `milestones[${mi}].stories[${si}].status`, expected: 'string', actual: typeof s.status })
      }
    }
  }

  return errors.length > 0 ? fail(errors) : ok()
}

// ─── product_standard.json ──────────────────────────────────────────

export function validateProductStandard(data: unknown): ValidationResult {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return fail([{ field: '(root)', expected: 'object', actual: typeof data }])
  }
  // Extremely permissive — this file is either auto-generated (has
  // `heuristics` array) or LLM-authored (free-form quality config).
  // We only check it parses as a non-empty object.
  const keys = Object.keys(data as Record<string, unknown>)
  if (keys.length === 0) {
    return fail([{ field: '(root)', expected: 'non-empty object', actual: 'empty object' }])
  }
  return ok()
}

// ─── seed_spec/milestones.json ──────────────────────────────────────

export function validateMilestones(data: unknown): ValidationResult {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return fail([{ field: '(root)', expected: 'object', actual: typeof data }])
  }
  const obj = data as Record<string, unknown>
  const errors: SchemaError[] = []

  if (!Array.isArray(obj.milestones)) {
    errors.push({ field: 'milestones', expected: 'array', actual: typeof obj.milestones })
    return fail(errors)
  }

  if (obj.milestones.length === 0) {
    errors.push({ field: 'milestones', expected: 'at least 1 milestone', actual: '0' })
    return fail(errors)
  }

  for (let mi = 0; mi < obj.milestones.length; mi++) {
    const m = obj.milestones[mi] as Record<string, unknown>
    if (!m || typeof m !== 'object') {
      errors.push({ field: `milestones[${mi}]`, expected: 'object', actual: typeof m })
      continue
    }
    if (typeof m.name !== 'string') {
      errors.push({ field: `milestones[${mi}].name`, expected: 'string', actual: typeof m.name })
    }
    if (!Array.isArray(m.stories)) {
      errors.push({ field: `milestones[${mi}].stories`, expected: 'array', actual: typeof m.stories })
    }
  }

  return errors.length > 0 ? fail(errors) : ok()
}

// ─── Registry ───────────────────────────────────────────────────────

export type ArtifactKind =
  | 'sizing'
  | 'vision'
  | 'infrastructure-manifest'
  | 'task-ledger'
  | 'product-standard'
  | 'milestones'

const VALIDATORS: Record<ArtifactKind, (data: unknown) => ValidationResult> = {
  'sizing': validateSizing,
  'vision': validateVision,
  'infrastructure-manifest': validateInfraManifest,
  'task-ledger': validateTaskLedger,
  'product-standard': validateProductStandard,
  'milestones': validateMilestones,
}

export function validateArtifact(kind: ArtifactKind, data: unknown): ValidationResult {
  return VALIDATORS[kind](data)
}
