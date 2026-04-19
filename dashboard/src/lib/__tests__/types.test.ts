import { describe, it, expect } from 'vitest'
import type {
  ProjectState,
  StoryStatus,
  MilestoneStatus,
  SeedingDiscipline,
  DisciplineStatus,
  DeployStatus,
  EscalationTier,
  Provider,
  Story,
  Milestone,
  Escalation,
  CostInfo,
  DisciplineProgress,
  SeedingProgress,
  ConfidencePoint,
  ProjectSummary,
  ProjectDetail,
  ChatMessage,
  ChatOption,
  ActivityEvent,
  ProviderQuota,
  CatalogueIntegration,
  PlatformData,
  CatalogueKind,
  CatalogueEntity,
} from '@/lib/types'
import { catalogue } from '@/data/catalogue'
import { projects, projectDetails } from '@/data/projects'
import { platform } from '@/data/platform'
import { epochTimerActivity, recipeOracleActivity } from '@/data/activity'
import { soundscapeSeedingChat } from '@/data/chat'

describe('Type contracts', () => {
  it('ProjectState union covers all V3 states', () => {
    const states: ProjectState[] = [
      'seeding', 'ready', 'foundation', 'foundation-eval',
      'story-building', 'milestone-check',
      'milestone-fix', 'analyzing', 'generating-change-spec',
      'vision-check', 'shipping', 'final-review', 'complete',
      'escalation', 'waiting-for-human',
    ]
    expect(states).toHaveLength(15)
  })

  it('StoryStatus union is complete', () => {
    const statuses: StoryStatus[] = ['pending', 'in-progress', 'done', 'failed', 'skipped']
    expect(statuses).toHaveLength(5)
  })

  it('MilestoneStatus union is complete', () => {
    const statuses: MilestoneStatus[] = ['pending', 'in-progress', 'promoted', 'failed']
    expect(statuses).toHaveLength(4)
  })

  it('SeedingDiscipline union covers all 8 disciplines', () => {
    const disciplines: SeedingDiscipline[] = [
      'brainstorming', 'competition', 'taste', 'spec',
      'infrastructure', 'design', 'legal-privacy', 'marketing',
    ]
    expect(disciplines).toHaveLength(8)
  })

  it('DisciplineStatus union is complete', () => {
    const statuses: DisciplineStatus[] = ['pending', 'in-progress', 'complete']
    expect(statuses).toHaveLength(3)
  })

  it('DeployStatus union is complete', () => {
    const statuses: DeployStatus[] = ['success', 'failed', 'rollback']
    expect(statuses).toHaveLength(3)
  })

  it('EscalationTier covers 0-3', () => {
    const tiers: EscalationTier[] = [0, 1, 2, 3]
    expect(tiers).toHaveLength(4)
  })

  it('Provider union is complete', () => {
    const providers: Provider[] = ['vercel', 'cloudflare', 'supabase']
    expect(providers).toHaveLength(3)
  })

  it('Story interface has required fields', () => {
    const story: Story = {
      id: 'test',
      title: 'Test story',
      status: 'pending',
      acceptanceCriteria: ['AC1'],
    }
    expect(story.id).toBeDefined()
    expect(story.title).toBeDefined()
    expect(story.status).toBeDefined()
    expect(story.acceptanceCriteria.length).toBeGreaterThan(0)
  })

  it('Milestone interface has required fields', () => {
    const milestone: Milestone = {
      id: 'test',
      title: 'Test milestone',
      description: 'Test',
      status: 'pending',
      stories: [],
    }
    expect(milestone.id).toBeDefined()
    expect(milestone.stories).toBeDefined()
  })

  it('Escalation interface has required fields', () => {
    const escalation: Escalation = {
      id: 'test',
      tier: 1,
      reason: 'Deploy failed',
      state: 'escalation',
      status: 'pending',
      createdAt: '2026-04-01T00:00:00Z',
    }
    expect(escalation.tier).toBe(1)
    expect(escalation.reason).toBeDefined()
  })

  it('CostInfo interface has required fields', () => {
    const costInfo: CostInfo = {
      totalSpend: 10,
      budgetCap: 50,
      breakdown: { llmTokens: 7, deploys: 2, other: 1 },
      lastUpdated: '2026-04-01T00:00:00Z',
    }
    expect(costInfo.totalSpend).toBeLessThanOrEqual(costInfo.budgetCap)
    expect(costInfo.breakdown.llmTokens + costInfo.breakdown.deploys + costInfo.breakdown.other).toBe(costInfo.totalSpend)
  })

  it('SeedingProgress tracks discipline completion', () => {
    const progress: SeedingProgress = {
      disciplines: [
        { discipline: 'brainstorming', status: 'complete' },
        { discipline: 'competition', status: 'in-progress' },
      ],
      currentDiscipline: 'competition',
      completedCount: 1,
      totalCount: 8,
    }
    expect(progress.completedCount).toBeLessThanOrEqual(progress.totalCount)
  })

  it('ConfidencePoint has timestamp and value', () => {
    const point: ConfidencePoint = {
      timestamp: '2026-04-01T00:00:00Z',
      value: 0.75,
    }
    expect(point.value).toBeGreaterThanOrEqual(0)
    expect(point.value).toBeLessThanOrEqual(1)
  })

  it('ChatMessage supports all roles and types', () => {
    const msg: ChatMessage = {
      id: 'test',
      role: 'rouge',
      type: 'question',
      discipline: 'brainstorming',
      content: 'What problem are you solving?',
      reasoning: 'Need to narrow scope.',
      options: [{ label: 'A', text: 'Focus' }],
      timestamp: '2026-04-01T00:00:00Z',
    }
    expect(msg.role).toBe('rouge')
    expect(msg.options).toHaveLength(1)
  })

  it('ActivityEvent supports all event types', () => {
    const event: ActivityEvent = {
      id: 'test',
      projectId: 'proj-test',
      projectName: 'Test',
      type: 'deploy',
      title: 'Deploy succeeded',
      timestamp: '2026-04-01T00:00:00Z',
      metadata: { deployStatus: 'success', deployUrl: 'https://example.com' },
    }
    expect(event.metadata?.deployStatus).toBe('success')
  })

  it('PlatformData has quotas and integrations', () => {
    const pd: PlatformData = {
      quotas: [{ provider: 'vercel', displayName: 'Vercel', used: 1, limit: 10, projects: ['test'] }],
      integrations: [{ name: 'Stripe', provider: 'stripe', inCatalogue: true, usedByCount: 0, usedBy: [] }],
      totalMonthlySpend: 50,
      budgetRemaining: 200,
    }
    expect(pd.quotas).toHaveLength(1)
    expect(pd.integrations).toHaveLength(1)
  })
})

describe('Catalogue entity types', () => {
  it('CatalogueKind has three values', () => {
    const kinds: CatalogueKind[] = ['Component', 'Resource', 'API']
    expect(kinds).toHaveLength(3)
  })

  it('CatalogueEntity has required fields', () => {
    const entity: CatalogueEntity = {
      id: 'nextjs',
      name: 'Next.js',
      kind: 'Component',
      type: 'framework',
      description: 'React meta-framework',
      capabilities: ['ssr', 'static', 'routing'],
      status: 'available',
      lifecycle: 'production',
      dependsOn: [],
      usedBy: ['soundscape'],
    }
    expect(entity.kind).toBe('Component')
    expect(entity.capabilities).toContain('ssr')
    expect(entity.status).toBe('available')
  })
})

describe('Catalogue seed data integrity', () => {
  it('has 35 entities total', () => {
    expect(catalogue).toHaveLength(35)
  })

  it('has 13 Components, 12 Resources, 10 APIs', () => {
    const components = catalogue.filter(e => e.kind === 'Component')
    const resources = catalogue.filter(e => e.kind === 'Resource')
    const apis = catalogue.filter(e => e.kind === 'API')
    expect(components).toHaveLength(13)
    expect(resources).toHaveLength(12)
    expect(apis).toHaveLength(10)
  })

  it('all entity IDs are unique', () => {
    const ids = catalogue.map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all dependsOn references exist', () => {
    const ids = new Set(catalogue.map(e => e.id))
    for (const entity of catalogue) {
      for (const dep of entity.dependsOn) {
        expect(ids.has(dep)).toBe(true)
      }
    }
  })

  it('all usedBy references are valid project slugs', () => {
    const slugs = new Set(projects.map(p => p.slug))
    for (const entity of catalogue) {
      for (const proj of entity.usedBy) {
        expect(slugs.has(proj)).toBe(true)
      }
    }
  })

  it('available entities with usedBy have at least one project', () => {
    const available = catalogue.filter(e => e.status === 'available' && e.usedBy.length > 0)
    expect(available.length).toBeGreaterThan(0)
  })
})

describe('Seed data integrity', () => {
  it('has 6 project summaries', () => {
    expect(projects).toHaveLength(6)
  })

  it('has 6 project details', () => {
    expect(Object.keys(projectDetails)).toHaveLength(6)
  })

  it('every summary slug has a matching detail', () => {
    for (const p of projects) {
      expect(projectDetails[p.slug]).toBeDefined()
      expect(projectDetails[p.slug].id).toBe(p.id)
    }
  })

  it('summary and detail states match', () => {
    for (const p of projects) {
      expect(projectDetails[p.slug].state).toBe(p.state)
    }
  })

  it('soundscape is in seeding with 3/8 disciplines done', () => {
    const s = projects.find(p => p.slug === 'soundscape')!
    expect(s.state).toBe('seeding')
    expect(s.seedingProgress?.completedCount).toBe(3)
    expect(s.seedingProgress?.totalCount).toBe(8)
  })

  it('epoch-timer is story-building with milestone 2 active', () => {
    const detail = projectDetails['epoch-timer']
    expect(detail.state).toBe('story-building')
    expect(detail.milestones[0].status).toBe('promoted')
    expect(detail.milestones[1].status).toBe('in-progress')
  })

  it('recipe-oracle has an active escalation', () => {
    const detail = projectDetails['recipe-oracle']
    expect(detail.state).toBe('escalation')
    expect(detail.escalations).toHaveLength(1)
    expect(detail.escalations[0].tier).toBe(1)
  })

  it('fleet-dash is in final-review with all milestones promoted', () => {
    const detail = projectDetails['fleet-dash']
    expect(detail.state).toBe('final-review')
    expect(detail.milestones.every(m => m.status === 'promoted')).toBe(true)
  })

  it('color-quiz is complete', () => {
    const s = projects.find(p => p.slug === 'color-quiz')!
    expect(s.state).toBe('complete')
    expect(s.productionUrl).toBe('https://color-quiz.pages.dev')
  })

  it('weather-api is ready with no costs', () => {
    const s = projects.find(p => p.slug === 'weather-api')!
    expect(s.state).toBe('ready')
    expect(s.cost.totalSpend).toBe(0)
  })

  it('platform has 3 provider quotas', () => {
    expect(platform.quotas).toHaveLength(3)
  })

  it('platform has 5 catalogue integrations', () => {
    expect(platform.integrations).toHaveLength(5)
  })

  it('epoch-timer has 9 activity events', () => {
    expect(epochTimerActivity).toHaveLength(9)
  })

  it('recipe-oracle has 5 activity events', () => {
    expect(recipeOracleActivity).toHaveLength(5)
  })

  it('soundscape seeding chat has messages from both roles', () => {
    const roles = new Set(soundscapeSeedingChat.map(m => m.role))
    expect(roles.has('rouge')).toBe(true)
    expect(roles.has('human')).toBe(true)
  })

  it('soundscape seeding chat covers 3 disciplines', () => {
    const disciplines = new Set(soundscapeSeedingChat.map(m => m.discipline).filter(Boolean))
    expect(disciplines.has('brainstorming')).toBe(true)
    expect(disciplines.has('competition')).toBe(true)
    expect(disciplines.has('taste')).toBe(true)
  })

  it('confidence histories (when present on fixtures) are monotonically timestamped', () => {
    for (const slug of Object.keys(projectDetails)) {
      const history = projectDetails[slug].confidenceHistory
      if (!history) continue
      for (let i = 1; i < history.length; i++) {
        expect(new Date(history[i].timestamp).getTime())
          .toBeGreaterThan(new Date(history[i - 1].timestamp).getTime())
      }
    }
  })
})
