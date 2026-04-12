import { resolve } from 'path'
import { describe, it, expect } from 'vitest'
import { readProjectSpec } from '../spec-reader'
import { join } from 'path'

const PROJECTS_ROOT = resolve(__dirname, '../../../../projects')

describe('readProjectSpec', () => {
  it('reads vision and milestones for mtgordle', () => {
    const spec = readProjectSpec(join(PROJECTS_ROOT, 'mtgordle'))
    expect(spec.hasVision).toBe(true)
    expect(spec.hasMilestones).toBe(true)
    expect(spec.vision?.name).toBeDefined()
    expect(spec.milestones!.length).toBeGreaterThan(0)
  })

  it('returns empty spec for nonexistent project', () => {
    const spec = readProjectSpec('/nonexistent/path/to/project')
    expect(spec.hasVision).toBe(false)
    expect(spec.hasMilestones).toBe(false)
  })
})
