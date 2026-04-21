import { describe, it, expect, afterEach } from 'vitest'
import { ProjectWatcher } from '../watcher'
import { writeFileSync, mkdirSync, rmSync, renameSync } from 'fs'
import { randomUUID } from 'crypto'
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

  it('emits build-progress when current_story advances within story-building', async () => {
    mkdirSync(projectDir, { recursive: true })
    const stateFile = join(projectDir, 'state.json')
    writeFileSync(
      stateFile,
      JSON.stringify({
        current_state: 'story-building',
        current_milestone: 'M1',
        current_story: 'S1.1',
      }),
    )

    watcher = new ProjectWatcher(testDir)
    const events: unknown[] = []
    watcher.on('event', (e) => events.push(e))
    watcher.start()
    await new Promise((r) => setTimeout(r, 200))

    // current_story changes S1.1 → S1.2; current_state stays
    // 'story-building' so no state-change event would fire. Without
    // build-progress the dashboard would not refetch.
    writeFileSync(
      stateFile,
      JSON.stringify({
        current_state: 'story-building',
        current_milestone: 'M1',
        current_story: 'S1.2',
      }),
    )
    await new Promise((r) => setTimeout(r, 600))
    watcher.stop()

    const buildProgress = events.filter((e: any) => e.type === 'build-progress')
    expect(buildProgress.length).toBeGreaterThan(0)
    expect((buildProgress[0] as any).data.story_from).toBe('S1.1')
    expect((buildProgress[0] as any).data.story_to).toBe('S1.2')
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

  // Fix for the daemon-path "Rouge replied but I don't see it" bug:
  // when a seeding turn writes a chat response without a watcher-
  // visible state.json diff (e.g. a gate question inside an already-
  // in-progress discipline), no SSE event fired, no client refetch,
  // UI stayed stuck. The watcher now ALSO watches seeding-chat.jsonl
  // per project and emits `chat-appended` on growth.
  it('emits chat-appended when seeding-chat.jsonl grows', async () => {
    mkdirSync(projectDir, { recursive: true })
    const stateFile = join(projectDir, 'state.json')
    writeFileSync(stateFile, JSON.stringify({ current_state: 'seeding' }))
    const chatFile = join(projectDir, 'seeding-chat.jsonl')
    // Seed with one entry so the size cache picks up a non-zero
    // baseline — proves the growth detection, not a first-write one.
    writeFileSync(chatFile, '{"id":"seed","role":"human","content":"hi","timestamp":"2026-04-21T00:00:00Z"}\n')

    watcher = new ProjectWatcher(testDir)
    const events: unknown[] = []
    watcher.on('event', (e) => events.push(e))
    watcher.start()
    await new Promise((r) => setTimeout(r, 200))

    // Append a new rouge reply — mimics what handleSeedMessage does
    // after runClaude returns.
    const { appendFileSync } = await import('fs')
    appendFileSync(
      chatFile,
      '{"id":"reply","role":"rouge","content":"response","timestamp":"2026-04-21T00:00:01Z"}\n',
    )

    await new Promise((r) => setTimeout(r, 600))
    watcher.stop()

    const chatEvents = events.filter((e: any) => e.type === 'chat-appended')
    expect(chatEvents.length).toBeGreaterThan(0)
    expect((chatEvents[0] as any).project).toBe('test-project')
    expect((chatEvents[0] as any).data.delta).toBeGreaterThan(0)
  })

  it('does not emit chat-appended for a pre-existing chat log on startup', async () => {
    // The chat-size cache is seeded on initProject so we don't
    // spuriously fire for content that existed before the watcher
    // booted.
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(join(projectDir, 'state.json'), JSON.stringify({ current_state: 'seeding' }))
    writeFileSync(
      join(projectDir, 'seeding-chat.jsonl'),
      '{"id":"old","role":"human","content":"preexisting","timestamp":"2026-04-21T00:00:00Z"}\n',
    )

    watcher = new ProjectWatcher(testDir)
    const events: unknown[] = []
    watcher.on('event', (e) => events.push(e))
    watcher.start()
    await new Promise((r) => setTimeout(r, 600))
    watcher.stop()

    expect(events.filter((e: any) => e.type === 'chat-appended')).toEqual([])
  })

  // Regression for the "all stories pending" bug: the launcher mutates
  // state.json via atomic rename (write to `<target>.<uuid>.tmp`, then
  // rename(2) into place). On macOS, fs.watch bound directly to the file
  // holds an inode handle that the rename unlinks — the watch goes deaf
  // after the first rename, the dashboard never refetches, and the UI
  // freezes at whatever stories were in-state on page mount. The fix is
  // to watch the parent directory; this test simulates the exact
  // atomic-rename pattern across multiple updates and asserts events
  // keep flowing.
  it('keeps firing events across repeated atomic renames (the launcher\'s write pattern)', async () => {
    mkdirSync(projectDir, { recursive: true })
    const stateFile = join(projectDir, 'state.json')
    writeFileSync(stateFile, JSON.stringify({ current_state: 'ready' }))

    watcher = new ProjectWatcher(testDir)
    const events: unknown[] = []
    watcher.on('event', (e) => events.push(e))
    watcher.start()
    await new Promise((r) => setTimeout(r, 200))

    // Simulate the launcher's writeStateJson: write to tmp, rename into
    // place. Repeat multiple times with meaningful diffs. The old
    // file-bound watcher would only catch the first of these on macOS;
    // the directory-bound watcher catches all of them.
    const writeAtomic = (body: unknown) => {
      const tmp = `${stateFile}.${randomUUID()}.tmp`
      writeFileSync(tmp, JSON.stringify(body))
      renameSync(tmp, stateFile)
    }

    writeAtomic({ current_state: 'foundation' })
    await new Promise((r) => setTimeout(r, 400))
    writeAtomic({ current_state: 'foundation-eval' })
    await new Promise((r) => setTimeout(r, 400))
    writeAtomic({ current_state: 'story-building' })
    await new Promise((r) => setTimeout(r, 600))

    watcher.stop()
    const stateChanges = events.filter((e: any) => e.type === 'state-change')
    // Three distinct state transitions — all three should fire.
    expect(stateChanges.length).toBe(3)
    expect((stateChanges[0] as any).data.to).toBe('foundation')
    expect((stateChanges[1] as any).data.to).toBe('foundation-eval')
    expect((stateChanges[2] as any).data.to).toBe('story-building')
  })
})
