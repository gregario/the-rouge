import { describe, it, expect } from 'vitest'
import {
  validateSizing,
  validateVision,
  validateInfraManifest,
  validateTaskLedger,
  validateProductStandard,
  validateMilestones,
} from '../artifact-schemas'

describe('validateSizing', () => {
  const valid = {
    schema_version: 'sizing-v1',
    project_size: 'M',
    signals: { entity_count: 5, integration_count: 3, role_count: 2, journey_count: 5, screen_count: 7 },
    reasoning: 'Classified M: driven by entity_count=5',
    classifier_version: 'bridge-v1',
    classified_at: '2026-05-03T00:00:00Z',
    decided_by: 'auto-classifier',
    human_override: null,
  }

  it('accepts valid sizing artifact', () => {
    expect(validateSizing(valid).ok).toBe(true)
  })

  it('rejects null', () => {
    expect(validateSizing(null).ok).toBe(false)
  })

  it('rejects invalid project_size', () => {
    const r = validateSizing({ ...valid, project_size: 'HUGE' })
    expect(r.ok).toBe(false)
    expect(r.errors[0].field).toBe('project_size')
  })

  it('rejects missing signals', () => {
    const { signals: _, ...rest } = valid
    const r = validateSizing(rest)
    expect(r.ok).toBe(false)
  })

  it('rejects non-integer signal value', () => {
    const r = validateSizing({ ...valid, signals: { ...valid.signals, entity_count: 1.5 } })
    expect(r.ok).toBe(false)
    expect(r.errors[0].field).toBe('signals.entity_count')
  })

  it('rejects negative signal value', () => {
    const r = validateSizing({ ...valid, signals: { ...valid.signals, role_count: -1 } })
    expect(r.ok).toBe(false)
  })

  it('rejects missing reasoning', () => {
    const { reasoning: _, ...rest } = valid
    const r = validateSizing(rest)
    expect(r.ok).toBe(false)
  })
})

describe('validateVision', () => {
  it('accepts vision with flat string persona', () => {
    const r = validateVision({
      product_name: 'HighLow',
      one_liner: 'A card game for two',
      persona: 'casual gamers who want quick fun',
    })
    expect(r.ok).toBe(true)
  })

  it('accepts vision with object persona', () => {
    const r = validateVision({
      product_name: 'HighLow',
      one_liner: 'A card game',
      persona: { who: 'casual gamers', context: 'mobile-first' },
    })
    expect(r.ok).toBe(true)
  })

  it('rejects missing product_name', () => {
    const r = validateVision({ one_liner: 'test', persona: 'test' })
    expect(r.ok).toBe(false)
    expect(r.errors[0].field).toBe('product_name')
  })

  it('rejects missing persona', () => {
    const r = validateVision({ product_name: 'X', one_liner: 'Y' })
    expect(r.ok).toBe(false)
    expect(r.errors.some(e => e.field === 'persona')).toBe(true)
  })

  it('rejects null persona', () => {
    const r = validateVision({ product_name: 'X', one_liner: 'Y', persona: null })
    expect(r.ok).toBe(false)
  })
})

describe('validateInfraManifest', () => {
  it('accepts manifest with deploy target', () => {
    const r = validateInfraManifest({ deploy: { target: 'vercel' }, database: null })
    expect(r.ok).toBe(true)
  })

  it('accepts stub manifests', () => {
    const r = validateInfraManifest({ stub: true, deploy: { target: 'vercel' } })
    expect(r.ok).toBe(true)
  })

  it('rejects manifest without deploy object', () => {
    const r = validateInfraManifest({ database: null })
    expect(r.ok).toBe(false)
    expect(r.errors[0].field).toBe('deploy')
  })

  it('rejects manifest with empty deploy.target', () => {
    const r = validateInfraManifest({ deploy: { target: '' } })
    expect(r.ok).toBe(false)
    expect(r.errors[0].field).toBe('deploy.target')
  })
})

describe('validateTaskLedger', () => {
  it('accepts ledger with milestones and stories', () => {
    const r = validateTaskLedger({
      milestones: [{
        name: 'Foundation',
        stories: [{ id: 'f-1', name: 'Scaffold', status: 'pending' }],
      }],
    })
    expect(r.ok).toBe(true)
  })

  it('rejects missing milestones', () => {
    const r = validateTaskLedger({})
    expect(r.ok).toBe(false)
  })

  it('rejects story missing id', () => {
    const r = validateTaskLedger({
      milestones: [{
        name: 'M1',
        stories: [{ name: 'no id', status: 'pending' }],
      }],
    })
    expect(r.ok).toBe(false)
    expect(r.errors.some(e => e.field.includes('id'))).toBe(true)
  })

  it('rejects story missing status', () => {
    const r = validateTaskLedger({
      milestones: [{
        name: 'M1',
        stories: [{ id: 's-1', name: 'no status' }],
      }],
    })
    expect(r.ok).toBe(false)
  })
})

describe('validateProductStandard', () => {
  it('accepts auto-generated standard', () => {
    const r = validateProductStandard({
      schema_version: 'product-standard-v1',
      generated: true,
      heuristics: [{ id: 'h-1', rule: 'test' }],
    })
    expect(r.ok).toBe(true)
  })

  it('rejects empty object', () => {
    expect(validateProductStandard({}).ok).toBe(false)
  })

  it('rejects non-object', () => {
    expect(validateProductStandard('string').ok).toBe(false)
    expect(validateProductStandard(null).ok).toBe(false)
  })
})

describe('validateMilestones', () => {
  it('accepts milestones with at least one entry', () => {
    const r = validateMilestones({
      milestones: [{
        name: 'MVP',
        stories: [{ id: 's-1', name: 'Story', status: 'pending' }],
      }],
    })
    expect(r.ok).toBe(true)
  })

  it('rejects empty milestones array', () => {
    const r = validateMilestones({ milestones: [] })
    expect(r.ok).toBe(false)
  })

  it('rejects milestone without name', () => {
    const r = validateMilestones({
      milestones: [{ stories: [] }],
    })
    expect(r.ok).toBe(false)
    expect(r.errors.some(e => e.field.includes('name'))).toBe(true)
  })

  it('rejects milestone without stories array', () => {
    const r = validateMilestones({
      milestones: [{ name: 'M1' }],
    })
    expect(r.ok).toBe(false)
    expect(r.errors.some(e => e.field.includes('stories'))).toBe(true)
  })
})
