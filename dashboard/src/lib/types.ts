// Rouge V3 State Model — TypeScript Types
// These types are the contract between the Rouge API and the dashboard UI.

// ─── Enums & Union Types ─────────────────────────────────────────────

// Keep in sync with schemas/state.json's current_state enum and rouge-loop.js
// STATE_TO_PROMPT. 'story-diagnosis' was removed from the state machine —
// it had scaffolding (prompt, model selection, handler) but no code path
// ever transitioned into it. Don't add it back without a real trigger.
export type ProjectState =
  | 'seeding'
  | 'ready'
  | 'foundation'
  | 'foundation-eval'
  | 'story-building'
  | 'milestone-check'
  | 'milestone-fix'
  | 'analyzing'
  | 'generating-change-spec'
  | 'vision-check'
  | 'shipping'
  | 'final-review'
  | 'complete'
  | 'escalation'
  | 'waiting-for-human'

export type StoryStatus = 'pending' | 'in-progress' | 'done' | 'failed' | 'skipped'
// 'under-review' and 'fixing' are derived client-side from project.state
// (milestone-check / milestone-fix) + which milestone is current — the
// backend doesn't persist them separately. Existing state.json
// milestones keep their base status; the mapper overlays review/fix
// on the current milestone so the timeline shows what's happening
// without requiring a schema change.
export type MilestoneStatus =
  | 'pending'
  | 'in-progress'
  | 'under-review'
  | 'fixing'
  | 'promoted'
  | 'failed'
export type SeedingDiscipline =
  | 'brainstorming'
  | 'competition'
  | 'taste'
  | 'sizing'
  | 'spec'
  | 'infrastructure'
  | 'design'
  | 'legal-privacy'
  | 'marketing'
export type DisciplineStatus = 'pending' | 'in-progress' | 'complete' | 'skipped'
export type DeployStatus = 'success' | 'failed' | 'rollback'
export type EscalationTier = 0 | 1 | 2 | 3
export type Provider = 'vercel' | 'cloudflare' | 'github-pages' | 'supabase' | 'sentry' | 'posthog'

export type ChatRole = 'rouge' | 'human'
export type ChatMessageType = 'question' | 'answer' | 'transition' | 'summary'

// Marker kind for gated-autonomy messages (parallels
// `SeedingMessageKind` in bridge/types.ts). Determines how the UI
// renders the message — gates look different from decisions look
// different from heartbeats. Undefined falls back to the message's
// `type` for legacy paths.
export type ChatMessageKind =
  | 'prose'
  | 'gate_question'
  | 'autonomous_decision'
  | 'heartbeat'
  | 'system_note'
  | 'resume_prompt'
  | 'wrote_artifact'

export type ActivityEventType =
  | 'deploy'
  | 'phase-transition'
  | 'escalation'
  | 'commit'
  | 'cost-alert'
  | 'milestone-promoted'
  | 'story-completed'
  | 'failure'
  | 'checkpoint'
  | 'manual-intervention'

// ─── Catalogue (Backstage-inspired) ─────────────────────────────────

export type CatalogueKind = 'Component' | 'Resource' | 'API'
export type CatalogueStatus = 'available' | 'planned'
export type CatalogueLifecycle = 'production' | 'experimental'

export interface CatalogueEntity {
  id: string
  name: string
  kind: CatalogueKind
  type: string
  description: string
  capabilities: string[]
  status: CatalogueStatus
  lifecycle: CatalogueLifecycle
  dependsOn: string[]
  usedBy: string[]
}

// ─── Core Domain Objects ─────────────────────────────────────────────

export interface Story {
  id: string
  title: string
  status: StoryStatus
  acceptanceCriteria: string[]
  startedAt?: string   // ISO 8601
  completedAt?: string
  failureReason?: string
  // Provenance for stories appended mid-build (by generating-change-spec
  // or similar). Seed-defined stories omit these. Dashboard shows an
  // "Added by Rouge" badge on stories whose `addedAt` is within the
  // last 24h so a user notices when the plan evolves without reading
  // every story.
  addedAt?: string
  addedBy?: string
}

export interface Milestone {
  id: string
  title: string
  description: string
  status: MilestoneStatus
  stories: Story[]
  startedAt?: string
  completedAt?: string
}

export interface Escalation {
  id: string
  tier: EscalationTier
  reason: string
  state: ProjectState
  // Pipeline status. Only 'pending' escalations block the loop / need
  // user action; 'resolved' ones are history. Required — the mapper
  // guarantees a value (defaults non-'resolved' raw input to
  // 'pending'), so leaving this optional would let the page-level
  // filter silently treat undefined as pending and show historical
  // escalations as live.
  status: 'pending' | 'resolved'
  createdAt: string
  resolvedAt?: string
  resolution?: string
  // Set by the launcher when the user triggers a hand-off to direct
  // Claude Code. The dashboard uses its presence to switch the
  // escalation panel into "I've resolved it" mode.
  handoff_started_at?: string
}

export interface CostInfo {
  /** Total API spend for this project so far (USD) */
  totalSpend: number
  /** Budget cap for the project (USD) */
  budgetCap: number
  /** Cost breakdown by category */
  breakdown: {
    llmTokens: number
    deploys: number
    other: number
  }
  /** When the last cost was recorded */
  lastUpdated: string
}

export interface DisciplineProgress {
  discipline: SeedingDiscipline
  status: DisciplineStatus
  startedAt?: string
  completedAt?: string
}

export interface SeedingProgress {
  disciplines: DisciplineProgress[]
  currentDiscipline?: SeedingDiscipline
  completedCount: number
  totalCount: number
}

export interface ConfidencePoint {
  timestamp: string
  value: number // 0-1
}

// ─── Project Types ───────────────────────────────────────────────────

/** Lightweight summary for dashboard cards and list views */
export interface ProjectSummary {
  id: string
  name: string
  slug: string
  description: string
  state: ProjectState
  providers: Provider[]
  stack?: {
    components: string[]  // catalogue entity IDs
    resources: string[]
    apis: string[]
  }
  health: number        // 0-100
  progress: number      // 0-100 story completion %
  // confidence — optional and currently unused. Kept on the mock
  // shape so legacy fixtures don't need a sweep, but nothing in
  // production renders it. Drop once we either surface real
  // confidence or delete the mock fixtures.
  confidence?: number   // 0-1
  cost: CostInfo
  lastCheckpointAt?: string
  milestonesTotal: number
  milestonesCompleted: number
  currentMilestone?: string
  storiesInProgress?: number
  storiesTotal?: number
  escalation?: {
    tier: EscalationTier
    reason: string
  }
  seedingProgress?: SeedingProgress
  stagingUrl?: string
  productionUrl?: string
  createdAt: string
  updatedAt: string
  // Specs-table metadata
  isPlaceholderName?: boolean
  messageCount?: number
  firstMessagePreview?: string
  archived?: boolean
  archivedAt?: string
  // Gated-autonomy signals. Populated from seeding-state.json while
  // the project is seeding; drive the "awaiting you" chip on the
  // project card and the discipline-gate indicator in spec-tab-content.
  awaitingGate?: boolean
  pendingGateDiscipline?: string
  lastHeartbeatAt?: string
}

/** Full detail for war room / project deep dive */
export interface ProjectDetail {
  id: string
  name: string
  slug: string
  description: string
  state: ProjectState
  providers: Provider[]
  stack?: {
    components: string[]  // catalogue entity IDs
    resources: string[]
    apis: string[]
  }
  health: number
  progress: number     // 0-100 story completion %
  // confidence / confidenceHistory / repoUrl are OPTIONAL and not set
  // by the live mapper — the launcher doesn't surface confidence or
  // a repo URL anywhere in state.json. The mapper used to fill them
  // with hardcoded placeholders (0.75 / empty array / undefined);
  // those placeholders rendered as if they were real data. The
  // fields stay optional so legacy demo fixtures still type-check,
  // but no production surface reads them. If a feature ever needs
  // them, wire them from a real source before using in the UI.
  confidence?: number
  confidenceHistory?: ConfidencePoint[]
  cost: CostInfo
  milestones: Milestone[]
  escalations: Escalation[]
  seedingProgress?: SeedingProgress
  lastCheckpointAt?: string
  lastPhase?: string
  checkpointCount?: number
  stagingUrl?: string
  productionUrl?: string
  repoUrl?: string
  // Subprocess state from the build-runner. Previously fetched via a
  // separate /build-status poll that could drift from the main detail
  // fetch; audit E9 folded it in so Stop/Start buttons always match
  // the same read.
  buildRunning?: boolean
  buildPid?: number
  buildStartedAt?: string
  // Gated-autonomy signals (mirrors ProjectSummary). When set, the
  // SpecTabContent highlights the discipline Rouge is blocked on and
  // the project header shows the "awaiting you" chip.
  awaitingGate?: boolean
  pendingGateDiscipline?: SeedingDiscipline
  lastHeartbeatAt?: string
  createdAt: string
  updatedAt: string
  archived?: boolean
  archivedAt?: string
}

// ─── Chat / Seeding Conversation ─────────────────────────────────────

export interface ChatOption {
  label: string  // e.g. "A", "B", "C"
  text: string
}

export interface ChatMessage {
  id: string
  role: ChatRole
  type: ChatMessageType
  discipline?: SeedingDiscipline
  content: string
  /** Chain-of-thought reasoning (shown on expand) */
  reasoning?: string
  options?: ChatOption[]
  timestamp: string
  /** Marker kind when the message came from the gated-autonomy
   *  protocol — drives distinct rendering (gates vs decisions vs
   *  heartbeats). Undefined on legacy messages. */
  kind?: ChatMessageKind
  /** Marker id from the orchestrator — e.g. `brainstorming/H2-north-star`
   *  for gates, or a decision slug. Used by the override mechanism
   *  (PR 2) to address a specific decision. */
  markerId?: string
  /** Optimistic send placeholder — the message is in-flight to the
   *  bridge. UI renders with a muted "sending…" state. Cleared on
   *  refetch once the authoritative version lands. */
  isPending?: boolean
  /** The optimistic send failed (rate limit, network). UI renders
   *  the pending bubble with an error mark so the user can retry. */
  pendingErrored?: boolean
}

// ─── Activity Feed ───────────────────────────────────────────────────

export interface ActivityEvent {
  id: string
  projectId: string
  projectName: string
  type: ActivityEventType
  title: string
  description?: string
  timestamp: string
  metadata?: {
    deployStatus?: DeployStatus
    deployUrl?: string
    commitSha?: string
    commitMessage?: string
    fromState?: ProjectState
    toState?: ProjectState
    escalationTier?: EscalationTier
    costPercentage?: number
    // Bridge-sourced fields (from checkpoints.jsonl / cycle_context.json)
    url?: string
    cycle?: number
    from?: string
    to?: string
    cost?: number
    phase?: string
    milestone?: string | null
    story?: string | null
    threshold?: number
    spent?: number
    count?: number
  } & Record<string, unknown>
}

// ─── Platform / Infrastructure ───────────────────────────────────────

export interface ProviderQuota {
  provider: Provider
  displayName: string
  used: number
  limit: number
  projects: string[] // project slugs using this provider
}

export interface CatalogueIntegration {
  name: string
  provider: Provider | string
  inCatalogue: boolean
  usedByCount: number
  usedBy: string[] // project slugs
}

export interface PlatformData {
  quotas: ProviderQuota[]
  integrations: CatalogueIntegration[]
  totalMonthlySpend: number
  budgetRemaining: number
}
