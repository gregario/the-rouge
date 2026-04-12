import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { EscalationDrawer } from '../escalation-drawer'
import type { Escalation } from '@/lib/types'

const escalation: Escalation = {
  id: 'esc-1',
  tier: 1,
  reason: 'Staging deploy failed — bundle size exceeds 1MB Workers limit.',
  state: 'escalation',
  createdAt: '2026-03-30T16:20:00Z',
}

describe('EscalationDrawer', () => {
  it('renders escalation context when open', () => {
    render(
      <EscalationDrawer
        open={true}
        onOpenChange={vi.fn()}
        escalation={escalation}
        projectState="escalation"
      />
    )
    const matches = screen.getAllByText(/Staging deploy failed/)
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  it('shows tier badge', () => {
    render(
      <EscalationDrawer
        open={true}
        onOpenChange={vi.fn()}
        escalation={escalation}
        projectState="escalation"
      />
    )
    expect(screen.getByTestId('tier-badge')).toHaveTextContent('Tier 1')
  })

  it('has a response textarea', () => {
    render(
      <EscalationDrawer
        open={true}
        onOpenChange={vi.fn()}
        escalation={escalation}
        projectState="escalation"
      />
    )
    expect(screen.getByTestId('escalation-response')).toBeInTheDocument()
  })

  it('has resume and skip phase buttons', () => {
    render(
      <EscalationDrawer
        open={true}
        onOpenChange={vi.fn()}
        escalation={escalation}
        projectState="escalation"
      />
    )
    expect(screen.getByTestId('resume-button')).toBeInTheDocument()
    expect(screen.getByTestId('skip-phase-button')).toBeInTheDocument()
  })

  it('shows affected story when provided', () => {
    render(
      <EscalationDrawer
        open={true}
        onOpenChange={vi.fn()}
        escalation={escalation}
        projectState="escalation"
        affectedStory="Staging deploy to Workers"
      />
    )
    expect(screen.getByTestId('affected-story')).toHaveTextContent('Staging deploy to Workers')
  })
})
