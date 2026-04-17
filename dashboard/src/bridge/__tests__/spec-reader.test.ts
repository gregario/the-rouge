import { describe, it, expect } from 'vitest'
import { readProjectSpec } from '../spec-reader'
import { homedir } from 'os'
import { existsSync } from 'fs'
import { join } from 'path'

// Exercises the reader against the real mtgordle project (migrated out
// of the repo in #143). Skip gracefully if the user hasn't run the
// migration so a fresh clone doesn't fail.
const MTGORDLE = join(homedir(), '.rouge', 'projects', 'mtgordle')
const withMtgordle = existsSync(MTGORDLE) ? it : it.skip

describe('readProjectSpec', () => {
  withMtgordle('reads vision and milestones for mtgordle', () => {
    const spec = readProjectSpec(MTGORDLE)
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
