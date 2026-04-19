import { describe, it, expect } from 'vitest'
import { mapRougeStateToProjectDetail } from '../bridge-mapper'

describe('mapRougeStateToProjectDetail — review-loop overlay', () => {
  const baseState = {
    project: 'demo',
    current_milestone: 'ms-1',
    milestones: [
      {
        name: 'ms-1',
        status: 'in-progress',
        stories: [{ id: 's1', name: 'Story 1', status: 'done' }],
      },
      {
        name: 'ms-2',
        status: 'pending',
        stories: [{ id: 's2', name: 'Story 2', status: 'pending' }],
      },
    ],
  }

  it('overlays under-review on the current milestone when state is milestone-check', () => {
    const mapped = mapRougeStateToProjectDetail(
      { ...baseState, current_state: 'milestone-check' },
      'demo',
    )
    expect(mapped.milestones[0].status).toBe('under-review')
    expect(mapped.milestones[1].status).toBe('pending') // other milestones unaffected
  })

  it('overlays fixing on the current milestone when state is milestone-fix', () => {
    const mapped = mapRougeStateToProjectDetail(
      { ...baseState, current_state: 'milestone-fix' },
      'demo',
    )
    expect(mapped.milestones[0].status).toBe('fixing')
  })

  it('leaves statuses alone for non-review states', () => {
    const mapped = mapRougeStateToProjectDetail(
      { ...baseState, current_state: 'analyzing' },
      'demo',
    )
    expect(mapped.milestones[0].status).toBe('in-progress')
  })
})

describe('mapRougeStateToProjectDetail — story provenance', () => {
  it('passes addedAt and addedBy through to the mapped story', () => {
    const mapped = mapRougeStateToProjectDetail(
      {
        project: 'demo',
        current_state: 'story-building',
        current_milestone: 'ms-1',
        milestones: [
          {
            name: 'ms-1',
            status: 'in-progress',
            stories: [
              { id: 's1', name: 'Original story', status: 'done' },
              {
                id: 'fix-1',
                name: 'Fix added mid-build',
                status: 'pending',
                added_at: '2026-04-19T15:00:00Z',
                added_by: 'generating-change-spec',
              },
            ],
          },
        ],
      },
      'demo',
    )
    const fix = mapped.milestones[0].stories.find((s) => s.id === 'fix-1')
    expect(fix?.addedAt).toBe('2026-04-19T15:00:00Z')
    expect(fix?.addedBy).toBe('generating-change-spec')
    const original = mapped.milestones[0].stories.find((s) => s.id === 's1')
    expect(original?.addedAt).toBeUndefined()
  })
})
