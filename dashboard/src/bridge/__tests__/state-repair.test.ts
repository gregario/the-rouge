import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { repairProjectState } from '../state-repair'

let dir: string

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

function seedProject(state: Record<string, unknown>, seeding: Record<string, unknown>): void {
  mkdirSync(join(dir, '.rouge'), { recursive: true })
  writeFileSync(join(dir, '.rouge', 'state.json'), JSON.stringify(state))
  writeFileSync(join(dir, 'seeding-state.json'), JSON.stringify(seeding))
}

function seedArtifacts(): void {
  // Satisfy finalizeSeeding's artifact checks.
  mkdirSync(join(dir, 'seed_spec'), { recursive: true })
  writeFileSync(join(dir, 'task_ledger.json'), '{}')
  writeFileSync(join(dir, 'seed_spec', 'milestones.json'), '{}')
  writeFileSync(join(dir, 'vision.json'), 'x'.repeat(500))
  writeFileSync(join(dir, 'product_standard.json'), 'x'.repeat(500))
}

describe('repairProjectState', () => {
  it('heals stuck-seeding: all 8 disciplines complete but seeding_complete null', async () => {
    dir = mkdtempSync(join(tmpdir(), 'repair-'))
    seedArtifacts()
    seedProject(
      {
        current_state: 'seeding',
        name: 'colour-contrast',
        seedingProgress: {
          disciplines: [
            { discipline: 'brainstorming', status: 'complete' },
            { discipline: 'competition', status: 'complete' },
            { discipline: 'taste', status: 'complete' },
            { discipline: 'spec', status: 'complete' },
            { discipline: 'infrastructure', status: 'complete' },
            { discipline: 'design', status: 'complete' },
            { discipline: 'legal-privacy', status: 'complete' },
            { discipline: 'marketing', status: 'complete' },
          ],
        },
      },
      {
        session_id: 's',
        status: 'active',
        disciplines_complete: [
          'brainstorming', 'competition', 'taste', 'spec',
          'infrastructure', 'design', 'legal-privacy', 'marketing',
        ],
      },
    )

    const report = await repairProjectState(dir)
    expect(report.fixes.length).toBeGreaterThan(0)
    expect(report.fixes.join(' ')).toContain('stuck-seeding')

    const state = JSON.parse(readFileSync(join(dir, '.rouge', 'state.json'), 'utf-8'))
    expect(state.current_state).toBe('ready')
    expect(state.foundation).toEqual({ status: 'pending' })

    const seeding = JSON.parse(readFileSync(join(dir, 'seeding-state.json'), 'utf-8'))
    expect(seeding.seeding_complete).toBe(true)
  })

  it('heals null-foundation: current_state=foundation with foundation=null', async () => {
    dir = mkdtempSync(join(tmpdir(), 'repair-'))
    seedProject(
      { current_state: 'foundation', name: 'testimonial', foundation: null },
      { session_id: 's', status: 'active' },
    )

    const report = await repairProjectState(dir)
    expect(report.fixes.length).toBe(1)
    expect(report.fixes[0]).toContain('null-foundation')

    const state = JSON.parse(readFileSync(join(dir, '.rouge', 'state.json'), 'utf-8'))
    expect(state.foundation).toEqual({ status: 'pending' })
    expect(state.current_state).toBe('foundation') // unchanged
  })

  it('is a no-op on a healthy project', async () => {
    dir = mkdtempSync(join(tmpdir(), 'repair-'))
    seedProject(
      { current_state: 'ready', name: 'healthy', foundation: { status: 'pending' } },
      { session_id: 's', status: 'active', seeding_complete: true },
    )
    const before = readFileSync(join(dir, '.rouge', 'state.json'), 'utf-8')

    const report = await repairProjectState(dir)
    expect(report.fixes).toEqual([])

    const after = readFileSync(join(dir, '.rouge', 'state.json'), 'utf-8')
    expect(after).toBe(before)
  })

  it('handles missing state.json gracefully', async () => {
    dir = mkdtempSync(join(tmpdir(), 'repair-'))
    // No state files written.
    const report = await repairProjectState(dir)
    expect(report.fixes).toEqual([])
  })

  it('is idempotent — running twice produces no additional fixes', async () => {
    dir = mkdtempSync(join(tmpdir(), 'repair-'))
    seedProject(
      { current_state: 'foundation', name: 'x', foundation: null },
      { session_id: 's', status: 'active' },
    )

    const first = await repairProjectState(dir)
    expect(first.fixes.length).toBe(1)

    const second = await repairProjectState(dir)
    expect(second.fixes).toEqual([])
  })

  it('heals empty-escalation: state=escalation but escalations[] is empty (testimonial shape)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'repair-'))
    seedProject(
      {
        current_state: 'escalation',
        name: 'testimonial',
        escalations: [], // the broken shape
      },
      { session_id: 's', status: 'active' },
    )

    const report = await repairProjectState(dir)
    expect(report.fixes.length).toBe(1)
    expect(report.fixes[0]).toContain('empty-escalation')

    const state = JSON.parse(readFileSync(join(dir, '.rouge', 'state.json'), 'utf-8'))
    expect(state.escalations).toHaveLength(1)
    expect(state.escalations[0].status).toBe('pending')
    expect(state.escalations[0].classification).toBe('unspecified-repair')
  })

  it('heals escalation whose only entries are already resolved', async () => {
    dir = mkdtempSync(join(tmpdir(), 'repair-'))
    seedProject(
      {
        current_state: 'escalation',
        name: 'stale',
        escalations: [{ id: 'e1', status: 'resolved' }],
      },
      { session_id: 's', status: 'active' },
    )

    const report = await repairProjectState(dir)
    expect(report.fixes.length).toBe(1)
    expect(report.fixes[0]).toContain('empty-escalation')

    const state = JSON.parse(readFileSync(join(dir, '.rouge', 'state.json'), 'utf-8'))
    const pending = state.escalations.filter((e: { status: string }) => e.status === 'pending')
    expect(pending).toHaveLength(1)
  })

  it('leaves a healthy escalation alone', async () => {
    dir = mkdtempSync(join(tmpdir(), 'repair-'))
    seedProject(
      {
        current_state: 'escalation',
        name: 'ok',
        escalations: [
          { id: 'e1', status: 'pending', tier: 1, classification: 'real', summary: 'real' },
        ],
      },
      { session_id: 's', status: 'active' },
    )
    const before = readFileSync(join(dir, '.rouge', 'state.json'), 'utf-8')
    const report = await repairProjectState(dir)
    expect(report.fixes).toEqual([])
    const after = readFileSync(join(dir, '.rouge', 'state.json'), 'utf-8')
    expect(after).toBe(before)
  })

  // Phase 5 — orphan daemon detection. Scenarios:
  //   (a) No PID file, queue has work → respawn is normal; repair
  //       appends a system_note telling the user their queued work
  //       is waiting.
  //   (b) Stale PID file (PID dead), no queue → just clean up the file.
  it('surfaces orphan-daemon-with-queue when daemon crashed mid-work', async () => {
    dir = mkdtempSync(join(tmpdir(), 'repair-'))
    seedProject(
      { current_state: 'seeding', name: 'orphan-test' },
      { session_id: null, status: 'active' },
    )
    // Write a stranded queue entry: daemon was running, crashed
    // without draining, queue still has work.
    writeFileSync(
      join(dir, 'seed-queue.jsonl'),
      JSON.stringify({ id: 'orphaned', text: 'please process me', enqueuedAt: '2026-04-21T00:00:00Z' }) + '\n',
    )
    // No .seed-pid — daemon exited unexpectedly and didn't clean
    // up, OR it was never there and a message got queued without
    // spawn (shouldn't happen post-Fix-B but defensive).

    const report = await repairProjectState(dir)
    expect(report.fixes.some((f) => f.startsWith('orphan-daemon-with-queue'))).toBe(true)

    // Verify the compensating system_note exists.
    const chat = readFileSync(join(dir, 'seeding-chat.jsonl'), 'utf-8')
    expect(chat).toContain('seeding daemon appears to have crashed')
    expect(chat).toContain('Send any message')
  })

  it('is a no-op when there is no seed-queue even if no PID file', async () => {
    // Ordinary healthy project state between turns: no daemon, no
    // queue. Repair should not emit anything for the daemon shape.
    dir = mkdtempSync(join(tmpdir(), 'repair-'))
    seedProject(
      { current_state: 'seeding', name: 'healthy' },
      { session_id: null, status: 'active' },
    )
    const report = await repairProjectState(dir)
    expect(report.fixes.filter((f) => f.startsWith('orphan-daemon'))).toEqual([])
    expect(report.fixes.filter((f) => f.startsWith('stale-seed-pid'))).toEqual([])
  })

  // Daemon-crash → first-class escalation (follow-up to Phase 5). The
  // chat system_note was already covered above; these tests lock in
  // the additional state.json.escalations[] push so the crash
  // surfaces on the project card and anywhere escalations render.
  it('pushes a seed-daemon-crash escalation alongside the system note', async () => {
    dir = mkdtempSync(join(tmpdir(), 'repair-'))
    seedProject(
      { current_state: 'seeding', name: 'crash-test', escalations: [] },
      { session_id: null, status: 'active' },
    )
    writeFileSync(
      join(dir, 'seed-queue.jsonl'),
      JSON.stringify({ id: 'q1', text: 'stranded', enqueuedAt: '2026-04-21T00:00:00Z' }) + '\n',
    )

    const report = await repairProjectState(dir)
    expect(report.fixes.some((f) => f.startsWith('seed-daemon-crash'))).toBe(true)

    const state = JSON.parse(readFileSync(join(dir, '.rouge', 'state.json'), 'utf-8'))
    const crashEsc = (state.escalations as Array<Record<string, unknown>>).find(
      (e) => e.classification === 'seed-daemon-crash',
    )
    expect(crashEsc).toBeDefined()
    expect(crashEsc!.status).toBe('pending')
    expect(crashEsc!.tier).toBe(1)
  })

  it('does NOT add a second pending crash escalation on repeated repair passes', async () => {
    // Repair runs on every scan + every detail fetch. Duplicating
    // would spam the escalations array; we must dedupe.
    dir = mkdtempSync(join(tmpdir(), 'repair-'))
    seedProject(
      { current_state: 'seeding', name: 'no-dup', escalations: [] },
      { session_id: null, status: 'active' },
    )
    writeFileSync(
      join(dir, 'seed-queue.jsonl'),
      JSON.stringify({ id: 'q1', text: 'stranded', enqueuedAt: '2026-04-21T00:00:00Z' }) + '\n',
    )

    await repairProjectState(dir)
    await repairProjectState(dir)
    await repairProjectState(dir)

    const state = JSON.parse(readFileSync(join(dir, '.rouge', 'state.json'), 'utf-8'))
    const crashEscs = (state.escalations as Array<Record<string, unknown>>).filter(
      (e) => e.classification === 'seed-daemon-crash' && e.status === 'pending',
    )
    expect(crashEscs).toHaveLength(1)
  })

  it('resolves stale crash escalations once the queue has drained', async () => {
    // Flow: daemon crashes with queued work → escalation added.
    // User sends a new message, daemon respawns, drains queue.
    // State: queue empty, daemon alive → the escalation no longer
    // applies, so the next repair pass resolves it.
    dir = mkdtempSync(join(tmpdir(), 'repair-'))
    seedProject(
      {
        current_state: 'seeding',
        name: 'recovered',
        escalations: [
          {
            id: 'esc-old-crash',
            tier: 1,
            classification: 'seed-daemon-crash',
            summary: 'daemon crashed earlier',
            status: 'pending',
            created_at: '2026-04-21T00:00:00Z',
          },
        ],
      },
      { session_id: null, status: 'active' },
    )
    // No seed-queue.jsonl on disk → queue has drained. No .seed-pid
    // → daemon idle-exited. The escalation should resolve because
    // the queue is empty.

    const report = await repairProjectState(dir)
    expect(report.fixes.some((f) => f.startsWith('seed-daemon-crash-stale'))).toBe(true)

    const state = JSON.parse(readFileSync(join(dir, '.rouge', 'state.json'), 'utf-8'))
    const esc = (state.escalations as Array<Record<string, unknown>>).find(
      (e) => e.id === 'esc-old-crash',
    )
    expect(esc!.status).toBe('resolved')
    expect(esc!.resolved_at).toBeDefined()
  })
})
