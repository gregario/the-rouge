import { describe, it, expect } from 'vitest'
import { parseClaudeOutput, detectRateLimit, extractMarkers, segmentMarkers } from '../claude-runner'

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

describe('segmentMarkers (gated autonomy)', () => {
  it('returns a single prose segment when no markers are present', () => {
    const segs = segmentMarkers('Working on your idea.')
    expect(segs).toEqual([{ kind: 'prose', content: 'Working on your idea.' }])
  })

  it('splits prose before a gate and captures the gate content', () => {
    const text = 'Here is what I have.\n\n[GATE: brainstorming/H1-premise]\nWho specifically hits this problem?'
    const segs = segmentMarkers(text)
    expect(segs).toHaveLength(2)
    expect(segs[0]).toEqual({ kind: 'prose', content: 'Here is what I have.' })
    expect(segs[1]).toMatchObject({ kind: 'gate', id: 'brainstorming/H1-premise' })
    expect(segs[1].content).toContain('Who specifically')
  })

  it('captures decision + heartbeat in order', () => {
    const text = '[DECISION: pick-stack]\nCloudflare because edge-only.\n[HEARTBEAT: writing manifest]\nHalfway through.'
    const segs = segmentMarkers(text)
    expect(segs.map((s) => s.kind)).toEqual(['decision', 'heartbeat'])
    expect(segs[0].id).toBe('pick-stack')
    expect(segs[1].id).toBe('writing manifest')
    expect(segs[0].content).toContain('Cloudflare')
    expect(segs[1].content).toContain('Halfway')
  })

  it('emits a trailing seeding_complete segment when the bare word is present', () => {
    const text = 'Everything is on disk.\n\nSEEDING_COMPLETE'
    const segs = segmentMarkers(text)
    const last = segs[segs.length - 1]
    expect(last.kind).toBe('seeding_complete')
  })

  it('handles DISCIPLINE_COMPLETE alongside newer markers', () => {
    const text = '[DECISION: final-call]\nLocked in.\n\n[DISCIPLINE_COMPLETE: brainstorming]'
    const segs = segmentMarkers(text)
    expect(segs.map((s) => s.kind)).toEqual(['decision', 'discipline_complete'])
    expect(segs[1].id).toBe('brainstorming')
  })

  it('parses [WROTE:] as a wrote segment', () => {
    const text = '[WROTE: fa5-spec-written]\nFA5 Colour Picker on disk — complex tier, 31 ACs across opening/closing (5), modes (9).'
    const segs = segmentMarkers(text)
    expect(segs).toHaveLength(1)
    expect(segs[0].kind).toBe('wrote')
    expect(segs[0].id).toBe('fa5-spec-written')
    expect(segs[0].content).toContain('31 ACs')
  })

  it('preserves content boundaries across consecutive markers', () => {
    const text = 'intro.\n[DECISION: a] one.\n[DECISION: b] two.\n[DECISION: c] three.'
    const segs = segmentMarkers(text)
    expect(segs).toHaveLength(4)
    expect(segs[0]).toEqual({ kind: 'prose', content: 'intro.' })
    expect(segs[1].content).toBe('one.')
    expect(segs[2].content).toBe('two.')
    expect(segs[3].content).toBe('three.')
  })
})
