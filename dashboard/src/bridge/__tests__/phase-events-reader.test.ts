import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { readPhaseEvents, EVENTS_FILENAME } from '../phase-events-reader'

describe('readPhaseEvents', () => {
  let projectDir: string

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'rouge-phase-events-'))
  })

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true })
  })

  it('returns exists:false when file is missing', () => {
    const r = readPhaseEvents(projectDir, 50)
    expect(r.exists).toBe(false)
    expect(r.events).toEqual([])
  })

  it('parses JSONL and preserves order', () => {
    writeFileSync(
      join(projectDir, EVENTS_FILENAME),
      [
        '{"ts":"2026-04-19T12:00:00Z","type":"phase_start","phase":"foundation","pid":1}',
        '{"ts":"2026-04-19T12:00:01Z","type":"tool_use","id":"t1","name":"Read","summary":"/a.ts"}',
        '{"ts":"2026-04-19T12:00:02Z","type":"tool_result","id":"t1","status":"ok","summary":"ok"}',
      ].join('\n') + '\n',
    )
    const r = readPhaseEvents(projectDir, 50)
    expect(r.exists).toBe(true)
    expect(r.totalCount).toBe(3)
    expect(r.events.length).toBe(3)
    expect(r.events[0].type).toBe('phase_start')
    expect(r.events[1].name).toBe('Read')
    expect(r.events[2].status).toBe('ok')
    expect(r.truncated).toBe(false)
  })

  it('skips malformed lines without failing', () => {
    writeFileSync(
      join(projectDir, EVENTS_FILENAME),
      [
        '{"ts":"t","type":"phase_start","phase":"foundation"}',
        'not json',
        '{bad json',
        '{"ts":"t","type":"tool_use","name":"Edit","summary":"/x"}',
      ].join('\n') + '\n',
    )
    const r = readPhaseEvents(projectDir, 50)
    expect(r.events.length).toBe(2)
  })

  it('returns only the tail when more events than tailCount', () => {
    const lines = Array.from({ length: 120 }, (_, i) =>
      JSON.stringify({ ts: 't', type: 'tool_use', name: 'Edit', summary: `/f${i}` }),
    )
    writeFileSync(join(projectDir, EVENTS_FILENAME), lines.join('\n') + '\n')
    const r = readPhaseEvents(projectDir, 25)
    expect(r.totalCount).toBe(120)
    expect(r.events.length).toBe(25)
    expect(r.truncated).toBe(true)
    expect(r.events[0].summary).toBe('/f95')
    expect(r.events[24].summary).toBe('/f119')
  })

  it('handles empty file', () => {
    writeFileSync(join(projectDir, EVENTS_FILENAME), '')
    const r = readPhaseEvents(projectDir, 10)
    expect(r.exists).toBe(true)
    expect(r.events).toEqual([])
    expect(r.sizeBytes).toBe(0)
  })
})
