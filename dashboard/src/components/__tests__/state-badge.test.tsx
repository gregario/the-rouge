import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { StateBadge } from '../state-badge'

describe('StateBadge', () => {
  it('renders the state text formatted with title case', () => {
    render(<StateBadge state="story-building" />)
    expect(screen.getByText('Story Building')).toBeInTheDocument()
  })

  it('renders seeding state', () => {
    render(<StateBadge state="seeding" />)
    expect(screen.getByText('Seeding')).toBeInTheDocument()
  })

  it('renders complete state', () => {
    render(<StateBadge state="complete" />)
    expect(screen.getByText('Complete')).toBeInTheDocument()
  })

  it('renders escalation state with red styling', () => {
    render(<StateBadge state="escalation" />)
    const badge = screen.getByText('Escalation')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain('red')
  })

  it('renders waiting-for-human state', () => {
    render(<StateBadge state="waiting-for-human" />)
    expect(screen.getByText('Waiting For Human')).toBeInTheDocument()
  })

  it('sets data-state attribute', () => {
    render(<StateBadge state="final-review" />)
    const badge = screen.getByText('Final Review')
    expect(badge).toHaveAttribute('data-state', 'final-review')
  })

  it('renders large size variant', () => {
    render(<StateBadge state="seeding" size="lg" />)
    const badge = screen.getByText('Seeding')
    expect(badge.className).toContain('font-semibold')
  })
})
