import { describe, it, expect, afterEach } from 'vitest'
import { ProjectWatcher } from '../watcher'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('ProjectWatcher', () => {
  const testDir = join(tmpdir(), 'rouge-watcher-test-' + Date.now())
  const projectDir = join(testDir, 'test-project')
  let watcher: ProjectWatcher | undefined

  afterEach(() => {
    watcher?.stop()
    watcher = undefined
    rmSync(testDir, { recursive: true, force: true })
  })

  it('emits state-change when state.json is modified', async () => {
    mkdirSync(projectDir, { recursive: true })
    const stateFile = join(projectDir, 'state.json')
    writeFileSync(stateFile, JSON.stringify({ current_state: 'ready' }))

    watcher = new ProjectWatcher(testDir)
    const events: unknown[] = []
    watcher.on('event', (e) => events.push(e))
    watcher.start()

    // Wait for watcher to initialize
    await new Promise((r) => setTimeout(r, 200))

    // Modify state.json
    writeFileSync(stateFile, JSON.stringify({ current_state: 'foundation' }))

    // Wait for event to propagate
    await new Promise((r) => setTimeout(r, 600))

    watcher.stop()
    expect(events.length).toBeGreaterThan(0)
    const stateChanges = events.filter((e: any) => e.type === 'state-change')
    expect(stateChanges.length).toBeGreaterThan(0)
    expect((stateChanges[0] as any).data.from).toBe('ready')
    expect((stateChanges[0] as any).data.to).toBe('foundation')
    expect((stateChanges[0] as any).project).toBe('test-project')
  })

  it('emits seeding-progress when currentDiscipline advances during seeding', async () => {
    mkdirSync(projectDir, { recursive: true })
    const stateFile = join(projectDir, 'state.json')
    writeFileSync(
      stateFile,
      JSON.stringify({
        current_state: 'seeding',
        seedingProgress: {
          disciplines: [{ discipline: 'spec', status: 'complete' }],
          completedCount: 4,
          totalCount: 8,
          currentDiscipline: 'spec',
        },
      }),
    )

    watcher = new ProjectWatcher(testDir)
    const events: unknown[] = []
    watcher.on('event', (e) => events.push(e))
    watcher.start()
    await new Promise((r) => setTimeout(r, 200))

    // Advance discipline spec → design, current_state stays 'seeding'
    // so this would have been invisible to the old watcher.
    writeFileSync(
      stateFile,
      JSON.stringify({
        current_state: 'seeding',
        seedingProgress: {
          disciplines: [{ discipline: 'design', status: 'pending' }],
          completedCount: 5,
          totalCount: 8,
          currentDiscipline: 'design',
        },
      }),
    )
    await new Promise((r) => setTimeout(r, 600))
    watcher.stop()

    const progress = events.filter((e: any) => e.type === 'seeding-progress')
    expect(progress.length).toBeGreaterThan(0)
    expect((progress[0] as any).data.from).toBe('spec')
    expect((progress[0] as any).data.to).toBe('design')
    // current_state didn't change — no state-change event should have fired.
    const stateChanges = events.filter((e: any) => e.type === 'state-change')
    expect(stateChanges.length).toBe(0)
  })

  it('detects new project directories', async () => {
    mkdirSync(testDir, { recursive: true })

    watcher = new ProjectWatcher(testDir)
    const events: unknown[] = []
    watcher.on('event', (e) => events.push(e))
    watcher.start()

    // Wait for watcher to initialize
    await new Promise((r) => setTimeout(r, 200))

    // Create a new project
    const newProject = join(testDir, 'new-project')
    mkdirSync(newProject, { recursive: true })
    writeFileSync(
      join(newProject, 'state.json'),
      JSON.stringify({ current_state: 'seeding' }),
    )

    // Wait for event
    await new Promise((r) => setTimeout(r, 600))

    watcher.stop()
    const discovered = events.filter(
      (e: any) => e.type === 'project-discovered',
    )
    expect(discovered.length).toBeGreaterThan(0)
    expect((discovered[0] as any).project).toBe('new-project')
    expect((discovered[0] as any).data.state).toBe('seeding')
  })

  it('emits escalation events when new escalation appears', async () => {
    mkdirSync(projectDir, { recursive: true })
    const stateFile = join(projectDir, 'state.json')
    writeFileSync(
      stateFile,
      JSON.stringify({ current_state: 'building', escalations: [] }),
    )

    watcher = new ProjectWatcher(testDir)
    const events: unknown[] = []
    watcher.on('event', (e) => events.push(e))
    watcher.start()

    await new Promise((r) => setTimeout(r, 200))

    // Add an escalation
    writeFileSync(
      stateFile,
      JSON.stringify({
        current_state: 'building',
        escalations: [
          {
            id: 'esc-1',
            tier: 2,
            classification: 'test-failure',
            summary: 'Tests failing repeatedly',
            status: 'open',
            created_at: new Date().toISOString(),
          },
        ],
      }),
    )

    await new Promise((r) => setTimeout(r, 600))

    watcher.stop()
    const escalations = events.filter((e: any) => e.type === 'escalation')
    expect(escalations.length).toBeGreaterThan(0)
    expect((escalations[0] as any).data.tier).toBe(2)
    expect((escalations[0] as any).data.classification).toBe('test-failure')
    expect((escalations[0] as any).data.summary).toBe(
      'Tests failing repeatedly',
    )
  })

  it('does not emit duplicate events from debouncing', async () => {
    mkdirSync(projectDir, { recursive: true })
    const stateFile = join(projectDir, 'state.json')
    writeFileSync(stateFile, JSON.stringify({ current_state: 'ready' }))

    watcher = new ProjectWatcher(testDir)
    const events: unknown[] = []
    watcher.on('event', (e) => events.push(e))
    watcher.start()

    await new Promise((r) => setTimeout(r, 200))

    // Rapid writes (simulating editor behavior)
    writeFileSync(stateFile, JSON.stringify({ current_state: 'foundation' }))
    writeFileSync(stateFile, JSON.stringify({ current_state: 'foundation' }))
    writeFileSync(stateFile, JSON.stringify({ current_state: 'foundation' }))

    await new Promise((r) => setTimeout(r, 600))

    watcher.stop()
    const stateChanges = events.filter((e: any) => e.type === 'state-change')
    // Should only get one state-change event despite multiple writes
    expect(stateChanges.length).toBe(1)
  })
})
