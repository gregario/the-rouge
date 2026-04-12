import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export type BridgeActivityEventType =
  | 'phase-transition'
  | 'milestone-promoted'
  | 'escalation'
  | 'cost-alert'
  | 'deploy'
  | 'failure'
  | 'checkpoint'
  | 'manual-intervention'

export interface BridgeActivityEvent {
  id: string
  type: BridgeActivityEventType
  timestamp: string
  title: string
  description?: string
  metadata?: Record<string, unknown>
}

interface Checkpoint {
  id: string
  phase: string
  timestamp: string
  state?: {
    current_milestone?: string | null
    current_story?: string | null
    promoted_milestones?: string[]
    consecutive_failures?: number
    escalations?: Array<{
      id: string
      tier: number
      classification?: string
      summary?: string
      status: string
    }>
  }
  costs?: {
    cumulative_cost_usd?: number
  }
}

interface CycleContext {
  infrastructure?: {
    deploy_history?: Array<{ url?: string; timestamp?: string; cycle?: number }>
  }
}

const COST_THRESHOLDS = [5, 10, 25, 50]

export function readProjectActivity(
  projectDir: string,
  options: { verbose?: boolean } = {},
): BridgeActivityEvent[] {
  const checkpointsPath = join(projectDir, 'checkpoints.jsonl')
  if (!existsSync(checkpointsPath)) return []

  const raw = readFileSync(checkpointsPath, 'utf-8').trim()
  const lines = raw ? raw.split('\n').filter(Boolean) : []
  const checkpoints: Checkpoint[] = []
  for (const line of lines) {
    try {
      checkpoints.push(JSON.parse(line))
    } catch {
      // Ignore malformed lines
    }
  }

  if (options.verbose) {
    return checkpoints
      .map<BridgeActivityEvent>((cp) => ({
        id: cp.id,
        type: 'checkpoint' as const,
        timestamp: cp.timestamp,
        title: `Checkpoint: ${cp.phase}`,
        description: cp.state?.current_story
          ? `Story: ${cp.state.current_story}`
          : cp.state?.current_milestone
            ? `Milestone: ${cp.state.current_milestone}`
            : undefined,
        metadata: {
          phase: cp.phase,
          cost: cp.costs?.cumulative_cost_usd,
          milestone: cp.state?.current_milestone,
          story: cp.state?.current_story,
        },
      }))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  }

  const events: BridgeActivityEvent[] = []
  let lastPhase = ''
  let lastPromoted: string[] = []
  let lastFailures = 0
  const crossedThresholds = new Set<number>()

  for (const cp of checkpoints) {
    const phaseChanged = cp.phase !== lastPhase && lastPhase !== ''

    // Phase transition (skip when entering escalation — we'll emit an escalation event instead)
    if (phaseChanged && cp.phase !== 'escalation') {
      events.push({
        id: `${cp.id}-transition`,
        type: 'phase-transition',
        timestamp: cp.timestamp,
        title: `${lastPhase} → ${cp.phase}`,
        metadata: {
          from: lastPhase,
          to: cp.phase,
          cost: cp.costs?.cumulative_cost_usd,
        },
      })
    }

    // Milestone promoted
    const promoted = cp.state?.promoted_milestones ?? []
    if (promoted.length > lastPromoted.length) {
      for (let i = lastPromoted.length; i < promoted.length; i++) {
        events.push({
          id: `${cp.id}-milestone-${i}`,
          type: 'milestone-promoted',
          timestamp: cp.timestamp,
          title: `Milestone promoted: ${promoted[i]}`,
          metadata: { milestone: promoted[i] },
        })
      }
      lastPromoted = promoted
    }

    // Escalation — emit only on transition into escalation phase
    if (cp.phase === 'escalation' && lastPhase !== 'escalation') {
      events.push({
        id: `${cp.id}-escalation`,
        type: 'escalation',
        timestamp: cp.timestamp,
        title: 'Escalation raised',
        description: cp.state?.current_story
          ? `Story: ${cp.state.current_story}`
          : undefined,
        metadata: { story: cp.state?.current_story },
      })
    }

    lastPhase = cp.phase

    // Failure count increment
    const failures = cp.state?.consecutive_failures ?? 0
    if (failures > lastFailures && failures > 0) {
      events.push({
        id: `${cp.id}-failure`,
        type: 'failure',
        timestamp: cp.timestamp,
        title: `Failure (${failures} consecutive)`,
        description: cp.state?.current_story
          ? `Story: ${cp.state.current_story}`
          : undefined,
        metadata: {
          count: failures,
          story: cp.state?.current_story,
        },
      })
    }
    lastFailures = failures

    // Cost alert thresholds
    const cost = cp.costs?.cumulative_cost_usd ?? 0
    for (const threshold of COST_THRESHOLDS) {
      if (cost >= threshold && !crossedThresholds.has(threshold)) {
        crossedThresholds.add(threshold)
        events.push({
          id: `${cp.id}-cost-${threshold}`,
          type: 'cost-alert',
          timestamp: cp.timestamp,
          title: `Cost alert: $${threshold} threshold crossed`,
          description: `Cumulative spend: $${cost.toFixed(2)}`,
          metadata: { threshold, spent: cost },
        })
      }
    }
  }

  // Deploys from cycle_context.json
  const contextPath = join(projectDir, 'cycle_context.json')
  if (existsSync(contextPath)) {
    try {
      const ctx: CycleContext = JSON.parse(readFileSync(contextPath, 'utf-8'))
      const deploys = ctx.infrastructure?.deploy_history ?? []
      for (const deploy of deploys) {
        if (!deploy.timestamp) continue
        events.push({
          id: `deploy-${deploy.timestamp}`,
          type: 'deploy',
          timestamp: deploy.timestamp,
          title: 'Deploy',
          description: deploy.url,
          metadata: { url: deploy.url, cycle: deploy.cycle },
        })
      }
    } catch {
      // Ignore malformed cycle_context
    }
  }

  // Manual interventions from interventions.jsonl (human/Socrates edits to state.json)
  const interventionsPath = join(projectDir, 'interventions.jsonl')
  if (existsSync(interventionsPath)) {
    try {
      const iRaw = readFileSync(interventionsPath, 'utf-8').trim()
      const iLines = iRaw ? iRaw.split('\n').filter(Boolean) : []
      for (const line of iLines) {
        try {
          const entry = JSON.parse(line) as {
            id: string
            timestamp: string
            title: string
            description?: string
          }
          events.push({
            id: entry.id,
            type: 'manual-intervention',
            timestamp: entry.timestamp,
            title: entry.title,
            description: entry.description,
            metadata: { source: 'manual' },
          })
        } catch {
          // Ignore malformed lines
        }
      }
    } catch {
      // Ignore missing/unreadable file
    }
  }

  return events.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}
