import { EventEmitter } from 'events'
import { watch, readFileSync, readdirSync, existsSync, statSync } from 'fs'
import { join, basename } from 'path'
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
  private stateCache: Map<string, string> = new Map()
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

    try {
      const w = watch(stateFile, (_eventType) => {
        this.debounce(projectDir, () => {
          this.handleStateChange(projectDir, projectName)
        })
      })

      this.watchers.set(projectDir, w)
    } catch {
      // File may have been removed
    }
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
