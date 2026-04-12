import { createServer, IncomingMessage, ServerResponse } from 'http'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { scanProjects } from './scanner'
import { readProjectSpec } from './spec-reader'
import { readInfrastructureManifest } from './infrastructure-reader'
import { readBuildLog } from './build-log-reader'
import { readStoryContext } from './story-context-reader'
import { readStoryEnrichment } from './story-enrichment-reader'
import { readProjectActivity } from './activity-reader'
import { readPlatformData } from './platform-reader'
import { ProjectWatcher } from './watcher'
import { handleSeedMessage, startSeedingSession } from './seed-handler'
import { writeSeedingState, readSeedingState } from './seeding-state'
import { readChatLog } from './chat-reader'
import { startBuild, stopBuild, readBuildInfo } from './build-runner'
import { DISCIPLINE_SEQUENCE } from './types'
import type { BridgeConfig } from './config'
import type { Server } from 'http'

function setCors(req: IncomingMessage, res: ServerResponse): void {
  // Allow any localhost origin (any port) for local dev
  const origin = req.headers.origin
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3001')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

/**
 * Claude overwrites state.json during seeding, wiping any custom fields we wrote.
 * seeding-state.json is bridge-managed and stable — use it as the source of truth
 * for seeding progress. Derives the full disciplines[] array from disciplines_complete.
 */
function mergeSeedingProgress(
  projectDir: string,
  rawState: Record<string, unknown>,
): Record<string, unknown> {
  // If state.json already has seedingProgress (e.g., freshly-created project before
  // Claude overwrote it), keep it.
  if (rawState.seedingProgress) return rawState

  const seedState = readSeedingState(projectDir)
  // Only add seedingProgress if this project has seeding history
  if (seedState.status === 'not-started' && !seedState.disciplines_complete) {
    return rawState
  }

  const complete = new Set(seedState.disciplines_complete ?? [])
  const disciplines = DISCIPLINE_SEQUENCE.map(d => ({
    discipline: d,
    status: complete.has(d) ? 'complete' : 'pending',
  }))
  return {
    ...rawState,
    seedingProgress: {
      disciplines,
      completedCount: complete.size,
      totalCount: DISCIPLINE_SEQUENCE.length,
      currentDiscipline: seedState.current_discipline,
    },
  }
}

interface CheckpointSummary {
  costUsd: number | null
  lastCheckpointAt: string | null
  lastPhase: string | null
  checkpointCount: number
}

/**
 * Summarise the checkpoints.jsonl: latest cost, latest timestamp, latest
 * phase, and total count. Used by the dashboard's cycle rhythm indicator
 * and the Build Cost metric.
 */
function readCheckpointSummary(projectDir: string): CheckpointSummary {
  const empty: CheckpointSummary = {
    costUsd: null,
    lastCheckpointAt: null,
    lastPhase: null,
    checkpointCount: 0,
  }
  const path = join(projectDir, 'checkpoints.jsonl')
  if (!existsSync(path)) return empty
  try {
    const raw = readFileSync(path, 'utf-8').trim()
    if (!raw) return empty
    const lines = raw.split('\n').filter(Boolean)
    let costUsd: number | null = null
    let lastCheckpointAt: string | null = null
    let lastPhase: string | null = null
    // Walk backwards for the most recent parseable checkpoint
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const cp = JSON.parse(lines[i])
        if (lastCheckpointAt === null && typeof cp?.timestamp === 'string') {
          lastCheckpointAt = cp.timestamp
          if (typeof cp?.phase === 'string') lastPhase = cp.phase
        }
        if (costUsd === null && typeof cp?.costs?.cumulative_cost_usd === 'number') {
          costUsd = cp.costs.cumulative_cost_usd
        }
        if (costUsd !== null && lastCheckpointAt !== null) break
      } catch {
        continue
      }
    }
    return { costUsd, lastCheckpointAt, lastPhase, checkpointCount: lines.length }
  } catch {
    return empty
  }
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()))
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

export function createBridgeServer(config: BridgeConfig): Server {
  let watcher: ProjectWatcher | null = null
  const sseClients = new Set<ServerResponse>()

  function getWatcher(): ProjectWatcher {
    if (!watcher) {
      watcher = new ProjectWatcher(config.projectsRoot)
      watcher.on('event', (event) => {
        const payload = `data: ${JSON.stringify(event)}\n\n`
        for (const client of sseClients) {
          client.write(payload)
        }
      })
      watcher.start()
    }
    return watcher
  }

  const server = createServer(async (req, res) => {
    setCors(req, res)

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const url = new URL(req.url || '/', `http://localhost:${config.bridgePort}`)
    const pathname = url.pathname

    try {
      // GET /projects
      if (req.method === 'GET' && pathname === '/projects') {
        const projects = scanProjects(config.projectsRoot)
        sendJson(res, 200, projects)
        return
      }

      // POST /projects — create new project
      if (req.method === 'POST' && pathname === '/projects') {
        const body = await readBody(req) as { slug?: string; name?: string }
        const slug = (body?.slug ?? '').trim()
        const name = (body?.name ?? '').trim() || slug

        // Validate slug: kebab-case, non-empty
        if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
          sendJson(res, 400, { error: 'Invalid slug — use lowercase letters, numbers, and hyphens only' })
          return
        }

        const projectDir = join(config.projectsRoot, slug)
        if (existsSync(projectDir)) {
          sendJson(res, 409, { error: `Project "${slug}" already exists` })
          return
        }

        // Create directory + initial state.json + seeding-state.json
        mkdirSync(projectDir, { recursive: true })
        const initialState = {
          project: slug,
          name,
          current_state: 'seeding',
          milestones: [],
          escalations: [],
          seedingProgress: {
            disciplines: [
              { discipline: 'brainstorming', status: 'pending' },
              { discipline: 'competition', status: 'pending' },
              { discipline: 'taste', status: 'pending' },
              { discipline: 'spec', status: 'pending' },
              { discipline: 'infrastructure', status: 'pending' },
              { discipline: 'design', status: 'pending' },
              { discipline: 'legal-privacy', status: 'pending' },
              { discipline: 'marketing', status: 'pending' },
            ],
            completedCount: 0,
            totalCount: 8,
          },
          createdAt: new Date().toISOString(),
        }
        writeFileSync(join(projectDir, 'state.json'), JSON.stringify(initialState, null, 2))
        writeSeedingState(projectDir, {
          session_id: null,
          status: 'not-started',
          started_at: new Date().toISOString(),
        })

        // Fire and forget: spawn initial Claude call for seeding
        startSeedingSession(projectDir, name).catch((err) => {
          console.error(`[seeding] Initial call failed for ${slug}:`, err)
        })

        sendJson(res, 200, { ok: true, slug })
        return
      }

      // GET /platform — aggregate provider data
      if (req.method === 'GET' && pathname === '/platform') {
        const data = readPlatformData(config.projectsRoot)
        sendJson(res, 200, data)
        return
      }

      // GET /events — SSE
      if (req.method === 'GET' && pathname === '/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        })

        // Send initial heartbeat
        res.write('data: {"type":"connected"}\n\n')

        // Ensure watcher is running
        getWatcher()
        sseClients.add(res)

        req.on('close', () => {
          sseClients.delete(res)
        })
        return
      }

      // Routes matching /projects/:name and /projects/:name/:action
      const projectMatch = pathname.match(/^\/projects\/([^/]+)(?:\/([^/]+)(?:\/([^/]+))?)?$/)
      if (projectMatch) {
        const [, name, action, subAction] = projectMatch

        // GET /projects/:name
        if (req.method === 'GET' && !action) {
          const stateFile = join(config.projectsRoot, name, 'state.json')
          if (!existsSync(stateFile)) {
            sendJson(res, 404, { error: 'Project not found' })
            return
          }
          const raw = JSON.parse(readFileSync(stateFile, 'utf-8'))
          // Merge seedingProgress from seeding-state.json — Claude overwrites
          // state.json during seeding, wiping any fields we wrote. seeding-state.json
          // is bridge-managed and stable.
          const projectDir = join(config.projectsRoot, name)
          const merged = mergeSeedingProgress(projectDir, raw)
          // Attach checkpoint summary — real cost, last-activity timestamp,
          // phase, and total count (Rouge launcher owns checkpoints; we only
          // read them)
          const checkpoint = readCheckpointSummary(projectDir)
          sendJson(res, 200, {
            slug: name,
            ...merged,
            costUsd: checkpoint.costUsd,
            lastCheckpointAt: checkpoint.lastCheckpointAt,
            lastPhase: checkpoint.lastPhase,
            checkpointCount: checkpoint.checkpointCount,
          })
          return
        }

        // GET /projects/:name/spec
        if (req.method === 'GET' && action === 'spec') {
          const projectDir = join(config.projectsRoot, name)
          if (!existsSync(projectDir)) {
            sendJson(res, 404, { error: 'Project not found' })
            return
          }
          const spec = readProjectSpec(projectDir)
          sendJson(res, 200, spec)
          return
        }

        // GET /projects/:name/story-enrichment
        if (req.method === 'GET' && action === 'story-enrichment') {
          const projectDir = join(config.projectsRoot, name)
          if (!existsSync(projectDir)) {
            sendJson(res, 404, { error: 'Project not found' })
            return
          }
          const enrichment = readStoryEnrichment(projectDir)
          sendJson(res, 200, enrichment)
          return
        }

        // GET /projects/:name/story-context
        if (req.method === 'GET' && action === 'story-context') {
          const projectDir = join(config.projectsRoot, name)
          if (!existsSync(projectDir)) {
            sendJson(res, 404, { error: 'Project not found' })
            return
          }
          const ctx = readStoryContext(projectDir)
          sendJson(res, 200, ctx)
          return
        }

        // GET /projects/:name/build-log
        if (req.method === 'GET' && action === 'build-log') {
          const projectDir = join(config.projectsRoot, name)
          if (!existsSync(projectDir)) {
            sendJson(res, 404, { error: 'Project not found' })
            return
          }
          const tailParam = url.searchParams.get('tail')
          const tail = tailParam ? Math.max(1, Math.min(500, parseInt(tailParam, 10) || 50)) : 50
          const log = readBuildLog(projectDir, tail)
          sendJson(res, 200, log)
          return
        }

        // GET /projects/:name/infrastructure
        if (req.method === 'GET' && action === 'infrastructure') {
          const projectDir = join(config.projectsRoot, name)
          if (!existsSync(projectDir)) {
            sendJson(res, 404, { error: 'Project not found' })
            return
          }
          const manifest = readInfrastructureManifest(projectDir)
          sendJson(res, 200, manifest)
          return
        }

        // GET /projects/:name/activity
        if (req.method === 'GET' && action === 'activity') {
          const projectDir = join(config.projectsRoot, name)
          if (!existsSync(projectDir)) {
            sendJson(res, 404, { error: 'Project not found' })
            return
          }
          const verbose = url.searchParams.get('verbose') === 'true'
          const events = readProjectActivity(projectDir, { verbose })
          sendJson(res, 200, events)
          return
        }

        // POST /projects/:name/feedback
        if (req.method === 'POST' && action === 'feedback') {
          const body = await readBody(req)
          const feedbackFile = join(config.projectsRoot, name, 'feedback.json')
          writeFileSync(feedbackFile, JSON.stringify(body, null, 2))
          sendJson(res, 200, { ok: true })
          return
        }

        // POST /projects/:name/start — spawn `rouge build <slug>` as detached subprocess
        if (req.method === 'POST' && action === 'start') {
          const result = startBuild(config.projectsRoot, config.rougeCli, name)
          if (!result.ok) {
            sendJson(res, 409, { error: result.error })
            return
          }
          sendJson(res, 200, { ok: true, pid: result.pid })
          return
        }

        // POST /projects/:name/stop — SIGINT with SIGKILL fallback after 5s
        if (req.method === 'POST' && action === 'stop') {
          const result = await stopBuild(config.projectsRoot, name)
          if (!result.ok) {
            sendJson(res, 404, { error: result.error })
            return
          }
          sendJson(res, 200, { ok: true, killed: result.killed })
          return
        }

        // GET /projects/:name/build-status — is the build loop running?
        if (req.method === 'GET' && action === 'build-status') {
          const info = readBuildInfo(join(config.projectsRoot, name))
          sendJson(res, 200, { running: !!info, pid: info?.pid, startedAt: info?.startedAt })
          return
        }

        // GET /projects/:name/seed/messages
        if (req.method === 'GET' && action === 'seed' && subAction === 'messages') {
          const projectDir = join(config.projectsRoot, name)
          if (!existsSync(projectDir)) {
            sendJson(res, 404, { error: 'Project not found' })
            return
          }
          sendJson(res, 200, readChatLog(projectDir))
          return
        }

        // POST /projects/:name/seed/message
        if (req.method === 'POST' && action === 'seed' && subAction === 'message') {
          const projectDir = join(config.projectsRoot, name)
          if (!existsSync(projectDir)) {
            sendJson(res, 404, { error: 'Project not found' })
            return
          }
          const body = await readBody(req) as { text?: string }
          const text = (body?.text ?? '').trim()
          if (!text) {
            sendJson(res, 400, { error: 'text is required' })
            return
          }

          const result = await handleSeedMessage(projectDir, text)
          sendJson(res, result.status, result)
          return
        }

        // POST /projects/:name/resolve-escalation
        if (req.method === 'POST' && action === 'resolve-escalation') {
          const stateFile = join(config.projectsRoot, name, 'state.json')
          if (!existsSync(stateFile)) {
            sendJson(res, 404, { error: 'Project not found' })
            return
          }
          const body = await readBody(req) as {
            escalation_id?: string
            response_type?: string
            text?: string
          }
          if (!body?.escalation_id || !body?.response_type) {
            sendJson(res, 400, { error: 'escalation_id and response_type are required' })
            return
          }

          const validTypes = ['guidance', 'manual-fix-applied', 'dismiss-false-positive', 'abort-story']
          if (!validTypes.includes(body.response_type)) {
            sendJson(res, 400, { error: `Invalid response_type. Must be one of: ${validTypes.join(', ')}` })
            return
          }

          const raw = JSON.parse(readFileSync(stateFile, 'utf-8'))
          const escalation = (raw.escalations || []).find(
            (e: { id: string; status: string }) => e.id === body.escalation_id && e.status === 'pending'
          )
          if (!escalation) {
            sendJson(res, 404, { error: `No pending escalation found with id "${body.escalation_id}"` })
            return
          }

          // Write human_response to the escalation
          escalation.human_response = {
            type: body.response_type,
            text: body.text || '',
            submitted_at: new Date().toISOString(),
          }

          // Reset consecutive_failures so the loop doesn't immediately re-escalate
          raw.consecutive_failures = 0

          // Restore current_state from paused_from_state if available,
          // otherwise keep as escalation — advanceState will handle the transition
          if (raw.paused_from_state) {
            raw.current_state = raw.paused_from_state
            delete raw.paused_from_state
          }

          writeFileSync(stateFile, JSON.stringify(raw, null, 2))
          sendJson(res, 200, raw)
          return
        }

        // POST /projects/:name/pause
        if (req.method === 'POST' && action === 'pause') {
          const stateFile = join(config.projectsRoot, name, 'state.json')
          if (!existsSync(stateFile)) {
            sendJson(res, 404, { error: 'Project not found' })
            return
          }
          const raw = JSON.parse(readFileSync(stateFile, 'utf-8'))
          raw.current_state = 'waiting-for-human'
          writeFileSync(stateFile, JSON.stringify(raw, null, 2))
          sendJson(res, 200, { ok: true })
          return
        }
      }

      // Unknown route
      sendJson(res, 404, { error: 'Not found' })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal server error'
      sendJson(res, 500, { error: message })
    }
  })

  // Clean up watcher when server closes
  server.on('close', () => {
    if (watcher) {
      watcher.stop()
      watcher = null
    }
    sseClients.clear()
  })

  return server
}
