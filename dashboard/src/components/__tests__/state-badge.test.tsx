import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { StateBadge } from '../state-badge'
import { phaseLabel } from '@/lib/phase-labels'

// StateBadge now renders user-speak labels (e.g. "Building this story"
// instead of "Story Building") sourced from phase-labels.ts. Tests
// assert through the shared mapping so label tweaks only need to be
// applied in one place.

describe('StateBadge', () => {
  it('renders the user-speak label for a mid-phase state', () => {
    render(<StateBadge state="story-building" />)
    expect(screen.getByText(phaseLabel('story-building'))).toBeInTheDocument()
  })

  it('renders seeding state', () => {
    render(<StateBadge state="seeding" />)
    expect(screen.getByText(phaseLabel('seeding'))).toBeInTheDocument()
  })

  it('renders complete state', () => {
    render(<StateBadge state="complete" />)
    expect(screen.getByText(phaseLabel('complete'))).toBeInTheDocument()
  })

  it('renders escalation state with red styling', () => {
    render(<StateBadge state="escalation" />)
    const badge = screen.getByText(phaseLabel('escalation'))
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain('red')
  })

  it('renders waiting-for-human state', () => {
    render(<StateBadge state="waiting-for-human" />)
    expect(screen.getByText(phaseLabel('waiting-for-human'))).toBeInTheDocument()
  })

  it('sets data-state attribute to the raw internal state', () => {
    render(<StateBadge state="final-review" />)
    const badge = screen.getByText(phaseLabel('final-review'))
    expect(badge).toHaveAttribute('data-state', 'final-review')
  })

  it('renders large size variant', () => {
    render(<StateBadge state="seeding" size="lg" />)
    const badge = screen.getByText(phaseLabel('seeding'))
    expect(badge.className).toContain('font-semibold')
  })

  it('exposes the tooltip gloss via title attribute', () => {
    render(<StateBadge state="foundation" />)
    const badge = screen.getByText(phaseLabel('foundation'))
    expect(badge.getAttribute('title')).toBeTruthy()
  })
})
