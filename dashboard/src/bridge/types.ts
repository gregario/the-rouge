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
  // Fires when seedingProgress.currentDiscipline changes during seeding.
  // Distinct from state-change (which is about current_state) so
  // listeners can differentiate discipline advance from state-machine
  // state transitions. Page-level refetch hook treats any bridge event
  // as a trigger to pull fresh data, so emitting this unsticks stale
  // stepper / section UI that would otherwise keep showing the old
  // current discipline.
  | 'seeding-progress'

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

// Kind of message in the chat feed. Prose is the default — free-form
// intro/narration from Rouge. The three marker kinds (gate, decision,
// heartbeat) are parsed out of the [MARKER: ...] convention emitted by
// the orchestrator so the UI can render them distinctly:
//   - gate_question: a hard or soft gate Rouge is waiting on
//   - autonomous_decision: a call Rouge made on its own, narrated so
//     the user can scroll back and see what changed
//   - heartbeat: "still working on X" pings during autonomous stretches
export type SeedingMessageKind =
  | 'prose'
  | 'gate_question'
  | 'autonomous_decision'
  | 'heartbeat'
  | 'system_note'
  // System note variant with a one-click Continue affordance. Used
  // for the chunk-budget-exhausted case so the user can resume the
  // chain without typing anything.
  | 'resume_prompt'
  // Artifact completion report: "I wrote this file, here's a
  // structured summary of what's in it". Semantically distinct from
  // [DECISION:] — no alternatives, no fork-in-the-road, just a
  // produced-work notification. Used heavily by spec for per-FA
  // completions.
  | 'wrote_artifact'

export interface SeedingChatMessage {
  id: string           // e.g. "msg-1712345678-abc"
  role: 'rouge' | 'human'
  content: string
  timestamp: string    // ISO 8601
  kind?: SeedingMessageKind  // undefined treated as 'prose' (back-compat)
  metadata?: {
    discipline?: string
    disciplineComplete?: string
    seedingComplete?: boolean
    // For gate_question / autonomous_decision / heartbeat messages: the
    // gate id or decision slug the orchestrator emitted. Lets the UI
    // anchor a reply to the right gate and lets the override mechanism
    // (PR 2) rewind to a specific decision.
    markerId?: string
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

  // ─── Gated autonomy (PR 1) ──────────────────────────────────────
  //
  // Why: before this field existed, reconciliation treated any artifact
  // on disk as proof a discipline was complete. If Claude wrote an
  // artifact during a turn *without* asking the user a question, the
  // next turn's reconciliation silently advanced past the unanswered
  // question. `mode` + `pending_gate` close that hole by making
  // "waiting on a human" a first-class state.

  // 'awaiting_gate': Rouge has asked the human a question and is
  //   blocked until they answer. Reconciliation does NOT advance state
  //   while awaiting_gate is set for the current discipline.
  // 'running_autonomous': Rouge is working, emitting [DECISION:] and
  //   [HEARTBEAT:] markers. The next user message becomes an override,
  //   not a gate answer.
  // Undefined on legacy state files = treated as 'running_autonomous'.
  mode?: 'awaiting_gate' | 'running_autonomous'

  // The gate Rouge is currently waiting on. Must be set iff
  // mode === 'awaiting_gate'.
  pending_gate?: {
    discipline: string
    gate_id: string       // e.g. 'brainstorming/H1-premise-persona'
    asked_at: string      // ISO 8601
  }

  // ISO 8601 timestamp of the last [DECISION:] or [HEARTBEAT:] marker
  // seen during an autonomous run. UI traffic-light decays from this:
  // <45s green, 45s-2m orange, 2m-3m red, >3m stall.
  last_heartbeat_at?: string
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
