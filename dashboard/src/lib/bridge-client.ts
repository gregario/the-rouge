// Bridge client — connects the dashboard to the Rouge API routes.
//
// Post-unification, the bridge runs as Next route handlers under /api/* on
// the same origin as the frontend. In the browser, relative URLs resolve
// against window.location. On the server (Server Components, SSR), Node's
// fetch requires absolute URLs — so we synthesize http://localhost:${PORT}
// for same-process calls. NEXT_PUBLIC_BRIDGE_URL overrides both for dev
// scenarios where frontend and API live on different hosts.
//
// isBridgeEnabled() now always returns true — the API routes always exist,
// even if the backing projects directory is empty. Retained for callers
// that still branch on it; safe to drop in a follow-up.

function resolveBridgeUrl(): string {
  const override = process.env.NEXT_PUBLIC_BRIDGE_URL
  if (override) return override
  // Browser: relative URLs are fine.
  if (typeof window !== 'undefined') return ''
  // Server: Node fetch needs absolute URLs. We're in-process with the
  // route handlers, so http://localhost:${PORT} is always correct.
  const port = process.env.PORT ?? process.env.ROUGE_DASHBOARD_PORT ?? '3001'
  return `http://localhost:${port}`
}

const BRIDGE_URL = resolveBridgeUrl()

export function isBridgeEnabled(): boolean {
  return true
}

export async function fetchBridgeProjects() {
  const res = await fetch(`${BRIDGE_URL}/api/projects`)
  if (!res.ok) throw new Error(`Bridge error: ${res.status}`)
  return res.json()
}

export async function fetchBridgeProject(name: string) {
  const res = await fetch(`${BRIDGE_URL}/api/projects/${name}`)
  if (!res.ok) throw new Error(`Bridge error: ${res.status}`)
  return res.json()
}

export async function fetchBridgeSpec(name: string) {
  const res = await fetch(`${BRIDGE_URL}/api/projects/${name}/spec`)
  if (!res.ok) throw new Error(`Bridge error: ${res.status}`)
  return res.json()
}

export async function fetchBridgeInfrastructure(name: string) {
  const res = await fetch(`${BRIDGE_URL}/api/projects/${name}/infrastructure`)
  if (!res.ok) throw new Error(`Bridge error: ${res.status}`)
  return res.json()
}

export interface BuildLogPayload {
  lines: string[]
  totalLines: number
  sizeBytes: number
  mtime: string | null
  truncated: boolean
}

export async function fetchBridgeStoryEnrichment(name: string) {
  const res = await fetch(`${BRIDGE_URL}/api/projects/${name}/story-enrichment`)
  if (!res.ok) throw new Error(`Bridge error: ${res.status}`)
  return res.json()
}

export async function fetchBridgeStoryContext(name: string) {
  const res = await fetch(`${BRIDGE_URL}/api/projects/${name}/story-context`)
  if (!res.ok) throw new Error(`Bridge error: ${res.status}`)
  return res.json()
}

export async function fetchBridgeBuildLog(name: string, tail = 50): Promise<BuildLogPayload> {
  const res = await fetch(`${BRIDGE_URL}/api/projects/${name}/build-log?tail=${tail}`)
  if (!res.ok) throw new Error(`Bridge error: ${res.status}`)
  return res.json()
}

export async function fetchBridgeActivity(name: string, verbose = false) {
  const q = verbose ? '?verbose=true' : ''
  const res = await fetch(`${BRIDGE_URL}/api/projects/${name}/activity${q}`)
  if (!res.ok) throw new Error(`Bridge error: ${res.status}`)
  return res.json()
}

export async function fetchBridgePlatform() {
  const res = await fetch(`${BRIDGE_URL}/api/platform`)
  if (!res.ok) throw new Error(`Bridge error: ${res.status}`)
  return res.json()
}

export async function createBridgeProject(slug: string, name?: string) {
  const res = await fetch(`${BRIDGE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, name }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error || `Failed: ${res.status}`)
  }
  return res.json()
}

export interface BuildStatus {
  running: boolean
  pid?: number
  startedAt?: string
}

export async function fetchBuildStatus(slug: string): Promise<BuildStatus> {
  const res = await fetch(`${BRIDGE_URL}/api/projects/${slug}/build-status`)
  if (!res.ok) throw new Error(`Bridge error: ${res.status}`)
  return res.json()
}

export async function sendCommand(name: string, command: string, body?: object) {
  const res = await fetch(`${BRIDGE_URL}/api/projects/${name}/${command}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: `Command failed: ${res.status}` }))
    throw new Error(data.error || `Command failed: ${res.status}`)
  }
  return res.json()
}

export function subscribeBridgeEvents(onEvent: (event: unknown) => void): EventSource | null {
  if (!isBridgeEnabled()) return null
  // Guard for non-browser environments (SSR, JSDOM unit tests) that don't
  // provide a global EventSource. The dashboard ships as a client-rendered
  // view so a no-op here is safe.
  if (typeof EventSource === 'undefined') return null
  const es = new EventSource(`${BRIDGE_URL}/api/events`)
  es.onmessage = (e) => {
    try {
      onEvent(JSON.parse(e.data))
    } catch {
      // Ignore malformed events
    }
  }
  return es
}

// ─── Seeding chat ────────────────────────────────────────────────

export interface SeedingChatMessage {
  id: string
  role: 'rouge' | 'human'
  content: string
  timestamp: string
  // Marker kind for gated-autonomy messages — undefined on legacy
  // or plain prose. Drives distinct rendering in the chat UI.
  kind?: 'prose' | 'gate_question' | 'autonomous_decision' | 'heartbeat' | 'system_note' | 'resume_prompt' | 'wrote_artifact'
  metadata?: {
    discipline?: string
    // Gate id ('brainstorming/H2-north-star') or decision slug —
    // lets the override mechanism address specific decisions.
    markerId?: string
  }
}

export async function fetchSeedingMessages(slug: string): Promise<SeedingChatMessage[]> {
  const res = await fetch(`${BRIDGE_URL}/api/projects/${slug}/seed/messages`)
  if (!res.ok) throw new Error(`Bridge error: ${res.status}`)
  return res.json()
}

export interface SeedingLivenessStatus {
  mode: 'awaiting_gate' | 'running_autonomous'
  pending_gate: { discipline: string; gate_id: string; asked_at: string } | null
  last_heartbeat_at: string | null
  current_discipline: string | null
  status: 'not-started' | 'active' | 'paused' | 'complete'
}

export async function fetchSeedingStatus(slug: string): Promise<SeedingLivenessStatus> {
  const res = await fetch(`${BRIDGE_URL}/api/projects/${slug}/seed/status`)
  if (!res.ok) throw new Error(`Bridge error: ${res.status}`)
  return res.json()
}

export interface SendSeedMessageResult {
  ok: boolean
  error?: string
  rateLimited?: boolean
  disciplineComplete?: string[]
  seedingComplete?: boolean
  readyTransition?: boolean
  missingArtifacts?: string[]
}

export async function sendSeedMessage(slug: string, text: string): Promise<SendSeedMessageResult> {
  const res = await fetch(`${BRIDGE_URL}/api/projects/${slug}/seed/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  const data = await res.json()
  return { ...data, ok: res.ok }
}
