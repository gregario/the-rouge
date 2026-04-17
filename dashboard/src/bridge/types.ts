// Bridge event types (SSE)
export type BridgeEventType =
  | 'state-change'
  | 'escalation'
  | 'deploy'
  | 'cost-alert'
  | 'story-complete'
  | 'milestone-promoted'
  | 'log-line'
  | 'project-discovered'

export interface BridgeEvent {
  type: BridgeEventType
  project: string
  timestamp: string
  data: Record<string, unknown>
}

// Project state as read from Rouge state.json (V3)
export interface RougeProjectState {
  project: string
  current_state: string
  current_milestone?: string
  current_story?: string
  milestones: RougeV3Milestone[]
  escalations?: RougeEscalation[]
  foundation?: { status: string }
  promoted_milestones?: string[]
  cycle_number?: number
}

export interface RougeV3Milestone {
  name: string
  status: string
  stories: RougeV3Story[]
}

export interface RougeV3Story {
  id: string
  name: string
  status: string
  attempts?: number
  completed_at?: string
  files_changed?: string[]
}

export interface EscalationHumanResponse {
  type: 'guidance' | 'manual-fix-applied' | 'dismiss-false-positive' | 'abort-story'
  text?: string
  submitted_at: string
}

export interface RougeEscalation {
  id: string
  tier: number
  classification: string
  summary: string
  story_id?: string
  status: string
  created_at: string
  resolution?: string
  resolved_at?: string
  human_response?: EscalationHumanResponse
}

// V2 project state (legacy — countdowntimer, fruit-and-veg)
export interface RougeV2ProjectState {
  current_state: string
  cycle_number?: number
  feature_areas?: { name: string; status: string }[]
}

// Normalized project summary for the dashboard
export interface BridgeProjectSummary {
  name: string
  slug: string
  state: string
  schemaVersion: 'v2' | 'v3'
  health: number
  progress: number
  milestones: { total: number; completed: number }
  currentMilestone?: string
  currentStory?: string
  escalation?: { tier: number; summary: string }
  costUsd?: number
  budgetCapUsd?: number
  lastCheckpointAt?: string
  hasStateFile: boolean
  providers: string[]
  deploymentUrl?: string
  // For the Specs table: distinguishes "Untitled but in progress" from
  // "Untitled and abandoned." Preview is a short excerpt of the first
  // human message if any exists.
  messageCount?: number
  firstMessagePreview?: string
  isPlaceholderName?: boolean
  archived?: boolean
  archivedAt?: string
}

// ─── Seeding chat log ────────────────────────────────────────────────

export interface SeedingChatMessage {
  id: string           // e.g. "msg-1712345678-abc"
  role: 'rouge' | 'human'
  content: string
  timestamp: string    // ISO 8601
  metadata?: {
    discipline?: string
    disciplineComplete?: string
    seedingComplete?: boolean
  }
}

// ─── Seeding session state ───────────────────────────────────────────

export interface SeedingSessionState {
  session_id: string | null
  status: 'not-started' | 'active' | 'paused' | 'complete'
  started_at?: string
  last_activity?: string
  disciplines_complete?: string[]
  current_discipline?: string
  seeding_complete?: boolean
  // Disciplines whose detailed sub-prompt has already been sent to Claude
  // in this session. Used by the seed handler to inject each discipline's
  // prompt exactly once per discipline (#147) — subsequent turns within a
  // discipline ride on session memory.
  disciplines_prompted?: string[]
  // A correction note that needs to be delivered to Claude on the next
  // turn. Populated when the dashboard rejects a `[DISCIPLINE_COMPLETE]`
  // marker because the artifact isn't on disk (#148). Appending to the
  // chat log alone isn't enough: Claude Code's `--resume` replays the
  // server-side session, not our jsonl, so Claude wouldn't see the
  // rejection otherwise. Consumed (and cleared) on the next message.
  pending_correction?: string
}

// The canonical sequence of disciplines used when auto-advancing current_discipline
export const DISCIPLINE_SEQUENCE = [
  'brainstorming',
  'competition',
  'taste',
  'spec',
  'infrastructure',
  'design',
  'legal-privacy',
  'marketing',
] as const
