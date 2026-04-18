import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { readStoryEnrichment } from '../story-enrichment-reader'

let dir: string

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('readStoryEnrichment', () => {
  it('maps acceptance_criteria from cycle_context.implemented into enrichment', () => {
    dir = mkdtempSync(join(tmpdir(), 'enrich-'))
    writeFileSync(
      join(dir, 'cycle_context.json'),
      JSON.stringify({
        implemented: [
          {
            story_id: 'S1.1',
            details: 'built login',
            acceptance_criteria: [
              'User can sign in with email + password',
              'Invalid credentials show inline error',
            ],
            files_changed: ['src/login.ts'],
            tests_added: 4,
            tests_passing: 4,
          },
        ],
      }),
    )
    const e = readStoryEnrichment(dir)
    expect(e['S1.1']).toBeDefined()
    expect(e['S1.1'].acceptanceCriteria).toEqual([
      'User can sign in with email + password',
      'Invalid credentials show inline error',
    ])
  })

  it('falls back to task_ledger.json for stories that have not completed a cycle', () => {
    dir = mkdtempSync(join(tmpdir(), 'enrich-'))
    // No cycle_context (pre-build). Task ledger has the decomposition.
    writeFileSync(
      join(dir, 'cycle_context.json'),
      JSON.stringify({ implemented: [] }),
    )
    writeFileSync(
      join(dir, 'task_ledger.json'),
      JSON.stringify({
        milestones: [
          {
            id: 'M1',
            name: 'Foundation',
            stories: [
              {
                id: 'S1.1',
                name: 'Admin auth',
                acceptance_criteria: ['password hashed with argon2id'],
              },
              {
                id: 'S1.2',
                name: 'Sessions',
                acceptance_criteria: ['session cookie lasts 30 days'],
              },
            ],
          },
        ],
      }),
    )
    const e = readStoryEnrichment(dir)
    expect(e['S1.1']?.acceptanceCriteria).toEqual(['password hashed with argon2id'])
    expect(e['S1.2']?.acceptanceCriteria).toEqual(['session cookie lasts 30 days'])
  })

  it('cycle_context wins over task_ledger when both have AC', () => {
    dir = mkdtempSync(join(tmpdir(), 'enrich-'))
    writeFileSync(
      join(dir, 'cycle_context.json'),
      JSON.stringify({
        implemented: [
          {
            story_id: 'S1.1',
            acceptance_criteria: ['refined AC from cycle'],
            files_changed: [],
          },
        ],
      }),
    )
    writeFileSync(
      join(dir, 'task_ledger.json'),
      JSON.stringify({
        milestones: [
          {
            stories: [
              { id: 'S1.1', acceptance_criteria: ['original AC from spec'] },
            ],
          },
        ],
      }),
    )
    const e = readStoryEnrichment(dir)
    // The more-recently-refined cycle_context AC takes precedence
    // because it reflects what was actually implemented.
    expect(e['S1.1']?.acceptanceCriteria).toEqual(['refined AC from cycle'])
  })
})
