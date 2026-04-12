import { describe, it, expect } from 'vitest'
import { parseClaudeOutput, detectRateLimit, extractMarkers } from '../claude-runner'

describe('parseClaudeOutput', () => {
  it('parses JSON output with result and session_id', () => {
    const raw = JSON.stringify({ result: 'Hello', session_id: 'sess-123', total_cost_usd: 0.01 })
    const result = parseClaudeOutput(raw)
    expect(result.result).toBe('Hello')
    expect(result.session_id).toBe('sess-123')
  })

  it('returns raw text on parse failure', () => {
    const result = parseClaudeOutput('not json')
    expect(result.result).toContain('not json')
    expect(result.session_id).toBeNull()
  })

  it('truncates raw text to 3000 chars on parse failure', () => {
    const longText = 'x'.repeat(5000)
    const result = parseClaudeOutput(longText)
    expect(result.result.length).toBe(3000)
  })
})

describe('detectRateLimit', () => {
  it('detects rate limit phrases in short responses', () => {
    expect(detectRateLimit('You have hit your limit')).toBe(true)
    expect(detectRateLimit('Too many requests')).toBe(true)
    expect(detectRateLimit('Limit resets in 5 minutes')).toBe(true)
  })

  it('ignores long responses even if they contain the phrases', () => {
    const long = 'x'.repeat(500) + ' hit your limit'
    expect(detectRateLimit(long)).toBe(false)
  })

  it('returns false for normal responses', () => {
    expect(detectRateLimit('What kind of product are you building?')).toBe(false)
  })
})

describe('extractMarkers', () => {
  it('finds discipline complete markers', () => {
    const text = 'Moving on. [DISCIPLINE_COMPLETE: brainstorming]'
    expect(extractMarkers(text).disciplinesComplete).toEqual(['brainstorming'])
  })

  it('finds multiple discipline markers', () => {
    const text = '[DISCIPLINE_COMPLETE: brainstorming]\n[DISCIPLINE_COMPLETE: competition]'
    expect(extractMarkers(text).disciplinesComplete).toEqual(['brainstorming', 'competition'])
  })

  it('detects SEEDING_COMPLETE', () => {
    expect(extractMarkers('All done. SEEDING_COMPLETE').seedingComplete).toBe(true)
    expect(extractMarkers('Everything looks good.').seedingComplete).toBe(false)
  })

  it('ignores SEEDING_COMPLETE without exact match', () => {
    expect(extractMarkers('seeding complete now').seedingComplete).toBe(false)
  })
})
