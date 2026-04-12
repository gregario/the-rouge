// Bridge client — connects the dashboard to the Rouge bridge server.
// When NEXT_PUBLIC_BRIDGE_URL is not set (empty), isBridgeEnabled() returns false
// and the dashboard falls back to static mock data.

const BRIDGE_URL = process.env.NEXT_PUBLIC_BRIDGE_URL || ''

export function isBridgeEnabled(): boolean {
  return BRIDGE_URL.length > 0
}

export async function fetchBridgeProjects() {
  const res = await fetch(`${BRIDGE_URL}/projects`)
  if (!res.ok) throw new Error(`Bridge error: ${res.status}`)
  return res.json()
}

export async function fetchBridgeProject(name: string) {
  const res = await fetch(`${BRIDGE_URL}/projects/${name}`)
  if (!res.ok) throw new Error(`Bridge error: ${res.status}`)
  return res.json()
}

export async function fetchBridgeSpec(name: string) {
  const res = await fetch(`${BRIDGE_URL}/projects/${name}/spec`)
  if (!res.ok) throw new Error(`Bridge error: ${res.status}`)
  return res.json()
}

export async function fetchBridgeInfrastructure(name: string) {
  const res = await fetch(`${BRIDGE_URL}/projects/${name}/infrastructure`)
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
  const res = await fetch(`${BRIDGE_URL}/projects/${name}/story-enrichment`)
  if (!res.ok) throw new Error(`Bridge error: ${res.status}`)
  return res.json()
}

export async function fetchBridgeStoryContext(name: string) {
  const res = await fetch(`${BRIDGE_URL}/projects/${name}/story-context`)
  if (!res.ok) throw new Error(`Bridge error: ${res.status}`)
  return res.json()
}

export async function fetchBridgeBuildLog(name: string, tail = 50): Promise<BuildLogPayload> {
  const res = await fetch(`${BRIDGE_URL}/projects/${name}/build-log?tail=${tail}`)
  if (!res.ok) throw new Error(`Bridge error: ${res.status}`)
  return res.json()
}

export async function fetchBridgeActivity(name: string, verbose = false) {
  const q = verbose ? '?verbose=true' : ''
  const res = await fetch(`${BRIDGE_URL}/projects/${name}/activity${q}`)
  if (!res.ok) throw new Error(`Bridge error: ${res.status}`)
  return res.json()
}

export async function fetchBridgePlatform() {
  const res = await fetch(`${BRIDGE_URL}/platform`)
  if (!res.ok) throw new Error(`Bridge error: ${res.status}`)
  return res.json()
}

export async function createBridgeProject(slug: string, name?: string) {
  const res = await fetch(`${BRIDGE_URL}/projects`, {
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
  const res = await fetch(`${BRIDGE_URL}/projects/${slug}/build-status`)
  if (!res.ok) throw new Error(`Bridge error: ${res.status}`)
  return res.json()
}

export async function sendCommand(name: string, command: string, body?: object) {
  const res = await fetch(`${BRIDGE_URL}/projects/${name}/${command}`, {
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
  const es = new EventSource(`${BRIDGE_URL}/events`)
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
  metadata?: {
    discipline?: string
  }
}

export async function fetchSeedingMessages(slug: string): Promise<SeedingChatMessage[]> {
  const res = await fetch(`${BRIDGE_URL}/projects/${slug}/seed/messages`)
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
  const res = await fetch(`${BRIDGE_URL}/projects/${slug}/seed/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  const data = await res.json()
  return { ...data, ok: res.ok }
}
