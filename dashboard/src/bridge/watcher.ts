import { EventEmitter } from 'events'
import { watch, readFileSync, readdirSync, existsSync, statSync } from 'fs'
import { join, basename, dirname } from 'path'
import type { FSWatcher } from 'fs'
import type { BridgeEvent } from './types'
import { statePath } from './state-path'

/**
 * Watches Rouge project directories for state.json changes.
 * Emits BridgeEvent objects for state transitions, new projects, and escalations.
 */
export class ProjectWatcher extends EventEmitter {
  private projectsRoot: string
  private watchers: Map<string, FSWatcher> = new Map()
  // Second fs.watch per project, watching the project root for
  // seeding-chat.jsonl changes. The chat log is in the project root,
  // not `.rouge/`, so the state-json watcher (above) doesn't cover it.
  // Without this, a daemon turn that produces a chat response but no
  // watcher-visible state.json diff (e.g. Rouge asks a gate question
  // inside an already-in-progress discipline) writes to disk but the
  // client never learns — no event fires, no refetch, UI stays stuck
  // on whatever it rendered last.
  private chatWatchers: Map<string, FSWatcher> = new Map()
  private stateCache: Map<string, string> = new Map()
  private chatSizeCache: Map<string, number> = new Map()
  private rootWatcher: FSWatcher | null = null
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private static readonly DEBOUNCE_MS = 100

  constructor(projectsRoot: string) {
    super()
    this.projectsRoot = projectsRoot
  }

  start(): void {
    // Scan for existing projects
    if (existsSync(this.projectsRoot)) {
      try {
        const entries = readdirSync(this.projectsRoot)
        for (const entry of entries) {
          const fullPath = join(this.projectsRoot, entry)
          try {
            if (statSync(fullPath).isDirectory()) {
              this.initProject(fullPath)
            }
          } catch {
            // Directory may have been removed between readdir and stat
          }
        }
      } catch {
        // Root may not exist yet
      }
    }

    // Watch root for new project directories
    try {
      this.rootWatcher = watch(this.projectsRoot, (eventType, filename) => {
        if (!filename) return
        const fullPath = join(this.projectsRoot, filename)

        // Debounce root watcher events for this filename
        this.debounce(`root:${filename}`, () => {
          try {
            if (
              existsSync(fullPath) &&
              statSync(fullPath).isDirectory() &&
              !this.watchers.has(fullPath)
            ) {
              this.discoverProject(fullPath)
            }
          } catch {
            // Race condition: path may disappear between exists check and stat
          }
        })
      })
    } catch {
      // Root directory may not exist yet
    }
  }

  stop(): void {
    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer)
    }
    this.debounceTimers.clear()

    // Close all project watchers
    for (const w of this.watchers.values()) {
      w.close()
    }
    this.watchers.clear()
    for (const w of this.chatWatchers.values()) {
      w.close()
    }
    this.chatWatchers.clear()
    this.chatSizeCache.clear()

    // Close root watcher
    if (this.rootWatcher) {
      this.rootWatcher.close()
      this.rootWatcher = null
    }

    this.stateCache.clear()
  }

  private initProject(projectDir: string): void {
    const stateFile = statePath(projectDir)
    if (!existsSync(stateFile)) return

    // Cache initial state
    try {
      const content = readFileSync(stateFile, 'utf-8')
      this.stateCache.set(projectDir, content)
    } catch {
      return
    }

    // Seed chat-size cache so the first growth event fires only for
    // writes that happen AFTER the watcher started. Without this, a
    // project with an existing chat log would emit a spurious
    // chat-appended event when the watcher's first tick reads the
    // pre-existing size.
    try {
      const chatFile = join(projectDir, 'seeding-chat.jsonl')
      if (existsSync(chatFile)) {
        this.chatSizeCache.set(projectDir, statSync(chatFile).size)
      }
    } catch {
      // Size cache defaults to 0 on any error — first real write will
      // look like growth from 0, which is correct.
    }

    this.watchProject(projectDir)
  }

  private discoverProject(projectDir: string): void {
    // Check periodically for state.json (it may arrive slightly after the dir)
    const checkForState = (attempts: number) => {
      if (attempts <= 0) return

      const stateFile = statePath(projectDir)
      if (existsSync(stateFile)) {
        try {
          const content = readFileSync(stateFile, 'utf-8')
          const parsed = JSON.parse(content)
          this.stateCache.set(projectDir, content)

          const event: BridgeEvent = {
            type: 'project-discovered',
            project: basename(projectDir),
            timestamp: new Date().toISOString(),
            data: { state: parsed.current_state },
          }
          this.emit('event', event)

          this.watchProject(projectDir)
        } catch {
          // JSON parse or read failure
        }
      } else {
        // Retry shortly — state.json may not be written yet
        setTimeout(() => checkForState(attempts - 1), 100)
      }
    }

    checkForState(5)
  }

  private watchProject(projectDir: string): void {
    const stateFile = statePath(projectDir)
    const projectName = basename(projectDir)
    // Watch the parent directory, not the state.json file directly.
    //
    // `writeStateJson` is an atomic rename (write to `<target>.<uuid>.tmp`
    // → rename(2) into place — see state-path.ts:49-52). On macOS,
    // `fs.watch` bound directly to the target file holds a handle on the
    // original inode; the atomic rename unlinks that inode and the
    // handle goes permanently deaf (may fire once for the rename, then
    // silent forever). Result: the dashboard would fetch the project
    // once on page mount and then freeze at that snapshot while the
    // launcher advanced underneath — exactly the "all stories show
    // pending while the loop is shipping commits" symptom users
    // reported.
    //
    // Watching the directory instead survives the rename on every
    // platform (inotify on Linux, kqueue-directory on macOS, ReadDirectoryChanges
    // on Windows). We filter callbacks by filename so unrelated files
    // written into the same directory (e.g. the `.tmp` intermediate
    // itself, or `state.lock`) don't trigger spurious handleStateChange
    // calls — the debounce would coalesce them, but filtering is free
    // and cuts noise.
    const watchDir = dirname(stateFile)
    const watchFilename = basename(stateFile)

    try {
      const w = watch(watchDir, (_eventType, filename) => {
        // Some Node builds fire callbacks without a filename (e.g.
        // kqueue-level inode changes). When that happens we can't tell
        // what moved, so conservatively trigger handleStateChange —
        // readFileSync + content-diff inside handleStateChange will
        // short-circuit if nothing relevant actually changed.
        if (filename && filename !== watchFilename) return
        this.debounce(projectDir, () => {
          this.handleStateChange(projectDir, projectName)
        })
      })

      this.watchers.set(projectDir, w)
    } catch {
      // Parent directory may have been removed.
    }

    // Chat-log watch: the chat file is the most reliable signal that
    // Rouge produced content the user cares about. Watching it ensures
    // a refetch fires even when the turn wrote no watcher-visible
    // state.json diff (gate questions inside an already-in-progress
    // discipline, prose returns, system notes, etc.).
    try {
      const chatWatcher = watch(projectDir, (_eventType, filename) => {
        if (filename && filename !== 'seeding-chat.jsonl') return
        this.debounce(`${projectDir}::chat`, () => {
          this.handleChatChange(projectDir, projectName)
        })
      })
      this.chatWatchers.set(projectDir, chatWatcher)
    } catch {
      // Project root may not exist yet. watchProject only runs after
      // initProject confirmed state.json exists, so the dir exists
      // too — this catch is defensive.
    }
  }

  private handleChatChange(projectDir: string, projectName: string): void {
    const chatFile = join(projectDir, 'seeding-chat.jsonl')
    let size = 0
    try {
      size = statSync(chatFile).size
    } catch {
      // File may not exist yet (first write in flight, or chat log
      // never created for this project). Treat as no-op.
      return
    }
    const previous = this.chatSizeCache.get(projectDir) ?? 0
    if (size === previous) return // spurious event (touch / metadata)
    this.chatSizeCache.set(projectDir, size)

    // Only emit on GROWTH. A shrink means someone truncated/rotated
    // the file (possible in tests or manual cleanup); we don't want
    // to fire a chat-appended event for that.
    if (size < previous) return

    const event: BridgeEvent = {
      type: 'chat-appended',
      project: projectName,
      timestamp: new Date().toISOString(),
      data: {
        bytes: size,
        delta: size - previous,
      },
    }
    this.emit('event', event)
  }

  private handleStateChange(projectDir: string, projectName: string): void {
    const stateFile = statePath(projectDir)

    let content: string
    try {
      content = readFileSync(stateFile, 'utf-8')
    } catch {
      return // File not readable (momentarily gone during write)
    }

    const previousContent = this.stateCache.get(projectDir)
    if (content === previousContent) return // No actual change

    this.stateCache.set(projectDir, content)

    let parsed: any
    let previousParsed: any
    try {
      parsed = JSON.parse(content)
      previousParsed = previousContent ? JSON.parse(previousContent) : {}
    } catch {
      return // Invalid JSON
    }

    // Check for state transition
    if (
      parsed.current_state &&
      parsed.current_state !== previousParsed.current_state
    ) {
      const event: BridgeEvent = {
        type: 'state-change',
        project: projectName,
        timestamp: new Date().toISOString(),
        data: {
          from: previousParsed.current_state ?? null,
          to: parsed.current_state,
        },
      }
      this.emit('event', event)
    }

    // Seeding progress: fires when the current discipline advances
    // during seeding. Without this the dashboard's stepper stays stuck
    // showing the previous discipline as active even though state.json
    // has moved on — because nothing else triggers a project refetch
    // during seeding (current_state stays 'seeding' the whole time).
    const prevDiscipline = previousParsed?.seedingProgress?.currentDiscipline ?? null
    const curDiscipline = parsed?.seedingProgress?.currentDiscipline ?? null
    if (curDiscipline && curDiscipline !== prevDiscipline) {
      const event: BridgeEvent = {
        type: 'seeding-progress',
        project: projectName,
        timestamp: new Date().toISOString(),
        data: {
          from: prevDiscipline,
          to: curDiscipline,
          completedCount: parsed?.seedingProgress?.completedCount ?? 0,
          totalCount: parsed?.seedingProgress?.totalCount ?? 8,
        },
      }
      this.emit('event', event)
    }

    // Build progress: mirror of seeding-progress for build phases.
    // Fires when current_milestone or current_story changes.
    // Escalations are handled separately in checkEscalations which
    // already emits dedicated 'escalation' events — no need to
    // double-fire here.
    const prevMilestone = previousParsed?.current_milestone ?? null
    const curMilestone = parsed?.current_milestone ?? null
    const prevStory = previousParsed?.current_story ?? null
    const curStory = parsed?.current_story ?? null
    if (curMilestone !== prevMilestone || curStory !== prevStory) {
      const event: BridgeEvent = {
        type: 'build-progress',
        project: projectName,
        timestamp: new Date().toISOString(),
        data: {
          milestone_from: prevMilestone,
          milestone_to: curMilestone,
          story_from: prevStory,
          story_to: curStory,
        },
      }
      this.emit('event', event)
    }

    // Check for new escalations
    this.checkEscalations(projectName, parsed, previousParsed)
  }

  private checkEscalations(
    projectName: string,
    current: any,
    previous: any,
  ): void {
    const currentEscalations: any[] = current.escalations ?? []
    const previousIds = new Set(
      (previous.escalations ?? []).map((e: any) => e.id),
    )

    for (const esc of currentEscalations) {
      if (!previousIds.has(esc.id)) {
        const event: BridgeEvent = {
          type: 'escalation',
          project: projectName,
          timestamp: new Date().toISOString(),
          data: {
            tier: esc.tier,
            classification: esc.classification,
            summary: esc.summary,
          },
        }
        this.emit('event', event)
      }
    }
  }

  private debounce(key: string, fn: () => void): void {
    const existing = this.debounceTimers.get(key)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      this.debounceTimers.delete(key)
      fn()
    }, ProjectWatcher.DEBOUNCE_MS)

    this.debounceTimers.set(key, timer)
  }
}
